/**
 * @module providers/transports/responses
 * @description Transport for the OpenAI Responses wire format (used by Codex).
 *
 * Differs from Chat Completions: `input` items in place of `messages`,
 * separate `instructions` field for the system prompt, `function_call` /
 * `function_call_output` item types, and `response.output_item.done` SSE
 * events.
 */

import type { LLMResponse, Message, ToolSchema } from '../../agent/types.js';
import type { ProviderTransport, TransportRequest } from '../types.js';

function toResponsesInput(messages: Message[]): {
  instructions: string;
  input: Array<Record<string, unknown>>;
} {
  let instructions = '';
  const input: Array<Record<string, unknown>> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      instructions = msg.content || '';
      continue;
    }

    if (msg.role === 'user') {
      input.push({ role: 'user', content: msg.content || '' });
    } else if (msg.role === 'assistant') {
      if (msg.content) {
        input.push({ role: 'assistant', content: msg.content });
      }

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        if (!msg.content) {
          input.push({ role: 'assistant', content: '' });
        }
        for (const tc of msg.toolCalls) {
          input.push({
            type: 'function_call',
            call_id: tc.id,
            name: tc.name,
            arguments: JSON.stringify(tc.args),
          });
        }
      }
    } else if (msg.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: msg.toolCallId || '',
        output: msg.content || '',
      });
    }
  }

  return { instructions, input };
}

function toResponsesTools(tools: ToolSchema[]): Array<Record<string, unknown>> {
  return tools.map((t) => ({
    type: 'function',
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    strict: false,
  }));
}

async function consumeResponsesStream(
  response: Response,
  startTime: number,
): Promise<LLMResponse> {
  if (!response.body) {
    return { content: '', durationMs: Date.now() - startTime };
  }

  const textParts: string[] = [];
  const toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
  let usage: LLMResponse['usage'];

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
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

        const eventType = event.type as string;

        if (eventType === 'response.output_item.done') {
          const item = event.item as Record<string, unknown> | undefined;
          if (!item) continue;

          const itemType = item.type as string;
          if (itemType === 'message') {
            const content = item.content as Array<{ type: string; text?: string }> | undefined;
            for (const c of content || []) {
              if (c.type === 'output_text' && c.text) textParts.push(c.text);
            }
          } else if (itemType === 'function_call') {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse((item.arguments as string) || '{}');
            } catch {
              /* tolerate malformed args */
            }
            toolCalls.push({
              id: (item.call_id as string) || '',
              name: (item.name as string) || '',
              args,
            });
          }
        }

        if (eventType === 'response.completed') {
          const resp = event.response as Record<string, unknown> | undefined;
          if (resp?.usage) {
            const u = resp.usage as Record<string, unknown>;
            const details = u.input_tokens_details as Record<string, unknown> | undefined;
            usage = {
              promptTokens: (u.input_tokens as number) || 0,
              completionTokens: (u.output_tokens as number) || 0,
              totalTokens: (u.total_tokens as number) || 0,
              cachedTokens: (details?.cached_tokens as number) || 0,
            };
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const result: LLMResponse = { durationMs: Date.now() - startTime };
  if (textParts.length > 0) result.content = textParts.join('');
  if (toolCalls.length > 0) result.toolCalls = toolCalls;
  if (usage) result.usage = usage;
  return result;
}

export const responsesTransport: ProviderTransport = {
  apiMode: 'responses',

  buildRequestBody(req: TransportRequest): Record<string, unknown> {
    const { instructions, input } = toResponsesInput(req.messages);

    const body: Record<string, unknown> = {
      model: req.model,
      instructions: instructions || 'You are a helpful assistant.',
      input,
      store: false,
      stream: true,
    };

    if (req.sessionId) body.prompt_cache_key = req.sessionId;

    if (req.tools.length > 0) {
      body.tools = toResponsesTools(req.tools);
      body.tool_choice = 'auto';
    }

    return body;
  },

  consumeStream: consumeResponsesStream,
};
