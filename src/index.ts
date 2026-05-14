/**
 * @module index
 * @description aouo — vertical agent app platform runtime.
 *
 * Public API surface for programmatic usage. Re-exports the core Agent,
 * type definitions, configuration, pack system, and tool registries.
 */

// ── Agent Runtime ────────────────────────────────────────────────────────────
export { Agent } from './agent/Agent.js';
export type { RunOptions, RunResult, ToolPolicy, SkillResolver } from './agent/Agent.js';

// ── Core Types ───────────────────────────────────────────────────────────────
export type {
  Message,
  MessageFile,
  ToolCall,
  ToolDispatchResult,
  TokenUsage,
  LLMResponse,
  ChatOptions,
  LLMProvider,
  Adapter,
  ToolParameterSchema,
  ToolSchema,
  ToolContext,
  ToolDefinition,
} from './agent/types.js';

// ── Agent Utilities ──────────────────────────────────────────────────────────
export { truncateHistory, sanitizeHistory } from './agent/history.js';
export { ContextCompressor, estimateTokens } from './agent/contextCompressor.js';
export type { ContextEngine } from './agent/contextCompressor.js';
export { classifyApiError } from './agent/errorClassifier.js';
export type { ClassifiedError, FailoverReason } from './agent/errorClassifier.js';
export { buildSystemPrompt, buildActiveSkillSystemPrompt } from './agent/promptBuilder.js';

// ── Configuration ────────────────────────────────────────────────────────────
export type { AouoConfig } from './config/defaults.js';
export { DEFAULT_CONFIG } from './config/defaults.js';
export { createDefaultConfig, loadConfig, getConfig, saveConfig, persistConfig, resetConfig } from './config/loader.js';

// ── Providers ────────────────────────────────────────────────────────────────
export { createProvider, GeminiProvider } from './providers/index.js';

// ── Pack System ──────────────────────────────────────────────────────────────
export type {
  PackManifest,
  LoadedPack,
  PackDependency,
  CronDefault,
  CustomToolDeclaration,
  PackPermissions,
  PackRuntime,
  ExternalToolDeclaration,
} from './packs/types.js';

export { parseManifestYaml, loadManifestFile } from './packs/manifest.js';
export type { ParseResult } from './packs/manifest.js';

export {
  scanForPacks,
  loadPack,
  loadAllPacks,
  getLoadedPacks,
  unloadAllPacks,
} from './packs/loader.js';

export {
  validatePackDirectory,
  formatValidationResult,
  linkPack,
} from './packs/validate.js';
export type { PackValidationIssue, PackValidationCheck, PackValidationResult, PackLinkResult } from './packs/validate.js';

export { registerPackCronDefaults } from './packs/cronDefaults.js';
export type { CronDefaultRegistration } from './packs/cronDefaults.js';

export {
  registerSkill,
  registerPackSkills,
  getSkill,
  getAllSkills,
  buildSkillIndex,
  clearSkills,
} from './packs/skillRegistry.js';
export type { RegisteredSkill } from './packs/skillRegistry.js';

export {
  loadPackMenus,
  resolveFastPath,
  getAllMenuPages,
  clearMenus,
} from './packs/fastpath.js';
export type { MenuItem, MenuPage, FastPathResult } from './packs/fastpath.js';

export { runPackMigration, getPackDbPath } from './packs/schema.js';

// ── Tool Registry ────────────────────────────────────────────────────────────
export {
  register,
  registerPackTools,
  registerAllTools,
  getAllTools,
  getEnabledTools,
  getToolSchemas,
  dispatch,
  listToolsWithStatus,
  unregisterPackTools,
} from './tools/registry.js';

// ── Storage ──────────────────────────────────────────────────────────────────
export { getDb, closeDb } from './storage/db.js';
export {
  getOrCreateSession,
  createSession,
  loadMessages,
  saveMessages,
  updateSessionTitle,
  listSessions,
  getActiveSkill,
  setActiveSkill,
} from './storage/sessionStore.js';
export type { SessionInfo } from './storage/sessionStore.js';

// ── Paths ────────────────────────────────────────────────────────────────────
export {
  AOUO_HOME,
  CONFIG_PATH,
  SOUL_PATH,
  RULES_PATH,
  PACKS_DIR,
  PACKS_DATA_DIR,
  SKILLS_DIR,
  DB_PATH,
  packDataPath,
  packDataDir,
  ensureDirectories,
  ensurePackDataDir,
  isInitialized,
} from './lib/paths.js';

// ── Adapters ─────────────────────────────────────────────────────────────────
export { TelegramAdapter, TelegramSessionAdapter, formatTgError, startTypingIndicator } from './adapters/telegram.js';
export { splitMarkdownForTelegram, stripMarkdown } from './adapters/telegram.js';

// ── Logger ───────────────────────────────────────────────────────────────────
export { logger, setLogLevel } from './lib/logger.js';

// ── Usage Tracking ───────────────────────────────────────────────────────────
export { trackLlm, trackTts, trackStt, trackService, trackWebSearch, trackVision } from './lib/usage.js';

// ── Formatting ───────────────────────────────────────────────────────────────
export { markdownToTelegramHtml } from './lib/tgFormat.js';

// ── Media Processing ─────────────────────────────────────────────────────────
export type { TranscriptionResult } from './lib/stt.js';
export { transcribeAudio } from './lib/stt.js';
export type { VisionResult } from './lib/vision.js';
export { analyzeImage } from './lib/vision.js';

// ── Scheduler ────────────────────────────────────────────────────────────────
export type { CronJob, CronSchedule, CreateCronJobInput, SchedulerDelivery } from './lib/scheduler.js';
export { startScheduler, stopScheduler, listJobs, getJob, createJob, updateJob, removeJob } from './lib/scheduler.js';
