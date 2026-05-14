/**
 * @module commands/config
 * @description Interactive configuration manager for `~/.aouo/config.json`.
 *
 * The public CLI is organized around operational surfaces:
 * provider/model, tool APIs, channels/cron, and advanced runtime settings.
 */

import { checkbox, confirm, input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import type { AouoConfig } from '../config/defaults.js';
import { loadConfig, saveConfig } from '../config/loader.js';
import { hasCodexAuth } from '../lib/auth.js';
import { isInitialized } from '../lib/paths.js';

type ProviderBackend = AouoConfig['provider']['backend'];
type LogLevel = AouoConfig['advanced']['log_level'];

const CUSTOM_MODEL = '__custom_model__';

const PROVIDER_MODELS: Record<ProviderBackend, string[]> = {
  gemini: ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-pro'],
  codex: ['gpt-5.4', 'gpt-5.3-codex', 'gpt-5.4-mini'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
};

const TOOL_GROUPS = [
  { value: 'file', name: 'file - read/write/list files inside the security fence' },
  { value: 'web_search', name: 'web_search - Tavily-backed search' },
  { value: 'memory', name: 'memory - pack-scoped USER.md/MEMORY.md' },
  { value: 'skill_view', name: 'skill_view - load pack skill instructions' },
  { value: 'clarify', name: 'clarify - ask the user a question' },
  { value: 'msg', name: 'msg - platform-neutral outbound message intents' },
  { value: 'tts', name: 'tts - text-to-speech generation' },
  { value: 'db', name: 'db - read-only SQLite diagnostics' },
  { value: 'persist', name: 'persist - pack-scoped structured writes' },
  { value: 'cron', name: 'cron - scheduled job management' },
];

function maskKey(key: string | undefined): string {
  if (!key) return chalk.yellow('not set');
  if (key.length <= 8) return '****';
  return `${key.substring(0, 4)}****${key.substring(key.length - 4)}`;
}

function status(value: string | boolean | undefined): string {
  if (!value) return chalk.yellow('not configured');
  return chalk.green('configured');
}

function assertInitialized(): boolean {
  if (isInitialized()) return true;
  console.log(chalk.yellow('Not initialized. Run `aouo init` first.'));
  return false;
}

async function withPromptErrors(work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (err) {
    if ((err as Error)?.name === 'ExitPromptError') {
      console.log(chalk.dim('\n  Cancelled.'));
      return;
    }
    throw err;
  }
}

function saveAndReport(config: AouoConfig, message: string): void {
  saveConfig(config);
  console.log(chalk.green(`\n  [ok] ${message}`));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function positiveInt(value: string, fallback: number, min = 1): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.floor(parsed));
}

function finiteNumber(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

// ── Entry Points ─────────────────────────────────────────────────────────────

export async function runConfigMenu(): Promise<void> {
  if (!assertInitialized()) return;

  await withPromptErrors(async () => {
    const config = loadConfig();
    const section = await select({
      message: 'Configure',
      choices: [
        {
          name: `Provider & model ${chalk.dim(`(${config.provider.backend}/${config.provider.model})`)}`,
          value: 'provider',
        },
        {
          name: `Tool APIs & enablement ${chalk.dim(`(${config.tools.enabled.length} enabled)`)}`,
          value: 'tools',
        },
        {
          name: `Channels & cron ${chalk.dim(`(Telegram ${status(config.telegram.bot_token)})`)}`,
          value: 'channels',
        },
        {
          name: `Advanced runtime ${chalk.dim(`(${config.advanced.log_level}, max loops ${config.advanced.max_react_loops})`)}`,
          value: 'advanced',
        },
        { name: 'Show masked config', value: 'show' },
        { name: chalk.dim('Cancel'), value: 'cancel' },
      ],
    });

    switch (section) {
      case 'provider': await configureProvider(config); break;
      case 'tools': await configureTools(config); break;
      case 'channels': await configureChannels(config); break;
      case 'advanced': await configureAdvanced(config); break;
      case 'show': runConfigShow(); break;
      case 'cancel': return;
    }
  });
}

export async function runConfigProvider(): Promise<void> {
  if (!assertInitialized()) return;
  await withPromptErrors(async () => configureProvider(loadConfig()));
}

export async function runConfigTools(): Promise<void> {
  if (!assertInitialized()) return;
  await withPromptErrors(async () => configureTools(loadConfig()));
}

export async function runConfigChannels(): Promise<void> {
  if (!assertInitialized()) return;
  await withPromptErrors(async () => configureChannels(loadConfig()));
}

export async function runConfigAdvanced(): Promise<void> {
  if (!assertInitialized()) return;
  await withPromptErrors(async () => configureAdvanced(loadConfig()));
}

// ── Show ─────────────────────────────────────────────────────────────────────

export function runConfigShow(): void {
  if (!assertInitialized()) return;

  const config = loadConfig();
  const display = JSON.parse(JSON.stringify(config));

  if (display.gemini?.api_key) display.gemini.api_key = maskKey(display.gemini.api_key);
  if (display.deepseek?.api_key) display.deepseek.api_key = maskKey(display.deepseek.api_key);
  if (display.tools?.web_search?.api_key) display.tools.web_search.api_key = maskKey(display.tools.web_search.api_key);
  if (display.telegram?.bot_token) display.telegram.bot_token = maskKey(display.telegram.bot_token);
  if (display.stt?.groq_api_key) display.stt.groq_api_key = maskKey(display.stt.groq_api_key);
  if (display.azure?.speech_key) display.azure.speech_key = maskKey(display.azure.speech_key);

  console.log(chalk.bold.cyan('\naouo Configuration'));
  console.log(JSON.stringify(display, null, 2));
  console.log();
}

// ── Provider ─────────────────────────────────────────────────────────────────

async function configureProvider(config: AouoConfig): Promise<void> {
  const backend = await select<ProviderBackend>({
    message: 'Active provider',
    choices: [
      {
        name: `Gemini ${chalk.dim(`(${status(config.gemini.api_key)}, model ${config.provider.model})`)}`,
        value: 'gemini',
      },
      {
        name: `Codex ${chalk.dim(`(${hasCodexAuth() ? chalk.green('authenticated') : chalk.yellow('not authenticated')})`)}`,
        value: 'codex',
      },
      {
        name: `DeepSeek ${chalk.dim(`(${status(config.deepseek.api_key)})`)}`,
        value: 'deepseek',
      },
    ],
  });

  if (backend === 'gemini') await configureGeminiProvider(config);
  if (backend === 'codex') await configureCodexProvider(config);
  if (backend === 'deepseek') await configureDeepSeekProvider(config);
}

async function chooseModel(backend: ProviderBackend, current: string): Promise<string> {
  const defaultModel = PROVIDER_MODELS[backend][0] ?? current;
  const suggestions = unique([current, ...PROVIDER_MODELS[backend]]);
  const picked = await select<string>({
    message: 'Model',
    choices: [
      ...suggestions.map((model) => ({ name: model, value: model })),
      { name: 'Custom model id', value: CUSTOM_MODEL },
    ],
  });

  if (picked !== CUSTOM_MODEL) return picked;

  const custom = await input({
    message: 'Custom model id:',
    default: current || defaultModel,
  });

  return custom.trim() || current || defaultModel;
}

async function configureGeminiProvider(config: AouoConfig): Promise<void> {
  console.log();
  console.log(chalk.dim(`  Gemini API Key: ${maskKey(config.gemini.api_key)}`));
  console.log(chalk.dim('  Get a key: https://aistudio.google.com/'));
  console.log();

  const apiKey = await input({
    message: 'Gemini API Key (Enter keeps current):',
    default: config.gemini.api_key || undefined,
  });
  if (apiKey.trim()) config.gemini.api_key = apiKey.trim();

  const model = await chooseModel('gemini', config.provider.backend === 'gemini' ? config.provider.model : '');
  const visionModel = await input({
    message: 'Gemini vision model:',
    default: config.gemini.vision_model || model,
  });

  config.provider.backend = 'gemini';
  config.provider.model = model;
  config.gemini.vision_model = visionModel.trim() || model;

  saveAndReport(config, 'Gemini provider saved.');
}

async function configureCodexProvider(config: AouoConfig): Promise<void> {
  const { codexDeviceLogin, hasCodexAuth: checkAuth } = await import('../lib/auth.js');
  const authenticated = checkAuth();

  console.log();
  console.log(chalk.dim(`  Codex OAuth: ${authenticated ? chalk.green('authenticated') : chalk.yellow('not authenticated')}`));
  console.log();

  if (!authenticated || await confirm({ message: 'Run Codex OAuth login?', default: false })) {
    await codexDeviceLogin();
  }

  const model = await chooseModel('codex', config.provider.backend === 'codex' ? config.provider.model : 'gpt-5.4');
  config.provider.backend = 'codex';
  config.provider.model = model;

  saveAndReport(config, 'Codex provider saved.');
}

async function configureDeepSeekProvider(config: AouoConfig): Promise<void> {
  console.log();
  console.log(chalk.dim(`  DeepSeek API Key: ${maskKey(config.deepseek.api_key)}`));
  console.log(chalk.dim('  Get a key: https://platform.deepseek.com/'));
  console.log();

  const apiKey = await input({
    message: 'DeepSeek API Key (Enter keeps current):',
    default: config.deepseek.api_key || undefined,
  });
  if (apiKey.trim()) config.deepseek.api_key = apiKey.trim();

  const model = await chooseModel('deepseek', config.provider.backend === 'deepseek' ? config.provider.model : '');
  config.provider.backend = 'deepseek';
  config.provider.model = model;

  saveAndReport(config, 'DeepSeek provider saved.');
}

// ── Tools ────────────────────────────────────────────────────────────────────

async function configureTools(config: AouoConfig): Promise<void> {
  const section = await select({
    message: 'Configure tools',
    choices: [
      { name: `Enabled tool groups ${chalk.dim(`(${config.tools.enabled.join(', ')})`)}`, value: 'enabled' },
      { name: `Web search / Tavily ${chalk.dim(`(${status(config.tools.web_search.api_key)})`)}`, value: 'tavily' },
      { name: `Speech-to-text / Groq Whisper ${chalk.dim(`(${status(config.stt.groq_api_key)})`)}`, value: 'stt' },
      { name: `Text-to-speech / Azure Speech ${chalk.dim(`(${status(config.azure.speech_key)})`)}`, value: 'azure' },
      { name: chalk.dim('Back'), value: 'back' },
    ],
  });

  switch (section) {
    case 'enabled': await configureEnabledTools(config); break;
    case 'tavily': await configureTavily(config); break;
    case 'stt': await configureSTT(config); break;
    case 'azure': await configureAzure(config); break;
    case 'back': return;
  }
}

async function configureEnabledTools(config: AouoConfig): Promise<void> {
  const current = new Set(config.tools.enabled);
  const selected = await checkbox<string>({
    message: 'Enabled tool groups',
    choices: TOOL_GROUPS.map((tool) => ({
      ...tool,
      checked: current.has(tool.value),
    })),
  });

  config.tools.enabled = selected;
  saveAndReport(config, 'Tool enablement saved.');
}

async function configureTavily(config: AouoConfig): Promise<void> {
  console.log();
  console.log(chalk.dim(`  Tavily API Key: ${maskKey(config.tools.web_search.api_key)}`));
  console.log(chalk.dim('  Get a key: https://tavily.com/'));
  console.log();

  const apiKey = await input({
    message: 'Tavily API Key (Enter keeps current):',
    default: config.tools.web_search.api_key || undefined,
  });
  if (apiKey.trim()) config.tools.web_search.api_key = apiKey.trim();

  const maxResults = await input({
    message: 'Max web search results:',
    default: String(config.tools.web_search.max_results || 5),
  });
  config.tools.web_search.backend = config.tools.web_search.backend || 'tavily';
  config.tools.web_search.max_results = positiveInt(maxResults, config.tools.web_search.max_results || 5, 1);

  saveAndReport(config, 'Web search settings saved.');
}

async function configureSTT(config: AouoConfig): Promise<void> {
  console.log();
  console.log(chalk.dim(`  Groq API Key: ${maskKey(config.stt.groq_api_key)}`));
  console.log(chalk.dim('  Get a key: https://console.groq.com/'));
  console.log();

  const apiKey = await input({
    message: 'Groq API Key (Enter keeps current):',
    default: config.stt.groq_api_key || undefined,
  });
  if (apiKey.trim()) config.stt.groq_api_key = apiKey.trim();

  const model = await input({
    message: 'STT model:',
    default: config.stt.model || 'whisper-large-v3-turbo',
  });
  config.stt.model = model.trim() || 'whisper-large-v3-turbo';

  saveAndReport(config, 'Speech-to-text settings saved.');
}

async function configureAzure(config: AouoConfig): Promise<void> {
  console.log();
  console.log(chalk.dim(`  Azure Speech Key: ${maskKey(config.azure.speech_key)}`));
  console.log(chalk.dim(`  Region: ${config.azure.speech_region || 'eastasia'}`));
  console.log();

  const speechKey = await input({
    message: 'Azure Speech Key (Enter keeps current):',
    default: config.azure.speech_key || undefined,
  });
  if (speechKey.trim()) config.azure.speech_key = speechKey.trim();

  const region = await input({
    message: 'Azure Speech region:',
    default: config.azure.speech_region || 'eastasia',
  });
  config.azure.speech_region = region.trim() || 'eastasia';

  const voice = await input({
    message: 'Default TTS voice:',
    default: config.tts.voice || 'en-US-AriaNeural',
  });
  config.tts.voice = voice.trim() || 'en-US-AriaNeural';

  saveAndReport(config, 'Text-to-speech settings saved.');
}

// ── Channels ─────────────────────────────────────────────────────────────────

async function configureChannels(config: AouoConfig): Promise<void> {
  const section = await select({
    message: 'Configure channels',
    choices: [
      {
        name: `Telegram ${chalk.dim(`(${config.telegram.enabled ? 'on' : 'off'}, ${status(config.telegram.bot_token)})`)}`,
        value: 'telegram',
      },
      {
        name: `Cron delivery ${chalk.dim(`(${config.cron.enabled ? 'on' : 'off'}, ${config.cron.default_platform})`)}`,
        value: 'cron',
      },
      { name: chalk.dim('Back'), value: 'back' },
    ],
  });

  switch (section) {
    case 'telegram': await configureTelegram(config); break;
    case 'cron': await configureCron(config); break;
    case 'back': return;
  }
}

async function configureTelegram(config: AouoConfig): Promise<void> {
  console.log();
  console.log(chalk.dim(`  Bot Token:     ${maskKey(config.telegram.bot_token)}`));
  console.log(chalk.dim(`  Allowed Users: ${config.telegram.allowed_user_ids.length ? config.telegram.allowed_user_ids.join(', ') : 'all'}`));
  console.log();

  config.telegram.enabled = await confirm({
    message: 'Enable Telegram channel?',
    default: config.telegram.enabled,
  });

  const botToken = await input({
    message: 'Telegram Bot Token (Enter keeps current):',
    default: config.telegram.bot_token || undefined,
  });
  if (botToken.trim()) config.telegram.bot_token = botToken.trim();

  const userIds = await input({
    message: 'Allowed Telegram User IDs (comma-separated, Enter allows all):',
    default: config.telegram.allowed_user_ids.join(', ') || undefined,
  });

  if (userIds.trim()) {
    const parsed = userIds
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => Number(value));
    if (parsed.some((value) => !Number.isSafeInteger(value))) {
      console.log(chalk.yellow('\n  Cancelled. User IDs must be numeric.'));
      return;
    }
    config.telegram.allowed_user_ids = parsed;
  } else {
    config.telegram.allowed_user_ids = [];
  }

  saveAndReport(config, 'Telegram settings saved.');
}

async function configureCron(config: AouoConfig): Promise<void> {
  console.log();
  console.log(chalk.dim(`  Enabled:          ${config.cron.enabled ? 'yes' : 'no'}`));
  console.log(chalk.dim(`  Tick seconds:     ${config.cron.tick_seconds}`));
  console.log(chalk.dim(`  Timezone:         ${config.cron.timezone}`));
  console.log(chalk.dim(`  Default platform: ${config.cron.default_platform}`));
  console.log(chalk.dim(`  Default chat:     ${config.cron.default_chat_id || '(not set)'}`));
  console.log();

  config.cron.enabled = await confirm({
    message: 'Enable background cron scheduler?',
    default: config.cron.enabled,
  });

  const tickSeconds = await input({
    message: 'Tick interval seconds:',
    default: String(config.cron.tick_seconds || 60),
  });
  config.cron.tick_seconds = positiveInt(tickSeconds, config.cron.tick_seconds || 60, 10);

  const timezone = await input({
    message: 'Timezone:',
    default: config.cron.timezone || 'UTC',
  });
  config.cron.timezone = timezone.trim() || 'UTC';

  const defaultPlatform = await select<string>({
    message: 'Default cron delivery platform',
    choices: [
      { name: 'Telegram', value: 'telegram' },
      { name: 'CLI/log only', value: 'cli' },
    ],
  });
  config.cron.default_platform = defaultPlatform;

  const defaultChat = await input({
    message: 'Default chat/user ID for cron pushes:',
    default: config.cron.default_chat_id || undefined,
  });
  config.cron.default_chat_id = defaultChat.trim();

  saveAndReport(config, 'Cron settings saved.');
}

// ── Advanced ─────────────────────────────────────────────────────────────────

async function configureAdvanced(config: AouoConfig): Promise<void> {
  const maxTokens = await input({
    message: 'Provider max output tokens:',
    default: String(config.provider.max_tokens),
  });
  config.provider.max_tokens = positiveInt(maxTokens, config.provider.max_tokens, 256);

  const temperature = await input({
    message: 'Provider temperature:',
    default: String(config.provider.temperature),
  });
  config.provider.temperature = finiteNumber(temperature, config.provider.temperature, 0, 2);

  const maxRetries = await input({
    message: 'Provider max retries:',
    default: String(config.provider.max_retries),
  });
  config.provider.max_retries = positiveInt(maxRetries, config.provider.max_retries, 0);

  const contextWindow = await input({
    message: 'Context window token budget:',
    default: String(config.advanced.context_window),
  });
  config.advanced.context_window = positiveInt(contextWindow, config.advanced.context_window, 1024);

  const maxReactLoops = await input({
    message: 'Max ReAct loops per request:',
    default: String(config.advanced.max_react_loops),
  });
  config.advanced.max_react_loops = positiveInt(maxReactLoops, config.advanced.max_react_loops, 1);

  config.advanced.log_level = await select<LogLevel>({
    message: 'Log level',
    choices: [
      { name: 'debug', value: 'debug' },
      { name: 'info', value: 'info' },
      { name: 'warn', value: 'warn' },
      { name: 'error', value: 'error' },
    ],
    default: config.advanced.log_level,
  });

  config.ui.show_tool_calls = await confirm({
    message: 'Show tool calls in UI/adapters?',
    default: config.ui.show_tool_calls,
  });

  saveAndReport(config, 'Advanced runtime settings saved.');
}
