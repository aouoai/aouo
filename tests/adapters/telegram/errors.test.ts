/**
 * @module tests/adapters/telegram/errors
 * @description Tests for error formatting and typing indicator.
 */

import { describe, it, expect } from 'vitest';
import { formatTgError } from '../../../src/adapters/telegram/errors.js';

describe('formatTgError', () => {
  it('classifies timeout errors with warning prefix', () => {
    const result = formatTgError(new Error('Request timeout'));
    expect(result).toContain('⚠️');
    expect(result.toLowerCase()).toContain('timed out');
  });

  it('classifies rate limit errors', () => {
    const result = formatTgError(new Error('429 Too Many Requests'));
    expect(result).toContain('⚠️');
    expect(result.toLowerCase()).toContain('rate limit');
  });

  it('classifies network errors', () => {
    const result = formatTgError(new Error('ECONNREFUSED'));
    expect(result).toContain('⚠️');
  });

  it('handles generic errors', () => {
    const result = formatTgError(new Error('Something broke'));
    expect(result).toContain('Something broke');
  });

  it('truncates very long error messages', () => {
    const longErr = new Error('x'.repeat(1000));
    const result = formatTgError(longErr);
    expect(result.length).toBeLessThan(600);
  });
});
