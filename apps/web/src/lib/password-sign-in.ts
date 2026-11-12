import { readRuntimeValue } from './runtime-env';
import { signInRoutes } from './sign-in-settings';

/**
 * Username-and-password sign-in is closed once ThaID or Provider ID is ready, so it cannot be brute-forced from the internet.
 * It stays open while no external route is ready (a fresh install), and PASSWORD_SIGN_IN=on reopens it as a break-glass.
 */
export function passwordSignInOpen(input: { externalRouteReady: boolean; override: string | undefined }): boolean {
  if (input.override?.trim().toLowerCase() === 'on') return true;
  return !input.externalRouteReady;
}

let warnedIncomplete = false;

/** ThaID or Provider ID settings that are present but broken (a typo, an unreadable secret file) keep the box closed: fail closed, never open. */
const externalCredentialNames = ['PROVIDER_ID_HEALTH_CLIENT_ID', 'PROVIDER_ID_CLIENT_ID', 'PROVIDER_ID_REDIRECT_URI', 'PROVIDER_ID_HEALTH_CLIENT_SECRET',
  'PROVIDER_ID_HEALTH_CLIENT_SECRET_FILE', 'PROVIDER_ID_SECRET_KEY', 'PROVIDER_ID_SECRET_KEY_FILE', 'THAID_CLIENT_ID', 'THAID_CLIENT_SECRET', 'THAID_CLIENT_SECRET_FILE', 'THAID_REDIRECT_URI'];
// PROVIDER_ID_ENV and the stub URL overrides alone do not count: they say nothing about a deployed client.
function externalRouteIntended(): boolean {
  return externalCredentialNames.some((name) => Boolean(process.env[name]?.trim()));
}

function override(): string | undefined {
  try { return readRuntimeValue('PASSWORD_SIGN_IN'); } catch { return undefined; }
}

/** Saved settings for ThaID or Provider ID also count once they are ready (ผู้ดูแลระบบ > การเข้าสู่ระบบ). */
export async function isPasswordSignInOpen(): Promise<boolean> {
  const routes = await signInRoutes();
  const ready = routes.providerId !== null || routes.thaid !== null;
  const intended = !ready && externalRouteIntended();
  if (intended && !warnedIncomplete) {
    warnedIncomplete = true;
    console.warn('password sign-in closed: Provider ID settings are present but incomplete');
  }
  return passwordSignInOpen({ externalRouteReady: ready || intended, override: override() });
}
