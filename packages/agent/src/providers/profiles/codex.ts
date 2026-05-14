/**
 * @module providers/profiles/codex
 * @description Codex — Responses protocol over ChatGPT-subscription OAuth.
 *
 * `prepareRequest` returns the cached OAuth token; when the runner
 * encounters a 401 it calls back with `forceRefresh: true`, at which
 * point we exchange the refresh token before returning the new
 * Authorization header.
 */

import type { ProviderProfile } from '../types.js';
import { getCodexAccessToken, forceRefreshCodexToken } from '../../lib/auth.js';

const CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex';

export const codexProfile: ProviderProfile = {
  name: 'codex',
  apiMode: 'responses',
  authType: 'oauth',

  async prepareRequest(_model, _config, opts) {
    const token = opts?.forceRefresh ? await forceRefreshCodexToken() : getCodexAccessToken();
    return {
      url: `${CODEX_BASE_URL}/responses`,
      headers: { Authorization: `Bearer ${token}` },
    };
  },
};
