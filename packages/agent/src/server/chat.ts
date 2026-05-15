/**
 * @module server/chat
 * @description `POST /api/packs/:pack/chat` SSE handler.
 *
 * Streams the agent's text deltas, tool events, and final completion to the
 * dashboard via Server-Sent Events. One handler invocation serves exactly
 * one user turn — the `WebSessionAdapter` and `Agent` are freshly minted
 * per request to keep state isolation crisp.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadConfig } from '../config/loader.js';
import { Agent } from '../agent/Agent.js';
import { createProvider } from '../providers/index.js';
import { WebSessionAdapter } from '../adapters/web/WebSessionAdapter.js';
import { createSseStream } from './sse.js';
import { getLoadedPacks } from '../packs/loader.js';
import { buildSkillIndex, getSkill } from '../packs/skillRegistry.js';
import {
  conversationSessionKey,
  getOrCreateRoute,
  setRoutePack,
  setRouteSession,
  type ConversationAddress,
} from '../storage/conversationRoutes.js';
import { logger } from '../lib/logger.js';

export interface ChatRequestBody {
  input: string;
  skillHint?: string;
}

interface ParsedBody {
  ok: true;
  value: ChatRequestBody;
}
interface ParsedBodyError {
  ok: false;
  error: string;
}

function parseBody(raw: unknown): ParsedBody | ParsedBodyError {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }
  const obj = raw as Record<string, unknown>;
  const input = typeof obj['input'] === 'string' ? obj['input'].trim() : '';
  if (!input) {
    return { ok: false, error: 'Field "input" is required and must be a non-empty string.' };
  }
  const hintRaw = obj['skillHint'];
  const skillHint = typeof hintRaw === 'string' && hintRaw.trim() ? hintRaw.trim() : undefined;
  return { ok: true, value: skillHint ? { input, skillHint } : { input } };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

/**
 * Drives one chat turn against the named pack and streams the result as SSE.
 *
 * Pre-conditions:
 *   - `packName` is non-empty and contains no path separators (caller has
 *     already enforced this by the router).
 *   - `rawBody` is the parsed JSON request body (or null on empty body).
 *
 * Errors before the SSE stream opens are returned as JSON. Errors after the
 * stream is open are emitted as `event: error` frames so the dashboard sees
 * them in the same channel as a successful completion.
 */
export async function handleChatStream(
  req: IncomingMessage,
  res: ServerResponse,
  packName: string,
  rawBody: unknown,
): Promise<void> {
  const parsed = parseBody(rawBody);
  if (!parsed.ok) {
    sendJson(res, 400, { error: parsed.error });
    return;
  }

  const pack = getLoadedPacks().find((p) => p.manifest.name === packName);
  if (!pack) {
    sendJson(res, 404, { error: `Pack not loaded: ${packName}` });
    return;
  }

  // ── Route + session ────────────────────────────────────────────────────────
  const address: ConversationAddress = {
    platform: 'web',
    chatId: 'dashboard',
    threadId: packName,
    userId: 'local',
  };
  const route = getOrCreateRoute(address);
  if (route.activePack !== packName) {
    setRoutePack(route.id, packName);
  }
  const sessionKey = conversationSessionKey(address, packName);

  // Soft skill hint: prepend `[skill:foo]` so the model treats it as guidance,
  // not a hard routing directive. The skill index is already in the system
  // prompt, so the model recognizes the qualified name.
  const fullInput = parsed.value.skillHint
    ? `[skill:${parsed.value.skillHint}] ${parsed.value.input}`
    : parsed.value.input;

  // ── SSE stream + agent ─────────────────────────────────────────────────────
  const stream = createSseStream(res);
  // The provider transport does not expose abort, so a mid-flight client
  // disconnect is observed but not propagated to the LLM call — the run
  // continues to completion and its tokens are dropped. Cheap to accept for
  // MVP; revisit when streaming abort lands in the transport layer.
  req.once('close', () => stream.close());

  const config = loadConfig();
  const provider = createProvider(config);
  const adapter = new WebSessionAdapter((evt) => stream.emit(evt));
  const agent = new Agent(config, adapter, provider, {
    packs: getLoadedPacks(),
    skillIndex: buildSkillIndex(),
    resolveSkill(name) {
      // Pack-scoped lookup first, then bare — same convention as TG so packs
      // emitting `skill_view('onboarding')` route to *this* pack's onboarding.
      const qualified = !name.includes(':') ? `${packName}:${name}` : null;
      const skill = (qualified ? getSkill(qualified) : undefined) ?? getSkill(name);
      return skill ? { body: skill.body, pack: skill.pack } : undefined;
    },
  });

  logger.info({
    msg: 'web_chat_incoming',
    pack: packName,
    sessionKey,
    skillHint: parsed.value.skillHint ?? null,
    inputLen: parsed.value.input.length,
  });

  try {
    const result = await agent.run(fullInput, {
      sessionKey,
      activePack: packName,
      onToken: (delta) => stream.emit({ event: 'token', data: delta }),
    });
    if (route.sessionId !== result.sessionId) {
      setRouteSession(route.id, result.sessionId);
    }
    stream.emit({
      event: 'done',
      data: { sessionId: result.sessionId, toolCallCount: result.toolCallCount },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ msg: 'web_chat_failed', pack: packName, error: message });
    stream.emit({ event: 'error', data: message });
  } finally {
    stream.close();
  }
}
