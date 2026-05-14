/**
 * @module tools/cron
 * @description Scheduled job management tool.
 *
 * Allows the agent to create, list, update, pause, resume, and remove
 * scheduled jobs. Implementation deferred until lib/scheduler is migrated.
 */

import { register } from './registry.js';
import type { ToolContext } from '../agent/types.js';

/** Prompt injection guard patterns */
const THREAT_PATTERNS = [
  /ignore\s+(?:previous|all|above|prior)\s+instructions/i,
  /system\s+prompt\s+override/i,
  /do\s+not\s+tell\s+the\s+user/i,
  /rm\s+-rf\s+\//i,
];

function scanPrompt(prompt: string): string {
  for (const p of THREAT_PATTERNS) {
    if (p.test(prompt)) return 'Blocked: cron prompt contains unsafe instructions.';
  }
  return '';
}

register({
  name: 'cron',
  description: 'Manage scheduled jobs stored in ~/.aouo/cron/jobs.json. Actions: create, list, update, pause, resume, remove.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'create | list | update | pause | resume | remove' },
      id: { type: 'string', description: 'Job id for update/pause/resume/remove.' },
      name: { type: 'string', description: 'Human-readable job name.' },
      prompt: { type: 'string', description: 'Self-contained unattended prompt.' },
      schedule: { type: 'string', description: 'Schedule: 30m, every 2h, cron expression.' },
      chat_id: { type: 'string', description: 'Telegram chat id for proactive delivery.' },
    },
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const action = String(args.action || 'list');

    if (action === 'create' || action === 'update') {
      const prompt = String(args.prompt || '');
      const blocked = scanPrompt(prompt);
      if (blocked) return JSON.stringify({ error: blocked });
    }

    try {
      const {
        createJob,
        listJobs,
        updateJob,
        pauseJob,
        resumeJob,
        removeJob,
      } = await import('../lib/scheduler.js');

      if (action === 'list') {
        return JSON.stringify({ ok: true, result: listJobs() });
      }
      if (action === 'create') {
        const result = await createJob(context.config, {
          name: String(args.name || ''),
          prompt: String(args.prompt || ''),
          schedule: String(args.schedule || ''),
          chat_id: args.chat_id ? String(args.chat_id) : undefined,
          pack: context.pack,
          skill: args.skill ? String(args.skill) : undefined,
        });
        return JSON.stringify({ ok: true, result });
      }

      const id = String(args.id || '');
      if (!id) return JSON.stringify({ error: `id is required for ${action}` });

      if (action === 'update') {
        const result = await updateJob(context.config, id, {
          name: args.name ? String(args.name) : undefined,
          prompt: args.prompt ? String(args.prompt) : undefined,
          schedule: args.schedule ? String(args.schedule) : undefined,
          chat_id: args.chat_id ? String(args.chat_id) : undefined,
          pack: context.pack,
          skill: args.skill ? String(args.skill) : undefined,
        });
        return JSON.stringify({ ok: true, result });
      }
      if (action === 'pause') {
        return JSON.stringify({ ok: true, result: pauseJob(id) });
      }
      if (action === 'resume') {
        return JSON.stringify({ ok: true, result: await resumeJob(context.config, id) });
      }
      if (action === 'remove') {
        return JSON.stringify({ ok: true, result: removeJob(id) });
      }
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message, action });
    }

    return JSON.stringify({
      error: `Unknown cron action: ${action}. Available: create, list, update, pause, resume, remove.`,
      action,
    });
  },
});
