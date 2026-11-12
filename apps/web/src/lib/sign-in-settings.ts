import { connectionSecretBoxFrom, SignInSettingsService, type ProviderIdConfig, type ThaidSettings } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { getSharedDatabase } from './database';
import { readRuntimeValue } from './runtime-env';

/** `configured`: a route is switched on in the saved settings, usable or not; it keeps password sign-in closed. */
export interface SignInRoutes { thaid: ThaidSettings | null; providerId: ProviderIdConfig | null; configured: boolean }

const CACHE_MS = 30_000;
/** A database error is retried sooner, so web-only settings come back within seconds. */
const FALLBACK_CACHE_MS = 5_000;
let cached: { at: number; ttl: number; routes: Promise<SignInRoutes> } | undefined;

/** With no database the saved settings cannot be read, so only the server environment counts. */
const noRows: Database = { query: async () => [], execute: async () => undefined, transaction: async (work) => work(noRows), close: async () => undefined } as Database;

/** ผู้ดูแลระบบ > การเข้าสู่ระบบ, with secrets sealed under CONNECTION_SECRET_KEY; the server environment is the fallback. */
export const signInSettings = (database: Database | null = getSharedDatabase()): SignInSettingsService =>
  new SignInSettingsService(database ?? noRows, connectionSecretBoxFrom(readRuntimeValue('CONNECTION_SECRET_KEY')), readRuntimeValue);

async function load(entry: { ttl: number }): Promise<SignInRoutes> {
  const database = getSharedDatabase();
  try {
    return await signInSettings(database).routes();
  } catch {
    // A database outage must not take the sign-in page down: fall back to what the server environment says. Password sign-in needs the
    // database too, so counting the routes as configured here (fail closed) locks nobody out.
    entry.ttl = FALLBACK_CACHE_MS;
    return { ...(await signInSettings(null).routes()), configured: true };
  }
}

/** The ready sign-in routes, read at most once per 30 seconds per process; a save clears the cache. */
export function signInRoutes(now: number = Date.now()): Promise<SignInRoutes> {
  if (!cached || now - cached.at >= cached.ttl) {
    const entry = { at: now, ttl: CACHE_MS, routes: Promise.resolve(null as unknown as SignInRoutes) };
    entry.routes = load(entry);
    cached = entry;
  }
  return cached.routes;
}

export function clearSignInRoutesCache(): void { cached = undefined; }
