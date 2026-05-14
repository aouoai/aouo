/**
 * @module providers/index
 * @description Provider factory.
 *
 * Composition over inheritance: each `LLMProvider` returned by
 * `createProvider()` is a thin wrapper around a `ProviderProfile`
 * (vendor metadata) and a `ProviderTransport` (wire protocol),
 * dispatched through the shared `runChat` runner.
 *
 * Adding a new OpenAI-compatible vendor is a 15-line profile file
 * — the transport is reused unchanged.
 */

import type { AouoConfig } from '../config/defaults.js';
import type { LLMProvider } from '../agent/types.js';
import type { ApiMode, ProviderProfile, ProviderTransport } from './types.js';
import { runChat } from './runner.js';
import { chatCompletionsTransport } from './transports/chat-completions.js';
import { geminiTransport } from './transports/gemini.js';
import { responsesTransport } from './transports/responses.js';
import { openaiProfile } from './profiles/openai.js';
import { deepseekProfile } from './profiles/deepseek.js';
import { geminiProfile } from './profiles/gemini.js';
import { codexProfile } from './profiles/codex.js';

const PROFILES: Record<AouoConfig['provider']['backend'], ProviderProfile> = {
  gemini: geminiProfile,
  deepseek: deepseekProfile,
  openai: openaiProfile,
  codex: codexProfile,
};

const TRANSPORTS: Record<ApiMode, ProviderTransport> = {
  chat_completions: chatCompletionsTransport,
  gemini_native: geminiTransport,
  responses: responsesTransport,
};

class ProfileBackedProvider implements LLMProvider {
  readonly name: string;
  constructor(
    private readonly profile: ProviderProfile,
    private readonly transport: ProviderTransport,
  ) {
    this.name = profile.name;
  }

  async chat(
    messages: Parameters<LLMProvider['chat']>[0],
    tools: Parameters<LLMProvider['chat']>[1],
    config: AouoConfig,
    options?: Parameters<LLMProvider['chat']>[3],
  ): Promise<Awaited<ReturnType<LLMProvider['chat']>>> {
    return runChat({
      profile: this.profile,
      transport: this.transport,
      config,
      request: {
        model: config.provider.model,
        messages,
        tools,
        temperature: config.provider.temperature,
        maxTokens: config.provider.max_tokens,
        ...(options?.sessionId ? { sessionId: options.sessionId } : {}),
      },
      ...(options?.onToken ? { onToken: options.onToken } : {}),
    });
  }
}

/**
 * Build an LLM provider matching `config.provider.backend`.
 */
export function createProvider(config: AouoConfig): LLMProvider {
  const profile = PROFILES[config.provider.backend] ?? geminiProfile;
  const transport = TRANSPORTS[profile.apiMode];
  return new ProfileBackedProvider(profile, transport);
}

export type { ProviderProfile, ProviderTransport, TransportRequest, ApiMode, AuthType } from './types.js';
