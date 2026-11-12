import { connectionSecretBoxFrom, SignInSettingsService, type ProviderIdConfig, type ThaidSettings } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { getSharedDatabase } from './database';
import { readRuntimeValue } from './runtime-env';

export interface SignInRoutes { thaid: ThaidSettings | null; providerId: ProviderIdConfig | null }

const CACHE_MS = 30_000;
let cached: { at: number; routes: Promise<SignInRoutes> } | undefined;

/** With no database the saved settings cannot be read, so only the server environment counts. */
const noRows: Database = { query: async () => [], execute: async () => undefined, transaction: async (work) => work(noRows), close: async () => undefined } as Database;

/** ผู้ดูแลระบบ > การเข้าสู่ระบบ, with secrets sealed under CONNECTION_SECRET_KEY; the server environment is the fallback. */
export const signInSettings = (database: Database | null = getSharedDatabase()): SignInSettingsService =>
  new SignInSettingsService(database ?? noRows, connectionSecretBoxFrom(readRuntimeValue('CONNECTION_SECRET_KEY')), readRuntimeValue);

async function load(): Promise<SignInRoutes> {
  try {
    return await signInSettings().routes();
  } catch {
    // A database outage must not take the sign-in page down: fall back to what the server environment says.
    return signInSettings(null).routes();
  }
}

/** The ready sign-in routes, read at most once per 30 seconds per process; a save clears the cache. */
export function signInRoutes(now: number = Date.now()): Promise<SignInRoutes> {
  if (!cached || now - cached.at >= CACHE_MS) cached = { at: now, routes: load() };
  return cached.routes;
}

export function clearSignInRoutesCache(): void { cached = undefined; }
