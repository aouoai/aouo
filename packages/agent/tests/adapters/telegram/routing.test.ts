/**
 * @module tests/adapters/telegram/routing
 * @description Unit tests for the Telegram address builder and slash-command
 *              argument parsers. Kept Grammy-free by using plain context
 *              fixtures that match the {@link TelegramRouteCtx} shape.
 */

import { describe, it, expect } from 'vitest';
import {
  buildAddressFromTelegram,
  formatRouteSummary,
  isUserAuthorized,
  packPickerKeyboard,
  parseUseCommand,
} from '../../../src/adapters/telegram/routing.js';
import type { ConversationRoute } from '../../../src/storage/conversationRoutes.js';

describe('adapters/telegram/routing', () => {
  describe('buildAddressFromTelegram', () => {
    it('maps a private-chat text message to a chat-only address', () => {
      const addr = buildAddressFromTelegram({
        chat: { id: 12345, type: 'private' },
        message: {},
      });
      expect(addr).toEqual({ platform: 'tg', chatId: '12345' });
    });

    it('includes threadId for forum topic posts', () => {
      const addr = buildAddressFromTelegram({
        chat: { id: -100123, type: 'supergroup' },
        message: { message_thread_id: 7, is_topic_message: true },
      });
      expect(addr).toEqual({ platform: 'tg', chatId: '-100123', threadId: '7' });
    });

    it('does NOT include threadId when message_thread_id exists but is_topic_message is false', () => {
      // Forum supergroups attach message_thread_id to every General-topic
      // message — that should not split routing.
      const addr = buildAddressFromTelegram({
        chat: { id: -100123, type: 'supergroup' },
        message: { message_thread_id: 1, is_topic_message: false },
      });
      expect(addr).toEqual({ platform: 'tg', chatId: '-100123' });
    });

    it('falls back to callbackQuery.message.chat.id when no ctx.chat is present', () => {
      const addr = buildAddressFromTelegram({
        callbackQuery: { message: { chat: { id: 999 } } },
      });
      expect(addr).toEqual({ platform: 'tg', chatId: '999' });
    });

    it('returns null when no chat id is available', () => {
      expect(buildAddressFromTelegram({})).toBeNull();
    });
  });

  describe('isUserAuthorized', () => {
    it('rejects EVERY user when the allowlist is empty (secure default)', () => {
      expect(isUserAuthorized([], 12345)).toBe(false);
      expect(isUserAuthorized([], undefined)).toBe(false);
    });

    it('allows users explicitly listed', () => {
      expect(isUserAuthorized([100, 200], 100)).toBe(true);
      expect(isUserAuthorized([100, 200], 200)).toBe(true);
    });

    it('rejects users not in the allowlist', () => {
      expect(isUserAuthorized([100, 200], 999)).toBe(false);
    });

    it('rejects callers with no userId even when an allowlist exists', () => {
      expect(isUserAuthorized([100], undefined)).toBe(false);
    });
  });

  describe('parseUseCommand', () => {
    it('parses a bare pack name', () => {
      expect(parseUseCommand('notes')).toEqual({ pack: 'notes' });
      expect(parseUseCommand('  notes  ')).toEqual({ pack: 'notes' });
    });

    it('parses pack:skill', () => {
      expect(parseUseCommand('notes:daily-note')).toEqual({ pack: 'notes', skill: 'daily-note' });
    });

    it('returns null for empty input', () => {
      expect(parseUseCommand('')).toBeNull();
      expect(parseUseCommand('   ')).toBeNull();
      expect(parseUseCommand(':daily-note')).toBeNull();
    });

    it('omits skill field when colon present but skill is blank', () => {
      expect(parseUseCommand('notes:')).toEqual({ pack: 'notes' });
    });
  });

  describe('packPickerKeyboard', () => {
    it('builds one row per pack with namespaced callback data', () => {
      expect(packPickerKeyboard(['notes', 'creator'])).toEqual([
        [{ text: '📦 notes', callback_data: 'pack:notes' }],
        [{ text: '📦 creator', callback_data: 'pack:creator' }],
      ]);
    });

    it('returns an empty layout for zero packs', () => {
      expect(packPickerKeyboard([])).toEqual([]);
    });

    it('prefixes the current pack with ✅ instead of 📦', () => {
      expect(packPickerKeyboard(['notes', 'creator', 'vocab'], 'creator')).toEqual([
        [{ text: '📦 notes', callback_data: 'pack:notes' }],
        [{ text: '✅ creator', callback_data: 'pack:creator' }],
        [{ text: '📦 vocab', callback_data: 'pack:vocab' }],
      ]);
    });

    it('ignores currentPack when it does not match any pack', () => {
      expect(packPickerKeyboard(['a', 'b'], 'c')).toEqual([
        [{ text: '📦 a', callback_data: 'pack:a' }],
        [{ text: '📦 b', callback_data: 'pack:b' }],
      ]);
    });
  });

  describe('formatRouteSummary', () => {
    const baseRoute: ConversationRoute = {
      id: 'r1',
      address: { platform: 'tg', chatId: '42' },
      activePack: null,
      activeSkill: null,
      sessionId: null,
      createdAt: '2026-05-14',
      updatedAt: '2026-05-14',
    };

    it('shows (none) placeholders when nothing is bound', () => {
      const out = formatRouteSummary(baseRoute, []);
      expect(out).toContain('active pack: `(none)`');
      expect(out).toContain('active skill: `(none)`');
      expect(out).toContain('session: `(unbound)`');
      expect(out).toContain('Loaded packs: (none)');
    });

    it('prompts the user to pick when multiple packs are loaded but none is active', () => {
      const out = formatRouteSummary(baseRoute, ['notes', 'creator']);
      expect(out).toContain('Pick one with `/use <pack>` or `/pack`.');
    });

    it('does NOT prompt to pick when a pack is already active', () => {
      const out = formatRouteSummary(
        { ...baseRoute, activePack: 'notes' },
        ['notes', 'creator'],
      );
      expect(out).not.toContain('Pick one with');
      expect(out).toContain('active pack: `notes`');
    });

    it('renders threadId only when present on the address', () => {
      const withTopic: ConversationRoute = {
        ...baseRoute,
        address: { platform: 'tg', chatId: '-100', threadId: '7' },
      };
      expect(formatRouteSummary(withTopic, [])).toContain('topic: `7`');
      expect(formatRouteSummary(baseRoute, [])).not.toContain('topic:');
    });
  });
});
