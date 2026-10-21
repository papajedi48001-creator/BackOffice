#!/usr/bin/env node
// Local development setup for other developers' machines. See docs/runbooks/local-setup.md.
//   node scripts/setup-local.mjs          install, write .env, start MariaDB + Redis, migrate, seed demo data
//   node scripts/setup-local.mjs web      build and start the web app on port 3000 with .env loaded
//   node scripts/setup-local.mjs worker   start the outbox worker with .env loaded
//   node scripts/setup-local.mjs lan      serve the web app over HTTPS to the LAN (port 8443)
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSeedDemo, lanAddresses, parseEnv, renderEnv } from './setup-local-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, '.env');
// Relative to root (the cwd of every command), so paths with spaces survive the Windows shell.
const composeFile = 'infra/compose/docker-compose.dev.yml';

function run(command, args, { env = {}, allowFailure = false, quiet = false } = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: quiet ? 'ignore' : 'inherit', shell: process.platform === 'win32' && command === 'pnpm', env: { ...process.env, ...env } });
  if (result.status !== 0 && !allowFailure) {
    console.error(`\nโ– ${command} ${args.join(' ')} failed`);
    process.exit(result.status ?? 1);
  }
  return result.status === 0;
}

function step(message) {
  console.log(`\nโ–ถ ${message}`);
}

function loadEnv() {
  if (!existsSync(envFile)) {
    console.error('โ– .env not found. Run `node scripts/setup-local.mjs` first.');
    process.exit(1);
  }
  return parseEnv(readFileSync(envFile, 'utf8'));
}

function checkTools() {
  step('Checking git, Docker Compose, Node 24 and pnpm');
  const missing = [];
  if (!run('git', ['--version'], { allowFailure: true, quiet: true })) missing.push('git');
  if (!run('docker', ['compose', 'version'], { allowFailure: true, quiet: true })) missing.push('Docker with Compose (Docker Desktop)');
  if (Number(process.versions.node.split('.')[0]) < 24) missing.push(`Node 24 (found ${process.versions.node})`);
  if (!run('pnpm', ['--version'], { allowFailure: true, quiet: true })) missing.push('pnpm (npm install -g pnpm@11.19.0)');
  if (missing.length) {
    console.error(`โ– Missing: ${missing.join(', ')}`);
    process.exit(1);
  }
}

function writeEnvIfMissing() {
  if (existsSync(envFile)) {
    step('.env already exists; keeping it');
    return;
  }
  step('Writing .env with fresh local secrets');
  const ports = {
    dbPort: Number(process.env.BACKOFFICE_DB_PORT ?? 3307),
    redisPort: Number(process.env.BACKOFFICE_REDIS_PORT ?? 6379),
    minioPort: Number(process.env.BACKOFFICE_MINIO_PORT ?? 9000)
  };
  writeFileSync(envFile, renderEnv(readFileSync(path.join(root, '.env.example'), 'utf8'), ports));
}

function migrateWithRetry(env) {
  step('Running migrations (waiting for MariaDB to accept connections)');
  for (let attempt = 1; attempt <= 30; attempt++) {
    if (run('pnpm', ['--filter', '@backoffice/db', 'migrate'], { env, allowFailure: true })) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  }
  console.error('โ– MariaDB did not become ready. Check `docker compose -f infra/compose/docker-compose.dev.yml logs mariadb`.');
  process.exit(1);
}

function workspacePackages() {
  const read = (dir, isRoot = false) => ({ ...JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')), root: isRoot });
  const children = ['apps', 'packages'].flatMap((group) =>
    readdirSync(path.join(root, group), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(path.join(root, group, entry.name, 'package.json')))
      .map((entry) => read(path.join(root, group, entry.name))));
  return [read(root, true), ...children];
}

function setup() {
  checkTools();
  step('Installing dependencies');
  run('pnpm', ['install', '--frozen-lockfile']);
  writeEnvIfMissing();
  const env = loadEnv();
  step('Starting MariaDB and Redis');
  const services = process.argv.includes('--with-minio') ? ['mariadb', 'redis', 'minio'] : ['mariadb', 'redis'];
  run('docker', ['compose', '-f', composeFile, 'up', '-d', ...services], { env });
  migrateWithRetry(env);
  const seed = findSeedDemo(workspacePackages());
  if (seed) {
    step('Seeding demo data');
    run('pnpm', seed, { env });
  } else {
    console.log('\n! seed:demo is not available on this branch yet; no demo accounts were created.');
  }
  console.log('\nโ” Ready. Next: `node scripts/setup-local.mjs web` and open http://localhost:3000');
}

function web() {
  const env = { ...loadEnv(), NODE_ENV: 'production' };
  if (!process.argv.includes('--no-build')) {
    step('Building the web app');
    run('pnpm', ['--filter', '@backoffice/web', 'build'], { env });
  }
  step('Starting the web app on http://localhost:3000');
  run('pnpm', ['--filter', '@backoffice/web', 'start', '--', '-p', env.BACKOFFICE_WEB_PORT ?? '3000'], { env });
}

function worker() {
  step('Starting the outbox worker');
  run('pnpm', ['--filter', '@backoffice/worker', 'start'], { env: loadEnv() });
}

function lan() {
  const env = loadEnv();
  const candidates = lanAddresses(networkInterfaces());
  const host = process.env.BACKOFFICE_LAN_HOST ?? env.BACKOFFICE_LAN_HOST ?? candidates[0];
  if (!host) {
    console.error('โ– No LAN address found. Set BACKOFFICE_LAN_HOST to this machine\'s IP address.');
    process.exit(1);
  }
  const port = env.BACKOFFICE_LAN_PORT ?? '8443';
  step(`Starting the HTTPS proxy for ${host}`);
  run('docker', ['compose', '-f', composeFile, '--profile', 'lan', 'up', '-d', 'https-lan'], { env: { ...env, BACKOFFICE_LAN_HOST: host } });
  console.log(`\nโ” Other machines on the LAN can open https://${host}:${port}`);
  if (candidates.length > 1) console.log(`  Other addresses on this machine: ${candidates.filter((a) => a !== host).join(', ')} (set BACKOFFICE_LAN_HOST to pick one)`);
  console.log('  The web app must be running (`node scripts/setup-local.mjs web`), and the firewall must allow inbound TCP on that port.');
}

const commands = { setup, web, worker, lan };
const command = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'setup';
if (!commands[command]) {
  console.error(`Unknown command "${command}". Use one of: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}
commands[command]();
