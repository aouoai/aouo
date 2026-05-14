/**
 * @module providers/index
 * @description Provider factory for creating LLM provider instances.
 */

import type { LLMProvider } from '../agent/types.js';
import type { AouoConfig } from '../config/defaults.js';
import { GeminiProvider } from './gemini.js';
import { CodexProvider } from './codex/index.js';
import { DeepSeekProvider } from './deepseek/index.js';

/**
 * Creates an LLM provider instance based on the configured backend.
 *
 * @param config - The active application configuration.
 * @returns An LLMProvider implementation matching the configured backend.
 */
export function createProvider(config: AouoConfig): LLMProvider {
  switch (config.provider.backend) {
    case 'codex':
      return new CodexProvider();
    case 'deepseek':
      return new DeepSeekProvider();
    case 'gemini':
    default:
      return new GeminiProvider();
  }
}

export { GeminiProvider, CodexProvider, DeepSeekProvider };
