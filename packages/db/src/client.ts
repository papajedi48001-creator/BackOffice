import mysql from 'mysql2/promise';
import type { ExecuteValues } from 'mysql2';

export interface Database {
  execute(sql: string, parameters?: ExecuteValues): Promise<void>;
  close(): Promise<void>;
}

export function createDatabase(connectionUrl: string): Database {
  const pool = mysql.createPool(connectionUrl);
  return {
    async execute(sql, parameters = []) { await pool.execute(sql, parameters); },
    async close() { await pool.end(); }
  };
}
