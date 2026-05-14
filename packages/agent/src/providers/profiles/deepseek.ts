/**
 * @module providers/profiles/deepseek
 * @description DeepSeek — Chat Completions over Bearer API key.
 */

import type { AouoConfig } from '../../config/defaults.js';
import type { ProviderProfile } from '../types.js';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

export const deepseekProfile: ProviderProfile = {
  name: 'deepseek',
  apiMode: 'chat_completions',
  authType: 'api_key',

  async prepareRequest(_model: string, config: AouoConfig) {
    const apiKey = config.deepseek?.api_key;
    if (!apiKey) {
      throw new Error('DeepSeek API key not configured. Set config.deepseek.api_key.');
    }
    return {
      url: `${DEEPSEEK_BASE_URL}/chat/completions`,
      headers: { Authorization: `Bearer ${apiKey}` },
    };
  },
};
