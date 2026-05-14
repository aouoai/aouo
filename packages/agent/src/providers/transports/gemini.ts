/**
 * @module providers/transports/gemini
 * @description Transport for the Gemini native streaming protocol.
 *
 * Distinct from Chat Completions: uses `contents` + `systemInstruction`
 * splits, `functionCall` parts, and preserves `_rawParts` so the agent
 * can replay assistant turns including `thoughtSignature` fields for
 * cache stability.
 */

import type { LLMResponse, Message, ToolSchema } from '../../agent/types.js';
import type { ProviderTransport, TransportRequest } from '../types.js';

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
        parts: [
          {
            functionResponse: {
              name: msg.toolName || '',
              response: { result: msg.content || '' },
              id: msg.toolCallId || '',
            },
          },
        ],
      });
    }
  }

  return { systemInstruction, contents };
}

function toGeminiTools(tools: ToolSchema[]): Array<Record<string, unknown>> {
  return [
    {
      function_declarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ];
}

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

async function consumeGeminiStream(
  response: Response,
  startTime: number,
  onToken?: (delta: string) => void,
): Promise<LLMResponse> {
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
        try {
          event = JSON.parse(data);
        } catch {
          continue;
        }

        const candidates = (event.candidates as GeminiCandidate[]) || [];
        for (const candidate of candidates) {
          if (!candidate.content?.parts) continue;
          for (const part of candidate.content.parts) {
            rawParts.push(part as Record<string, unknown>);
            if (part.text) {
              textParts.push(part.text);
              if (onToken) {
                try { onToken(part.text); } catch { /* swallow — streaming is best-effort */ }
              }
            }
            if (part.functionCall) {
              toolCalls.push({
                id:
                  part.functionCall.id ||
                  `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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

export const geminiTransport: ProviderTransport = {
  apiMode: 'gemini_native',

  buildRequestBody(req: TransportRequest): Record<string, unknown> {
    const { systemInstruction, contents } = toGeminiContents(req.messages);

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: req.temperature,
        maxOutputTokens: req.maxTokens,
      },
    };

    if (systemInstruction) body.systemInstruction = systemInstruction;

    if (req.tools.length > 0) {
      body.tools = toGeminiTools(req.tools);
      body.toolConfig = { functionCallingConfig: { mode: 'AUTO' } };
    }

    return body;
  },

  consumeStream: consumeGeminiStream,
};
