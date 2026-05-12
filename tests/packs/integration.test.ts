import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { scanForPacks, loadPack, unloadAllPacks } from '../../src/packs/loader.js';
import { loadManifestFile } from '../../src/packs/manifest.js';
import { getSkill, getAllSkills } from '../../src/packs/skillRegistry.js';
import { packDataPath } from '../../src/lib/paths.js';

const FIXTURES_DIR = join(import.meta.dirname, '..', 'fixtures', 'packs');

describe('packs (integration)', () => {
  beforeEach(() => {
    unloadAllPacks(); // also clears skills + menus
  });

  afterEach(() => {
    unloadAllPacks();
  });

  it('should scan fixture packs directory', () => {
    const packs = scanForPacks(FIXTURES_DIR);
    expect(packs.length).toBeGreaterThanOrEqual(1);
    expect(packs.some(p => p.name === 'hello-world')).toBe(true);
  });

  it('should parse hello-world pack manifest', () => {
    const result = loadManifestFile(join(FIXTURES_DIR, 'hello-world', 'pack.yml'));
    expect(result.ok).toBe(true);
    expect(result.manifest).toBeDefined();
    expect(result.manifest!.name).toBe('hello-world');
    expect(result.manifest!.version).toBe('1.0.0');
    expect(result.manifest!.provided_skills).toContain('greeting');
    expect(result.manifest!.schema.owned_tables).toContain('greetings');
  });

  it('should load pack and register skills', async () => {
    // loadPack(packSourceDir, availablePacks?) => Promise<LoadedPack | null>
    const loaded = await loadPack(join(FIXTURES_DIR, 'hello-world'));
    expect(loaded).not.toBeNull();
    expect(loaded!.manifest.name).toBe('hello-world');

    // Skills should be registered
    const skill = getSkill('greeting');
    expect(skill).toBeDefined();
    expect(skill!.name).toBe('greeting');
    expect(skill!.body).toContain('Greeting Skill');

    // All skills list should include it
    const all = getAllSkills();
    expect(all.some(s => s.name === 'greeting')).toBe(true);
  });

  it('should copy USER.md.tmpl on first load', async () => {
    await loadPack(join(FIXTURES_DIR, 'hello-world'));
    // Templates are copied to ~/.aouo/packs/<name>/USER.md
    const userMdPath = packDataPath('hello-world', 'USER.md');
    expect(existsSync(userMdPath)).toBe(true);
  });

  it('should run schema migration and create pack.db', async () => {
    const loaded = await loadPack(join(FIXTURES_DIR, 'hello-world'));
    expect(loaded).not.toBeNull();

    // Pack DB should have been created
    const dbPath = packDataPath('hello-world', join('data', 'pack.db'));
    expect(existsSync(dbPath)).toBe(true);
  });
});
