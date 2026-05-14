/**
 * @module packs/cronDefaults
 * @description Registration of pack-declared cron defaults.
 */

import type { AouoConfig } from '../config/defaults.js';
import { createJob, getJob, type CronJob } from '../lib/scheduler.js';
import type { LoadedPack } from './types.js';

export interface CronDefaultRegistration {
  created: CronJob[];
  skipped: Array<{
    id: string;
    reason: 'disabled' | 'already_exists' | 'missing_chat_id';
  }>;
}

function buildCronPrompt(pack: LoadedPack, skillName: string, cronId: string): string {
  return [
    `Run scheduled pack workflow.`,
    `Pack: ${pack.manifest.name}`,
    `Skill: ${skillName}`,
    `Cron default: ${cronId}`,
    `Load and follow the active skill instructions. Use pack-scoped persist and memory.`,
  ].join('\n');
}

export async function registerPackCronDefaults(
  config: AouoConfig,
  pack: LoadedPack,
): Promise<CronDefaultRegistration> {
  const created: CronJob[] = [];
  const skipped: CronDefaultRegistration['skipped'] = [];

  for (const cron of pack.manifest.cron_defaults) {
    const name = `${pack.manifest.name}:${cron.id}`;
    if (!cron.enabled_by_default) {
      skipped.push({ id: name, reason: 'disabled' });
      continue;
    }
    if (getJob(name)) {
      skipped.push({ id: name, reason: 'already_exists' });
      continue;
    }
    if (!config.cron.default_chat_id) {
      skipped.push({ id: name, reason: 'missing_chat_id' });
      continue;
    }

    const qualifiedSkill = `${pack.manifest.name}:${cron.skill}`;
    const job = await createJob(config, {
      name,
      prompt: buildCronPrompt(pack, cron.skill, cron.id),
      schedule: cron.schedule,
      chat_id: config.cron.default_chat_id,
      enabled: true,
      pack: pack.manifest.name,
      skill: qualifiedSkill,
    });
    created.push(job);
  }

  return { created, skipped };
}
