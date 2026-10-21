import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createServer } from 'node:net';
import { findSeedDemo, isPortFree, lanAddresses, parseEnv, renderEnv } from './setup-local-lib.mjs';

const example = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');

test('fills database and service URLs from the chosen host ports', () => {
  const env = parseEnv(renderEnv(example, { dbPort: 3308, redisPort: 6380, minioPort: 9010 }));
  assert.equal(env.DATABASE_URL, 'mysql://backoffice:local-development-only@127.0.0.1:3308/backoffice');
  assert.equal(env.REDIS_URL, 'redis://127.0.0.1:6380');
  assert.equal(env.S3_ENDPOINT, 'http://127.0.0.1:9010');
  assert.equal(env.BACKOFFICE_DB_PORT, '3308');
  assert.equal(env.BACKOFFICE_REDIS_PORT, '6380');
  assert.equal(env.BACKOFFICE_MINIO_PORT, '9010');
});

test('uses the compose default ports when none are given', () => {
  const env = parseEnv(renderEnv(example));
  assert.equal(env.DATABASE_URL, 'mysql://backoffice:local-development-only@127.0.0.1:3307/backoffice');
  assert.equal(env.REDIS_URL, 'redis://127.0.0.1:6379');
});

test('generates fresh secrets of the sizes the app requires', () => {
  const env = parseEnv(renderEnv(example));
  assert.equal(Buffer.from(env.BACKOFFICE_SESSION_SECRET, 'base64').length, 48);
  assert.match(env.NATIONAL_ID_ENCRYPTION_KEY, /^[0-9a-f]{64}$/);
  assert.match(env.NATIONAL_ID_LOOKUP_KEY, /^[0-9a-f]{64}$/);
  assert.notEqual(env.NATIONAL_ID_ENCRYPTION_KEY, env.NATIONAL_ID_LOOKUP_KEY);
  assert.notEqual(parseEnv(renderEnv(example)).BACKOFFICE_SESSION_SECRET, env.BACKOFFICE_SESSION_SECRET);
});

test('keeps no placeholder values from the example', () => {
  assert.doesNotMatch(renderEnv(example), /replace-with|change-me/);
});

test('parseEnv skips comments and blank lines and keeps "=" inside values', () => {
  assert.deepEqual(parseEnv('# note\n\nA=1\nB=x=y==\n'), { A: '1', B: 'x=y==' });
});

test('findSeedDemo prefers a root seed:demo script', () => {
  assert.deepEqual(findSeedDemo([{ name: 'root', root: true, scripts: { 'seed:demo': 'x' } }, { name: '@backoffice/core', scripts: { 'seed:demo': 'y' } }]), ['seed:demo']);
});

test('findSeedDemo falls back to the workspace package that has it', () => {
  assert.deepEqual(findSeedDemo([{ name: 'root', root: true, scripts: {} }, { name: '@backoffice/core', scripts: { 'seed:demo': 'y' } }]), ['--filter', '@backoffice/core', 'seed:demo']);
});

test('findSeedDemo returns null before seed:demo exists', () => {
  assert.equal(findSeedDemo([{ name: 'root', root: true, scripts: {} }, { name: '@backoffice/db' }]), null);
});

test('lanAddresses lists external IPv4 addresses with physical adapters first', () => {
  const interfaces = {
    'vEthernet (WSL)': [{ family: 'IPv4', address: '172.18.160.1', internal: false }],
    Loopback: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
    Ethernet: [{ family: 'IPv6', address: 'fe80::1', internal: false }, { family: 'IPv4', address: '192.168.1.20', internal: false }],
    docker0: [{ family: 'IPv4', address: '172.17.0.1', internal: false }]
  };
  assert.deepEqual(lanAddresses(interfaces), ['192.168.1.20', '172.18.160.1', '172.17.0.1']);
});

test('isPortFree reports a port another process is listening on as busy', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  const { port } = server.address();
  try {
    assert.equal(await isPortFree(port), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  assert.equal(await isPortFree(port), true);
});
