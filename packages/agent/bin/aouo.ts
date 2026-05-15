#!/usr/bin/env node

/**
 * @module bin/aouo
 * @description CLI entry point for the aouo agent runtime.
 *
 * Commands:
 * - `aouo init`           — Initialize ~/.aouo/ directory with templates
 * - `aouo gateway start`  — Start the Telegram bot (long-polling)
 * - `aouo config`         — View active configuration
 * - `aouo doctor`         — Check environment health
 * - `aouo pack list`      — List installed packs
 */

import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const program = new Command();

function packageVersion(): string {
  const candidates = [
    // Source tree: packages/agent/bin/aouo.ts -> packages/agent/package.json
    join(import.meta.dirname, '..', 'package.json'),
    // Published build: dist/bin/aouo.js -> package root package.json
    join(import.meta.dirname, '..', '..', 'package.json'),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as { version?: unknown };
    if (typeof parsed.version === 'string') return parsed.version;
  }

  return '0.0.0';
}

program
  .name('aouo')
  .description('Vertical agent app platform — install packs, not prompts.')
  .version(packageVersion());

// ── init ─────────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Initialize the ~/.aouo/ data directory')
  .action(async () => {
    const { ensureDirectories, AOUO_HOME, SOUL_PATH, RULES_PATH, isInitialized, CONFIG_PATH } = await import(
      '../src/lib/paths.js'
    );

    const alreadyInitialized = isInitialized();

    ensureDirectories();

    // Copy SOUL.md and RULES.md templates if not present
    const templateCandidates = [
      join(import.meta.dirname, '..', 'templates'),
      join(import.meta.dirname, '..', '..', 'templates'),
    ];
    const templatesDir = templateCandidates.find((dir) => existsSync(dir));
    const templates = [
      { src: 'SOUL.md', dest: SOUL_PATH },
      { src: 'RULES.md', dest: RULES_PATH },
    ];

    for (const { src, dest } of templates) {
      if (!existsSync(dest)) {
        const srcPath = templatesDir ? join(templatesDir, src) : '';
        if (existsSync(srcPath)) {
          const { copyFileSync } = await import('node:fs');
          copyFileSync(srcPath, dest);
          console.log(`  📄 Created ${dest}`);
        } else {
          console.log(`  ⚠️  Template ${src} not found; skipped ${dest}`);
        }
      }
    }

    // Create default config.json. Runtime configuration is file-only.
    const { createDefaultConfig, saveConfig } = await import('../src/config/loader.js');
    if (!existsSync(CONFIG_PATH)) {
      saveConfig(createDefaultConfig());
      console.log(`  📄 Created ${CONFIG_PATH}`);
    }

    console.log(`\n✅ ${alreadyInitialized ? 'Already initialized' : 'Initialized'} aouo at ${AOUO_HOME}`);
    console.log(`   Edit SOUL.md, RULES.md, and config.json to customize your agent.`);
  });

// ── doctor ───────────────────────────────────────────────────────────────────

interface DoctorOptions {
  fast?: boolean;
}

program
  .command('doctor')
  .description('Check environment health and pack status')
  .option('--fast', 'Skip network and provider-API checks (offline mode)')
  .action(async (options: DoctorOptions) => {
    const { AOUO_HOME, PACKS_DIR, DB_PATH, SOUL_PATH, RULES_PATH, CONFIG_PATH } = await import(
      '../src/lib/paths.js'
    );
    const { loadConfig } = await import('../src/config/loader.js');
    const { hasCodexAuth } = await import('../src/lib/auth.js');
    const {
      runChecks,
      nodeVersionCheck,
      initializedCheck,
      dbWritableCheck,
      telegramTokenCheck,
      providerKeyCheck,
      reachabilityCheck,
      formatCheckLine,
      computeExitCode,
    } = await import('../src/lib/diagnostics.js');
    const { dirname } = await import('node:path');

    console.log(`🩺 aouo doctor${options.fast ? ' (--fast)' : ''}\n`);
    console.log(`  Home: ${AOUO_HOME}\n`);

    const config = loadConfig();

    const checks = [
      nodeVersionCheck(),
      initializedCheck({ soulPath: SOUL_PATH, rulesPath: RULES_PATH, configPath: CONFIG_PATH }),
      dbWritableCheck(dirname(DB_PATH)),
      reachabilityCheck('https://api.telegram.org', 'Network: api.telegram.org'),
      telegramTokenCheck(config.telegram.bot_token),
      providerKeyCheck(config, hasCodexAuth),
    ];

    const results = await runChecks(checks, { fast: options.fast });
    for (const { check, result } of results) {
      console.log(formatCheckLine(check, result));
    }

    // ── Configuration & inventory summary (cheap, always shown) ──
    console.log('\n  Inventory:');

    if (existsSync(PACKS_DIR)) {
      const packDirs = readdirSync(PACKS_DIR, { withFileTypes: true }).filter(
        (d) => d.isDirectory() && !d.name.startsWith('.'),
      );
      console.log(`    Packs: ${packDirs.length} installed`);
      for (const dir of packDirs) {
        console.log(`      - ${dir.name}`);
      }
    } else {
      console.log(`    Packs: none installed`);
    }

    console.log(`    Provider: ${config.provider.backend} (${config.provider.model})`);
    if (config.telegram.bot_token) {
      const allowlistSize = config.telegram.allowed_user_ids.length;
      if (allowlistSize === 0) {
        console.log(
          `    Telegram allowlist: ❌ empty — bot will reject every message.`,
        );
        console.log(`       → DM @userinfobot to get your numeric ID, then run \`aouo config channels\`.`);
      } else {
        console.log(`    Telegram allowlist: ✅ ${allowlistSize} user(s)`);
      }
    }
    console.log(`    Cron: ${config.cron.enabled ? '✅ enabled' : 'off'}\n`);

    process.exitCode = computeExitCode(results);
  });

// ── config ───────────────────────────────────────────────────────────────────

const configCmd = program
  .command('config')
  .description('Manage configuration')
  .action(async () => {
    const { runConfigMenu } = await import('../src/commands/config.js');
    await runConfigMenu();
  });

configCmd
  .command('provider')
  .description('Configure active provider, credentials, and model')
  .action(async () => {
    const { runConfigProvider } = await import('../src/commands/config.js');
    await runConfigProvider();
  });

configCmd
  .command('tools')
  .description('Configure tool APIs and enabled tool groups')
  .action(async () => {
    const { runConfigTools } = await import('../src/commands/config.js');
    await runConfigTools();
  });

configCmd
  .command('channels')
  .description('Configure messaging channels and cron delivery')
  .action(async () => {
    const { runConfigChannels } = await import('../src/commands/config.js');
    await runConfigChannels();
  });

configCmd
  .command('advanced')
  .description('Configure runtime limits and display behavior')
  .action(async () => {
    const { runConfigAdvanced } = await import('../src/commands/config.js');
    await runConfigAdvanced();
  });

configCmd
  .command('show')
  .description('Show current configuration (masked)')
  .action(async () => {
    const { runConfigShow } = await import('../src/commands/config.js');
    runConfigShow();
  });

configCmd
  .command('edit')
  .description('Open config.json in $EDITOR')
  .action(async () => {
    const { execFileSync } = await import('node:child_process');
    const { CONFIG_PATH, isInitialized } = await import('../src/lib/paths.js');
    if (!isInitialized()) {
      console.log('Not initialized. Run `aouo init` first.');
      return;
    }
    const editor = process.env.EDITOR || 'vi';
    execFileSync(editor, [CONFIG_PATH], { stdio: 'inherit' });
  });

// ── packs ────────────────────────────────────────────────────────────────────

const packCmd = program
  .command('pack')
  .description('Developer commands for local packs');

packCmd
  .command('list')
  .description('List installed and scanned packs')
  .action(async () => {
    const { runPackList } = await import('../src/commands/pack.js');
    const ok = await runPackList();
    if (!ok) process.exitCode = 1;
  });

packCmd
  .command('validate <path>')
  .description('Validate a local pack against the Pack ABI')
  .action(async (packPath: string) => {
    const { runPackValidate } = await import('../src/commands/pack.js');
    const ok = await runPackValidate(packPath);
    if (!ok) process.exitCode = 1;
  });

packCmd
  .command('link <path>')
  .description('Validate and link a local pack into ~/.aouo/packs/<name>')
  .action(async (packPath: string) => {
    const { runPackLink } = await import('../src/commands/pack.js');
    const ok = await runPackLink(packPath);
    if (!ok) process.exitCode = 1;
  });

program
  .command('packs', { hidden: true })
  .description('Deprecated alias for `aouo pack list`')
  .action(async () => {
    console.log('`aouo packs` is deprecated. Use `aouo pack list`.');
    const { runPackList } = await import('../src/commands/pack.js');
    const ok = await runPackList();
    if (!ok) process.exitCode = 1;
  });

// ── gateway ──────────────────────────────────────────────────────────────────

const gateway = program
  .command('gateway')
  .description('Manage the Telegram bot gateway');

async function runGatewayStart(): Promise<void> {
  const { isServiceRunning } = await import('../src/lib/pidfile.js');
  const { isDaemonChild, spawnDetachedChild, daemonLogPath } = await import('../src/lib/daemonize.js');

  if (!isDaemonChild()) {
    // ── Parent path: validate, spawn detached daemon, exit. ──
    const { running, pid } = isServiceRunning('gateway');
    if (running) {
      console.log(`⚠️  Gateway is already running (PID ${pid}).`);
      console.log(`   Run "aouo gateway stop" first, or "aouo gateway restart".`);
      process.exitCode = 1;
      return;
    }

    const { loadConfig } = await import('../src/config/loader.js');
    const { ensureDirectories } = await import('../src/lib/paths.js');
    ensureDirectories();
    const config = loadConfig();

    if (!config.telegram?.bot_token) {
      console.log('❌ Telegram bot token not configured.');
      console.log('   Run "aouo config" → Telegram to set it up.');
      process.exitCode = 1;
      return;
    }

    const { logPath } = spawnDetachedChild('gateway', ['gateway', 'start']);
    // Wait for the child to either write its pidfile (success) or die (failure).
    await new Promise((r) => setTimeout(r, 800));
    const after = isServiceRunning('gateway');
    if (!after.running) {
      console.log(`❌ Gateway failed to start. Check logs: ${daemonLogPath('gateway')}`);
      process.exitCode = 1;
      return;
    }

    console.log(`✅ Gateway started in background (PID ${after.pid}).`);
    console.log(`   Logs: ${logPath}`);
    console.log(`   Stop: aouo gateway stop`);
    return;
  }

  // ── Child path: actually run the service. ──
  const { writePid, removePid } = await import('../src/lib/pidfile.js');
  writePid('gateway');

  const { loadConfig } = await import('../src/config/loader.js');
  const { ensureDirectories, PACKS_DIR } = await import('../src/lib/paths.js');
  const { loadAllPacks } = await import('../src/packs/loader.js');

  ensureDirectories();
  const config = loadConfig();
  await loadAllPacks([PACKS_DIR, ...config.packs.scan_dirs], config.packs.enabled, config);

  const { TelegramAdapter } = await import('../src/adapters/telegram/TelegramAdapter.js');
  const adapter = new TelegramAdapter(config);

  const shutdown = () => {
    adapter.stop();
    removePid('gateway');
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await adapter.start();
}

gateway
  .command('start')
  .description('Start the Telegram bot in the background (long-polling)')
  .action(async () => {
    await runGatewayStart();
  });

gateway
  .command('stop')
  .description('Stop the running gateway')
  .action(async () => {
    const { isServiceRunning, stopService } = await import('../src/lib/pidfile.js');
    const { running, pid } = isServiceRunning('gateway');

    if (!running) {
      console.log('ℹ️  Gateway is not running.');
      return;
    }

    console.log(`[gateway] Stopping PID ${pid}...`);
    const stopped = await stopService('gateway');

    if (stopped) {
      console.log('✅ Gateway stopped.');
    } else {
      console.log('⚠️  Could not stop gateway. Process may have already exited.');
    }
  });

gateway
  .command('status')
  .description('Check if the gateway is running')
  .action(async () => {
    const { isServiceRunning } = await import('../src/lib/pidfile.js');
    const { running, pid } = isServiceRunning('gateway');

    if (running) {
      console.log(`✅ Gateway is running (PID ${pid}).`);
    } else {
      console.log('⏹️  Gateway is not running.');
    }
  });

gateway
  .command('restart')
  .description('Restart the gateway (stop + start)')
  .action(async () => {
    const { isServiceRunning, stopService } = await import('../src/lib/pidfile.js');
    const { running, pid } = isServiceRunning('gateway');

    if (running) {
      console.log(`[gateway] Stopping PID ${pid}...`);
      await stopService('gateway');
      console.log('✅ Stopped.');
      await new Promise((r) => setTimeout(r, 500));
    }

    await runGatewayStart();
  });

gateway
  .command('logs')
  .description('Print the path of the gateway log file')
  .action(async () => {
    const { daemonLogPath } = await import('../src/lib/daemonize.js');
    console.log(daemonLogPath('gateway'));
  });

// ── ui ───────────────────────────────────────────────────────────────────────

const DEFAULT_UI_PORT = 9800;

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  try {
    const child = spawn(cmd, [url], { detached: true, stdio: 'ignore' });
    child.unref();
  } catch {
    // Browser launch is best-effort — the URL is printed regardless.
  }
}

function resolveDashboardDir(): string | undefined {
  // Built artifact: dist/bin/aouo.js → dist/dashboard/.
  // Dev tree (tsx): bin/aouo.ts → ../../dashboard/dist (packages/dashboard/dist).
  const candidates = [
    join(import.meta.dirname, '..', 'dashboard'),
    join(import.meta.dirname, '..', '..', 'dashboard', 'dist'),
  ];
  return candidates.find((dir) => existsSync(join(dir, 'index.html')));
}

const ui = program.command('ui').description('Local dashboard server (web UI for config, status, packs)');

interface UiStartOptions {
  port?: string;
  open?: boolean;
}

/**
 * UI is intentionally foreground-only — the local dashboard is a single-user
 * admin console and must NOT survive the operator's interactive session.
 * Closing the terminal (SIGHUP), Ctrl+C (SIGINT), or kill (SIGTERM) all
 * tear it down cleanly.
 *
 * Gateway is different and IS daemonized: it serves the Telegram bot, which
 * has its own auth (allowlist) and is meant to run 24/7.
 */
async function runUiStart(options: UiStartOptions): Promise<void> {
  const { isServiceRunning, writePid, removePid } = await import('../src/lib/pidfile.js');
  const { running, pid } = isServiceRunning('ui');
  if (running) {
    console.log(`⚠️  Dashboard is already running (PID ${pid}).`);
    console.log(`   Stop the other instance with "aouo ui stop", or attach to its terminal.`);
    process.exitCode = 1;
    return;
  }

  const { ensureDirectories, PACKS_DIR } = await import('../src/lib/paths.js');
  ensureDirectories();

  // Packs must be loaded before the server accepts requests: /api/packs/:pack
  // and /api/packs/:pack/chat both read from the in-process pack registry, so
  // a bare `aouo ui start` against an empty registry would return 404 for
  // every pack until something else loaded them.
  const { loadConfig } = await import('../src/config/loader.js');
  const { loadAllPacks } = await import('../src/packs/loader.js');
  const config = loadConfig();
  const loadedPacks = await loadAllPacks(
    [PACKS_DIR, ...config.packs.scan_dirs],
    config.packs.enabled,
    config,
  );

  const { startUiServer } = await import('../src/server/index.js');
  const port = Number(options.port ?? DEFAULT_UI_PORT) || DEFAULT_UI_PORT;
  const dashboardDir = resolveDashboardDir();

  if (!dashboardDir) {
    console.log('ℹ️  Dashboard bundle not found. Serving API only.');
    console.log('   Run `pnpm --filter @aouo/dashboard build` to generate the SPA.');
  }

  // AOUO_UI_TOKEN env var pins the auth token, which is useful when running
  // Vite dev (HMR) against this server: both sides agree on a known token.
  // Unset → a fresh 32-byte hex token is minted every boot (production default).
  const devToken = process.env['AOUO_UI_TOKEN'];

  let handle;
  try {
    handle = await startUiServer({ port, dashboardDir, ...(devToken ? { token: devToken } : {}) });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EADDRINUSE') {
      console.log(`❌ Port ${port} is already in use. Pass --port <n> to choose another.`);
    } else {
      console.log(`❌ Failed to start dashboard: ${(err as Error).message}`);
    }
    process.exitCode = 1;
    return;
  }

  writePid('ui');
  console.log('🖥️  aouo dashboard running (foreground)');
  console.log(`   URL:  ${handle.url}`);
  console.log(`   Port: ${handle.port} (bound to 127.0.0.1)`);
  console.log(`   Bundle: ${dashboardDir ?? '(API only — no SPA)'}`);
  console.log(`   Packs: ${loadedPacks.length} loaded`);
  if (devToken) {
    console.log(`   Dev URL (vite HMR): http://127.0.0.1:5173/?token=${devToken}`);
  }
  console.log(`   ⚠️  Closing this terminal or Ctrl+C will stop the dashboard.\n`);

  if (options.open !== false) {
    openBrowser(handle.url);
  }

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[ui] Received ${signal}, shutting down...`);
    handle
      .stop()
      .catch(() => undefined)
      .finally(() => {
        removePid('ui');
        process.exit(0);
      });
  };
  // SIGHUP fires when the controlling terminal closes (window close, ssh
  // disconnect, parent shell exit). Default Node behavior would also
  // terminate, but installing a handler lets us drop the pidfile cleanly.
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGHUP', () => shutdown('SIGHUP'));
}

ui
  .command('start', { isDefault: true })
  .description('Start the dashboard (foreground — Ctrl+C or terminal close stops it)')
  .option('-p, --port <number>', 'Port to bind on 127.0.0.1', String(DEFAULT_UI_PORT))
  .option('--no-open', 'Do not auto-open the browser')
  .action(async (options: UiStartOptions) => {
    await runUiStart(options);
  });

ui
  .command('stop')
  .description('Stop the running dashboard')
  .action(async () => {
    const { isServiceRunning, stopService } = await import('../src/lib/pidfile.js');
    const { running, pid } = isServiceRunning('ui');
    if (!running) {
      console.log('ℹ️  Dashboard is not running.');
      return;
    }
    console.log(`[ui] Stopping PID ${pid}...`);
    const stopped = await stopService('ui');
    if (stopped) {
      console.log('✅ Dashboard stopped.');
    } else {
      console.log('⚠️  Could not stop dashboard. Process may have already exited.');
    }
  });

ui
  .command('status')
  .description('Check if the dashboard is running')
  .action(async () => {
    const { isServiceRunning } = await import('../src/lib/pidfile.js');
    const { running, pid } = isServiceRunning('ui');
    if (running) {
      console.log(`✅ Dashboard is running (PID ${pid}).`);
    } else {
      console.log('⏹️  Dashboard is not running.');
    }
  });

ui
  .command('restart')
  .description('Restart the dashboard (stop + start)')
  .option('-p, --port <number>', 'Port to bind on 127.0.0.1', String(DEFAULT_UI_PORT))
  .option('--no-open', 'Do not auto-open the browser')
  .action(async (options: UiStartOptions) => {
    const { isServiceRunning, stopService } = await import('../src/lib/pidfile.js');
    const { running, pid } = isServiceRunning('ui');
    if (running) {
      console.log(`[ui] Stopping PID ${pid}...`);
      await stopService('ui');
      console.log('✅ Stopped.');
      await new Promise((r) => setTimeout(r, 500));
    }
    await runUiStart(options);
  });

program.parse();
