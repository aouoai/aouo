/**
 * @module providers/codex
 * @description Codex OAuth LLM provider using the Responses-compatible transport.
 *
 * Connects to chatgpt.com/backend-api/codex with device-code OAuth. This is
 * intentionally separate from the direct OpenAI Platform API-key provider path.
 */

import type { Message, LLMResponse, ToolParameterSchema, LLMProvider, ChatOptions } from '../../agent/types.js';
import type { AouoConfig } from '../../config/defaults.js';
import { getCodexAccessToken, forceRefreshCodexToken } from '../../lib/auth.js';
import { classifyApiError } from '../../agent/errorClassifier.js';
import { logger, redactSecrets } from '../../lib/logger.js';
import { toResponsesInput, toResponsesTools } from './transform.js';
import { consumeStream } from './stream.js';

const CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Codex OAuth provider — Responses-compatible streaming transport. */
export class CodexProvider implements LLMProvider {
  readonly name = 'codex';

  async chat(
    messages: Message[],
    tools: Array<{ name: string; description: string; parameters: ToolParameterSchema }>,
    config: AouoConfig,
    options?: ChatOptions,
  ): Promise<LLMResponse> {
    const { instructions, input } = toResponsesInput(messages);

    const body: Record<string, unknown> = {
      model: config.provider.model,
      instructions: instructions || 'You are a helpful assistant.',
      input,
      store: false,
      stream: true,
      prompt_cache_key: options?.sessionId || undefined,
    };

    if (tools.length > 0) {
      body.tools = toResponsesTools(tools);
      body.tool_choice = 'auto';
    }

    let currentToken = getCodexAccessToken();
    let authRefreshed = false;
    const maxRetries = config.provider.max_retries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90_000);

      let response: Response;
      try {
        response = await fetch(`${CODEX_BASE_URL}/responses`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentToken}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (fetchErr) {
        clearTimeout(timeout);
        const isAbort = (fetchErr as Error).name === 'AbortError';
        const errMsg = isAbort
          ? 'Codex API request timed out after 90s'
          : `Codex API fetch failed: ${(fetchErr as Error).message}`;
        logger.error({
          msg: 'api_fetch_error', provider: 'codex',
          error: errMsg, aborted: isAbort, attempt,
          elapsed_ms: Date.now() - startTime,
        });

        if (attempt < maxRetries) {
          await sleep(Math.min(1000 * Math.pow(2, attempt), 10_000));
          continue;
        }
        throw new Error(errMsg);
      } finally {
        clearTimeout(timeout);
      }

      // Auto-refresh on 401
      if (response.status === 401 && !authRefreshed) {
        authRefreshed = true;
        try {
          currentToken = await forceRefreshCodexToken();
          logger.info({ msg: 'codex_token_refreshed_on_401' });
          continue;
        } catch (refreshErr) {
          throw new Error(`Codex auth expired and refresh failed: ${(refreshErr as Error).message}`);
        }
      }

      if (!response.ok) {
        const errText = await response.text();
        const safeBody = redactSecrets(errText.substring(0, 200));
        const apiErr = new Error(`Codex API error (${response.status}): ${redactSecrets(errText.substring(0, 500))}`);
        const classified = classifyApiError(apiErr);

        logger.error({
          msg: 'api_error', provider: 'codex',
          status: response.status, reason: classified.reason,
          retryable: classified.retryable,
          body: safeBody,
          elapsed_ms: Date.now() - startTime, attempt,
        });

        if (!classified.retryable || attempt >= maxRetries) throw apiErr;
        await sleep(classified.backoffMs || Math.min(1000 * Math.pow(2, attempt), 10_000));
        continue;
      }

      return await consumeStream(response, startTime);
    }

    throw new Error('Codex API: max retries exceeded');
  }
}
