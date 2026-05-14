/**
 * @module commands/pack
 * @description Developer-facing pack commands.
 */

import { join } from 'node:path';
import { PACKS_DIR } from '../lib/paths.js';
import { loadConfig } from '../config/loader.js';
import { loadManifestFile } from '../packs/manifest.js';
import { scanForPacks } from '../packs/loader.js';
import { formatValidationResult, linkPack, validatePackDirectory } from '../packs/validate.js';

export interface CommandOutput {
  log(message?: string): void;
  error(message?: string): void;
}

export async function runPackValidate(packPath: string, output: CommandOutput = console): Promise<boolean> {
  const result = await validatePackDirectory(packPath);
  const text = formatValidationResult(result);
  if (result.ok) output.log(text);
  else output.error(text);
  return result.ok;
}

export async function runPackLink(
  packPath: string,
  output: CommandOutput = console,
  targetRoot: string = PACKS_DIR,
): Promise<boolean> {
  const result = await linkPack(packPath, targetRoot);
  if (result.ok) {
    output.log(`Pack linked: ${result.manifest!.name} -> ${result.targetPath}`);
    return true;
  }
  output.error(formatValidationResult(result));
  return false;
}

export async function runPackList(output: CommandOutput = console): Promise<boolean> {
  const config = loadConfig();
  const scanDirs = [PACKS_DIR, ...config.packs.scan_dirs];
  const packs = scanDirs.flatMap((dir) => scanForPacks(dir));

  output.log('Installed packs:\n');

  if (packs.length === 0) {
    output.log('  No packs found.');
    output.log('  Link a local pack with: aouo pack link ./packs/<name>');
    return true;
  }

  const seen = new Set<string>();
  for (const pack of packs) {
    const manifestResult = loadManifestFile(join(pack.path, 'pack.yml'));
    if (!manifestResult.ok || !manifestResult.manifest) {
      output.log(`  ${pack.name}: invalid pack.yml`);
      continue;
    }

    const manifest = manifestResult.manifest;
    if (seen.has(manifest.name)) {
      output.log(`  ${manifest.name}: duplicate pack name at ${pack.path}`);
      continue;
    }
    seen.add(manifest.name);

    const validation = await validatePackDirectory(pack.path);
    const description = manifest.description ? ` - ${manifest.description}` : '';
    output.log(`  ${manifest.name} v${manifest.version}${description}`);
    output.log(`    path: ${pack.path}`);
    output.log(`    skills: ${manifest.provided_skills.length}`);
    output.log(`    cron defaults: ${manifest.cron_defaults.length}`);
    output.log(`    validation: ${validation.ok ? 'ok' : 'failed'}`);
  }

  return true;
}
