import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const composeFile = fileURLToPath(new URL('../infra/compose/docker-compose.dev.yml', import.meta.url));
const hasDocker = spawnSync('docker', ['compose', 'version'], { stdio: 'ignore' }).status === 0;

function renderCompose(env, profiles = []) {
  const args = ['compose', '-f', composeFile, ...profiles.flatMap((p) => ['--profile', p]), 'config', '--format', 'json'];
  const result = spawnSync('docker', args, { encoding: 'utf8', env: { ...process.env, ...env } });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

const publishedPorts = (service) => service.ports.map((p) => `${p.published}:${p.target}`);

test('dev infrastructure keeps its default host ports', { skip: !hasDocker && 'docker compose not available' }, () => {
  const { services } = renderCompose({});
  assert.deepEqual(publishedPorts(services.mariadb), ['3307:3306']);
  assert.deepEqual(publishedPorts(services.redis), ['6379:6379']);
  assert.deepEqual(publishedPorts(services.minio), ['9000:9000', '9001:9001']);
});

test('dev infrastructure host ports follow BACKOFFICE_*_PORT', { skip: !hasDocker && 'docker compose not available' }, () => {
  const { services } = renderCompose({ BACKOFFICE_DB_PORT: '3308', BACKOFFICE_REDIS_PORT: '6380', BACKOFFICE_MINIO_PORT: '9010', BACKOFFICE_MINIO_CONSOLE_PORT: '9011' });
  assert.deepEqual(publishedPorts(services.mariadb), ['3308:3306']);
  assert.deepEqual(publishedPorts(services.redis), ['6380:6379']);
  assert.deepEqual(publishedPorts(services.minio), ['9010:9000', '9011:9001']);
});

test('the lan profile adds an HTTPS proxy only when asked for', { skip: !hasDocker && 'docker compose not available' }, () => {
  assert.equal(renderCompose({}).services['https-lan'], undefined);
  const { services } = renderCompose({ BACKOFFICE_LAN_HOST: '192.0.2.10', BACKOFFICE_LAN_PORT: '8443' }, ['lan']);
  assert.deepEqual(publishedPorts(services['https-lan']), ['8443:8443']);
  assert.equal(services['https-lan'].environment.BACKOFFICE_LAN_HOST, '192.0.2.10');
});
