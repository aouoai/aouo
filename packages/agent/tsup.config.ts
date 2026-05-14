import { defineConfig } from 'tsup';
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

export default defineConfig((options) => ({
  entry: {
    index: 'src/index.ts',
    'bin/aouo': 'bin/aouo.ts',
  },
  format: ['esm'],
  target: 'node22',
  clean: true,
  // DTS is the slow part (~1.5s). Skip it in watch mode for fast iteration;
  // production `pnpm build` still emits types for downstream consumers.
  dts: options.watch ? false : { entry: 'src/index.ts' },
  splitting: true,
  sourcemap: true,
  external: ['@tavily/core'],
  // Built-in vertical apps live at repo-root `apps/` (e.g. apps/notes/).
  // Copy them into `dist/packs/` so the published tarball ships them at the
  // runtime path the agent already expects (`<pkg>/dist/packs/<name>/`).
  // Naming asymmetry on purpose: source name `apps/` (matches product
  // language "vertical agent apps"); runtime / dist name `packs/` (matches
  // `~/.aouo/packs/` user directory and `PackManifest` API).
  // The dashboard SPA bundle (built by `@aouo/dashboard`) is copied into
  // `dist/dashboard/` so the published tarball can serve it via `aouo ui`.
  // Use a function form so the command runs via execSync — tsup 8.x spawns
  // string-form onSuccess directly and chokes on multi-token commands.
  onSuccess: async () => {
    // tsup's `clean: true` empties dist before build, but if onSuccess runs
    // twice in one session (watch mode) the target dirs persist between runs.
    // Remove first so `cp -R src dst` treats dst as new each time — BSD `cp`
    // on macOS otherwise nests `src` inside the existing dst directory.
    rmSync('dist/packs', { recursive: true, force: true });
    execSync('cp -R ../../apps dist/packs', { stdio: 'inherit' });

    rmSync('dist/dashboard', { recursive: true, force: true });
    const dashboardDist = '../dashboard/dist';
    if (existsSync(dashboardDist)) {
      execSync(`cp -R ${dashboardDist} dist/dashboard`, { stdio: 'inherit' });
    } else {
      console.warn(
        '[tsup] @aouo/dashboard dist not found — skipping. Run `pnpm --filter @aouo/dashboard build` first to bundle the SPA.',
      );
    }
  },
}));
