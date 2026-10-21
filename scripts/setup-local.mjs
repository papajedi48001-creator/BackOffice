#!/usr/bin/env node
/* global process, console -- Node script outside the workspace packages */
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
import { findSeedDemo, isPortFree, lanAddresses, parseEnv, renderEnv } from './setup-local-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, '.env');
// Relative to root (the cwd of every command), so paths with spaces survive the Windows shell.
const composeFile = 'infra/compose/docker-compose.dev.yml';

function run(command, args, { env = {}, allowFailure = false, quiet = false } = {}) {
  // pnpm is a .cmd shim on Windows and needs a shell; every argument here is a fixed script value.
  const viaShell = process.platform === 'win32' && command === 'pnpm';
  const options = { cwd: root, stdio: quiet ? 'ignore' : 'inherit', shell: viaShell, env: { ...process.env, ...env } };
  const result = viaShell ? spawnSync([command, ...args].join(' '), options) : spawnSync(command, args, options);
  if (result.status !== 0 && !allowFailure) {
    console.error(`\nx ${command} ${args.join(' ')} failed`);
    process.exit(result.status ?? 1);
  }
  return result.status === 0;
}

function step(message) {
  console.log(`\n==> ${message}`);
}

function loadEnv() {
  if (!existsSync(envFile)) {
    console.error('x .env not found. Run `node scripts/setup-local.mjs` first.');
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
    console.error(`x Missing: ${missing.join(', ')}`);
    process.exit(1);
  }
}

function hostPorts() {
  const source = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : process.env;
  return {
    dbPort: Number(source.BACKOFFICE_DB_PORT ?? 3307),
    redisPort: Number(source.BACKOFFICE_REDIS_PORT ?? 6379),
    minioPort: Number(source.BACKOFFICE_MINIO_PORT ?? 9000)
  };
}

/** Fails early with a clear fix when another program already holds a port Docker needs to publish. */
async function checkPortsFree(ports, services, env) {
  const wanted = { mariadb: ['BACKOFFICE_DB_PORT', ports.dbPort], redis: ['BACKOFFICE_REDIS_PORT', ports.redisPort], minio: ['BACKOFFICE_MINIO_PORT', ports.minioPort] };
  const busy = [];
  for (const service of services) {
    const running = spawnSync('docker', ['compose', '-f', composeFile, 'ps', '--status', 'running', '-q', service], { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } });
    if (running.stdout?.trim()) continue; // our own container already holds the port
    const [variable, port] = wanted[service];
    if (!(await isPortFree(port))) busy.push(`  ${service}: port ${port} is in use -> set ${variable} to a free port`);
  }
  if (!busy.length) return;
  console.error(`x Ports already in use:\n${busy.join('\n')}`);
  console.error(existsSync(envFile)
    ? '  Change the BACKOFFICE_*_PORT lines in .env and the matching port in DATABASE_URL / REDIS_URL, then run again.'
    : '  Example (PowerShell): $env:BACKOFFICE_DB_PORT=3310; node scripts/setup-local.mjs\n  Example (bash): BACKOFFICE_DB_PORT=3310 node scripts/setup-local.mjs');
  process.exit(1);
}

function writeEnvIfMissing(ports) {
  if (existsSync(envFile)) {
    step('.env already exists; keeping it');
    return;
  }
  step('Writing .env with fresh local secrets');
  writeFileSync(envFile, renderEnv(readFileSync(path.join(root, '.env.example'), 'utf8'), ports));
}

function migrateWithRetry(env) {
  step('Running migrations (waiting for MariaDB to accept connections)');
  for (let attempt = 1; attempt <= 30; attempt++) {
    // Connection errors are expected while MariaDB boots; only the last attempt prints its output.
    if (run('pnpm', ['--filter', '@backoffice/db', 'migrate'], { env, allowFailure: true, quiet: attempt < 30 })) {
      console.log('Migrations applied.');
      return;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  }
  console.error('x MariaDB did not become ready. Check `docker compose -f infra/compose/docker-compose.dev.yml logs mariadb`.');
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

async function setup() {
  checkTools();
  step('Installing dependencies');
  run('pnpm', ['install', '--frozen-lockfile']);
  const services = process.argv.includes('--with-minio') ? ['mariadb', 'redis', 'minio'] : ['mariadb', 'redis'];
  const ports = hostPorts();
  await checkPortsFree(ports, services, existsSync(envFile) ? loadEnv() : {});
  writeEnvIfMissing(ports);
  const env = loadEnv();
  step('Starting MariaDB and Redis');
  run('docker', ['compose', '-f', composeFile, 'up', '-d', ...services], { env });
  migrateWithRetry(env);
  const seed = findSeedDemo(workspacePackages());
  if (seed) {
    step('Seeding demo data');
    run('pnpm', seed, { env });
  } else {
    console.log('\n! seed:demo is not available on this branch yet; no demo accounts were created.');
  }
  console.log('\nOK Ready. Next: `node scripts/setup-local.mjs web` and open http://localhost:3000');
}

function web() {
  const env = { ...loadEnv(), NODE_ENV: 'production' };
  if (!process.argv.includes('--no-build')) {
    step('Building the web app');
    run('pnpm', ['--filter', '@backoffice/web', 'build'], { env });
  }
  const port = env.BACKOFFICE_WEB_PORT ?? '3000';
  step(`Starting the web app on http://localhost:${port}`);
  // pnpm forwards extra arguments to the script; a literal "--" would reach next as a directory name.
  run('pnpm', ['--filter', '@backoffice/web', 'start', '-p', port], { env });
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
    console.error('x No LAN address found. Set BACKOFFICE_LAN_HOST to this machine\'s IP address.');
    process.exit(1);
  }
  const port = env.BACKOFFICE_LAN_PORT ?? '8443';
  step(`Starting the HTTPS proxy for ${host}`);
  run('docker', ['compose', '-f', composeFile, '--profile', 'lan', 'up', '-d', 'https-lan'], { env: { ...env, BACKOFFICE_LAN_HOST: host } });
  console.log(`\nOK Other machines on the LAN can open https://${host}:${port}`);
  if (candidates.length > 1) console.log(`  Other addresses on this machine: ${candidates.filter((a) => a !== host).join(', ')} (set BACKOFFICE_LAN_HOST to pick one)`);
  console.log('  The web app must be running (`node scripts/setup-local.mjs web`), and the firewall must allow inbound TCP on that port.');
}

const commands = { setup, web, worker, lan };
const command = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'setup';
if (!commands[command]) {
  console.error(`Unknown command "${command}". Use one of: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}
await commands[command]();
