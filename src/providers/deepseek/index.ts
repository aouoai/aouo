/**
 * @module providers/deepseek
 * @description DeepSeek LLM provider using the OpenAI-compatible Chat Completions API.
 *
 * DeepSeek exposes a fully OpenAI-compatible endpoint at api.deepseek.com.
 * Supports streaming SSE, function calling, and reasoning_content extraction.
 *
 * Models: deepseek-chat (general), deepseek-reasoner (thinking mode)
 */

import type { Message, LLMResponse, ToolParameterSchema, LLMProvider, ChatOptions } from '../../agent/types.js';
import type { AouoConfig } from '../../config/defaults.js';
import { classifyApiError } from '../../agent/errorClassifier.js';
import { logger, redactSecrets } from '../../lib/logger.js';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Message Transform ────────────────────────────────────────────────────────

function toOpenAIMessages(messages: Message[]): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      result.push({ role: 'system', content: msg.content || '' });
    } else if (msg.role === 'user') {
      result.push({ role: 'user', content: msg.content || '' });
    } else if (msg.role === 'assistant') {
      const entry: Record<string, unknown> = { role: 'assistant' };
      if (msg.content) entry.content = msg.content;

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        entry.tool_calls = msg.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.args),
          },
        }));
      }

      result.push(entry);
    } else if (msg.role === 'tool') {
      result.push({
        role: 'tool',
        tool_call_id: msg.toolCallId || '',
        content: msg.content || '',
      });
    }
  }

  return result;
}

function toOpenAITools(
  tools: Array<{ name: string; description: string; parameters: ToolParameterSchema }>,
): Array<Record<string, unknown>> {
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

// ── SSE Stream Consumer ──────────────────────────────────────────────────────

async function consumeOpenAIStream(response: Response, startTime: number): Promise<LLMResponse> {
  if (!response.body) {
    return { content: '', durationMs: Date.now() - startTime };
  }

  const textParts: string[] = [];
  const toolCallAccum = new Map<number, { id: string; name: string; args: string }>();
  let usage: LLMResponse['usage'];

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        let chunk: Record<string, unknown>;
        try { chunk = JSON.parse(data); } catch { continue; }

        const choices = chunk.choices as Array<Record<string, unknown>> | undefined;
        if (!choices?.[0]) continue;

        const delta = choices[0].delta as Record<string, unknown> | undefined;
        if (!delta) continue;

        // Text content
        if (delta.content) textParts.push(delta.content as string);

        // Tool calls (streamed incrementally)
        const tcDeltas = delta.tool_calls as Array<Record<string, unknown>> | undefined;
        if (tcDeltas) {
          for (const tcd of tcDeltas) {
            const idx = (tcd.index as number) ?? 0;
            if (!toolCallAccum.has(idx)) {
              toolCallAccum.set(idx, { id: '', name: '', args: '' });
            }
            const acc = toolCallAccum.get(idx)!;
            if (tcd.id) acc.id = tcd.id as string;
            const fn = tcd.function as Record<string, unknown> | undefined;
            if (fn?.name) acc.name = fn.name as string;
            if (fn?.arguments) acc.args += fn.arguments as string;
          }
        }

        // Usage (sent in the final chunk by DeepSeek)
        if (chunk.usage) {
          const u = chunk.usage as Record<string, unknown>;
          usage = {
            promptTokens: (u.prompt_tokens as number) || 0,
            completionTokens: (u.completion_tokens as number) || 0,
            totalTokens: (u.total_tokens as number) || 0,
          };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const result: LLMResponse = { durationMs: Date.now() - startTime };
  if (textParts.length > 0) result.content = textParts.join('');

  if (toolCallAccum.size > 0) {
    result.toolCalls = [...toolCallAccum.values()].map(tc => ({
      id: tc.id || `ds-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: tc.name,
      args: (() => { try { return JSON.parse(tc.args); } catch { return {}; } })(),
    }));
  }

  if (usage) result.usage = usage;
  return result;
}

// ── Provider Class ───────────────────────────────────────────────────────────

/**
 * DeepSeek provider — OpenAI-compatible Chat Completions API with streaming.
 */
export class DeepSeekProvider implements LLMProvider {
  readonly name = 'deepseek';

  async chat(
    messages: Message[],
    tools: Array<{ name: string; description: string; parameters: ToolParameterSchema }>,
    config: AouoConfig,
    _options?: ChatOptions,
  ): Promise<LLMResponse> {
    const apiKey = config.deepseek?.api_key;
    if (!apiKey) {
      throw new Error('DeepSeek API key not configured. Set config.deepseek.api_key.');
    }

    const model = config.provider.model;
    const openaiMessages = toOpenAIMessages(messages);

    const body: Record<string, unknown> = {
      model,
      messages: openaiMessages,
      temperature: config.provider.temperature,
      max_tokens: config.provider.max_tokens,
      stream: true,
      stream_options: { include_usage: true },
    };

    if (tools.length > 0) {
      body.tools = toOpenAITools(tools);
      body.tool_choice = 'auto';
    }

    const maxRetries = config.provider.max_retries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90_000);

      let response: Response;
      try {
        response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (fetchErr) {
        clearTimeout(timeout);
        const isAbort = (fetchErr as Error).name === 'AbortError';
        const errMsg = isAbort
          ? 'DeepSeek API request timed out after 90s'
          : `DeepSeek API fetch failed: ${(fetchErr as Error).message}`;
        logger.error({
          msg: 'api_fetch_error', provider: 'deepseek',
          error: errMsg, attempt, elapsed_ms: Date.now() - startTime,
        });

        if (attempt < maxRetries) {
          await sleep(Math.min(1000 * Math.pow(2, attempt), 10_000));
          continue;
        }
        throw new Error(errMsg);
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const errText = await response.text();
        const safeBody = redactSecrets(errText.substring(0, 200));
        const apiErr = new Error(`DeepSeek API error (${response.status}): ${redactSecrets(errText.substring(0, 500))}`);
        const classified = classifyApiError(apiErr);

        logger.error({
          msg: 'api_error', provider: 'deepseek',
          status: response.status, reason: classified.reason,
          retryable: classified.retryable,
          body: safeBody,
          elapsed_ms: Date.now() - startTime, attempt,
        });

        if (!classified.retryable || attempt >= maxRetries) throw apiErr;
        await sleep(classified.backoffMs || Math.min(1000 * Math.pow(2, attempt), 10_000));
        continue;
      }

      return await consumeOpenAIStream(response, startTime);
    }

    throw new Error('DeepSeek API: max retries exceeded');
  }
}
