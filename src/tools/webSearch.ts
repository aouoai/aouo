/**
 * @module tools/webSearch
 * @description Web search tool using the Tavily API with 24h disk caching.
 */

import { register } from './registry.js';
import type { ToolContext } from '../agent/types.js';
import { AOUO_HOME } from '../lib/paths.js';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { logger } from '../lib/logger.js';
import { trackWebSearch } from '../lib/usage.js';

const SEARCH_CACHE_DIR = join(AOUO_HOME, 'data', 'search');

function cacheKey(query: string): string {
  const hash = createHash('sha256').update(query.toLowerCase().trim()).digest('hex').slice(0, 12);
  const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
  return `${slug}_${hash}`;
}

function readCache(query: string): string | null {
  const filePath = join(SEARCH_CACHE_DIR, `${cacheKey(query)}.json`);
  if (!existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
    const ageMs = Date.now() - new Date(raw.timestamp).getTime();
    if (ageMs < 24 * 60 * 60 * 1000) return raw.result;
  } catch { /* corrupted */ }
  return null;
}

function writeCache(query: string, result: string, rawData: unknown): void {
  if (!existsSync(SEARCH_CACHE_DIR)) mkdirSync(SEARCH_CACHE_DIR, { recursive: true });
  const filePath = join(SEARCH_CACHE_DIR, `${cacheKey(query)}.json`);
  writeFileSync(filePath, JSON.stringify({
    query, timestamp: new Date().toISOString(), result, raw: rawData,
  }, null, 2));
}

register({
  name: 'web_search',
  timeoutMs: 45_000,
  description: 'Search the internet for up-to-date information using Tavily API. Results are cached for 24 hours.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      max_results: { type: 'number', description: 'Maximum results (default: 5).', default: 5 },
    },
    required: ['query'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const query = String(args.query);
    const maxResults = Number(args.max_results) || context.config.tools.web_search.max_results;

    const apiKey = context.config.tools.web_search.api_key;
    if (!apiKey) {
      return 'Error: Tavily API key not configured. Set tools.web_search.api_key in config.\nGet a free key at: https://tavily.com/';
    }

    const cached = readCache(query);
    if (cached) {
      logger.info({ msg: 'web_search_cache_hit', query: query.substring(0, 80) });
      return cached;
    }

    logger.info({ msg: 'web_search_start', query: query.substring(0, 80), maxResults });
    const t0 = Date.now();

    // @ts-ignore — @tavily/core is an optional peer dependency
    const { tavily } = await import('@tavily/core');
    const client = (tavily as any)({ apiKey });
    const data = await client.search(query, {
      maxResults,
      includeAnswer: true,
      includeRawContent: false,
    });

    const lines: string[] = [];
    if (data.answer) lines.push(`**Summary:** ${data.answer}\n`);
    if (data.results) {
      lines.push('**Sources:**\n');
      for (const [i, result] of data.results.entries()) {
        lines.push(`${i + 1}. **${result.title}**`);
        lines.push(`   ${result.url}`);
        lines.push(`   ${result.content}\n`);
      }
    }

    const formatted = lines.join('\n') || 'No results found.';
    writeCache(query, formatted, data);

    logger.info({ msg: 'web_search_done', query: query.substring(0, 80), results: data.results?.length || 0, duration_ms: Date.now() - t0 });
    trackWebSearch();

    return formatted;
  },
});
