import mysql from 'mysql2/promise';
import type { ExecuteValues, QueryValues } from 'mysql2';

export interface Database {
  execute(sql: string, parameters?: ExecuteValues): Promise<void>;
  query<T extends object>(sql: string, parameters?: QueryValues): Promise<T[]>;
  transaction<T>(work: (database: Database) => Promise<T>): Promise<T>;
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
    async transaction<T>(work: (database: Database) => Promise<T>): Promise<T> {
      const connection = await pool.getConnection();
      const transactionDatabase: Database = {
        async execute(sql, parameters = []) { await connection.execute(sql, parameters); },
        async query<T extends object>(sql: string, parameters: QueryValues = []) { const [rows] = await connection.query(sql, parameters); return rows as T[]; },
        async transaction<U>(nestedWork: (database: Database) => Promise<U>): Promise<U> { return nestedWork(transactionDatabase); },
        async close() { /* the outer transaction owns this connection */ }
      };
      try { await connection.beginTransaction(); const result = await work(transactionDatabase); await connection.commit(); return result; }
      catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async close() { await pool.end(); }
  };
}
