/**
 * @module adapters/telegram
 * @description Public entry point for the Telegram adapter.
 *
 * ## Architecture
 *
 * ```text
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  TelegramAdapter (Singleton)                                     │
 * │  - Owns the Grammy Bot instance and long-polling lifecycle       │
 * │  - Routes incoming messages & callback queries                   │
 * │  - Manages shared pendingApprovals / pendingChoices maps         │
 * │                                                                  │
 * │  ┌───────────────────────────────────────────────────────────┐   │
 * │  │ TelegramSessionAdapter (Per-request)                      │   │
 * │  │ - Created for each incoming message or callback           │   │
 * │  │ - Implements the Adapter interface for Agent.run()        │   │
 * │  │ - Owns outbound queue, message tags, and status window    │   │
 * │  └───────────────────────────────────────────────────────────┘   │
 * └──────────────────────────────────────────────────────────────────┘
 * ```
 */

export { TelegramAdapter } from './telegram/TelegramAdapter.js';
export { TelegramSessionAdapter } from './telegram/SessionAdapter.js';
export { formatTgError, startTypingIndicator } from './telegram/errors.js';
export { splitMarkdownForTelegram, stripMarkdown } from './telegram/markdown.js';
export type { SendMessageOptions, PendingApproval, PendingChoice } from './telegram/types.js';
