import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'bin/aouo': 'bin/aouo.ts',
  },
  format: ['esm'],
  target: 'node22',
  clean: true,
  dts: { entry: 'src/index.ts' },
  splitting: true,
  sourcemap: true,
  external: ['@tavily/core'],
});
