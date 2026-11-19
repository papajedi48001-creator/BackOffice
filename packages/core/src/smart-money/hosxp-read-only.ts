import type { Database } from '@backoffice/db';

/** Every Smart Money read from HOSxP goes through these two: HOSxP is never written. */

/** The legacy guard: one statement that starts with SELECT and names no write or lock command. */
export function isReadOnlySelect(sql: string): boolean {
  const text = sql.trim().toUpperCase();
  if (!text.startsWith('SELECT') || text.includes(';')) return false;
  return !/\b(INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|CREATE|TRUNCATE|GRANT|RENAME|LOCK|CALL|INTO\s+OUTFILE)\b/.test(text);
}

/**
 * Runs `work` in a READ ONLY transaction. A server too old to parse `SET TRANSACTION READ ONLY` (MySQL < 5.6.5, MariaDB < 10.0, still
 * common under HOSxP) gets a plain transaction instead, as the legacy page carried on; the SELECT text guard still applies.
 */
export async function withReadOnlyFallback<T>(database: Pick<Database, 'transaction'>, work: (tx: Database) => Promise<T>): Promise<T> {
  try {
    return await database.transaction(work, { readOnly: true });
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code !== 'ER_PARSE_ERROR') throw error;
    console.error('[smart-money] HOSxP read-only transaction not supported', 'ER_PARSE_ERROR');
    return database.transaction(work);
  }
}
