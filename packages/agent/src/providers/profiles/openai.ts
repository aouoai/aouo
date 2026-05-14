/**
 * @module providers/profiles/openai
 * @description OpenAI Platform — Chat Completions over Bearer API key.
 */

import type { AouoConfig } from '../../config/defaults.js';
import type { ProviderProfile } from '../types.js';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';

export const openaiProfile: ProviderProfile = {
  name: 'openai',
  apiMode: 'chat_completions',
  authType: 'api_key',

  async prepareRequest(_model: string, config: AouoConfig) {
    const apiKey = config.openai.api_key;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured. Set config.openai.api_key.');
    }
    return {
      url: `${OPENAI_BASE_URL}/chat/completions`,
      headers: { Authorization: `Bearer ${apiKey}` },
    };
  },
};
