/**
 * @module providers/transports/chat-completions
 * @description Shared transport for the OpenAI Chat Completions wire format.
 *
 * Used by every vendor that exposes a Chat Completions-compatible endpoint —
 * currently DeepSeek and OpenAI. Adding a new compat vendor (Moonshot,
 * Together, etc.) means writing a new `ProviderProfile` and reusing this
 * transport unchanged.
 */

import type { LLMResponse, Message, ToolSchema } from '../../agent/types.js';
import type { ProviderTransport, TransportRequest } from '../types.js';

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
        entry.tool_calls = msg.toolCalls.map((tc) => ({
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

function toOpenAITools(tools: ToolSchema[]): Array<Record<string, unknown>> {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

async function consumeOpenAIStream(
  response: Response,
  startTime: number,
  onToken?: (delta: string) => void,
): Promise<LLMResponse> {
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
        try {
          chunk = JSON.parse(data);
        } catch {
          continue;
        }

        const choices = chunk.choices as Array<Record<string, unknown>> | undefined;
        if (choices?.[0]) {
          const delta = choices[0].delta as Record<string, unknown> | undefined;
          if (delta) {
            if (delta.content) {
              const text = delta.content as string;
              textParts.push(text);
              if (onToken) {
                try { onToken(text); } catch { /* swallow — streaming is best-effort */ }
              }
            }

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
          }
        }

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
    result.toolCalls = [...toolCallAccum.values()].map((tc) => ({
      id: tc.id || `oai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: tc.name,
      args: (() => {
        try {
          return JSON.parse(tc.args);
        } catch {
          return {};
        }
      })(),
    }));
  }

  if (usage) result.usage = usage;
  return result;
}

export const chatCompletionsTransport: ProviderTransport = {
  apiMode: 'chat_completions',

  buildRequestBody(req: TransportRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: req.model,
      messages: toOpenAIMessages(req.messages),
      temperature: req.temperature,
      max_tokens: req.maxTokens,
      stream: true,
      stream_options: { include_usage: true },
    };

    if (req.tools.length > 0) {
      body.tools = toOpenAITools(req.tools);
      body.tool_choice = 'auto';
    }

    return body;
  },

  consumeStream: consumeOpenAIStream,
};
