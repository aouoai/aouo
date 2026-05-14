/**
 * @module server/static
 * @description Tiny static file server for the dashboard bundle.
 *
 * Supports HTML5-history SPA routing: any request that resolves to a missing
 * file under the bundle root falls back to `index.html`. Path traversal is
 * blocked by resolving the request path relative to the bundle root and
 * rejecting anything that escapes.
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function contentTypeFor(filePath: string): string {
  return MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

function resolveSafe(root: string, urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  const rel = decoded.replace(/^\/+/, '');
  const target = resolve(root, normalize(rel));
  const rootResolved = resolve(root);
  if (target !== rootResolved && !target.startsWith(rootResolved + sep)) return null;
  return target;
}

/**
 * Serves a file from `root` for the given request. Falls back to `index.html`
 * if the resolved path is missing — required for client-side routing.
 *
 * Returns `true` when the request was handled (200, 304, or fallback 200),
 * `false` only if the bundle root itself does not exist.
 */
export function serveStatic(req: IncomingMessage, res: ServerResponse, root: string): boolean {
  if (!existsSync(root)) return false;

  const urlPath = req.url ?? '/';
  let resolved = resolveSafe(root, urlPath);
  if (!resolved) {
    res.statusCode = 400;
    res.end('Bad path');
    return true;
  }

  // Directory request → index.html inside the directory.
  if (existsSync(resolved) && statSync(resolved).isDirectory()) {
    resolved = join(resolved, 'index.html');
  }

  // SPA fallback: missing file → root index.html.
  if (!existsSync(resolved)) {
    resolved = join(root, 'index.html');
    if (!existsSync(resolved)) {
      res.statusCode = 404;
      res.end('Not found');
      return true;
    }
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', contentTypeFor(resolved));
  res.setHeader('Cache-Control', 'no-cache');
  createReadStream(resolved).pipe(res);
  return true;
}
