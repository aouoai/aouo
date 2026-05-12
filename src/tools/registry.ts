/**
 * @module tools/registry
 * @description Central tool registry for the aouo agent.
 *
 * Tools register themselves by calling {@link register}. The agent
 * queries the registry via {@link getToolSchemas} for LLM function
 * declarations and via {@link dispatch} to execute tool calls.
 *
 * Supports both core built-in tools and pack-provided custom tools.
 */

import type {
  ToolDefinition,
  ToolContext,
  ToolParameterSchema,
  ToolDispatchResult,
  AouoConfig,
} from '../agent/types.js';
import { logger } from '../lib/logger.js';

/** Internal store of all registered tools, keyed by tool name. */
const tools = new Map<string, ToolDefinition>();

/** Track which tools were registered by which pack for diagnostics. */
const toolOwnership = new Map<string, string>();

let coreToolsLoaded = false;

/**
 * Loads and registers all built-in core tools exactly once.
 *
 * Each tool module self-registers via {@link register} when imported.
 * This function ensures those imports happen once and only once.
 */
export async function registerAllTools(): Promise<void> {
  if (coreToolsLoaded) return;
  coreToolsLoaded = true;

  // Core tools are loaded dynamically to avoid circular imports.
  // Each module calls register() at import time.
  await Promise.all([
    import('../tools/file.js'),
    import('../tools/webSearch.js'),
    import('../tools/memory.js'),
    import('../tools/skill.js'),
    import('../tools/clarify.js'),
    import('../tools/telegram.js'),
    import('../tools/tts.js'),
    import('../tools/db.js'),
    import('../tools/persist.js'),
    import('../tools/cron.js'),
  ]);
}

/**
 * Registers a tool with the global registry.
 *
 * Called at module import time by each tool file. Duplicate names
 * are logged as warnings and silently overwritten.
 *
 * @param tool - The tool definition to register.
 * @param packName - Optional pack name for ownership tracking.
 */
export function register(tool: ToolDefinition, packName?: string): void {
  if (tools.has(tool.name)) {
    logger.warn({ msg: 'tool_duplicate', tool: tool.name, pack: packName });
  }
  tools.set(tool.name, tool);
  if (packName) {
    toolOwnership.set(tool.name, packName);
  }
}

/**
 * Registers multiple tools from a domain pack.
 *
 * @param packName - The pack identifier for ownership tracking.
 * @param packTools - Array of tool definitions from the pack.
 */
export function registerPackTools(packName: string, packTools: ToolDefinition[]): void {
  for (const tool of packTools) {
    register(tool, packName);
  }
}

/**
 * Gets all registered tools regardless of enablement.
 *
 * @returns Array of all tool definitions.
 */
export function getAllTools(): ToolDefinition[] {
  return [...tools.values()];
}

/**
 * Gets only the tools enabled in config.
 *
 * @param config - Agent configuration.
 * @returns Array of enabled tool definitions, in config order.
 */
export function getEnabledTools(config: AouoConfig): ToolDefinition[] {
  return config.tools.enabled
    .map((name) => tools.get(name))
    .filter((t): t is ToolDefinition => t !== undefined);
}

/**
 * Gets tool schemas for LLM function calling.
 *
 * Filtering layers (in order):
 * 1. `config.tools.enabled` — global enabled list
 * 2. Platform — `tg_msg` only for 'telegram'
 * 3. `toolPolicy.deny` — per-run blacklist
 * 4. `toolPolicy.allow` — per-run whitelist (overrides all above)
 *
 * @param config - Agent configuration.
 * @param platform - Adapter platform (e.g., 'telegram', 'cli').
 * @param toolPolicy - Optional per-run filtering policy.
 * @returns Array of tool schemas for the LLM.
 */
export function getToolSchemas(
  config: AouoConfig,
  platform: string = 'telegram',
  toolPolicy?: { allow?: string[]; deny?: string[] },
): Array<{ name: string; description: string; parameters: ToolParameterSchema }> {
  let enabled = getEnabledTools(config);

  // Platform filter: tg_msg only for telegram
  if (platform !== 'telegram') {
    enabled = enabled.filter((t) => t.name !== 'tg_msg');
  }

  // ToolPolicy: deny list
  if (toolPolicy?.deny?.length) {
    const denySet = new Set(toolPolicy.deny);
    enabled = enabled.filter((t) => !denySet.has(t.name));
  }

  // ToolPolicy: allow list (overrides everything above)
  if (toolPolicy?.allow?.length) {
    const allowSet = new Set(toolPolicy.allow);
    enabled = enabled.filter((t) => allowSet.has(t.name));
  }

  return enabled.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

/**
 * Dispatches a tool call with timeout enforcement and structured logging.
 *
 * @param toolName - The tool to execute.
 * @param args - Arguments from the LLM.
 * @param context - Execution context with adapter, config, and session info.
 * @returns Structured result with content and error flag.
 */
export async function dispatch(
  toolName: string,
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolDispatchResult> {
  const tool = tools.get(toolName);

  if (!tool) {
    return {
      content: `Error: Unknown tool "${toolName}". Available tools: ${[...tools.keys()].join(', ')}`,
      isError: true,
    };
  }

  const startTime = Date.now();
  const sid = context.sessionId;
  const DEFAULT_TIMEOUT_MS = 30_000;
  const timeoutMs = tool.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    logger.info({ msg: 'tool_call', tool: toolName, sessionId: sid, args });

    const content = await Promise.race([
      tool.execute(args, context),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Tool "${toolName}" timed out after ${timeoutMs / 1000}s`)),
          timeoutMs,
        ),
      ),
    ]);

    const durationMs = Date.now() - startTime;
    logger.info({ msg: 'tool_result', tool: toolName, sessionId: sid, duration_ms: durationMs });

    return { content, isError: false };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ msg: 'tool_error', tool: toolName, sessionId: sid, duration_ms: durationMs, error: errorMsg });

    return { content: `Error executing ${toolName}: ${errorMsg}`, isError: true };
  }
}

/**
 * Returns diagnostics for all registered tools with enabled status.
 *
 * @param config - Agent configuration.
 * @returns Array of tool status objects.
 */
export function listToolsWithStatus(
  config: AouoConfig,
): Array<{ name: string; description: string; enabled: boolean; pack?: string }> {
  return getAllTools().map((t) => ({
    name: t.name,
    description: t.description,
    enabled: config.tools.enabled.includes(t.name),
    pack: toolOwnership.get(t.name),
  }));
}
