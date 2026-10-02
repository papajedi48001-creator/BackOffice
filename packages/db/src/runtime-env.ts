import { readFileSync } from 'node:fs';

export function readRuntimeValue(name: string): string | undefined {
  const directValue = process.env[name]?.trim();
  if (directValue) return directValue;

  const filePath = process.env[`${name}_FILE`]?.trim();
  if (!filePath) return undefined;

  const fileValue = readFileSync(filePath, 'utf8').trim();
  return fileValue || undefined;
}
