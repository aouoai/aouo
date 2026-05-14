/**
 * @module adapters/telegram/types
 * @description Shared type definitions for the Telegram adapter.
 */

/**
 * Options for sending messages via the Telegram adapter.
 */
export interface SendMessageOptions {
  /** Parse mode for message formatting. */
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML' | 'none';
  /** Message ID or tag name to reply to. */
  replyTo?: number | string;
  /** Tag name to associate with the sent message for later reference. */
  tag?: string;
}

/**
 * Represents a pending user approval request.
 */
export interface PendingApproval {
  resolve: (value: 'allow' | 'deny' | 'always') => void;
}

/**
 * Represents a pending user choice from a multi-option prompt.
 */
export interface PendingChoice {
  resolve: (value: string) => void;
}
