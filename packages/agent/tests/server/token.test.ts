import { describe, it, expect } from 'vitest';
import { generateToken, safeEqualToken } from '../../src/server/token.js';

describe('server/token', () => {
  it('generateToken returns a 64-character hex string', () => {
    const token = generateToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('two consecutive tokens differ', () => {
    expect(generateToken()).not.toBe(generateToken());
  });

  it('safeEqualToken matches identical tokens', () => {
    const token = generateToken();
    expect(safeEqualToken(token, token)).toBe(true);
  });

  it('safeEqualToken rejects different tokens of equal length', () => {
    const a = generateToken();
    const b = generateToken();
    expect(safeEqualToken(a, b)).toBe(false);
  });

  it('safeEqualToken rejects mismatched lengths', () => {
    expect(safeEqualToken('a'.repeat(64), 'a'.repeat(63))).toBe(false);
    expect(safeEqualToken('abc', '')).toBe(false);
  });

  it('safeEqualToken handles empty inputs without throwing', () => {
    expect(safeEqualToken('', '')).toBe(true);
    expect(safeEqualToken('abc', '')).toBe(false);
  });
});
