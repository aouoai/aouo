/**
 * @module tools/telegram
 * @description Legacy Telegram message tool alias.
 *
 * New skills should use `msg(type=...)`. This alias remains for older prompts
 * and routes through the same adapter-level message intent contract.
 */

import { register } from './registry.js';
import {
  executeMessageTool,
  MESSAGE_TOOL_PARAMETERS,
} from './message.js';

register({
  name: 'tg_msg',
  platforms: ['telegram'],
  description: 'Legacy alias for msg(type=...) on Telegram. Prefer msg for new skills.',
  parameters: MESSAGE_TOOL_PARAMETERS,
  execute: executeMessageTool,
});
