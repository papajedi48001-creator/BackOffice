import type { SetupDatabaseInput } from '@backoffice/contracts';

/** The mysql2 connection URL for the setup form's fields. The setup page never accepts a raw URL. */
export function buildDatabaseUrl(input: SetupDatabaseInput): string {
  const host = input.host.includes(':') && !input.host.startsWith('[') ? `[${input.host}]` : input.host;
  return `mysql://${encodeURIComponent(input.username)}:${encodeURIComponent(input.password)}@${host}:${input.port}/${input.database}`;
}
