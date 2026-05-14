/**
 * @module packs/manifest
 * @description Pack manifest parser and validator.
 *
 * Parses `pack.yml` files into typed {@link PackManifest} objects using
 * Zod for strict schema validation. Provides clear, human-readable
 * error messages for invalid manifests.
 */

import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { PackManifest } from './types.js';

// ── Zod Schema ───────────────────────────────────────────────────────────────

const PackDependencySchema = z.object({
  name: z.string().min(1),
  inheritance: z.enum(['extends', 'parallel']).default('parallel'),
});

const CronDefaultSchema = z.object({
  id: z.string().min(1),
  schedule: z.string().min(1),
  skill: z.string().min(1),
  enabled_by_default: z.boolean().default(true),
});

const CustomToolSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
});

const PermissionsSchema = z
  .object({
    files: z.array(z.string()).default([]),
    network: z.array(z.string()).default([]),
    platforms: z.array(z.string()).default([]),
    cron: z.boolean().default(false),
    external_commands: z.array(z.string()).default([]),
  })
  .default({
    files: [],
    network: [],
    platforms: [],
    cron: false,
    external_commands: [],
  });

const ExternalToolSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  input: z.literal('json').default('json'),
  output: z.literal('json').default('json'),
  permissions: z.array(z.string()).default([]),
});

const RuntimeSchema = z
  .object({
    js: z
      .object({
        tools: z.boolean().default(true),
      })
      .default({ tools: true }),
    external_tools: z.array(ExternalToolSchema).default([]),
  })
  .default({
    js: { tools: true },
    external_tools: [],
  });

const PackManifestSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_-]*$/, 'Pack name must be lowercase alphanumeric with hyphens/underscores'),
  version: z.string().regex(/^\d+\.\d+\.\d+/, 'Version must follow semver (e.g., 1.0.0)'),
  display_name: z.string().min(1),
  description: z.string().default(''),

  depends_on: z.array(PackDependencySchema).default([]),
  provided_skills: z.array(z.string()).default([]),

  fast_paths: z
    .object({
      menu: z.string().optional(),
      i18n: z.string().optional(),
    })
    .default({}),

  schema: z
    .object({
      file: z.string().default('schema.sql'),
      owned_tables: z.array(z.string()).default([]),
      shared_tables: z.array(z.string()).default([]),
      extends_columns: z.record(z.record(z.string())).default({}),
    })
    .default({ file: 'schema.sql', owned_tables: [], shared_tables: [], extends_columns: {} }),

  persist_contract: z
    .object({
      skill_type_prefix: z.string().default(''),
      required_fields: z.array(z.string()).default([]),
      optional_fields: z.array(z.string()).default([]),
      subcap_keys: z.array(z.string()).default([]),
    })
    .default({ skill_type_prefix: '', required_fields: [], optional_fields: [], subcap_keys: [] }),

  cron_defaults: z.array(CronDefaultSchema).default([]),
  custom_tools: z.array(CustomToolSchema).default([]),
  permissions: PermissionsSchema,
  runtime: RuntimeSchema,
});

/**
 * Result of parsing and validating a pack manifest.
 */
export interface ParseResult {
  /** Whether parsing succeeded. */
  ok: boolean;
  /** The parsed manifest (present when ok is true). */
  manifest?: PackManifest;
  /** Human-readable error messages (present when ok is false). */
  errors?: string[];
}

/**
 * Parses a YAML string into a validated {@link PackManifest}.
 *
 * @param yamlContent - Raw YAML content of the pack.yml file.
 * @returns A parse result with either a valid manifest or error messages.
 *
 * @example
 * ```typescript
 * const result = parseManifestYaml(fs.readFileSync('pack.yml', 'utf-8'));
 * if (result.ok) {
 *   console.log(result.manifest.name);
 * } else {
 *   console.error(result.errors);
 * }
 * ```
 */
export function parseManifestYaml(yamlContent: string): ParseResult {
  let raw: unknown;
  try {
    raw = parseYaml(yamlContent);
  } catch (err) {
    return {
      ok: false,
      errors: [`YAML parse error: ${(err as Error).message}`],
    };
  }

  const result = PackManifestSchema.safeParse(raw);

  if (result.success) {
    return { ok: true, manifest: result.data as PackManifest };
  }

  const errors = result.error.issues.map((issue) => {
    const path = issue.path.join('.');
    return `${path ? `${path}: ` : ''}${issue.message}`;
  });

  return { ok: false, errors };
}

/**
 * Loads and parses a pack.yml file from disk.
 *
 * @param filePath - Absolute path to the pack.yml file.
 * @returns A parse result with either a valid manifest or error messages.
 */
export function loadManifestFile(filePath: string): ParseResult {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return parseManifestYaml(content);
  } catch (err) {
    return {
      ok: false,
      errors: [`Failed to read ${filePath}: ${(err as Error).message}`],
    };
  }
}
