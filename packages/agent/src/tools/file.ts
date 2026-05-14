/**
 * @module tools/file
 * @description Sandboxed filesystem read/write/list for the agent.
 *
 * Operations are gated via `security.allowed_paths` in config.
 * Path fence mode ('ask' | 'allow' | 'deny') controls behavior
 * for paths outside the sandbox.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { register } from './registry.js';
import type { ToolContext } from '../agent/types.js';

/**
 * Checks if a path is within the allowed security fence.
 */
function isPathAllowed(filePath: string, config: ToolContext['config']): boolean {
  const resolved = resolve(filePath);
  return config.security.allowed_paths.some(p => resolved.startsWith(resolve(p)));
}

/**
 * Evaluates access permission for a file path.
 */
async function checkFileAccess(
  filePath: string,
  operation: string,
  context: ToolContext,
): Promise<boolean> {
  if (isPathAllowed(filePath, context.config)) return true;

  if (context.config.security.fence_mode === 'deny') return false;
  if (context.config.security.fence_mode === 'allow') return true;

  // fence_mode === 'ask'
  const result = await context.adapter.requestApproval(
    `Agent wants to ${operation} a file outside the security fence:\n   ${filePath}`,
  );

  if (result === 'always') {
    const dir = dirname(resolve(filePath)) + '/';
    if (!context.config.security.allowed_paths.includes(dir)) {
      context.config.security.allowed_paths.push(dir);
    }
  }

  return result !== 'deny';
}

// --- read_file ---
register({
  name: 'read_file',
  description: 'Read a file and return its text content.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path or path starting with ~ to read' },
    },
    required: ['path'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const filePath = String(args.path).replace(/^~/, process.env.HOME || '');

    if (!existsSync(filePath)) return `Error: File not found: ${filePath}`;

    const allowed = await checkFileAccess(filePath, 'read', context);
    if (!allowed) return `Access denied: ${filePath} is outside the security fence.`;

    try {
      const stat = statSync(filePath);
      if (stat.isDirectory()) return `Error: ${filePath} is a directory. Use list_dir instead.`;
      if (stat.size > 1024 * 1024) return `Error: File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Max 1MB.`;
      return readFileSync(filePath, 'utf-8');
    } catch (err) {
      return `Error reading file: ${(err as Error).message}`;
    }
  },
});

// --- write_file ---
register({
  name: 'write_file',
  description: 'Write content to a file. Creates the file (and parent dirs) if it does not exist.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path or path starting with ~ to write to' },
      content: { type: 'string', description: 'Content to write' },
    },
    required: ['path', 'content'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const filePath = String(args.path).replace(/^~/, process.env.HOME || '');
    const content = String(args.content);

    const allowed = await checkFileAccess(filePath, 'write', context);
    if (!allowed) return `Access denied: ${filePath} is outside the security fence.`;

    try {
      const dir = dirname(filePath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(filePath, content, 'utf-8');
      return `Successfully wrote ${content.length} characters to ${filePath}`;
    } catch (err) {
      return `Error writing file: ${(err as Error).message}`;
    }
  },
});

// --- list_dir ---
register({
  name: 'list_dir',
  description: 'List directory contents, returning files and subdirectories with sizes.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path or path starting with ~ to list' },
    },
    required: ['path'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const dirPath = String(args.path).replace(/^~/, process.env.HOME || '');

    if (!existsSync(dirPath)) return `Error: Directory not found: ${dirPath}`;

    const allowed = await checkFileAccess(dirPath, 'list', context);
    if (!allowed) return `Access denied: ${dirPath} is outside the security fence.`;

    try {
      const stat = statSync(dirPath);
      if (!stat.isDirectory()) return `Error: ${dirPath} is not a directory.`;

      const entries = readdirSync(dirPath);
      const lines: string[] = [];

      for (const entry of entries) {
        try {
          const entryPath = join(dirPath, entry);
          const entryStat = statSync(entryPath);
          if (entryStat.isDirectory()) {
            lines.push(`[dir]  ${entry}/`);
          } else {
            const size = entryStat.size;
            const sizeStr = size < 1024
              ? `${size}B`
              : size < 1024 * 1024
                ? `${(size / 1024).toFixed(1)}KB`
                : `${(size / 1024 / 1024).toFixed(1)}MB`;
            lines.push(`[file] ${entry} (${sizeStr})`);
          }
        } catch {
          lines.push(`[?]    ${entry} (no access)`);
        }
      }

      if (lines.length === 0) return `Directory ${dirPath} is empty.`;
      return `Contents of ${dirPath}:\n${lines.join('\n')}`;
    } catch (err) {
      return `Error listing directory: ${(err as Error).message}`;
    }
  },
});
