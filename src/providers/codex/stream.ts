/**
 * @module providers/codex/stream
 * @description SSE stream consumer for Codex Responses API.
 */

import type { LLMResponse } from '../../agent/types.js';

/**
 * Consume a Codex SSE stream and aggregate into LLMResponse.
 */
export async function consumeStream(response: Response, startTime: number): Promise<LLMResponse> {
  if (!response.body) {
    return { content: '', durationMs: Date.now() - startTime };
  }

  const textParts: string[] = [];
  const toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
  let usage: LLMResponse['usage'] = undefined;

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
        try { event = JSON.parse(data); } catch { continue; }

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
            try { args = JSON.parse((item.arguments as string) || '{}'); } catch { /* ignore */ }
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

  const durationMs = Date.now() - startTime;
  const result: LLMResponse = { durationMs };
  if (textParts.length > 0) result.content = textParts.join('');
  if (toolCalls.length > 0) result.toolCalls = toolCalls;
  if (usage) result.usage = usage;
  return result;
}
