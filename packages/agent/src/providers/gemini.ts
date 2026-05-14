/**
 * @module providers/gemini
 * @description Gemini LLM provider using the Google AI Studio REST API.
 *
 * Implements streaming SSE consumption of the `streamGenerateContent`
 * endpoint with exponential backoff retry, function calling support,
 * and raw part preservation for multi-turn cache stability.
 */

import type { Message, LLMResponse, ToolParameterSchema, LLMProvider, ChatOptions } from '../agent/types.js';
import type { AouoConfig } from '../config/defaults.js';
import { classifyApiError } from '../agent/errorClassifier.js';
import { logger, redactSecrets } from '../lib/logger.js';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

// ── Message Transform ────────────────────────────────────────────────────────

/**
 * Converts internal Message[] to Gemini API `contents` + `systemInstruction`.
 */
function toGeminiContents(messages: Message[]): {
  systemInstruction: { parts: Array<{ text: string }> } | undefined;
  contents: Array<Record<string, unknown>>;
} {
  let systemInstruction: { parts: Array<{ text: string }> } | undefined;
  const contents: Array<Record<string, unknown>> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction = { parts: [{ text: msg.content || '' }] };
      continue;
    }

    if (msg.role === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: msg.content || '' }],
      });
    } else if (msg.role === 'assistant') {
      // Prefer raw Gemini parts if available (preserves thoughtSignature)
      if (msg._rawParts && Array.isArray(msg._rawParts)) {
        contents.push({ role: 'model', parts: msg._rawParts });
        continue;
      }

      const parts: Array<Record<string, unknown>> = [];
      if (msg.content) parts.push({ text: msg.content });

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          parts.push({
            functionCall: { name: tc.name, args: tc.args, id: tc.id },
          });
        }
      }

      if (parts.length > 0) {
        contents.push({ role: 'model', parts });
      }
    } else if (msg.role === 'tool') {
      contents.push({
        role: 'function',
        parts: [{
          functionResponse: {
            name: msg.toolName || '',
            response: { result: msg.content || '' },
            id: msg.toolCallId || '',
          },
        }],
      });
    }
  }

  return { systemInstruction, contents };
}

/**
 * Transforms internal tool definitions into Gemini function_declarations format.
 */
function toGeminiTools(
  tools: Array<{ name: string; description: string; parameters: ToolParameterSchema }>,
): Array<Record<string, unknown>> {
  return [{
    function_declarations: tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
  }];
}

// ── Response Parsing ─────────────────────────────────────────────────────────

interface GeminiCandidate {
  content?: {
    role?: string;
    parts?: Array<{
      text?: string;
      functionCall?: {
        name: string;
        args: Record<string, unknown>;
        id?: string;
      };
    }>;
  };
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  cachedContentTokenCount?: number;
  thoughtsTokenCount?: number;
}

function parseGeminiResponse(data: Record<string, unknown>, startTime: number): LLMResponse {
  const candidates = (data.candidates as GeminiCandidate[]) || [];
  const usageMeta = data.usageMetadata as GeminiUsageMetadata | undefined;

  const textParts: string[] = [];
  const toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];

  for (const candidate of candidates) {
    if (!candidate.content?.parts) continue;
    for (const part of candidate.content.parts) {
      if (part.text) textParts.push(part.text);
      if (part.functionCall) {
        toolCalls.push({
          id: part.functionCall.id || `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: part.functionCall.name,
          args: part.functionCall.args || {},
        });
      }
    }
  }

  const result: LLMResponse = { durationMs: Date.now() - startTime };
  if (textParts.length > 0) result.content = textParts.join('');
  if (toolCalls.length > 0) result.toolCalls = toolCalls;

  if (usageMeta) {
    result.usage = {
      promptTokens: usageMeta.promptTokenCount || 0,
      completionTokens: usageMeta.candidatesTokenCount || 0,
      totalTokens: usageMeta.totalTokenCount || 0,
      cachedTokens: usageMeta.cachedContentTokenCount || 0,
      thoughtsTokens: usageMeta.thoughtsTokenCount || 0,
    };
  }

  return result;
}

// ── Streaming SSE Consumer ───────────────────────────────────────────────────

async function consumeGeminiStream(response: Response, startTime: number): Promise<LLMResponse> {
  if (!response.body) {
    return { content: '', durationMs: Date.now() - startTime };
  }

  const textParts: string[] = [];
  const toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
  const rawParts: Array<Record<string, unknown>> = [];
  let usage: LLMResponse['usage'];

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');

      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const eventBlock of events) {
        if (!eventBlock.trim()) continue;

        let data = '';
        for (const line of eventBlock.split('\n')) {
          if (line.startsWith('data: ')) data += line.slice(6);
          else if (line.startsWith('data:')) data += line.slice(5);
        }

        if (!data || data === '[DONE]') continue;

        let event: Record<string, unknown>;
        try { event = JSON.parse(data); } catch { continue; }

        const candidates = (event.candidates as GeminiCandidate[]) || [];
        for (const candidate of candidates) {
          if (!candidate.content?.parts) continue;
          for (const part of candidate.content.parts) {
            rawParts.push(part as Record<string, unknown>);
            if (part.text) textParts.push(part.text);
            if (part.functionCall) {
              toolCalls.push({
                id: part.functionCall.id || `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                name: part.functionCall.name,
                args: part.functionCall.args || {},
              });
            }
          }
        }

        const usageMeta = event.usageMetadata as GeminiUsageMetadata | undefined;
        if (usageMeta) {
          usage = {
            promptTokens: usageMeta.promptTokenCount || 0,
            completionTokens: usageMeta.candidatesTokenCount || 0,
            totalTokens: usageMeta.totalTokenCount || 0,
            cachedTokens: usageMeta.cachedContentTokenCount || 0,
            thoughtsTokens: usageMeta.thoughtsTokenCount || 0,
          };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const result: LLMResponse = { durationMs: Date.now() - startTime };
  if (textParts.length > 0) result.content = textParts.join('');
  if (toolCalls.length > 0) result.toolCalls = toolCalls;
  if (rawParts.length > 0) result.rawModelParts = rawParts;
  if (usage) result.usage = usage;
  return result;
}

// ── Provider Class ───────────────────────────────────────────────────────────

/**
 * Gemini LLM provider using the Google AI Studio REST API.
 *
 * Supports streaming SSE, function calling, and exponential backoff retry.
 */
export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';

  async chat(
    messages: Message[],
    tools: Array<{ name: string; description: string; parameters: ToolParameterSchema }>,
    config: AouoConfig,
    _options?: ChatOptions,
  ): Promise<LLMResponse> {
    const apiKey = config.gemini.api_key;
    if (!apiKey) {
      throw new Error('Gemini API key not configured. Set gemini.api_key in config.json.');
    }

    const model = config.provider.model;
    const { systemInstruction, contents } = toGeminiContents(messages);

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: config.provider.temperature,
        maxOutputTokens: config.provider.max_tokens,
      },
    };

    if (systemInstruction) body.systemInstruction = systemInstruction;

    if (tools.length > 0) {
      body.tools = toGeminiTools(tools);
      body.toolConfig = { functionCallingConfig: { mode: 'AUTO' } };
    }

    const maxRetries = config.provider.max_retries;
    const useStreaming = true;
    const endpoint = useStreaming ? 'streamGenerateContent' : 'generateContent';
    const url = `${GEMINI_BASE_URL}/models/${model}:${endpoint}${useStreaming ? '?alt=sse&' : '?'}key=${apiKey}`;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90_000);

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (fetchErr) {
        clearTimeout(timeout);
        const isAbort = (fetchErr as Error).name === 'AbortError';
        const errMsg = isAbort
          ? 'Gemini API request timed out after 90s'
          : `Gemini API fetch failed: ${(fetchErr as Error).message}`;
        logger.error({
          msg: 'api_fetch_error', provider: 'gemini',
          error: redactSecrets(errMsg), aborted: isAbort, attempt,
          elapsed_ms: Date.now() - startTime,
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
        const apiErr = new Error(`Gemini API error (${response.status}): ${redactSecrets(errText.substring(0, 500))}`);
        const classified = classifyApiError(apiErr);

        logger.error({
          msg: 'api_error', provider: 'gemini',
          status: response.status, reason: classified.reason,
          retryable: classified.retryable,
          body: safeBody,
          elapsed_ms: Date.now() - startTime, attempt,
        });

        if (!classified.retryable || attempt >= maxRetries) throw apiErr;
        await sleep(classified.backoffMs || Math.min(1000 * Math.pow(2, attempt), 10_000));
        continue;
      }

      if (useStreaming) {
        return await consumeGeminiStream(response, startTime);
      } else {
        const data = await response.json() as Record<string, unknown>;
        return parseGeminiResponse(data, startTime);
      }
    }

    throw new Error('Gemini API: max retries exceeded');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
