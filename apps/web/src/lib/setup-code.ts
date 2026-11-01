import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const maxFailures = 5;
// instrumentation.ts and the route handlers are separate bundles in one process, so the code lives on globalThis.
const key = Symbol.for('backoffice.setupCode');
type CodeState = { hash: Buffer; failures: number };
const store = globalThis as unknown as Record<symbol, CodeState | undefined>;

const normalise = (code: string) => code.replace(/[\s-]/g, '').toUpperCase();
const digest = (code: string) => createHash('sha256').update(normalise(code), 'utf8').digest();
const defaultLog = (line: string) => console.log(line);

function newCode(log: (line: string) => void): void {
  const characters = Array.from({ length: 12 }, () => alphabet[randomInt(alphabet.length)]).join('');
  const code = `${characters.slice(0, 4)}-${characters.slice(4, 8)}-${characters.slice(8)}`;
  store[key] = { hash: digest(code), failures: 0 };
  // The one place the code is shown: whoever can read the server log already operates the server.
  log(`backoffice.setup.code ${code}`);
}

/** Creates and logs a one-time setup code unless one is already waiting. */
export function issueSetupCode(log: (line: string) => void = defaultLog): void {
  if (!store[key]) newCode(log);
}

/** Checks a typed code; the fifth wrong try replaces the code with a new one in the log. */
export function verifySetupCode(code: string, log: (line: string) => void = defaultLog): boolean {
  const state = store[key];
  if (!state) { newCode(log); return false; }
  if (timingSafeEqual(state.hash, digest(code))) return true;
  state.failures += 1;
  if (state.failures >= maxFailures) newCode(log);
  return false;
}

/** Forgets the code once setup is done. */
export function clearSetupCode(): void {
  store[key] = undefined;
}
