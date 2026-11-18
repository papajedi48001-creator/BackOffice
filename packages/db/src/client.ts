import mysql from 'mysql2/promise';
import type { ExecuteValues, QueryValues } from 'mysql2';

export interface Database {
  execute(sql: string, parameters?: ExecuteValues): Promise<void>;
  query<T extends object>(sql: string, parameters?: QueryValues): Promise<T[]>;
  transaction<T>(work: (database: Database) => Promise<T>, options?: TransactionOptions): Promise<T>;
  close(): Promise<void>;
}

/**
 * `READ COMMITTED` lets a transaction read and lock rows other transactions committed after it began.
 * MariaDB 11.8 runs REPEATABLE READ with snapshot isolation, which instead fails such a locking read with ER_CHECKREAD.
 */
export interface TransactionOptions { isolationLevel?: 'READ COMMITTED'; /** The server refuses any write inside it (used for reads from HOSxP). */ readOnly?: true; }

export function createDatabase(connectionUrl: string): Database {
  const pool = mysql.createPool(connectionUrl);
  return {
    async execute(sql, parameters = []) { await pool.execute(sql, parameters); },
    async query<T extends object>(sql: string, parameters: QueryValues = []) {
      const [rows] = await pool.query(sql, parameters);
      return rows as T[];
    },
    async transaction<T>(work: (database: Database) => Promise<T>, options: TransactionOptions = {}): Promise<T> {
      const connection = await pool.getConnection();
      const transactionDatabase: Database = {
        async execute(sql, parameters = []) { await connection.execute(sql, parameters); },
        async query<T extends object>(sql: string, parameters: QueryValues = []) { const [rows] = await connection.query(sql, parameters); return rows as T[]; },
        async transaction<U>(nestedWork: (database: Database) => Promise<U>): Promise<U> { return nestedWork(transactionDatabase); },
        async close() { /* the outer transaction owns this connection */ }
      };
      try {
        // Applies to the next transaction on this connection only.
        const characteristics = [options.isolationLevel && `ISOLATION LEVEL ${options.isolationLevel}`, options.readOnly && 'READ ONLY'].filter(Boolean);
        if (characteristics.length > 0) await connection.query(`SET TRANSACTION ${characteristics.join(', ')}`);
        await connection.beginTransaction();
        const result = await work(transactionDatabase);
        await connection.commit();
        return result;
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async close() { await pool.end(); }
  };
}
