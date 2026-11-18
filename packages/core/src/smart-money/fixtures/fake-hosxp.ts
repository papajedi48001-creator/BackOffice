import type { Database } from '@backoffice/db';

/**
 * The HOSxP tables the dental query reads (`dtmain`, `doctor`, `opitemrece` included), cut down to the columns it uses. Text columns are latin1 holding TIS-620 bytes,
 * the way many HOSxP installs store Thai, so the reader's Thai repair is exercised too. Used by the reader test and screenshots.
 */
export const FAKE_HOSXP_TABLES = [
  'CREATE TABLE ovst (vn VARCHAR(13) PRIMARY KEY, hn VARCHAR(9) NOT NULL, vstdate DATE NOT NULL, pttype VARCHAR(2) NULL) DEFAULT CHARSET=latin1',
  'CREATE TABLE ovstdiag (ovst_diag_id INT AUTO_INCREMENT PRIMARY KEY, vn VARCHAR(13) NOT NULL, icd10 VARCHAR(9) NOT NULL, diagtype VARCHAR(1) NULL) DEFAULT CHARSET=latin1',
  'CREATE TABLE dtmain (dtmain_id INT AUTO_INCREMENT PRIMARY KEY, vn VARCHAR(13) NOT NULL, hn VARCHAR(9) NOT NULL, vstdate DATE NOT NULL, doctor VARCHAR(7) NULL, doctor_helper VARCHAR(7) NULL) DEFAULT CHARSET=latin1',
  'CREATE TABLE doctor (code VARCHAR(7) PRIMARY KEY, name VARCHAR(250) NULL) DEFAULT CHARSET=latin1',
  'CREATE TABLE opitemrece (opitemrece_id INT AUTO_INCREMENT PRIMARY KEY, vn VARCHAR(13) NULL, icode VARCHAR(7) NOT NULL) DEFAULT CHARSET=latin1',
  'CREATE TABLE patient (hn VARCHAR(9) PRIMARY KEY, pname VARCHAR(25) NULL, fname VARCHAR(100) NULL, lname VARCHAR(100) NULL) DEFAULT CHARSET=latin1',
  'CREATE TABLE icd101 (code VARCHAR(9) PRIMARY KEY, name VARCHAR(250) NULL) DEFAULT CHARSET=latin1',
  'CREATE TABLE pttype (pttype VARCHAR(2) PRIMARY KEY, name VARCHAR(150) NULL) DEFAULT CHARSET=latin1',
  'CREATE TABLE paccountopd (pttype VARCHAR(2) NOT NULL, paccount VARCHAR(10) NOT NULL, paccount_year INT NOT NULL, last_modify DATETIME NULL) DEFAULT CHARSET=latin1',
  'CREATE TABLE paccount (paccount VARCHAR(10) NOT NULL, paccount_year INT NOT NULL, name VARCHAR(250) NULL) DEFAULT CHARSET=latin1',
  `CREATE TABLE vn_stat (vn VARCHAR(13) PRIMARY KEY, ${Array.from({ length: 16 }, (_, i) => `inc${String(i + 1).padStart(2, '0')} DECIMAL(12,2) NOT NULL DEFAULT 0`).join(', ')}, paid_money DECIMAL(12,2) NOT NULL DEFAULT 0, rcpt_money DECIMAL(12,2) NOT NULL DEFAULT 0)`
];

/** Thai text as the latin1 string MariaDB would hold for its TIS-620 bytes. */
export const tis = (text: string) => Buffer.from([...text].map((ch) => { const code = ch.codePointAt(0)!; return code >= 0x0e01 && code <= 0x0e5b ? code - 0x0e01 + 0xa1 : code; })).toString('latin1');

/**
 * `diags[0]` is the main diagnosis (`diagtype` '1'), the rest '2'. `dental` lists the `dtmain` rows as [doctor, helper] codes;
 * a visit without any is not dental work. `icodes` go into `opitemrece`.
 */
export type FakeVisit = { vn: string; hn: string; vstdate: string; pttype: string; diags: string[]; inc: number[]; paid: number; rcpt: number; dental?: [doctor: string, helper: string | null][]; icodes?: string[] };

export async function seedFakeHosxp(database: Database, data: { patients: [hn: string, pname: string, fname: string, lname: string][]; icd: [code: string, name: string][]; pttypes: [code: string, name: string][]; paccountopd: [pttype: string, paccount: string, year: number, lastModify?: string][]; paccounts: [paccount: string, year: number, name: string][]; visits: FakeVisit[]; doctors?: [code: string, name: string][] }): Promise<void> {
  for (const sql of FAKE_HOSXP_TABLES) await database.execute(sql);
  for (const [hn, pname, fname, lname] of data.patients) await database.execute('INSERT INTO patient VALUES (?, ?, ?, ?)', [hn, tis(pname), tis(fname), tis(lname)]);
  for (const [code, name] of data.icd) await database.execute('INSERT INTO icd101 VALUES (?, ?)', [code, tis(name)]);
  for (const [code, name] of data.pttypes) await database.execute('INSERT INTO pttype VALUES (?, ?)', [code, tis(name)]);
  for (const [pttype, paccount, year, lastModify] of data.paccountopd) await database.execute('INSERT INTO paccountopd VALUES (?, ?, ?, ?)', [pttype, paccount, year, lastModify ?? null]);
  for (const [code, name] of data.doctors ?? []) await database.execute('INSERT INTO doctor VALUES (?, ?)', [code, tis(name)]);
  for (const [paccount, year, name] of data.paccounts) await database.execute('INSERT INTO paccount VALUES (?, ?, ?)', [paccount, year, tis(name)]);
  for (const visit of data.visits) {
    await database.execute('INSERT INTO ovst VALUES (?, ?, ?, ?)', [visit.vn, visit.hn, visit.vstdate, visit.pttype]);
    for (const [index, icd10] of visit.diags.entries()) await database.execute('INSERT INTO ovstdiag (vn, icd10, diagtype) VALUES (?, ?, ?)', [visit.vn, icd10, index === 0 ? '1' : '2']);
    for (const [doctor, helper] of visit.dental ?? []) await database.execute('INSERT INTO dtmain (vn, hn, vstdate, doctor, doctor_helper) VALUES (?, ?, ?, ?, ?)', [visit.vn, visit.hn, visit.vstdate, doctor, helper]);
    for (const icode of visit.icodes ?? []) await database.execute('INSERT INTO opitemrece (vn, icode) VALUES (?, ?)', [visit.vn, icode]);
    const inc = Array.from({ length: 16 }, (_, i) => visit.inc[i] ?? 0);
    await database.execute(`INSERT INTO vn_stat VALUES (?, ${inc.map(() => '?').join(', ')}, ?, ?)`, [visit.vn, ...inc, visit.paid, visit.rcpt]);
  }
}
