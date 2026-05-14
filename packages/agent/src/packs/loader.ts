/**
 * @module packs/loader
 * @description Pack lifecycle manager — scan, validate, load, and unload.
 *
 * Orchestrates the full pack loading sequence:
 * 1. Scan directories for pack.yml manifests
 * 2. Validate manifests with Zod
 * 3. Resolve dependency graph (topological sort)
 * 4. Run schema migrations
 * 5. Copy USER/MEMORY templates on first install
 * 6. Register fast-path routes
 * 7. Register skills
 * 8. Register custom tools
 */

import { readdirSync, existsSync, copyFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PackManifest, LoadedPack } from './types.js';
import type { AouoConfig } from '../config/defaults.js';
import { loadManifestFile } from './manifest.js';
import { runPackMigration, runExtendsColumns } from './schema.js';
import { registerPackSkills, clearSkills } from './skillRegistry.js';
import { loadPackMenus, clearMenus } from './fastpath.js';
import { registerPackCronDefaults } from './cronDefaults.js';
import { packDataPath, ensurePackDataDir } from '../lib/paths.js';
import { logger } from '../lib/logger.js';
import { register, unregisterPackTools } from '../tools/registry.js';
import { createExternalToolDefinition } from '../tools/external.js';

/** Currently loaded packs in dependency order. */
const loadedPacks: LoadedPack[] = [];

/**
 * Scans a directory for pack subdirectories containing pack.yml.
 *
 * @param baseDir - Directory to scan (e.g., ~/.aouo/packs/ or node_modules/).
 * @returns Array of { name, path } for each discovered pack.
 */
export function scanForPacks(
  baseDir: string,
): Array<{ name: string; path: string }> {
  if (!existsSync(baseDir)) return [];

  const result: Array<{ name: string; path: string }> = [];

  try {
    const entries = readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;

      const packDir = join(baseDir, entry.name);
      let isPackDir = entry.isDirectory();
      if (!isPackDir && entry.isSymbolicLink()) {
        try {
          isPackDir = statSync(packDir).isDirectory();
        } catch {
          isPackDir = false;
        }
      }
      if (!isPackDir) continue;

      const manifestPath = join(packDir, 'pack.yml');

      if (existsSync(manifestPath)) {
        result.push({ name: entry.name, path: packDir });
      }
    }
  } catch (err) {
    logger.error({ msg: 'scan_failed', dir: baseDir, error: (err as Error).message });
  }

  return result;
}

/**
 * Validates a pack manifest and checks dependency satisfaction.
 *
 * @param manifest - The parsed pack manifest.
 * @param available - Set of pack names already loaded or discovered.
 * @returns Array of error messages. Empty means valid.
 */
export function validateDependencies(
  manifest: PackManifest,
  available: Set<string>,
): string[] {
  const errors: string[] = [];

  for (const dep of manifest.depends_on) {
    if (!available.has(dep.name)) {
      errors.push(
        `Pack "${manifest.name}" depends on "${dep.name}" which is not available.`,
      );
    }
  }

  return errors;
}

/**
 * Copies template files (USER.md.tmpl, MEMORY.md.tmpl) to the pack's
 * data directory on first install.
 *
 * @param packName - The pack identifier.
 * @param packSourceDir - Absolute path to the pack's source directory.
 */
function copyTemplates(packName: string, packSourceDir: string): void {
  ensurePackDataDir(packName);
  const templatesDir = join(packSourceDir, 'templates');

  const templates = [
    { src: 'USER.md.tmpl', dest: 'USER.md' },
    { src: 'MEMORY.md.tmpl', dest: 'MEMORY.md' },
  ];

  for (const { src, dest } of templates) {
    const srcPath = join(templatesDir, src);
    const destPath = packDataPath(packName, dest);

    // Only copy if destination doesn't exist (first install)
    if (existsSync(srcPath) && !existsSync(destPath)) {
      copyFileSync(srcPath, destPath);
      logger.info({ msg: 'template_copied', pack: packName, file: dest });
    }
  }
}

/**
 * Loads a single pack through the full initialization sequence.
 *
 * @param packSourceDir - Absolute path to the pack's source directory.
 * @param availablePacks - Set of already-loaded pack names (for dependency validation).
 * @returns The loaded pack instance, or null if loading failed.
 */
export async function loadPack(
  packSourceDir: string,
  availablePacks: Set<string> = new Set(),
  config?: AouoConfig,
): Promise<LoadedPack | null> {
  const manifestPath = join(packSourceDir, 'pack.yml');

  // 1. Parse manifest
  const parseResult = loadManifestFile(manifestPath);
  if (!parseResult.ok || !parseResult.manifest) {
    logger.error({
      msg: 'pack_load_failed',
      path: packSourceDir,
      errors: parseResult.errors,
    });
    return null;
  }

  const manifest = parseResult.manifest;

  // 2. Validate dependencies
  const depErrors = validateDependencies(manifest, availablePacks);
  if (depErrors.length > 0) {
    logger.error({ msg: 'pack_deps_unsatisfied', pack: manifest.name, errors: depErrors });
    return null;
  }

  // 3. Copy templates (first install)
  copyTemplates(manifest.name, packSourceDir);

  // 4. Run schema migration
  if (manifest.schema?.file) {
    const migrated = runPackMigration(manifest.name, manifest.schema.file, packSourceDir);
    if (!migrated) {
      logger.error({ msg: 'pack_schema_failed', pack: manifest.name });
      return null;
    }
  }

  // 4b. Run extends_columns (ALTER TABLE ADD COLUMN for shared tables)
  if (manifest.schema?.extends_columns && Object.keys(manifest.schema.extends_columns).length > 0) {
    runExtendsColumns(manifest.name, manifest.schema.extends_columns);
  }

  // 5. Register fast-path menus
  if (manifest.fast_paths?.menu) {
    loadPackMenus(manifest.name, manifest.fast_paths.menu, packSourceDir);
  }

  // 6. Register skills
  if (manifest.provided_skills.length > 0) {
    registerPackSkills(manifest.name, manifest.provided_skills, packSourceDir);
  }

  // 7. Register custom tools (domain-specific tools provided by the pack)
  if (manifest.custom_tools.length > 0) {
    for (const toolDecl of manifest.custom_tools) {
      try {
        const toolPath = join(packSourceDir, toolDecl.path);
        const toolUrl = pathToFileURL(toolPath).href;
        const toolModule = await import(toolUrl);
        const toolDef = toolModule.default || toolModule;
        if (toolDef && typeof toolDef === 'object' && toolDef.name && toolDef.execute) {
          register(toolDef, manifest.name);
          logger.info({ msg: 'custom_tool_registered', pack: manifest.name, tool: toolDecl.name });
        } else {
          logger.warn({ msg: 'custom_tool_invalid', pack: manifest.name, tool: toolDecl.name });
        }
      } catch (err) {
        logger.error({
          msg: 'custom_tool_load_failed',
          pack: manifest.name,
          tool: toolDecl.name,
          error: (err as Error).message,
        });
      }
    }
  }

  // 7b. Register external tools declared through the explicit JSON I/O protocol
  if (manifest.runtime.external_tools.length > 0) {
    for (const toolDecl of manifest.runtime.external_tools) {
      register(createExternalToolDefinition(manifest.name, toolDecl, packSourceDir), manifest.name);
      logger.info({ msg: 'external_tool_registered', pack: manifest.name, tool: toolDecl.name });
    }
  }

  // 8. Build loaded pack instance
  const loaded: LoadedPack = {
    manifest,
    sourcePath: packSourceDir,
    dataPath: packDataPath(manifest.name, ''),
    onboarded: existsSync(packDataPath(manifest.name, '.onboarded')),
  };

  loadedPacks.push(loaded);

  if (config) {
    try {
      await registerPackCronDefaults(config, loaded);
    } catch (err) {
      logger.warn({ msg: 'cron_defaults_register_failed', pack: manifest.name, error: (err as Error).message });
    }
  }

  logger.info({
    msg: 'pack_loaded',
    pack: manifest.name,
    version: manifest.version,
    skills: manifest.provided_skills.length,
    customTools: manifest.custom_tools.length,
  });

  return loaded;
}

/**
 * Loads all packs from specified directories.
 *
 * Scans each directory, parses manifests, resolves dependencies via
 * topological sort, and loads packs in dependency order.
 *
 * @param scanDirs - Directories to scan for packs.
 * @param enabledPacks - Pack names to load (empty = load all discovered).
 * @returns Array of successfully loaded packs.
 */
export async function loadAllPacks(
  scanDirs: string[],
  enabledPacks: string[] = [],
  config?: AouoConfig,
): Promise<LoadedPack[]> {
  // Discover all available packs
  const discovered = new Map<string, string>();
  for (const dir of scanDirs) {
    for (const { name, path } of scanForPacks(dir)) {
      discovered.set(name, path);
    }
  }

  // Filter to enabled packs (if specified)
  const toLoad = enabledPacks.length > 0
    ? enabledPacks.filter((name) => discovered.has(name))
    : [...discovered.keys()];

  // Simple dependency-aware loading: iterate and load satisfied packs
  // until no more can be loaded (handles basic topological ordering)
  const loaded = new Set<string>();
  const result: LoadedPack[] = [];
  let progress = true;

  while (progress && toLoad.length > 0) {
    progress = false;

    for (let i = toLoad.length - 1; i >= 0; i--) {
      const name = toLoad[i]!;
      const path = discovered.get(name);
      if (!path) continue;

      const pack = await loadPack(path, loaded, config);
      if (pack) {
        loaded.add(name);
        result.push(pack);
        toLoad.splice(i, 1);
        progress = true;
      }
    }
  }

  if (toLoad.length > 0) {
    logger.warn({ msg: 'packs_not_loaded', packs: toLoad, reason: 'unresolved dependencies' });
  }

  logger.info({ msg: 'packs_loaded_total', count: result.length });
  return result;
}

/**
 * Returns all currently loaded packs.
 */
export function getLoadedPacks(): LoadedPack[] {
  return [...loadedPacks];
}

/**
 * Unloads all packs and clears registries.
 *
 * Used during shutdown or testing.
 */
export function unloadAllPacks(): void {
  for (const pack of loadedPacks) {
    unregisterPackTools(pack.manifest.name);
  }
  loadedPacks.length = 0;
  clearSkills();
  clearMenus();
  logger.info({ msg: 'packs_unloaded' });
}
