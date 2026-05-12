/**
 * @module tests/packs/schema
 * @description Tests for extends_columns schema migration.
 */

import { describe, it, expect } from 'vitest';
import { runExtendsColumns } from '../../src/packs/schema.js';

describe('runExtendsColumns', () => {
  it('does not throw when table does not exist', () => {
    // Should gracefully warn, not crash
    expect(() => {
      runExtendsColumns('nonexistent-pack', {
        missing_table: { some_col: 'TEXT' },
      });
    }).not.toThrow();
  });

  it('handles empty extends_columns map', () => {
    expect(() => {
      runExtendsColumns('test-pack', {});
    }).not.toThrow();
  });

  it('handles empty columns for a table', () => {
    expect(() => {
      runExtendsColumns('test-pack', { some_table: {} });
    }).not.toThrow();
  });
});
