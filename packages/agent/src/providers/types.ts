/**
 * @module providers/types
 * @description Provider + transport abstractions.
 *
 * Two orthogonal concerns:
 * - `ProviderProfile` — declarative metadata for one vendor (name, endpoint,
 *   auth, config keys). One per vendor (gemini, deepseek, openai, codex).
 * - `ProviderTransport` — protocol-level translator (request body shape,
 *   stream consumer). One per `api_mode`; multiple profiles can share
 *   the same transport (e.g. DeepSeek + OpenAI both use `chat_completions`).
 *
 * The runner (`runner.ts`) owns the orthogonal universal concerns:
 * retry loop, timeout, error classification, OAuth refresh.
 */

import type { AouoConfig } from '../config/defaults.js';
import type { LLMResponse, Message, ToolSchema } from '../agent/types.js';

/** Wire-protocol family. Determines which transport handles the request. */
export type ApiMode = 'chat_completions' | 'gemini_native' | 'responses';

/** Credential kind. Determines refresh behaviour on 401. */
export type AuthType = 'api_key' | 'oauth';

/**
 * Inputs the runner hands to a transport when building a request body.
 */
export interface TransportRequest {
  model: string;
  messages: Message[];
  tools: ToolSchema[];
  temperature: number;
  maxTokens: number;
  /** Used by Codex for `prompt_cache_key`; ignored elsewhere. */
  sessionId?: string;
}

/**
 * Declarative description of a single vendor.
 *
 * A profile knows where to send the request (URL), how to authenticate
 * (headers), and which protocol family handles its replies (apiMode).
 * It does *not* know about retry, timeout, or response parsing.
 */
export interface ProviderProfile {
  /** Stable identifier — matches `config.provider.backend`. */
  readonly name: string;
  /** Selects which transport handles this profile's requests. */
  readonly apiMode: ApiMode;
  /** Credential kind. `oauth` enables one-shot 401 refresh in the runner. */
  readonly authType: AuthType;

  /**
   * Build URL + auth headers for the next request.
   *
   * For OAuth profiles, `opts.forceRefresh` is set by the runner after a
   * 401, signalling that the cached token should be exchanged for a new
   * one before retry. API-key profiles ignore the option.
   *
   * Throws if credentials are missing (the agent should not have selected
   * this profile in the first place).
   */
  prepareRequest(
    model: string,
    config: AouoConfig,
    opts?: { forceRefresh?: boolean },
  ): Promise<{ url: string; headers: Record<string, string> }>;
}

/**
 * Stateless protocol translator + stream consumer.
 *
 * One implementation per `ApiMode`. Shared across all profiles that speak
 * the same wire protocol.
 */
export interface ProviderTransport {
  readonly apiMode: ApiMode;
  /** Build the JSON body of a streaming POST. */
  buildRequestBody(req: TransportRequest): Record<string, unknown>;
  /** Consume the SSE stream and aggregate it into an LLMResponse. */
  consumeStream(response: Response, startTime: number): Promise<LLMResponse>;
}
