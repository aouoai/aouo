import { describe, it, expect } from 'vitest';
import { estimateTokens } from '../../src/agent/contextCompressor.js';
import type { Message } from '../../src/agent/types.js';

describe('estimateTokens', () => {
  it('should return 0 for empty messages', () => {
    expect(estimateTokens([])).toBe(0);
  });

  it('should estimate tokens for English text', () => {
    const messages: Message[] = [{ role: 'user', content: 'Hello, how are you doing today?' }];
    const tokens = estimateTokens(messages);
    // ~30 chars / 4 = ~8 tokens
    expect(tokens).toBeGreaterThan(5);
    expect(tokens).toBeLessThan(20);
  });

  it('should estimate higher density for CJK text', () => {
    const messages: Message[] = [{ role: 'user', content: '你好世界这是一个测试' }];
    const tokens = estimateTokens(messages);
    // 9 CJK chars / 1.5 = 6 tokens
    expect(tokens).toBeGreaterThan(4);
    expect(tokens).toBeLessThan(15);
  });

  it('should add overhead for tool schemas', () => {
    const messages: Message[] = [{ role: 'user', content: 'test' }];
    const withoutTools = estimateTokens(messages, 0);
    const withTools = estimateTokens(messages, 5);
    // 5 tools * 200 overhead = 1000 extra
    expect(withTools - withoutTools).toBe(1000);
  });

  it('should include toolCalls in estimation', () => {
    const messages: Message[] = [
      {
        role: 'assistant',
        toolCalls: [{ id: '1', name: 'test_tool', args: { key: 'value' } }],
      },
    ];
    const tokens = estimateTokens(messages);
    expect(tokens).toBeGreaterThan(0);
  });
});
