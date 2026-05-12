/**
 * @module providers/index
 * @description Provider factory for creating LLM provider instances.
 */

import type { LLMProvider } from '../agent/types.js';
import type { AouoConfig } from '../config/defaults.js';
import { GeminiProvider } from './gemini.js';

/**
 * Creates an LLM provider instance based on the configured backend.
 *
 * @param config - The active application configuration.
 * @returns An LLMProvider implementation matching the configured backend.
 */
export function createProvider(config: AouoConfig): LLMProvider {
  switch (config.provider.backend) {
    case 'gemini':
      return new GeminiProvider();
    default:
      return new GeminiProvider();
  }
}

export { GeminiProvider };
