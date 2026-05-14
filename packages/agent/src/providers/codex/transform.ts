/**
 * @module providers/codex/transform
 * @description Message ↔ Codex Responses API translation helpers.
 */

import type { Message, ToolParameterSchema } from '../../agent/types.js';

/**
 * Convert internal Message[] to Codex Responses API input items.
 */
export function toResponsesInput(messages: Message[]): {
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

/**
 * Transform tool definitions to Codex Responses API format.
 */
export function toResponsesTools(
  tools: Array<{ name: string; description: string; parameters: ToolParameterSchema }>,
): Array<Record<string, unknown>> {
  return tools.map(t => ({
    type: 'function',
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    strict: false,
  }));
}
