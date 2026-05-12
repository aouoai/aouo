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
 * - `aouo packs`          — List installed packs
 */

import { Command } from 'commander';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const program = new Command();

program
  .name('aouo')
  .description('Domain Companion agent runtime — install packs, not plugins.')
  .version('0.1.0');

// ── init ─────────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Initialize the ~/.aouo/ data directory')
  .action(async () => {
    const { ensureDirectories, AOUO_HOME, SOUL_PATH, RULES_PATH, isInitialized } = await import(
      '../src/lib/paths.js'
    );

    if (isInitialized()) {
      console.log(`✅ Already initialized at ${AOUO_HOME}`);
      return;
    }

    ensureDirectories();

    // Copy SOUL.md and RULES.md templates if not present
    const templatesDir = join(import.meta.dirname, '..', 'templates');
    const templates = [
      { src: 'SOUL.md', dest: SOUL_PATH },
      { src: 'RULES.md', dest: RULES_PATH },
    ];

    for (const { src, dest } of templates) {
      if (!existsSync(dest)) {
        const srcPath = join(templatesDir, src);
        if (existsSync(srcPath)) {
          const { copyFileSync } = await import('node:fs');
          copyFileSync(srcPath, dest);
          console.log(`  📄 Created ${dest}`);
        }
      }
    }

    console.log(`\n✅ Initialized aouo at ${AOUO_HOME}`);
    console.log(`   Edit SOUL.md and RULES.md to customize your agent's personality.`);
  });

// ── doctor ───────────────────────────────────────────────────────────────────

program
  .command('doctor')
  .description('Check environment health and pack status')
  .action(async () => {
    const { AOUO_HOME, isInitialized, PACKS_DATA_DIR, DB_PATH } = await import(
      '../src/lib/paths.js'
    );

    console.log('🩺 aouo doctor\n');

    // Node.js version
    const nodeVersion = process.version;
    const nodeMajor = parseInt(nodeVersion.slice(1));
    const nodeOk = nodeMajor >= 22;
    console.log(`  Node.js: ${nodeVersion} ${nodeOk ? '✅' : '❌ (requires ≥ 22)'}`);

    // Initialization
    const initialized = isInitialized();
    console.log(`  Initialized: ${initialized ? '✅' : '❌ Run `aouo init`'}`);
    console.log(`  Home: ${AOUO_HOME}`);

    // Database
    const dbExists = existsSync(DB_PATH);
    console.log(`  Database: ${dbExists ? '✅' : '⚠️  Not yet created (created on first run)'}`);

    // Packs
    if (existsSync(PACKS_DATA_DIR)) {
      const packDirs = readdirSync(PACKS_DATA_DIR, { withFileTypes: true }).filter(
        (d) => d.isDirectory() && !d.name.startsWith('.'),
      );
      console.log(`  Packs: ${packDirs.length} installed`);
      for (const dir of packDirs) {
        console.log(`    - ${dir.name}`);
      }
    } else {
      console.log(`  Packs: none installed`);
    }

    // Environment variables
    const envVars = ['GEMINI_API_KEY', 'TELEGRAM_BOT_TOKEN', 'OPENAI_API_KEY'];
    console.log(`\n  Environment:`);
    for (const key of envVars) {
      const set = !!process.env[key];
      console.log(`    ${key}: ${set ? '✅ set' : '⚠️  not set'}`);
    }

    console.log('');
  });

// ── config ───────────────────────────────────────────────────────────────────

program
  .command('config')
  .description('Display active configuration')
  .action(async () => {
    const { loadConfig } = await import('../src/config/loader.js');
    const { CONFIG_PATH } = await import('../src/lib/paths.js');

    const config = loadConfig();
    console.log(`📁 Config source: ${existsSync(CONFIG_PATH) ? CONFIG_PATH : 'defaults'}\n`);

    // Mask sensitive values
    const masked = JSON.parse(JSON.stringify(config));
    if (masked.gemini?.api_key) masked.gemini.api_key = '***';
    if (masked.telegram?.bot_token) masked.telegram.bot_token = '***';
    if (masked.openai?.api_key) masked.openai.api_key = '***';

    console.log(JSON.stringify(masked, null, 2));
  });

// ── packs ────────────────────────────────────────────────────────────────────

program
  .command('packs')
  .description('List installed packs')
  .action(async () => {
    const { PACKS_DATA_DIR } = await import('../src/lib/paths.js');
    const { scanForPacks } = await import('../src/packs/loader.js');

    console.log('📦 Installed packs:\n');

    const packs = scanForPacks(PACKS_DATA_DIR);
    if (packs.length === 0) {
      console.log('  No packs installed.');
      console.log('  To install a pack, copy it to ~/.aouo/packs/<name>/');
      return;
    }

    for (const pack of packs) {
      const { loadManifestFile } = await import('../src/packs/manifest.js');
      const result = loadManifestFile(join(pack.path, 'pack.yml'));
      if (result.ok && result.manifest) {
        const m = result.manifest;
        console.log(`  📦 ${m.display_name} (${m.name}) v${m.version}`);
        if (m.description) console.log(`     ${m.description}`);
        console.log(`     Skills: ${m.provided_skills.join(', ') || 'none'}`);
      } else {
        console.log(`  ⚠️  ${pack.name}: invalid pack.yml`);
      }
    }
  });

// ── gateway ──────────────────────────────────────────────────────────────────

const gateway = program
  .command('gateway')
  .description('Manage the Telegram bot gateway');

gateway
  .command('start')
  .description('Start the Telegram bot (long-polling mode)')
  .action(async () => {
    console.log('🚀 Starting aouo gateway...\n');

    const { loadConfig } = await import('../src/config/loader.js');
    const { ensureDirectories, PACKS_DATA_DIR } = await import('../src/lib/paths.js');
    const { loadAllPacks } = await import('../src/packs/loader.js');
    const { TelegramAdapter } = await import('../src/adapters/telegram/TelegramAdapter.js');

    ensureDirectories();
    const config = loadConfig();

    // Load all installed packs
    await loadAllPacks([PACKS_DATA_DIR]);

    const adapter = new TelegramAdapter(config);

    // Graceful shutdown
    const shutdown = () => {
      console.log('\n[gateway] Shutting down...');
      adapter.stop();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    await adapter.start();
  });

program.parse();
