import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

// Must set env before importing paths module
const testDir = mkdtempSync(join(tmpdir(), 'aouo-test-'));
process.env['AOUO_HOME'] = testDir;

describe('lib/paths', () => {
  // Dynamic import to pick up AOUO_HOME for path selection.
  let paths: typeof import('../../src/lib/paths.js');

  beforeEach(async () => {
    // Re-import to ensure env is picked up
    paths = await import('../../src/lib/paths.js');
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should respect AOUO_HOME env variable', () => {
    expect(paths.AOUO_HOME).toBe(testDir);
  });

  it('should derive all paths from AOUO_HOME', () => {
    expect(paths.CONFIG_PATH).toContain(testDir);
    expect(paths.SOUL_PATH).toContain(testDir);
    expect(paths.RULES_PATH).toContain(testDir);
    expect(paths.DB_PATH).toContain(testDir);
    expect(paths.PACKS_DIR).toContain(testDir);
    expect(paths.PACKS_DATA_DIR).toContain(testDir);
  });

  it('should build pack data paths correctly', () => {
    const userPath = paths.packDataPath('english', 'USER.md');
    expect(userPath).toBe(join(testDir, 'data', 'packs', 'english', 'USER.md'));
  });

  it('should build pack data dir correctly', () => {
    const dir = paths.packDataDir('fitness');
    expect(dir).toBe(join(testDir, 'data', 'packs', 'fitness'));
  });
});
