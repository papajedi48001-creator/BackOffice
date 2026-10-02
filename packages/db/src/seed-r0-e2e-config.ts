import { readRuntimeValue } from './runtime-env.ts';

export function readR0E2eSeedConfig(): { databaseUrl: string; password: string } {
  const databaseUrl = readRuntimeValue('DATABASE_URL');
  const password = readRuntimeValue('R0_E2E_PASSWORD');
  if (!databaseUrl || !password) {
    throw new Error('DATABASE_URL and R0_E2E_PASSWORD are required');
  }

  return { databaseUrl, password };
}
