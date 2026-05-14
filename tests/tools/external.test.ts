import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { loadPack, unloadAllPacks } from '../../src/packs/loader.js';
import { dispatch } from '../../src/tools/registry.js';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import type { Adapter, ToolContext } from '../../src/agent/types.js';

const adapter: Adapter = {
  platform: 'test',
  async reply() {},
  async requestApproval() {
    return 'deny';
  },
};

function writeExternalToolPack(root: string): string {
  const packDir = join(root, 'external-pack');
  mkdirSync(join(packDir, 'skills', 'run'), { recursive: true });
  mkdirSync(join(packDir, 'tools'), { recursive: true });
  writeFileSync(
    join(packDir, 'pack.yml'),
    `name: external-pack
version: 0.1.0
display_name: External Pack
provided_skills:
  - run
permissions:
  external_commands:
    - echo_json
runtime:
  external_tools:
    - name: echo_json
      command: "node tools/echo.mjs"
      input: json
      output: json
`,
  );
  writeFileSync(join(packDir, 'skills', 'run', 'SKILL.md'), '# Run\n');
  writeFileSync(
    join(packDir, 'tools', 'echo.mjs'),
    `let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => raw += chunk);
process.stdin.on('end', () => {
  const payload = JSON.parse(raw);
  process.stdout.write(JSON.stringify({
    ok: true,
    input: payload.input,
    pack: payload.context.pack
  }));
});
`,
  );
  return packDir;
}

describe('external tools', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'aouo-external-tool-'));
    unloadAllPacks();
  });

  afterEach(() => {
    unloadAllPacks();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('registers manifest external_tools and executes JSON stdin/stdout', async () => {
    const packDir = writeExternalToolPack(tempDir);
    const loaded = await loadPack(packDir);
    expect(loaded).not.toBeNull();

    const context: ToolContext = {
      adapter,
      config: DEFAULT_CONFIG,
      sessionKey: 'test:external',
      pack: 'external-pack',
    };

    const result = await dispatch('echo_json', { message: 'hello' }, context);

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      input: { message: 'hello' },
      pack: 'external-pack',
    });
  });
});
