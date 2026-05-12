/**
 * @module agent/errorClassifier
 * @description Structured classification for LLM provider API errors.
 *
 * Translates raw provider exceptions into actionable {@link ClassifiedError}
 * objects that drive retry logic, context compression, and provider failover:
 *
 * - **Provider Layer**: Uses `retryable`, `backoffMs`, `shouldRotate`.
 * - **Agent Layer**: Uses `shouldCompress` to trigger context reduction.
 *
 * Classification priority:
 * 1. HTTP status codes (from SDK error properties).
 * 2. Regex pattern matching on error messages.
 * 3. Fallback to 'unknown' with conservative retry defaults.
 */

/**
 * Categorical reason for a provider failure.
 */
export type FailoverReason =
  | 'auth'
  | 'auth_permanent'
  | 'billing'
  | 'rate_limit'
  | 'overloaded'
  | 'server_error'
  | 'timeout'
  | 'context_overflow'
  | 'model_not_found'
  | 'format_error'
  | 'unknown';

/**
 * Structured outcome of classifying an API error.
 */
export interface ClassifiedError {
  /** High-level reason for the failure. */
  reason: FailoverReason;
  /** True if the operation can be safely retried. */
  retryable: boolean;
  /** True if the system should compress context and retry. */
  shouldCompress: boolean;
  /** True if multi-key systems should rotate their active credential. */
  shouldRotate: boolean;
  /** True if the application should fall back to an alternative provider. */
  shouldFallback: boolean;
  /** Recommended delay in ms before retrying. */
  backoffMs: number;
  /** The originating error instance. */
  original: Error;
}

const CONTEXT_OVERFLOW_PATTERNS = [
  'context length',
  'token limit',
  'maximum context',
  'too many tokens',
  'exceeds the model',
  'prompt is too long',
  'request too large',
  'content_too_large',
  'max_tokens',
  'input is too long',
];

const RATE_LIMIT_PATTERNS = [
  'rate limit',
  'rate_limit',
  'too many requests',
  'quota exceeded',
  'resource exhausted',
  'resource_exhausted',
  'try again in',
  'resets at',
  'retry after',
  'throttl',
];

const BILLING_PATTERNS = [
  'insufficient credits',
  'exceeded quota',
  'billing',
  'payment required',
  'account has been deactivated',
  'usage limit exceeded',
];

const TIMEOUT_PATTERNS = [
  'timeout',
  'timed out',
  'econnreset',
  'econnrefused',
  'enotfound',
  'socket hang up',
  'network error',
  'fetch failed',
  'aborted',
];

/**
 * Classifies a raw provider exception into an actionable control object.
 *
 * @param error - The raw error thrown by the provider integration.
 * @returns The classified error with retry/compress/failover hints.
 */
export function classifyApiError(error: unknown): ClassifiedError {
  const err = error instanceof Error ? error : new Error(String(error));
  const msg = err.message.toLowerCase();
  const status = extractStatus(err);

  if (status === 401 || status === 403) {
    return make('auth', err, { retryable: true, shouldRotate: true, backoffMs: 0 });
  }

  if (status === 402) {
    const isTempQuota = RATE_LIMIT_PATTERNS.some(p => msg.includes(p));
    if (isTempQuota) {
      return make('rate_limit', err, { retryable: true, shouldRotate: true, backoffMs: 5_000 });
    }
    return make('billing', err, { retryable: false, shouldRotate: true, shouldFallback: true });
  }

  if (status === 404) {
    return make('model_not_found', err, { retryable: false });
  }

  if (status === 429) {
    return make('rate_limit', err, { retryable: true, shouldRotate: true, backoffMs: 5_000 });
  }

  if (status === 400) {
    if (CONTEXT_OVERFLOW_PATTERNS.some(p => msg.includes(p))) {
      return make('context_overflow', err, { retryable: true, shouldCompress: true, backoffMs: 0 });
    }
    return make('format_error', err, { retryable: false });
  }

  if (status === 500 || status === 502) {
    return make('server_error', err, { retryable: true, backoffMs: 2_000 });
  }

  if (status === 503 || status === 529) {
    return make('overloaded', err, { retryable: true, backoffMs: 5_000 });
  }

  // Heuristic pattern matching
  if (CONTEXT_OVERFLOW_PATTERNS.some(p => msg.includes(p))) {
    return make('context_overflow', err, { retryable: true, shouldCompress: true, backoffMs: 0 });
  }

  if (RATE_LIMIT_PATTERNS.some(p => msg.includes(p))) {
    return make('rate_limit', err, { retryable: true, shouldRotate: true, backoffMs: 5_000 });
  }

  if (BILLING_PATTERNS.some(p => msg.includes(p))) {
    return make('billing', err, { retryable: false, shouldRotate: true, shouldFallback: true });
  }

  if (TIMEOUT_PATTERNS.some(p => msg.includes(p))) {
    return make('timeout', err, { retryable: true, backoffMs: 2_000 });
  }

  return make('unknown', err, { retryable: true, backoffMs: 3_000 });
}

/**
 * Extracts HTTP status code from polymorphic error payloads.
 *
 * @param err - The Error object to inspect.
 * @returns The status code, or null if not found.
 */
function extractStatus(err: Error): number | null {
  const record = err as unknown as Record<string, unknown>;
  if (typeof record['status'] === 'number') return record['status'];
  if (typeof record['statusCode'] === 'number') return record['statusCode'];
  if (typeof record['httpStatus'] === 'number') return record['httpStatus'];

  const msg = err.message.toLowerCase();
  const m = msg.match(/(?:status|error|http)?\s*\(?(\d{3})\)?/);
  return m ? parseInt(m[1]!, 10) : null;
}

interface MakeOpts {
  retryable?: boolean;
  shouldCompress?: boolean;
  shouldRotate?: boolean;
  shouldFallback?: boolean;
  backoffMs?: number;
}

function make(reason: FailoverReason, original: Error, opts: MakeOpts = {}): ClassifiedError {
  return {
    reason,
    retryable: opts.retryable ?? false,
    shouldCompress: opts.shouldCompress ?? false,
    shouldRotate: opts.shouldRotate ?? false,
    shouldFallback: opts.shouldFallback ?? false,
    backoffMs: opts.backoffMs ?? 0,
    original,
  };
}
