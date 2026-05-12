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
  splitting: false,
  sourcemap: true,
  esbuildPlugins: [
    {
      name: 'node-builtins-external',
      setup(build) {
        // node:sqlite is experimental and must remain external
        build.onResolve({ filter: /^node:sqlite$/ }, () => ({
          path: 'node:sqlite',
          external: true,
        }));
        // @tavily/core is an optional peer dependency
        build.onResolve({ filter: /^@tavily\/core$/ }, () => ({
          path: '@tavily/core',
          external: true,
        }));
      },
    },
  ],
});
