import { providerSsoEnabled } from './provider-sso';
import { readRuntimeValue } from './runtime-env';

/**
 * Username-and-password sign-in is closed once ThaID or Provider ID is ready, so it cannot be brute-forced from the internet.
 * It stays open while no external route is ready (a fresh install), and PASSWORD_SIGN_IN=on reopens it as a break-glass.
 */
export function passwordSignInOpen(input: { externalRouteReady: boolean; override: string | undefined }): boolean {
  if (input.override?.trim().toLowerCase() === 'on') return true;
  return !input.externalRouteReady;
}

export function isPasswordSignInOpen(): boolean {
  return passwordSignInOpen({ externalRouteReady: providerSsoEnabled(), override: readRuntimeValue('PASSWORD_SIGN_IN') });
}
