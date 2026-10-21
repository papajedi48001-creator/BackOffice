import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';

/** Password set for the backoffice user in infra/compose/docker-compose.dev.yml. */
const devDatabasePassword = 'local-development-only';

/** Builds a local-development .env from .env.example with fresh secrets and the given host ports. */
export function renderEnv(example, { dbPort = 3307, redisPort = 6379, minioPort = 9000 } = {}) {
  const values = {
    DATABASE_URL: `mysql://backoffice:${devDatabasePassword}@127.0.0.1:${dbPort}/backoffice`,
    BACKOFFICE_SESSION_SECRET: randomBytes(48).toString('base64'),
    NATIONAL_ID_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    NATIONAL_ID_LOOKUP_KEY: randomBytes(32).toString('hex'),
    REDIS_URL: `redis://127.0.0.1:${redisPort}`,
    S3_ENDPOINT: `http://127.0.0.1:${minioPort}`
  };
  let text = example;
  for (const [key, value] of Object.entries(values)) {
    text = text.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`);
  }
  const ports = { BACKOFFICE_DB_PORT: dbPort, BACKOFFICE_REDIS_PORT: redisPort, BACKOFFICE_MINIO_PORT: minioPort };
  const portLines = Object.entries(ports).map(([key, value]) => `${key}=${value}`).join('\n');
  return `${text.trimEnd()}\n# Host ports used by infra/compose/docker-compose.dev.yml\n${portLines}\n`;
}

export function parseEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator > 0) env[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return env;
}

/** pnpm arguments that run seed:demo, or null while no workspace package defines it. */
export function findSeedDemo(packages) {
  const owner = packages.find((pkg) => pkg.root && pkg.scripts?.['seed:demo']) ?? packages.find((pkg) => pkg.scripts?.['seed:demo']);
  if (!owner) return null;
  return owner.root ? ['seed:demo'] : ['--filter', owner.name, 'seed:demo'];
}

const virtualAdapter = /vEthernet|WSL|Hyper-V|docker|veth|br-|virbr|vmnet|VirtualBox/i;

/** External IPv4 addresses from os.networkInterfaces(), physical adapters first. */
export function lanAddresses(interfaces) {
  const entries = Object.entries(interfaces).flatMap(([name, addresses]) =>
    (addresses ?? []).filter((a) => a.family === 'IPv4' && !a.internal).map((a) => ({ name, address: a.address })));
  return [...entries.filter((e) => !virtualAdapter.test(e.name)), ...entries.filter((e) => virtualAdapter.test(e.name))].map((e) => e.address);
}

/** True when nothing is listening on the host port, so Docker can publish it. */
export function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '0.0.0.0', () => server.close(() => resolve(true)));
  });
}
