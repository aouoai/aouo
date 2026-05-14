import { defineConfig } from 'tsup';
import { execSync } from 'node:child_process';

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
  // Built-in vertical apps live at repo-root `apps/` (e.g. apps/notes/).
  // Copy them into `dist/packs/` so the published tarball ships them at the
  // runtime path the agent already expects (`<pkg>/dist/packs/<name>/`).
  // Naming asymmetry on purpose: source name `apps/` (matches product
  // language "vertical agent apps"); runtime / dist name `packs/` (matches
  // `~/.aouo/packs/` user directory and `PackManifest` API).
  // Use a function form so the command runs via execSync — tsup 8.x spawns
  // string-form onSuccess directly and chokes on multi-token commands.
  onSuccess: async () => {
    execSync('cp -R ../../apps dist/packs', { stdio: 'inherit' });
  },
});
