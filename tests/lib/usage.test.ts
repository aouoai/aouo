/**
 * @module tests/lib/usage
 * @description Per-session and per-day token aggregation used by the Agent's
 *              quota gate. Tests insert events through the public trackLlm
 *              entry point so they exercise the same migration + INSERT path
 *              the runtime uses.
 */

import { describe, it, expect } from 'vitest';
import {
  trackLlm,
  getSessionTokenTotal,
  getDailyTokenTotal,
} from '../../src/lib/usage.js';

/** Build a session id that won't collide with other test runs. */
function freshSessionId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe('lib/usage quota aggregation', () => {
  it('returns 0 for an unknown session', () => {
    expect(getSessionTokenTotal(freshSessionId('never'))).toBe(0);
  });

  it('returns 0 for the empty string session id (legacy events)', () => {
    expect(getSessionTokenTotal('')).toBe(0);
  });

  it('sums input + output tokens for a single session across multiple calls', () => {
    const sid = freshSessionId('sum-single');
    trackLlm(100, 50, 0, 'gemini', sid);
    trackLlm(80, 20, 5, 'gemini', sid);
    // 100+50 + 80+20 = 250 — cached tokens are NOT counted toward the quota
    // because they reflect server-side reuse, not new spend.
    expect(getSessionTokenTotal(sid)).toBe(250);
  });

  it('isolates totals by session id', () => {
    const sidA = freshSessionId('iso-a');
    const sidB = freshSessionId('iso-b');
    trackLlm(100, 50, 0, 'gemini', sidA);
    trackLlm(999, 999, 0, 'gemini', sidB);
    expect(getSessionTokenTotal(sidA)).toBe(150);
    expect(getSessionTokenTotal(sidB)).toBe(1998);
  });

  it('daily total is a monotonically non-decreasing function of new events', () => {
    const before = getDailyTokenTotal();
    const sid = freshSessionId('daily');
    trackLlm(10, 5, 0, 'gemini', sid);
    const after = getDailyTokenTotal();
    expect(after).toBeGreaterThanOrEqual(before + 15);
  });
});
