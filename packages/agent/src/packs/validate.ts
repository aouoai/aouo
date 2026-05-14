/**
 * @module packs/validate
 * @description Pack ABI validator and local development linker.
 */

import Database from 'better-sqlite3';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { loadManifestFile } from './manifest.js';
import type { PackManifest } from './types.js';
import { DEFAULT_CONFIG } from '../config/defaults.js';
import { PACKS_DIR } from '../lib/paths.js';

export interface PackValidationIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  file?: string;
}

export interface PackValidationCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface PackValidationResult {
  ok: boolean;
  packPath: string;
  manifest?: PackManifest;
  errors: PackValidationIssue[];
  warnings: PackValidationIssue[];
  checks: PackValidationCheck[];
}

export interface PackLinkResult {
  ok: boolean;
  sourcePath: string;
  targetPath?: string;
  manifest?: PackManifest;
  errors: PackValidationIssue[];
  warnings: PackValidationIssue[];
}

function issue(
  level: 'error' | 'warning',
  code: string,
  message: string,
  file?: string,
): PackValidationIssue {
  return { level, code, message, file };
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep));
}

function resolvePackPath(packPath: string, relPath: string): string {
  return resolve(packPath, relPath);
}

function isSafeRelativePath(relPath: string): boolean {
  return !relPath.startsWith('/') && !relPath.includes('\0');
}

async function validateCronSchedule(schedule: string): Promise<string | null> {
  const text = schedule.trim();
  const parts = text.split(/\s+/);

  if ((parts.length === 5 || parts.length === 6) && parts.every((p) => /^[\d*?,/\-A-Za-z#LW]+$/.test(p))) {
    try {
      const { CronExpressionParser } = await import('cron-parser');
      CronExpressionParser.parse(text, {
        currentDate: new Date(),
        tz: DEFAULT_CONFIG.cron.timezone || 'UTC',
      });
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  }

  try {
    const { parseSchedule } = await import('../lib/scheduler.js');
    await parseSchedule(schedule, DEFAULT_CONFIG);
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}

function dryRunSchema(packPath: string, manifest: PackManifest): { ok: boolean; error?: string } {
  const schemaPath = resolvePackPath(packPath, manifest.schema.file);
  if (!existsSync(schemaPath)) {
    if (manifest.schema.owned_tables.length > 0) {
      return { ok: false, error: `schema file not found: ${manifest.schema.file}` };
    }
    return { ok: true };
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'aouo-schema-dry-run-'));
  const dbPath = join(tempDir, 'pack.db');
  try {
    const db = new Database(dbPath);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(readFileSync(schemaPath, 'utf-8'));

    for (const table of manifest.schema.owned_tables) {
      const rows = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
        .all(table) as Array<{ name: string }>;
      if (rows.length === 0) {
        db.close();
        return { ok: false, error: `owned table "${table}" was not created by schema.sql` };
      }
    }

    db.close();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function validatePackDirectory(inputPath: string): Promise<PackValidationResult> {
  const packPath = resolve(inputPath);
  const errors: PackValidationIssue[] = [];
  const warnings: PackValidationIssue[] = [];
  const checks: PackValidationCheck[] = [];

  if (!existsSync(packPath) || !statSync(packPath).isDirectory()) {
    errors.push(issue('error', 'pack.not_found', `Pack directory not found: ${packPath}`));
    return { ok: false, packPath, errors, warnings, checks };
  }

  const manifestPath = join(packPath, 'pack.yml');
  const parsed = loadManifestFile(manifestPath);
  if (!parsed.ok || !parsed.manifest) {
    for (const error of parsed.errors ?? ['Invalid pack.yml']) {
      errors.push(issue('error', 'manifest.invalid', error, 'pack.yml'));
    }
    checks.push({ name: 'manifest', ok: false });
    return { ok: false, packPath, errors, warnings, checks };
  }

  const manifest = parsed.manifest;
  checks.push({ name: 'manifest', ok: true, detail: `${manifest.name}@${manifest.version}` });

  for (const skillName of manifest.provided_skills) {
    const skillPath = join(packPath, 'skills', skillName, 'SKILL.md');
    if (!existsSync(skillPath)) {
      errors.push(
        issue('error', 'skill.missing', `Declared skill "${skillName}" is missing skills/${skillName}/SKILL.md`, `skills/${skillName}/SKILL.md`),
      );
    }
  }
  checks.push({
    name: 'skills',
    ok: !errors.some((entry) => entry.code === 'skill.missing'),
    detail: `${manifest.provided_skills.length} declared`,
  });

  const schema = dryRunSchema(packPath, manifest);
  if (!schema.ok) {
    errors.push(issue('error', 'schema.invalid', `Schema dry-run failed: ${schema.error}`, manifest.schema.file));
  }
  checks.push({ name: 'schema dry-run', ok: schema.ok, detail: schema.error });

  for (const tool of manifest.custom_tools) {
    const relPath = tool.path;
    const absPath = resolvePackPath(packPath, relPath);
    const normalized = relPath.replace(/\\/g, '/');
    if (!isSafeRelativePath(relPath) || !isInside(packPath, absPath) || !normalized.startsWith('tools/')) {
      errors.push(issue('error', 'custom_tool.path', `Custom tool "${tool.name}" must live under tools/`, relPath));
      continue;
    }
    if (!/\.(ts|js|mjs|cjs)$/.test(normalized)) {
      errors.push(issue('error', 'custom_tool.extension', `Custom tool "${tool.name}" must be JS/TS`, relPath));
    }
    if (!existsSync(absPath)) {
      errors.push(issue('error', 'custom_tool.missing', `Custom tool "${tool.name}" file not found`, relPath));
    }
  }
  if (!manifest.runtime.js.tools && manifest.custom_tools.length > 0) {
    errors.push(issue('error', 'runtime.js_tools', 'custom_tools require runtime.js.tools=true'));
  }
  checks.push({
    name: 'custom tools',
    ok: !errors.some((entry) => entry.code.startsWith('custom_tool') || entry.code === 'runtime.js_tools'),
    detail: `${manifest.custom_tools.length} declared`,
  });

  if (manifest.cron_defaults.length > 0 && !manifest.permissions.cron) {
    errors.push(issue('error', 'permissions.cron', 'cron_defaults require permissions.cron=true'));
  }
  for (const cron of manifest.cron_defaults) {
    if (!manifest.provided_skills.includes(cron.skill)) {
      errors.push(issue('error', 'cron.skill', `Cron default "${cron.id}" references undeclared skill "${cron.skill}"`));
    }
    const cronError = await validateCronSchedule(cron.schedule);
    if (cronError) {
      errors.push(issue('error', 'cron.schedule', `Cron default "${cron.id}" has invalid schedule: ${cronError}`));
    }
  }
  checks.push({
    name: 'cron defaults',
    ok: !errors.some((entry) => entry.code.startsWith('cron.') || entry.code === 'permissions.cron'),
    detail: `${manifest.cron_defaults.length} declared`,
  });

  if (manifest.runtime.external_tools.length > 0 && manifest.permissions.external_commands.length === 0) {
    errors.push(
      issue('error', 'permissions.external_commands', 'runtime.external_tools require permissions.external_commands declarations'),
    );
  }
  const allowedExternal = new Set(manifest.permissions.external_commands);
  for (const tool of manifest.runtime.external_tools) {
    if (!allowedExternal.has(tool.name)) {
      errors.push(
        issue('error', 'permissions.external_commands', `External tool "${tool.name}" is not listed in permissions.external_commands`),
      );
    }
  }
  checks.push({
    name: 'external tools',
    ok: !errors.some((entry) => entry.code === 'permissions.external_commands'),
    detail: `${manifest.runtime.external_tools.length} declared`,
  });

  return {
    ok: errors.length === 0,
    packPath,
    manifest,
    errors,
    warnings,
    checks,
  };
}

export function formatValidationResult(result: PackValidationResult | PackLinkResult): string {
  const lines: string[] = [];
  lines.push(result.ok ? 'Pack check passed' : 'Pack check failed');
  if (result.manifest) {
    lines.push(`${result.manifest.display_name} (${result.manifest.name}) v${result.manifest.version}`);
  }
  if ('checks' in result) {
    for (const check of result.checks) {
      lines.push(`- ${check.ok ? 'ok' : 'fail'} ${check.name}${check.detail ? `: ${check.detail}` : ''}`);
    }
  }
  for (const warning of result.warnings) {
    lines.push(`warning ${warning.code}: ${warning.message}`);
  }
  for (const error of result.errors) {
    lines.push(`error ${error.code}: ${error.message}`);
  }
  return lines.join('\n');
}

export async function linkPack(inputPath: string, targetRoot: string = PACKS_DIR): Promise<PackLinkResult> {
  const validation = await validatePackDirectory(inputPath);
  if (!validation.ok || !validation.manifest) {
    return {
      ok: false,
      sourcePath: validation.packPath,
      manifest: validation.manifest,
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  mkdirSync(targetRoot, { recursive: true });
  const targetPath = join(targetRoot, validation.manifest.name);
  if (existsSync(targetPath)) {
    return {
      ok: false,
      sourcePath: validation.packPath,
      targetPath,
      manifest: validation.manifest,
      errors: [issue('error', 'link.exists', `Target pack already exists: ${targetPath}`)],
      warnings: validation.warnings,
    };
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  symlinkSync(validation.packPath, targetPath, 'dir');
  return {
    ok: true,
    sourcePath: validation.packPath,
    targetPath,
    manifest: validation.manifest,
    errors: [],
    warnings: validation.warnings,
  };
}
