import { describe, it, expect, beforeAll } from 'vitest';
import { dispatch, registerAllTools } from '../../src/tools/registry.js';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import type { Adapter, ToolContext } from '../../src/agent/types.js';

const adapter: Adapter = {
  platform: 'test',
  async reply() {},
  async requestApproval() {
    return 'allow';
  },
};

const context: ToolContext = {
  adapter,
  config: DEFAULT_CONFIG,
  sessionKey: 'test:db',
};

describe('tools/db', () => {
  beforeAll(async () => {
    await registerAllTools();
  });

  it('rejects write SQL because db is diagnostics-only', async () => {
    const result = await dispatch(
      'db',
      {
        name: `readonly-${process.pid}`,
        sql: 'CREATE TABLE writes_should_fail (id INTEGER PRIMARY KEY)',
      },
      context,
    );

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content);
    expect(parsed.error).toContain('read-only');
  });

  it('rejects write statements inside batch queries', async () => {
    const result = await dispatch(
      'db',
      {
        name: `readonly-batch-${process.pid}`,
        queries: JSON.stringify([
          { sql: 'SELECT 1 AS ok' },
          { sql: 'DELETE FROM entries WHERE id = 1' },
        ]),
      },
      context,
    );

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content);
    expect(parsed.error).toContain('read-only');
  });
});
