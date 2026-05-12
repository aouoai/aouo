/**
 * @module tools/clarify
 * @description Interactive clarification tool for structured user input.
 *
 * Pauses generative execution to block on a discrete choice driven
 * by the end-user via native adapter UI (e.g., inline keyboards).
 */

import { register } from './registry.js';
import type { ToolContext } from '../agent/types.js';

register({
  name: 'clarify',
  description: 'Ask the user to pick from a set of choices via native UI (e.g., inline keyboards). Use this when you have 2-5 clear structural options.',
  parameters: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'The question to render above the choices.',
      },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of choice strings rendered as selectable buttons.',
      },
    },
    required: ['message', 'options'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const message = String(args.message);
    const options = (args.options as unknown[])?.map(String) || [];

    if (!context.adapter.requestChoice) {
      return 'Error: The current adapter does not support native choices. Ask the user to type their choice instead.';
    }

    if (options.length === 0) {
      return 'Error: You must provide at least one option.';
    }

    const choice = await context.adapter.requestChoice(message, options);

    if (!choice) {
      return 'User did not respond within the timeout or cancelled.';
    }

    return `User selected: ${choice}`;
  },
});
