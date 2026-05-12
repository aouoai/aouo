/**
 * @module packs/fastpath
 * @description Deterministic fast-path dispatcher for menu navigation.
 *
 * Fast-path routes bypass the LLM entirely for deterministic operations
 * like menu navigation and skill selection. This saves 5K-16K tokens
 * per user per day.
 *
 * Architecture:
 * - Packs declare menus in `menu.json` files
 * - Menus are merged at startup into a global callback → action map
 * - Telegram callback queries matching `nav:*` or `skill:*` are
 *   resolved directly without LLM invocation
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../lib/logger.js';

/**
 * A single menu item with text label and callback data.
 */
export interface MenuItem {
  /** Display text for the button. */
  text: string;
  /** Callback data sent when the button is pressed. */
  callback: string;
}

/**
 * A menu page containing a title and rows of buttons.
 */
export interface MenuPage {
  /** Menu page identifier (e.g., 'main', 'practice', 'settings'). */
  id: string;
  /** Display title when this menu is shown. */
  title: string;
  /** Rows of menu items (each row is an array of items). */
  rows: MenuItem[][];
  /** Optional pack that owns this menu page. */
  pack?: string;
}

/**
 * Result of resolving a fast-path callback.
 */
export interface FastPathResult {
  /** Whether a fast-path was found. */
  matched: boolean;
  /** The menu page to display (if matched). */
  page?: MenuPage;
  /** The skill to activate (if callback is a skill trigger). */
  skillName?: string;
}

/** Global menu registry: callback → MenuPage. */
const menuPages = new Map<string, MenuPage>();

/** Global skill shortcuts: callback → skill name. */
const skillCallbacks = new Map<string, string>();

/**
 * Loads and registers menus from a pack's menu.json file.
 *
 * @param packName - The pack identifier.
 * @param menuFile - Relative path to the menu.json within the pack source.
 * @param packSourceDir - Absolute path to the pack's source directory.
 * @returns Count of registered menu pages.
 */
export function loadPackMenus(
  packName: string,
  menuFile: string,
  packSourceDir: string,
): number {
  const menuPath = join(packSourceDir, menuFile);

  if (!existsSync(menuPath)) {
    logger.info({ msg: 'menu_skip', pack: packName, reason: 'no menu.json found' });
    return 0;
  }

  try {
    const raw = readFileSync(menuPath, 'utf-8');
    const pages = JSON.parse(raw) as MenuPage[];

    let count = 0;
    for (const page of pages) {
      page.pack = packName;
      menuPages.set(`nav:${page.id}`, page);
      count++;

      // Extract skill callbacks from menu items
      for (const row of page.rows) {
        for (const item of row) {
          if (item.callback.startsWith('skill:')) {
            const skillName = item.callback.slice(6);
            skillCallbacks.set(item.callback, skillName);
          }
        }
      }
    }

    logger.info({ msg: 'menus_loaded', pack: packName, pages: count });
    return count;
  } catch (err) {
    logger.error({
      msg: 'menu_load_failed',
      pack: packName,
      error: (err as Error).message,
    });
    return 0;
  }
}

/**
 * Resolves a callback query string to a fast-path action.
 *
 * Handles two types of callbacks:
 * - `nav:<page>` → returns the menu page to display
 * - `skill:<name>` → returns the skill name to activate
 *
 * @param callback - The callback data from a Telegram button press.
 * @returns The resolution result. Check `matched` to determine if LLM should be bypassed.
 */
export function resolveFastPath(callback: string): FastPathResult {
  // Navigation callback
  if (callback.startsWith('nav:')) {
    const page = menuPages.get(callback);
    if (page) {
      return { matched: true, page };
    }
  }

  // Skill activation callback
  if (callback.startsWith('skill:')) {
    const skillName = skillCallbacks.get(callback);
    if (skillName) {
      return { matched: true, skillName };
    }
  }

  return { matched: false };
}

/**
 * Returns all registered menu pages.
 *
 * @returns Array of all menu pages across all packs.
 */
export function getAllMenuPages(): MenuPage[] {
  return [...menuPages.values()];
}

/**
 * Clears all registered menus and skill callbacks.
 *
 * Used during pack unloading or testing.
 */
export function clearMenus(): void {
  menuPages.clear();
  skillCallbacks.clear();
}
