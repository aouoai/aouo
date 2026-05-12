import { describe, it, expect } from 'vitest';
import { truncateHistory, sanitizeHistory } from '../../src/agent/history.js';
import type { Message } from '../../src/agent/types.js';

function msg(role: Message['role'], content?: string, toolCalls?: Message['toolCalls']): Message {
  return { role, content, toolCalls };
}

function toolMsg(toolCallId: string, content: string, toolName = 'test'): Message {
  return { role: 'tool', content, toolCallId, toolName };
}

describe('truncateHistory', () => {
  it('should return history unchanged if within limit', () => {
    const history = [msg('user', 'hi'), msg('assistant', 'hello')];
    expect(truncateHistory(history, 10)).toHaveLength(2);
  });

  it('should truncate to maxHistory', () => {
    const history = Array.from({ length: 20 }, (_, i) => msg('user', `msg ${i}`));
    const result = truncateHistory(history, 10);
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it('should backtrack over leading tool messages', () => {
    const history: Message[] = [
      msg('user', 'a'),
      msg('assistant', 'b', [{ id: '1', name: 'test', args: {} }]),
      toolMsg('1', 'result'),
      msg('user', 'c'),
      msg('assistant', 'd'),
    ];
    const result = truncateHistory(history, 3);
    // Should not start with a tool message
    expect(result[0]?.role).not.toBe('tool');
  });
});

describe('sanitizeHistory', () => {
  it('should return empty array unchanged', () => {
    expect(sanitizeHistory([])).toEqual([]);
  });

  it('should skip leading non-user messages', () => {
    const history = [msg('assistant', 'stale'), msg('user', 'hi'), msg('assistant', 'hello')];
    const result = sanitizeHistory(history);
    expect(result[0]?.role).toBe('user');
    expect(result).toHaveLength(2);
  });

  it('should drop orphaned tool messages', () => {
    const history = [msg('user', 'hi'), toolMsg('x', 'orphan')];
    const result = sanitizeHistory(history);
    expect(result).toHaveLength(1);
    expect(result[0]?.role).toBe('user');
  });

  it('should keep valid tool call + tool result pairs', () => {
    const history: Message[] = [
      msg('user', 'do something'),
      msg('assistant', undefined, [{ id: '1', name: 'test', args: {} }]),
      toolMsg('1', 'result'),
      msg('assistant', 'done'),
    ];
    const result = sanitizeHistory(history);
    expect(result).toHaveLength(4);
  });

  it('should drop assistant with toolCalls but no tool results', () => {
    const history: Message[] = [
      msg('user', 'do something'),
      msg('assistant', undefined, [{ id: '1', name: 'test', args: {} }]),
      msg('user', 'next question'),
    ];
    const result = sanitizeHistory(history);
    // Should drop the toolCall assistant + keep both users
    expect(result).toHaveLength(2);
    expect(result.every((m) => m.role === 'user')).toBe(true);
  });
});
