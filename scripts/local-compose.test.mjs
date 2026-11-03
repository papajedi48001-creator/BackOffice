/* global URL, process -- Node script outside the workspace packages */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
  assert.deepEqual(publishedPorts(services.seaweedfs), ['8333:8333']);
  assert.deepEqual(publishedPorts(services.clamav), ['3310:3310']);
  assert.equal(services.minio, undefined);
});

test('dev infrastructure host ports follow BACKOFFICE_*_PORT', { skip: !hasDocker && 'docker compose not available' }, () => {
  const { services } = renderCompose({ BACKOFFICE_DB_PORT: '3308', BACKOFFICE_REDIS_PORT: '6380', BACKOFFICE_S3_PORT: '8334', BACKOFFICE_CLAMAV_PORT: '3311' });
  assert.deepEqual(publishedPorts(services.mariadb), ['3308:3306']);
  assert.deepEqual(publishedPorts(services.redis), ['6380:6379']);
  assert.deepEqual(publishedPorts(services.seaweedfs), ['8334:8333']);
  assert.deepEqual(publishedPorts(services.clamav), ['3311:3310']);
});

test('dev SeaweedFS takes the keys .env.example gives the web app', { skip: !hasDocker && 'docker compose not available' }, () => {
  const { services } = renderCompose({});
  const config = JSON.parse(readFileSync(new URL('../infra/compose/seaweedfs-dev-s3.json', import.meta.url), 'utf8'));
  const example = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  const [credential] = config.identities[0].credentials;
  assert.match(example, new RegExp(`^S3_ACCESS_KEY_ID=${credential.accessKey}$`, 'm'));
  assert.match(example, new RegExp(`^S3_SECRET_ACCESS_KEY=${credential.secretKey}$`, 'm'));
  assert.ok(services.seaweedfs.command.includes('-s3.config=/etc/seaweedfs/s3.json'));
});

test('the lan profile adds an HTTPS proxy only when asked for', { skip: !hasDocker && 'docker compose not available' }, () => {
  assert.equal(renderCompose({}).services['https-lan'], undefined);
  const { services } = renderCompose({ BACKOFFICE_LAN_HOST: '192.0.2.10', BACKOFFICE_LAN_PORT: '8443' }, ['lan']);
  assert.deepEqual(publishedPorts(services['https-lan']), ['8443:8443']);
  assert.equal(services['https-lan'].environment.BACKOFFICE_LAN_HOST, '192.0.2.10');
});

test('the LAN Caddyfile serves its certificate to clients that connect by IP', () => {
  const caddyfile = readFileSync(new URL('../infra/compose/Caddyfile.lan', import.meta.url), 'utf8');
  // Browsers send no SNI for https://<ip>:8443; without default_sni the TLS handshake fails.
  assert.match(caddyfile, /^\s*default_sni \{\$BACKOFFICE_LAN_HOST\}\s*$/m);
});

test('the line-webhook profile opens 80 and 443 to the public host only when asked for', { skip: !hasDocker && 'docker compose not available' }, () => {
  assert.equal(renderCompose({}).services['line-webhook'], undefined);
  const { services } = renderCompose({ LINE_WEBHOOK_HOST: 'notify.example.go.th', BACKOFFICE_WEB_PORT: '3011' }, ['line-webhook']);
  assert.deepEqual(publishedPorts(services['line-webhook']), ['80:80', '443:443']);
  assert.equal(services['line-webhook'].environment.LINE_WEBHOOK_HOST, 'notify.example.go.th');
  assert.equal(services['line-webhook'].environment.BACKOFFICE_WEB_PORT, '3011');
});

test('the line-webhook host ports move when another service already holds 80 or 443', { skip: !hasDocker && 'docker compose not available' }, () => {
  const { services } = renderCompose({ LINE_WEBHOOK_HOST: 'notify.example.go.th', LINE_WEBHOOK_HTTP_PORT: '8081', LINE_WEBHOOK_HTTPS_PORT: '8444' }, ['line-webhook']);
  // The NAT maps public 80/443 onto these; Caddy inside still listens on 80/443 for the ACME challenges.
  assert.deepEqual(publishedPorts(services['line-webhook']), ['8081:80', '8444:443']);
});

test('the public Caddyfile passes on only the LINE webhook and answers 404 to everything else', () => {
  const caddyfile = readFileSync(new URL('../infra/compose/Caddyfile.line-webhook', import.meta.url), 'utf8');
  assert.match(caddyfile, /^\{\$LINE_WEBHOOK_HOST\} \{$/m);
  assert.match(caddyfile, /@webhook \{\s*method POST\s*path \/api\/line\/webhook\s*\}/);
  assert.match(caddyfile, /handle @webhook \{\s*reverse_proxy host\.docker\.internal:\{\$BACKOFFICE_WEB_PORT\}\s*\}/);
  assert.match(caddyfile, /handle \{\s*respond 404\s*\}/);
  assert.doesNotMatch(caddyfile, /tls internal/);
  assert.equal((caddyfile.match(/reverse_proxy/g) ?? []).length, 1);
});
