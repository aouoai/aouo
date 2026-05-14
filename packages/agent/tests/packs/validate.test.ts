import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { validatePackDirectory, linkPack } from '../../src/packs/validate.js';
import { scanForPacks } from '../../src/packs/loader.js';
import { STORE_DIR } from '../../src/lib/paths.js';

// Built-in apps live at monorepo root (`<repo>/apps/`). From this test file
// (packages/agent/tests/packs/) it's four levels up to the repo root.
const PACKS_DIR = join(import.meta.dirname, '..', '..', '..', '..', 'apps');

function copyFixturePack(tempDir: string, name = 'notes'): string {
  const source = join(PACKS_DIR, name);
  const dest = join(tempDir, name);
  cpSync(source, dest, { recursive: true });
  return dest;
}

function renamePack(packDir: string, name: string): void {
  const manifestPath = join(packDir, 'pack.yml');
  const manifest = readFileSync(manifestPath, 'utf-8').replace(/^name: notes$/m, `name: ${name}`);
  writeFileSync(manifestPath, manifest);
}

describe('packs/validate', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'aouo-pack-validate-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('validates the notes pack', async () => {
    const result = await validatePackDirectory(join(PACKS_DIR, 'notes'));

    expect(result.ok).toBe(true);
    expect(result.manifest?.name).toBe('notes');
    expect(result.errors).toEqual([]);
    expect(result.checks.some((check) => check.name === 'schema dry-run' && check.ok)).toBe(true);
  });

  it('dry-runs schema without writing to the user store', async () => {
    const packDir = copyFixturePack(tempDir);
    const packName = `validate-dry-run-${process.pid}`;
    renamePack(packDir, packName);

    const result = await validatePackDirectory(packDir);

    expect(result.ok).toBe(true);
    expect(existsSync(join(STORE_DIR, `${packName}.db`))).toBe(false);
  });

  it('fails when a declared skill is missing SKILL.md', async () => {
    const packDir = copyFixturePack(tempDir);
    rmSync(join(packDir, 'skills', 'daily-note', 'SKILL.md'));

    const result = await validatePackDirectory(packDir);

    expect(result.ok).toBe(false);
    expect(result.errors.some((issue) => issue.message.includes('daily-note'))).toBe(true);
    expect(result.errors.some((issue) => issue.message.includes('SKILL.md'))).toBe(true);
  });

  it('fails invalid schema without writing to the user store', async () => {
    const packDir = copyFixturePack(tempDir);
    const packName = `validate-invalid-${process.pid}`;
    renamePack(packDir, packName);
    writeFileSync(join(packDir, 'schema.sql'), 'CREATE TABLE broken (id INTEGER PRIMARY KEY,,);');

    const result = await validatePackDirectory(packDir);

    expect(result.ok).toBe(false);
    expect(result.errors.some((issue) => issue.code === 'schema.invalid')).toBe(true);
    expect(existsSync(join(STORE_DIR, `${packName}.db`))).toBe(false);
  });

  it('enforces cron and external command permissions', async () => {
    const packDir = copyFixturePack(tempDir);
    writeFileSync(
      join(packDir, 'pack.yml'),
      `name: notes
version: 0.1.0
display_name: Notes Companion
provided_skills: [daily-note]
cron_defaults:
  - id: evening
    schedule: "0 21 * * *"
    skill: daily-note
runtime:
  external_tools:
    - name: legacy_importer
      command: "node tools/legacy.mjs"
      input: json
      output: json
permissions:
  cron: false
  external_commands: []
`,
    );

    const result = await validatePackDirectory(packDir);

    expect(result.ok).toBe(false);
    expect(result.errors.some((issue) => issue.code === 'permissions.cron')).toBe(true);
    expect(result.errors.some((issue) => issue.code === 'permissions.external_commands')).toBe(true);
  });

  it('rejects custom tools outside tools directory', async () => {
    const packDir = copyFixturePack(tempDir);
    writeFileSync(
      join(packDir, 'pack.yml'),
      `name: notes
version: 0.1.0
display_name: Notes Companion
provided_skills: [daily-note]
custom_tools:
  - name: bad_tool
    path: ../bad-tool.ts
permissions:
  cron: false
`,
    );

    const result = await validatePackDirectory(packDir);

    expect(result.ok).toBe(false);
    expect(result.errors.some((issue) => issue.code === 'custom_tool.path')).toBe(true);
  });

  it('links a validated pack and rejects an existing target', async () => {
    const packDir = copyFixturePack(tempDir);
    const targetRoot = join(tempDir, 'linked-packs');
    mkdirSync(targetRoot);

    const first = await linkPack(packDir, targetRoot);
    expect(first.ok).toBe(true);
    expect(first.targetPath).toBe(join(targetRoot, 'notes'));
    expect(existsSync(first.targetPath!)).toBe(true);

    const second = await linkPack(packDir, targetRoot);
    expect(second.ok).toBe(false);
    expect(second.errors.some((issue) => issue.code === 'link.exists')).toBe(true);
  });

  it('discovers a linked pack through the normal scanner', async () => {
    const packDir = copyFixturePack(tempDir);
    const targetRoot = join(tempDir, 'linked-packs');
    mkdirSync(targetRoot);

    const result = await linkPack(packDir, targetRoot);
    expect(result.ok).toBe(true);

    expect(scanForPacks(targetRoot)).toEqual([
      { name: 'notes', path: join(targetRoot, 'notes') },
    ]);
  });

  it('validates a linked pack path', async () => {
    const packDir = copyFixturePack(tempDir);
    const targetRoot = join(tempDir, 'linked-packs');
    mkdirSync(targetRoot);

    const link = await linkPack(packDir, targetRoot);
    const result = await validatePackDirectory(link.targetPath!);

    expect(result.ok).toBe(true);
    expect(result.manifest?.name).toBe('notes');
  });

  it('rejects link when target already exists as a real directory', async () => {
    const packDir = copyFixturePack(tempDir);
    const targetRoot = join(tempDir, 'linked-packs');
    mkdirSync(join(targetRoot, 'notes'), { recursive: true });

    const result = await linkPack(packDir, targetRoot);

    expect(result.ok).toBe(false);
    expect(result.errors.some((issue) => issue.code === 'link.exists')).toBe(true);
  });

  it('treats a pre-existing symlink as an existing target', async () => {
    const packDir = copyFixturePack(tempDir);
    const targetRoot = join(tempDir, 'linked-packs');
    mkdirSync(targetRoot);
    symlinkSync(packDir, join(targetRoot, 'notes'), 'dir');

    const result = await linkPack(packDir, targetRoot);

    expect(result.ok).toBe(false);
    expect(result.errors.some((issue) => issue.code === 'link.exists')).toBe(true);
  });
});
