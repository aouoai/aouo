import { describe, it, expect } from 'vitest';
import { parseManifestYaml } from '../../src/packs/manifest.js';

const VALID_YAML = `
name: english
version: 1.0.0
display_name: English Learning Pack
description: IELTS + General English skills

provided_skills:
  - shadowing
  - dictation
  - reading

fast_paths:
  menu: menu.json

schema:
  file: schema.sql
  owned_tables:
    - practice_log
    - sub_capabilities

persist_contract:
  skill_type_prefix: "english."
  required_fields:
    - skill_type
    - result
  optional_fields:
    - duration_sec
  subcap_keys:
    - listening
    - speaking

cron_defaults:
  - id: daily_tasks
    schedule: "0 9 * * *"
    skill: task-gen
    enabled_by_default: true

permissions:
  files:
    - "~/aouo/imports"
  network:
    - "https://api.example.com"
  platforms:
    - telegram
  cron: true
  external_commands: []

runtime:
  js:
    tools: true
  external_tools:
    - name: legacy_importer
      command: "python tools/importer.py"
      input: json
      output: json
      permissions:
        - "network:https://api.example.com"
`;

describe('packs/manifest', () => {
  it('should parse a valid manifest', () => {
    const result = parseManifestYaml(VALID_YAML);
    expect(result.ok).toBe(true);
    expect(result.manifest).toBeDefined();
    expect(result.manifest!.name).toBe('english');
    expect(result.manifest!.version).toBe('1.0.0');
    expect(result.manifest!.display_name).toBe('English Learning Pack');
  });

  it('should parse provided_skills', () => {
    const result = parseManifestYaml(VALID_YAML);
    expect(result.manifest!.provided_skills).toEqual(['shadowing', 'dictation', 'reading']);
  });

  it('should parse schema configuration', () => {
    const result = parseManifestYaml(VALID_YAML);
    expect(result.manifest!.schema.file).toBe('schema.sql');
    expect(result.manifest!.schema.owned_tables).toContain('practice_log');
  });

  it('should parse persist_contract', () => {
    const result = parseManifestYaml(VALID_YAML);
    expect(result.manifest!.persist_contract.skill_type_prefix).toBe('english.');
    expect(result.manifest!.persist_contract.required_fields).toContain('skill_type');
  });

  it('should parse cron_defaults', () => {
    const result = parseManifestYaml(VALID_YAML);
    expect(result.manifest!.cron_defaults).toHaveLength(1);
    expect(result.manifest!.cron_defaults[0]!.id).toBe('daily_tasks');
    expect(result.manifest!.cron_defaults[0]!.schedule).toBe('0 9 * * *');
  });

  it('should parse declared permissions and runtime requirements', () => {
    const result = parseManifestYaml(VALID_YAML);
    expect(result.ok).toBe(true);
    expect(result.manifest!.permissions.files).toEqual(['~/aouo/imports']);
    expect(result.manifest!.permissions.network).toEqual(['https://api.example.com']);
    expect(result.manifest!.permissions.platforms).toEqual(['telegram']);
    expect(result.manifest!.permissions.cron).toBe(true);
    expect(result.manifest!.runtime.js.tools).toBe(true);
    expect(result.manifest!.runtime.external_tools).toEqual([
      {
        name: 'legacy_importer',
        command: 'python tools/importer.py',
        input: 'json',
        output: 'json',
        permissions: ['network:https://api.example.com'],
      },
    ]);
  });

  it('should reject invalid pack names', () => {
    const yaml = `
name: "Invalid Name!"
version: 1.0.0
display_name: Bad
`;
    const result = parseManifestYaml(yaml);
    expect(result.ok).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.some((e) => e.includes('lowercase'))).toBe(true);
  });

  it('should reject invalid version format', () => {
    const yaml = `
name: test
version: latest
display_name: Test
`;
    const result = parseManifestYaml(yaml);
    expect(result.ok).toBe(false);
    expect(result.errors!.some((e) => e.includes('semver'))).toBe(true);
  });

  it('should reject missing required fields', () => {
    const yaml = `
name: test
`;
    const result = parseManifestYaml(yaml);
    expect(result.ok).toBe(false);
  });

  it('should handle YAML parse errors gracefully', () => {
    const result = parseManifestYaml('{{invalid yaml:');
    expect(result.ok).toBe(false);
    expect(result.errors!.some((e) => e.includes('YAML parse error'))).toBe(true);
  });

  it('should provide defaults for optional fields', () => {
    const minimal = `
name: minimal-pack
version: 0.1.0
display_name: Minimal
`;
    const result = parseManifestYaml(minimal);
    expect(result.ok).toBe(true);
    expect(result.manifest!.provided_skills).toEqual([]);
    expect(result.manifest!.depends_on).toEqual([]);
    expect(result.manifest!.cron_defaults).toEqual([]);
    expect(result.manifest!.custom_tools).toEqual([]);
    expect(result.manifest!.schema.file).toBe('schema.sql');
    expect(result.manifest!.permissions).toEqual({
      files: [],
      network: [],
      platforms: [],
      cron: false,
      external_commands: [],
    });
    expect(result.manifest!.runtime).toEqual({
      js: { tools: true },
      external_tools: [],
    });
  });
});
