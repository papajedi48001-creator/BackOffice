import mysql from 'mysql2/promise';
import type { ExecuteValues, QueryValues } from 'mysql2';

export interface Database {
  execute(sql: string, parameters?: ExecuteValues): Promise<void>;
  query<T extends object>(sql: string, parameters?: QueryValues): Promise<T[]>;
  close(): Promise<void>;
}

export function createDatabase(connectionUrl: string): Database {
  const pool = mysql.createPool(connectionUrl);
  return {
    async execute(sql, parameters = []) { await pool.execute(sql, parameters); },
    async query<T extends object>(sql: string, parameters: QueryValues = []) {
      const [rows] = await pool.query(sql, parameters);
      return rows as T[];
    },
    async close() { await pool.end(); }
  };
}
