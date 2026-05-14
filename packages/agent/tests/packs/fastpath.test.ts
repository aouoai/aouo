import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveFastPath, clearMenus } from '../../src/packs/fastpath.js';

// We manually inject menu pages via internal state for testing
// In production, loadPackMenus reads from disk
describe('packs/fastpath', () => {
  beforeEach(() => {
    clearMenus();
  });

  afterEach(() => {
    clearMenus();
  });

  it('should return not matched for unknown callbacks', () => {
    const result = resolveFastPath('nav:nonexistent');
    expect(result.matched).toBe(false);
  });

  it('should return not matched for non-prefixed callbacks', () => {
    const result = resolveFastPath('random_callback');
    expect(result.matched).toBe(false);
  });

  it('should return not matched for skill: prefix without registration', () => {
    const result = resolveFastPath('skill:unknown');
    expect(result.matched).toBe(false);
  });
});
