/**
 * @module config/defaults
 * @description Type definitions and default fallback values for the aouo configuration.
 *
 * This configuration controls the agent runtime, LLM provider connections,
 * tool enablement, security boundaries, and orchestration parameters.
 *
 * Domain-specific configuration belongs in pack manifests, not here.
 */

/**
 * Complete configuration shape for the aouo agent runtime.
 *
 * Loaded from `~/.aouo/config.json`, deeply merged with defaults,
 * and validated at startup.
 */
export interface AouoConfig {
  /** Configuration format version. */
  version: string;

  /** Primary LLM provider settings. */
  provider: {
    /** Active provider backend. */
    backend: 'gemini' | 'codex' | 'deepseek' | 'openai';
    /**
     * Model identifier. Examples by backend:
     *   - gemini:   'gemini-3-flash-preview' (default), 'gemini-3.1-pro-preview'
     *   - codex:    'gpt-5.4' / 'gpt-5.5' (OAuth, via ChatGPT subscription)
     *   - deepseek: 'deepseek-v4-pro', 'deepseek-v4-flash'
     *   - openai:   'gpt-5.4', 'o3-mini' (Platform API key)
     */
    model: string;
    /** Maximum output tokens per generation. */
    max_tokens: number;
    /** Sampling temperature (0.0–2.0). */
    temperature: number;
    /** Maximum retries for transient API errors. */
    max_retries: number;
  };

  /** Google Gemini-specific settings. */
  gemini: {
    /** API key for Gemini. */
    api_key: string;
    /** Model for multi-modal vision tasks. */
    vision_model: string;
  };

  /** DeepSeek-specific settings. */
  deepseek: {
    /** API key for DeepSeek. */
    api_key: string;
  };

  /** OpenAI Platform-specific settings. */
  openai: {
    /** API key for the OpenAI Platform (sk-...). */
    api_key: string;
  };

  /** Tool system configuration. */
  tools: {
    /** Tool names the agent is permitted to invoke. */
    enabled: string[];
    /** Web search backend settings. */
    web_search: {
      /** Search backend service (e.g., 'tavily'). */
      backend: string;
      /** API key for the search backend. */
      api_key: string;
      /** Maximum search results to process. */
      max_results: number;
    };
  };

  /** Security and execution boundaries. */
  security: {
    /** Directory paths the agent is permitted to access. */
    allowed_paths: string[];
    /** Behavior for operations outside allowed paths. */
    fence_mode: 'ask' | 'deny' | 'allow';
  };

  /** Pack system configuration. */
  packs: {
    /** List of enabled pack names. */
    enabled: string[];
    /** Directories to scan for packs (in addition to ~/.aouo/packs/). */
    scan_dirs: string[];
  };

  /** Telegram integration settings. */
  telegram: {
    /** Whether the Telegram bot is enabled. */
    enabled: boolean;
    /** Bot token from BotFather. */
    bot_token: string;
    /** Telegram user IDs allowed to interact. Empty = allow all (dev only). */
    allowed_user_ids: number[];
  };

  /** Cron scheduler settings. */
  cron: {
    /** Whether the cron scheduler is enabled. */
    enabled: boolean;
    /** Tick interval in seconds. */
    tick_seconds: number;
    /** Timezone for cron expressions. */
    timezone: string;
    /** Default platform for cron notifications. */
    default_platform: string;
    /** Default chat/user ID for cron messages. */
    default_chat_id: string;
  };

  /** Speech-to-Text settings. */
  stt: {
    /** Groq API key for audio transcription. */
    groq_api_key: string;
    /** Whisper model identifier. */
    model: string;
  };

  /** Text-to-Speech settings. */
  tts: {
    /** Voice identifier (e.g., 'en-US-AriaNeural'). */
    voice: string;
    /** Prosody rate adjustment (e.g., '+0%'). */
    rate: string;
  };

  /** Azure Cognitive Services settings (TTS, pronunciation assessment). */
  azure: {
    /** Azure Speech Services subscription key. */
    speech_key: string;
    /** Azure region (e.g., 'eastasia'). */
    speech_region: string;
  };

  /** UI display preferences. */
  ui: {
    /** Whether to echo tool calls and results to the console. */
    show_tool_calls: boolean;
  };

  /** Advanced orchestration parameters. */
  advanced: {
    /** Context window token limit before forced compression. */
    context_window: number;
    /** Ratio of context usage (0.0–1.0) that triggers compression. */
    compress_threshold: number;
    /** Maximum messages kept in active conversation history. */
    max_history_messages: number;
    /** Logging verbosity level. */
    log_level: 'debug' | 'info' | 'warn' | 'error';
    /** Maximum ReAct loop iterations per user query. */
    max_react_loops: number;
    /**
     * Per-session lifetime token cap (sum of input + output across all turns
     * in one session). When exceeded, Agent.run throws QuotaExceededError
     * before the next LLM call. Set to 0 to disable.
     */
    session_tokens_max: number;
    /**
     * Aggregate token cap for the current local day (all sessions, all
     * providers). When exceeded, Agent.run refuses new turns until the next
     * day. Set to 0 to disable. The default is provider-agnostic — at
     * Gemini Flash rates ~2M tokens ≈ a couple of USD; tune for your wallet.
     */
    daily_tokens_max: number;
  };
}

/**
 * Default configuration providing sensible fallback values.
 *
 * Deeply merged with user-defined JSON and environment variables at runtime.
 * No domain-specific tools or settings — those come from packs.
 */
export const DEFAULT_CONFIG: AouoConfig = {
  version: '0.1.0',

  provider: {
    backend: 'gemini',
    model: 'gemini-3-flash-preview',
    max_tokens: 8192,
    temperature: 0.7,
    max_retries: 3,
  },

  gemini: {
    api_key: '',
    vision_model: 'gemini-3-flash-preview',
  },

  deepseek: {
    api_key: '',
  },

  openai: {
    api_key: '',
  },

  tools: {
    enabled: [
      'file',
      'web_search',
      'memory',
      'skill_view',
      'clarify',
      'msg',
      'tts',
      'db',
      'persist',
      'cron',
    ],
    web_search: { backend: 'tavily', api_key: '', max_results: 5 },
  },

  security: {
    allowed_paths: ['~/.aouo/'],
    fence_mode: 'deny',
  },

  packs: {
    enabled: [],
    scan_dirs: [],
  },

  telegram: {
    enabled: false,
    bot_token: '',
    allowed_user_ids: [],
  },

  cron: {
    enabled: false,
    tick_seconds: 60,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    default_platform: 'telegram',
    default_chat_id: '',
  },

  stt: { groq_api_key: '', model: 'whisper-large-v3-turbo' },
  tts: { voice: 'en-US-AriaNeural', rate: '+0%' },
  azure: { speech_key: '', speech_region: 'eastasia' },
  ui: { show_tool_calls: true },

  advanced: {
    context_window: 1_000_000,
    compress_threshold: 0.8,
    max_history_messages: 200,
    log_level: 'info',
    max_react_loops: 20,
    session_tokens_max: 500_000,
    daily_tokens_max: 2_000_000,
  },
};
