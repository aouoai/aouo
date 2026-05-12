/**
 * @module tests/agent/promptBuilder
 * @description Tests for system prompt assembly.
 */

import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildActiveSkillSystemPrompt } from '../../src/agent/promptBuilder.js';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';

describe('buildSystemPrompt', () => {
  it('returns a non-empty system prompt', () => {
    const prompt = buildSystemPrompt(DEFAULT_CONFIG);
    expect(prompt.length).toBeGreaterThan(50);
  });

  it('includes security section', () => {
    const prompt = buildSystemPrompt(DEFAULT_CONFIG);
    expect(prompt).toContain('Security');
  });

  it('includes skill index when provided', () => {
    const prompt = buildSystemPrompt(
      DEFAULT_CONFIG,
      [],
      '## Available Skills\n- shadowing — Practice pronunciation',
    );
    expect(prompt).toContain('shadowing');
  });

  it('includes TTS capability when enabled', () => {
    const config = {
      ...DEFAULT_CONFIG,
      tools: { ...DEFAULT_CONFIG.tools, enabled: ['tts'] },
    };
    const prompt = buildSystemPrompt(config);
    expect(prompt).toContain('TTS');
  });
});

describe('buildActiveSkillSystemPrompt', () => {
  it('appends skill body to base prompt', () => {
    const base = buildSystemPrompt(DEFAULT_CONFIG);
    const prompt = buildActiveSkillSystemPrompt(
      base,
      'shadowing',
      '# Shadowing Skill\nRepeat after me.',
    );
    expect(prompt).toContain('Repeat after me');
    expect(prompt).toContain('shadowing');
    expect(prompt).toContain('Active Skill Instructions');
  });

  it('warns against redundant skill_view calls', () => {
    const prompt = buildActiveSkillSystemPrompt(
      'base prompt',
      'test',
      'test body',
    );
    expect(prompt).toContain('Do not call');
    expect(prompt).toContain('skill_view');
  });
});
