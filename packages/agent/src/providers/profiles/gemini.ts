/**
 * @module providers/profiles/gemini
 * @description Google AI Studio — native streaming protocol over query-param key.
 *
 * Gemini puts the API key in the URL query (`?key=...`) rather than an
 * Authorization header. URL is per-model since the endpoint embeds the
 * model name path-segment.
 */

import type { AouoConfig } from '../../config/defaults.js';
import type { ProviderProfile } from '../types.js';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export const geminiProfile: ProviderProfile = {
  name: 'gemini',
  apiMode: 'gemini_native',
  authType: 'api_key',

  async prepareRequest(model: string, config: AouoConfig) {
    const apiKey = config.gemini.api_key;
    if (!apiKey) {
      throw new Error('Gemini API key not configured. Set gemini.api_key in config.json.');
    }
    return {
      url: `${GEMINI_BASE_URL}/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
      headers: {},
    };
  },
};
