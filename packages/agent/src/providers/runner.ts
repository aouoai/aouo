/**
 * @module providers/runner
 * @description The single retry/timeout/error-classify loop that every
 * provider uses. Profile + transport are passed in; the runner owns
 * universal concerns and stays vendor-agnostic.
 */

import type { AouoConfig } from '../config/defaults.js';
import type { LLMResponse } from '../agent/types.js';
import type { ProviderProfile, ProviderTransport, TransportRequest } from './types.js';
import { classifyApiError } from '../agent/errorClassifier.js';
import { logger, redactSecrets } from '../lib/logger.js';

const REQUEST_TIMEOUT_MS = 90_000;
const MAX_BACKOFF_MS = 10_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RunChatArgs {
  profile: ProviderProfile;
  transport: ProviderTransport;
  request: TransportRequest;
  config: AouoConfig;
}

/**
 * Execute one chat-completion call, end to end.
 *
 * Handles fetch, retry-with-backoff, OAuth 401 refresh (one-shot), and
 * error classification. Returns the parsed LLMResponse on success.
 */
export async function runChat(args: RunChatArgs): Promise<LLMResponse> {
  const { profile, transport, request, config } = args;
  const maxRetries = config.provider.max_retries;
  const body = JSON.stringify(transport.buildRequestBody(request));
  let authRefreshed = false;
  let forceRefresh = false;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const startTime = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      const { url, headers } = await profile.prepareRequest(request.model, config, { forceRefresh });
      forceRefresh = false;
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body,
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeout);
      const isAbort = (fetchErr as Error).name === 'AbortError';
      const errMsg = isAbort
        ? `${profile.name} API request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
        : `${profile.name} API fetch failed: ${(fetchErr as Error).message}`;
      logger.error({
        msg: 'api_fetch_error',
        provider: profile.name,
        error: redactSecrets(errMsg),
        aborted: isAbort,
        attempt,
        elapsed_ms: Date.now() - startTime,
      });
      if (attempt < maxRetries) {
        await sleep(Math.min(1000 * Math.pow(2, attempt), MAX_BACKOFF_MS));
        continue;
      }
      throw new Error(errMsg);
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 401 && profile.authType === 'oauth' && !authRefreshed) {
      authRefreshed = true;
      forceRefresh = true;
      logger.info({ msg: 'oauth_refresh_on_401', provider: profile.name });
      continue;
    }

    if (!response.ok) {
      const errText = await response.text();
      const safeBody = redactSecrets(errText.substring(0, 200));
      const apiErr = new Error(
        `${profile.name} API error (${response.status}): ${redactSecrets(errText.substring(0, 500))}`,
      );
      const classified = classifyApiError(apiErr);

      logger.error({
        msg: 'api_error',
        provider: profile.name,
        status: response.status,
        reason: classified.reason,
        retryable: classified.retryable,
        body: safeBody,
        elapsed_ms: Date.now() - startTime,
        attempt,
      });

      if (!classified.retryable || attempt >= maxRetries) throw apiErr;
      await sleep(classified.backoffMs || Math.min(1000 * Math.pow(2, attempt), MAX_BACKOFF_MS));
      continue;
    }

    return await transport.consumeStream(response, startTime);
  }

  throw new Error(`${profile.name} API: max retries exceeded`);
}
