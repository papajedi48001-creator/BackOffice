import type { Database } from '@backoffice/db';
import { tis } from '../../smart-money/fixtures/fake-hosxp';

/**
 * The HOSxP tables Mapping สิทธิ reads and writes, cut down to the columns it uses. Text is latin1 holding TIS-620 bytes, as
 * many HOSxP installs store Thai, and the tables are InnoDB so the writer's transaction and row locks are real.
 */
export const FAKE_MAPPING_TABLES = [
  "CREATE TABLE pttype (pttype VARCHAR(2) PRIMARY KEY, name VARCHAR(150) NULL, isuse CHAR(1) NULL) ENGINE=InnoDB DEFAULT CHARSET=latin1",
  'CREATE TABLE paccount (paccount VARCHAR(20) NOT NULL, paccount_year INT NOT NULL, name VARCHAR(250) NULL, type VARCHAR(10) NULL, PRIMARY KEY (paccount, paccount_year)) ENGINE=InnoDB DEFAULT CHARSET=latin1',
  'CREATE TABLE paccountopd (pttype VARCHAR(2) NOT NULL, paccount VARCHAR(20) NOT NULL, iclaim_status INT NULL, paccount_year INT NOT NULL, last_modify DATETIME NULL) ENGINE=InnoDB DEFAULT CHARSET=latin1',
  'CREATE TABLE paccountipd (pttype VARCHAR(2) NOT NULL, paccount VARCHAR(20) NOT NULL, iclaim_status INT NULL, paccount_year INT NOT NULL, last_modify DATETIME NULL) ENGINE=InnoDB DEFAULT CHARSET=latin1'
];

export type FakeMappingRow = [pttype: string, paccount: string, year: number, lastModify: string | null];

export async function seedFakeMappingHosxp(database: Database, data: { pttypes: [code: string, name: string, isuse: 'Y' | 'N'][]; paccounts: [code: string, year: number, name: string, type: string][]; opd: FakeMappingRow[]; ipd: FakeMappingRow[] }): Promise<void> {
  for (const sql of FAKE_MAPPING_TABLES) await database.execute(sql);
  for (const [code, name, isuse] of data.pttypes) await database.execute('INSERT INTO pttype VALUES (?, ?, ?)', [code, tis(name), isuse]);
  for (const [code, year, name, type] of data.paccounts) await database.execute('INSERT INTO paccount VALUES (?, ?, ?, ?)', [code, year, tis(name), type]);
  for (const [pttype, paccount, year, lastModify] of data.opd) await database.execute('INSERT INTO paccountopd VALUES (?, ?, 1, ?, ?)', [pttype, paccount, year, lastModify]);
  for (const [pttype, paccount, year, lastModify] of data.ipd) await database.execute('INSERT INTO paccountipd VALUES (?, ?, 1, ?, ?)', [pttype, paccount, year, lastModify]);
}
