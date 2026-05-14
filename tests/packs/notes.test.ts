import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { scanForPacks, loadPack, unloadAllPacks } from '../../src/packs/loader.js';
import { loadManifestFile } from '../../src/packs/manifest.js';
import { getSkill, getAllSkills } from '../../src/packs/skillRegistry.js';
import { dispatch, registerAllTools } from '../../src/tools/registry.js';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import type { Adapter, ToolContext } from '../../src/agent/types.js';

const PACKS_DIR = join(import.meta.dirname, '..', '..', 'packs');

const adapter: Adapter = {
  platform: 'test',
  async reply() {},
  async requestApproval() {
    return 'deny';
  },
};

describe('notes pack', () => {
  beforeAll(async () => {
    await registerAllTools();
  });

  beforeEach(() => {
    unloadAllPacks();
  });

  afterEach(() => {
    unloadAllPacks();
  });

  it('should be discoverable in the packs directory', () => {
    const packs = scanForPacks(PACKS_DIR);
    expect(packs.some(p => p.name === 'notes')).toBe(true);
  });

  it('should parse notes/pack.yml successfully', () => {
    const result = loadManifestFile(join(PACKS_DIR, 'notes', 'pack.yml'));
    expect(result.ok).toBe(true);
    expect(result.manifest).toBeDefined();
    expect(result.manifest!.name).toBe('notes');
    expect(result.manifest!.version).toBe('0.1.0');
  });

  it('should declare required skills (onboarding + aggregator)', () => {
    const result = loadManifestFile(join(PACKS_DIR, 'notes', 'pack.yml'));
    expect(result.manifest!.provided_skills).toContain('onboarding');
    expect(result.manifest!.provided_skills).toContain('aggregator');
  });

  it('should declare all 4 skills', () => {
    const result = loadManifestFile(join(PACKS_DIR, 'notes', 'pack.yml'));
    expect(result.manifest!.provided_skills).toEqual(
      expect.arrayContaining(['onboarding', 'aggregator', 'daily-note', 'review']),
    );
    expect(result.manifest!.provided_skills).toHaveLength(4);
  });

  it('should declare owned tables', () => {
    const result = loadManifestFile(join(PACKS_DIR, 'notes', 'pack.yml'));
    expect(result.manifest!.schema.owned_tables).toContain('entries');
    expect(result.manifest!.schema.owned_tables).toContain('weekly_summaries');
  });

  it('should declare persist contract with notes. prefix', () => {
    const result = loadManifestFile(join(PACKS_DIR, 'notes', 'pack.yml'));
    expect(result.manifest!.persist_contract.skill_type_prefix).toBe('notes.');
    expect(result.manifest!.persist_contract.required_fields).toContain('skill_type');
    expect(result.manifest!.persist_contract.required_fields).toContain('content');
  });

  it('should declare cron defaults', () => {
    const result = loadManifestFile(join(PACKS_DIR, 'notes', 'pack.yml'));
    expect(result.manifest!.cron_defaults).toHaveLength(2);
    expect(result.manifest!.cron_defaults[0]!.id).toBe('evening-journal');
    expect(result.manifest!.cron_defaults[0]!.skill).toBe('daily-note');
    expect(result.manifest!.permissions.cron).toBe(true);
  });

  it('should load and register all skills', async () => {
    const loaded = await loadPack(join(PACKS_DIR, 'notes'));
    expect(loaded).not.toBeNull();
    expect(loaded!.manifest.name).toBe('notes');

    // All 4 skills should be registered
    const all = getAllSkills();
    const noteSkills = all.filter(s => s.pack === 'notes');
    expect(noteSkills).toHaveLength(4);

    // Check specific skills
    const dailyNote = getSkill('daily-note');
    expect(dailyNote).toBeDefined();
    expect(dailyNote!.pack).toBe('notes');
    expect(dailyNote!.command).toBe(true);

    const onboarding = getSkill('onboarding');
    expect(onboarding).toBeDefined();
    expect(onboarding!.command).toBe(false);
  });

  it('should support pack-qualified skill lookup', async () => {
    await loadPack(join(PACKS_DIR, 'notes'));

    const skill = getSkill('notes:daily-note');
    expect(skill).toBeDefined();
    expect(skill!.name).toBe('daily-note');
    expect(skill!.pack).toBe('notes');
  });

  it('supports the daily-note -> review -> aggregator data loop', async () => {
    await loadPack(join(PACKS_DIR, 'notes'));
    const sessionKey = `test:notes-loop:${Date.now()}`;
    const context: ToolContext = {
      adapter,
      config: DEFAULT_CONFIG,
      sessionKey,
      pack: 'notes',
    };

    const dailyContent = `Today I planned the next aouo pack loop ${sessionKey}`;
    const daily = await dispatch(
      'persist',
      {
        action: 'practice',
        skill_type: 'notes.daily',
        content: dailyContent,
        mood: 'focused',
        metadata: { tags: ['planning'], word_count: 9 },
      },
      context,
    );
    expect(JSON.parse(daily.content).ok).toBe(true);

    const recentDaily = await dispatch(
      'persist',
      { action: 'recent_practice', skill_type: 'notes.daily', limit: 5 },
      context,
    );
    const dailyRows = JSON.parse(recentDaily.content).rows as Array<{ content: string }>;
    expect(dailyRows.some((row) => row.content === dailyContent)).toBe(true);

    const summaryContent = `Weekly review based on ${sessionKey}`;
    const aggregator = await dispatch(
      'persist',
      {
        action: 'practice',
        skill_type: 'notes.aggregator',
        content: summaryContent,
        metadata: { week: '2026-W20', entry_count: 1 },
      },
      context,
    );
    expect(JSON.parse(aggregator.content).ok).toBe(true);

    const recentAggregator = await dispatch(
      'persist',
      { action: 'recent_practice', skill_type: 'notes.aggregator', limit: 5 },
      context,
    );
    const aggregatorRows = JSON.parse(recentAggregator.content).rows as Array<{ content: string }>;
    expect(aggregatorRows.some((row) => row.content === summaryContent)).toBe(true);

    await dispatch(
      'memory',
      {
        target: 'memory',
        action: 'append',
        content: `## Recent State\n\n${summaryContent}`,
      },
      context,
    );
    const memory = await dispatch('memory', { target: 'memory', action: 'read' }, context);
    expect(memory.content).toContain(summaryContent);
  });
});
