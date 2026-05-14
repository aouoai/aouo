import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/types.ts'],
      // Sprint 0 anti-regression floor (current actual baseline, -1% safety).
      // Schedule:  Sprint 1 → lines:50 / functions:75
      //            Sprint 2 → lines:60
      //            Sprint 3 → lines:80 / branches:70
      // Providers (gemini/codex/deepseek) currently uncovered because they
      // hit network; raising lines first requires the E2E fixture in Sprint 3.
      thresholds: {
        lines: 40,
        statements: 40,
        functions: 70,
        branches: 60,
      },
    },
    testTimeout: 10_000,
  },
});
