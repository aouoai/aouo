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

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<string> {
    const action = String(args.action || 'list');

    if (action === 'create' || action === 'update') {
      const prompt = String(args.prompt || '');
      const blocked = scanPrompt(prompt);
      if (blocked) return JSON.stringify({ error: blocked });
    }

    // Scheduler implementation will be migrated in a future phase.
    // This stub provides the interface contract.
    try {
      const scheduler = await import('../lib/scheduler.js');
      if (typeof scheduler[action as keyof typeof scheduler] === 'function') {
        const result = await (scheduler as any)[action](_context.config, args);
        return JSON.stringify({ ok: true, result });
      }
    } catch {
      // Scheduler not yet available
    }

    return JSON.stringify({
      error: `Scheduler not yet configured. The cron tool will be fully functional after lib/scheduler is implemented.`,
      action,
    });
  },
});
