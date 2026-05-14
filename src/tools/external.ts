/**
 * @module tools/external
 * @description Declared external tool runner using JSON stdin/stdout.
 */

import { spawn } from 'node:child_process';
import type { ToolContext, ToolDefinition } from '../agent/types.js';
import type { ExternalToolDeclaration } from '../packs/types.js';

const DEFAULT_TIMEOUT_MS = 30_000;

function splitCommand(command: string): string[] {
  const parts: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|[^\s]+/g;
  for (const match of command.matchAll(pattern)) {
    parts.push(match[1] ?? match[2] ?? match[0]);
  }
  return parts;
}

function runExternalJsonTool(
  packName: string,
  declaration: ExternalToolDeclaration,
  packSourceDir: string,
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const commandParts = splitCommand(declaration.command);
    const executable = commandParts[0];
    if (!executable) {
      reject(new Error(`External tool "${declaration.name}" has an empty command`));
      return;
    }

    const child = spawn(executable, commandParts.slice(1), {
      cwd: packSourceDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`External tool "${declaration.name}" timed out after ${DEFAULT_TIMEOUT_MS / 1000}s`));
    }, DEFAULT_TIMEOUT_MS);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`External tool "${declaration.name}" exited with ${code}: ${stderr.trim()}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout || '{}');
        resolve(JSON.stringify(parsed));
      } catch (err) {
        reject(new Error(`External tool "${declaration.name}" returned invalid JSON: ${(err as Error).message}`));
      }
    });

    child.stdin.end(JSON.stringify({
      input: args,
      context: {
        pack: context.pack ?? packName,
        sessionId: context.sessionId,
        sessionKey: context.sessionKey,
      },
    }));
  });
}

export function createExternalToolDefinition(
  packName: string,
  declaration: ExternalToolDeclaration,
  packSourceDir: string,
): ToolDefinition {
  return {
    name: declaration.name,
    description: `External JSON tool "${declaration.name}" declared by pack "${packName}".`,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    parameters: {
      type: 'object',
      properties: {},
    },
    async execute(args, context) {
      return runExternalJsonTool(packName, declaration, packSourceDir, args, context);
    },
  };
}
