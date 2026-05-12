/**
 * @module tools/memory
 * @description Pack-scoped profile file read/write.
 *
 * Manages `USER.md` and `MEMORY.md` files within the active pack's
 * data directory. Falls back to `_global` scope when no pack context is available.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { register } from './registry.js';
import { packDataPath } from '../lib/paths.js';
import type { ToolContext } from '../agent/types.js';

/**
 * Resolves abstract memory target to a pack-scoped file path.
 */
function resolvePath(target: string, pack?: string): { filePath: string; fileName: string } {
  const scope = pack || '_global';
  if (target === 'user') {
    return { filePath: packDataPath(scope, 'USER.md'), fileName: 'USER.md' };
  }
  return { filePath: packDataPath(scope, 'MEMORY.md'), fileName: 'MEMORY.md' };
}

register({
  name: 'memory',
  description: 'Read or update profile markdown files. Use target="user" for stable user facts and preferences. Use target="memory" for evolving state data. These files are injected into the system prompt every session.',
  parameters: {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        description: 'Which profile file: "user" for USER.md or "memory" for MEMORY.md',
        enum: ['user', 'memory'],
      },
      action: {
        type: 'string',
        description: 'Action: "read", "append", or "replace"',
        enum: ['read', 'append', 'replace'],
      },
      content: {
        type: 'string',
        description: 'Markdown content to append or replace. Not needed for "read".',
      },
    },
    required: ['target', 'action'],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<string> {
    const target = String(args.target || '');
    const action = String(args.action || '');
    const content = String(args.content || '');

    if (!['user', 'memory'].includes(target)) {
      return 'Error: target must be "user" or "memory".';
    }

    if (!['read', 'append', 'replace'].includes(action)) {
      return 'Error: action must be "read", "append", or "replace".';
    }

    const { filePath, fileName } = resolvePath(target, _context.pack);

    try {
      const dir = dirname(filePath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      if (action === 'read') {
        if (!existsSync(filePath)) return `${fileName} does not exist yet.`;
        return readFileSync(filePath, 'utf-8');
      }

      if (!content.trim()) {
        return `Error: content is required for ${action}.`;
      }

      if (action === 'replace') {
        writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`, 'utf-8');
        return `Successfully replaced ${fileName}.`;
      }

      const existing = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';
      const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
      writeFileSync(filePath, `${existing}${separator}${content}${content.endsWith('\n') ? '' : '\n'}`, 'utf-8');
      return `Successfully appended to ${fileName}.`;
    } catch (err) {
      return `Error updating ${fileName}: ${(err as Error).message}`;
    }
  },
});
