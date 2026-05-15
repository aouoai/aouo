/**
 * @module server
 * @description Local dashboard server. Boots `node:http` on the loopback interface,
 * gates every `/api/*` request with an ephemeral token, and serves the bundled
 * dashboard SPA for everything else.
 *
 * Design rules:
 * - Bind 127.0.0.1 only. The dashboard is a single-user local control panel;
 *   never expose it on 0.0.0.0.
 * - Token is minted at boot, embedded in the launch URL (`?token=`), and never
 *   persisted to disk.
 * - HTTP framework: `node:http` only — no extra runtime dependency.
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import {
  handleGetConfig,
  handleGetConfigRaw,
  handleGetPackDetail,
  handleGetPackHistory,
  handleGetPacks,
  handleGetStatus,
  handlePutConfig,
} from './handlers.js';
import { handleChatStream } from './chat.js';
import { generateToken, safeEqualToken } from './token.js';
import { serveStatic } from './static.js';
import { logger } from '../lib/logger.js';

const DEFAULT_PORT = 9800;
const DEFAULT_HOST = '127.0.0.1';

export interface StartUiServerOptions {
  /** TCP port to bind. Default 9800. */
  port?: number;
  /** Bind host. Default 127.0.0.1; never expose externally. */
  host?: string;
  /** Directory containing the dashboard `index.html`. Optional — API-only when omitted. */
  dashboardDir?: string;
  /** Override the auth token. Defaults to a fresh 32-byte hex string. */
  token?: string;
}

export interface UiServerHandle {
  /** Full launch URL including `?token=`. Open this to authenticate the browser. */
  url: string;
  /** Auth token to attach as `X-Aouo-Token` on every `/api/*` request. */
  token: string;
  /** Bound port. */
  port: number;
  /** Underlying server (mainly exposed for tests). */
  server: Server;
  /** Stop the server gracefully. */
  stop(): Promise<void>;
}

/**
 * Boots the dashboard server. Resolves once the listener is active.
 */
export async function startUiServer(opts: StartUiServerOptions = {}): Promise<UiServerHandle> {
  const port = opts.port ?? DEFAULT_PORT;
  const host = opts.host ?? DEFAULT_HOST;
  const token = opts.token ?? generateToken();
  const dashboardDir = opts.dashboardDir;

  const server = createServer((req, res) => {
    // Hard-coded CORS preflight rejection — same-origin only.
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const url = req.url ?? '/';
    if (url.startsWith('/api/')) {
      handleApi(req, res, token).catch((err) => {
        logger.error({ err }, '[ui-server] handler failed');
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      });
      return;
    }

    if (dashboardDir) {
      if (serveStatic(req, res, dashboardDir)) return;
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Not found');
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, host, () => {
      server.removeListener('error', rejectListen);
      resolveListen();
    });
  });

  const addr = server.address();
  const boundPort = typeof addr === 'object' && addr !== null ? addr.port : port;
  const launchUrl = `http://${host}:${boundPort}/?token=${token}`;

  return {
    url: launchUrl,
    token,
    port: boundPort,
    server,
    async stop() {
      await new Promise<void>((resolveClose) => {
        server.close(() => resolveClose());
      });
    },
  };
}

// ── API dispatch ─────────────────────────────────────────────────────────────

async function handleApi(req: IncomingMessage, res: ServerResponse, expectedToken: string): Promise<void> {
  // Auth.
  const presented = (req.headers['x-aouo-token'] as string | undefined) ?? '';
  if (!safeEqualToken(expectedToken, presented)) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }

  const rawUrl = req.url ?? '';
  const parsedUrl = new URL(rawUrl, 'http://localhost');
  const path = parsedUrl.pathname;
  const method = (req.method ?? 'GET').toUpperCase();

  // GET /api/config
  if (method === 'GET' && path === '/api/config') {
    sendJson(res, 200, handleGetConfig());
    return;
  }
  // GET /api/config/raw
  if (method === 'GET' && path === '/api/config/raw') {
    sendJson(res, 200, handleGetConfigRaw());
    return;
  }
  // PUT /api/config/:section
  if (method === 'PUT' && path.startsWith('/api/config/')) {
    const section = path.slice('/api/config/'.length);
    if (!section || section.includes('/')) {
      sendJson(res, 400, { error: 'Missing section name' });
      return;
    }
    let body: unknown;
    try {
      body = await readJson(req);
    } catch (err) {
      sendJson(res, 400, { error: `Invalid JSON body: ${(err as Error).message}` });
      return;
    }
    const result = handlePutConfig(section, body);
    if (!result.ok) {
      sendJson(res, result.status ?? 500, { error: result.error });
      return;
    }
    sendJson(res, 200, { ok: true, config: result.config });
    return;
  }
  // GET /api/status
  if (method === 'GET' && path === '/api/status') {
    sendJson(res, 200, handleGetStatus());
    return;
  }
  // GET /api/packs
  if (method === 'GET' && path === '/api/packs') {
    sendJson(res, 200, handleGetPacks());
    return;
  }
  // /api/packs/:pack[/chat|/history]
  const packMatch = path.match(/^\/api\/packs\/([^/]+)(?:\/(chat|history))?$/);
  if (packMatch) {
    const packName = packMatch[1]!;
    const sub = packMatch[2];

    if (!sub) {
      if (method !== 'GET') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return;
      }
      const detail = handleGetPackDetail(packName);
      if (!detail) {
        sendJson(res, 404, { error: `Pack not loaded: ${packName}` });
        return;
      }
      sendJson(res, 200, detail);
      return;
    }

    if (sub === 'chat') {
      if (method !== 'POST') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return;
      }
      let body: unknown;
      try {
        body = await readJson(req);
      } catch (err) {
        sendJson(res, 400, { error: `Invalid JSON body: ${(err as Error).message}` });
        return;
      }
      await handleChatStream(req, res, packName, body);
      return;
    }

    if (sub === 'history') {
      if (method !== 'GET') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return;
      }
      // Clamp limit to a safe range; default 50 mirrors the dashboard hook.
      const raw = Number.parseInt(parsedUrl.searchParams.get('limit') ?? '50', 10);
      const limit = Math.min(200, Math.max(1, Number.isFinite(raw) ? raw : 50));
      const history = handleGetPackHistory(packName, limit);
      if (!history) {
        sendJson(res, 404, { error: `Pack not loaded: ${packName}` });
        return;
      }
      sendJson(res, 200, history);
      return;
    }
  }

  sendJson(res, 404, { error: `Unknown endpoint: ${method} ${path}` });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

const MAX_BODY_BYTES = 1_000_000; // 1 MB — config payloads are tiny

async function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        rejectBody(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf-8');
      if (!text.trim()) {
        resolveBody({});
        return;
      }
      try {
        resolveBody(JSON.parse(text));
      } catch (err) {
        rejectBody(err);
      }
    });
    req.on('error', rejectBody);
  });
}
