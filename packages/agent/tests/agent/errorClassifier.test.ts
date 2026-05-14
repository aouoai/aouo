import { describe, it, expect } from 'vitest';
import { classifyApiError } from '../../src/agent/errorClassifier.js';

describe('errorClassifier', () => {
  it('should classify 401 as auth error', () => {
    const err = Object.assign(new Error('Unauthorized'), { status: 401 });
    const result = classifyApiError(err);
    expect(result.reason).toBe('auth');
    expect(result.retryable).toBe(true);
    expect(result.shouldRotate).toBe(true);
  });

  it('should classify 429 as rate limit', () => {
    const err = Object.assign(new Error('Too many requests'), { status: 429 });
    const result = classifyApiError(err);
    expect(result.reason).toBe('rate_limit');
    expect(result.retryable).toBe(true);
    expect(result.backoffMs).toBeGreaterThan(0);
  });

  it('should classify 400 with context overflow pattern as context_overflow', () => {
    const err = Object.assign(new Error('Request too large: maximum context length exceeded'), {
      status: 400,
    });
    const result = classifyApiError(err);
    expect(result.reason).toBe('context_overflow');
    expect(result.shouldCompress).toBe(true);
    expect(result.retryable).toBe(true);
  });

  it('should classify 404 as model_not_found', () => {
    const err = Object.assign(new Error('Model not found'), { status: 404 });
    const result = classifyApiError(err);
    expect(result.reason).toBe('model_not_found');
    expect(result.retryable).toBe(false);
  });

  it('should classify 503 as overloaded', () => {
    const err = Object.assign(new Error('Service unavailable'), { status: 503 });
    const result = classifyApiError(err);
    expect(result.reason).toBe('overloaded');
    expect(result.retryable).toBe(true);
  });

  it('should use heuristic patterns when no status code', () => {
    const err = new Error('resource_exhausted: quota exceeded');
    const result = classifyApiError(err);
    expect(result.reason).toBe('rate_limit');
  });

  it('should classify timeout errors', () => {
    const err = new Error('ECONNRESET');
    const result = classifyApiError(err);
    expect(result.reason).toBe('timeout');
    expect(result.retryable).toBe(true);
  });

  it('should fall back to unknown for unrecognized errors', () => {
    const err = new Error('something completely unexpected');
    const result = classifyApiError(err);
    expect(result.reason).toBe('unknown');
    expect(result.retryable).toBe(true);
  });

  it('should handle non-Error inputs', () => {
    const result = classifyApiError('plain string error');
    expect(result.reason).toBe('unknown');
    expect(result.original).toBeInstanceOf(Error);
  });
});
