import type { Database } from '@backoffice/db';

/**
 * The HOSxP tables the dental query reads (`dtmain`, `doctor`, `opitemrece` included), cut down to the columns it uses. Text columns are latin1 holding TIS-620 bytes,
 * the way many HOSxP installs store Thai, so the reader's Thai repair is exercised too. Used by the reader test and screenshots.
 */
export const FAKE_HOSXP_TABLES = [
  'CREATE TABLE ovst (vn VARCHAR(13) PRIMARY KEY, hn VARCHAR(9) NOT NULL, vstdate DATE NOT NULL, pttype VARCHAR(2) NULL, an VARCHAR(9) NULL) DEFAULT CHARSET=latin1',
  'CREATE TABLE ovstdiag (ovst_diag_id INT AUTO_INCREMENT PRIMARY KEY, vn VARCHAR(13) NOT NULL, icd10 VARCHAR(9) NOT NULL, diagtype VARCHAR(1) NULL) DEFAULT CHARSET=latin1',
  'CREATE TABLE dtmain (dtmain_id INT AUTO_INCREMENT PRIMARY KEY, vn VARCHAR(13) NOT NULL, hn VARCHAR(9) NOT NULL, vstdate DATE NOT NULL, doctor VARCHAR(7) NULL, doctor_helper VARCHAR(7) NULL) DEFAULT CHARSET=latin1',
  'CREATE TABLE doctor (code VARCHAR(7) PRIMARY KEY, name VARCHAR(250) NULL) DEFAULT CHARSET=latin1',
  'CREATE TABLE opitemrece (opitemrece_id INT AUTO_INCREMENT PRIMARY KEY, vn VARCHAR(13) NULL, an VARCHAR(9) NULL, hn VARCHAR(9) NULL, rxdate DATE NULL, icode VARCHAR(7) NOT NULL, income VARCHAR(2) NULL, qty DECIMAL(12,2) NOT NULL DEFAULT 1, sum_price DECIMAL(12,2) NOT NULL DEFAULT 0) DEFAULT CHARSET=latin1',
  'CREATE TABLE patient (hn VARCHAR(9) PRIMARY KEY, pname VARCHAR(25) NULL, fname VARCHAR(100) NULL, lname VARCHAR(100) NULL) DEFAULT CHARSET=latin1',
  'CREATE TABLE icd101 (code VARCHAR(9) PRIMARY KEY, name VARCHAR(250) NULL) DEFAULT CHARSET=latin1',
  'CREATE TABLE pttype (pttype VARCHAR(2) PRIMARY KEY, name VARCHAR(150) NULL, hipdata_code VARCHAR(3) NULL) DEFAULT CHARSET=latin1',
  'CREATE TABLE paccountopd (pttype VARCHAR(2) NOT NULL, paccount VARCHAR(10) NOT NULL, paccount_year INT NOT NULL, last_modify DATETIME NULL) DEFAULT CHARSET=latin1',
  'CREATE TABLE paccount (paccount VARCHAR(10) NOT NULL, paccount_year INT NOT NULL, name VARCHAR(250) NULL) DEFAULT CHARSET=latin1',
  // แพทย์แผนไทย (monitor แพทย์แผนไทย): services and the names its charge lines are read with.
  'CREATE TABLE health_med_service (health_med_service_id INT AUTO_INCREMENT PRIMARY KEY, vn VARCHAR(13) NULL, hn VARCHAR(9) NOT NULL, an VARCHAR(9) NULL, service_date DATE NOT NULL, service_time TIME NULL, health_med_service_type_id INT NULL, health_med_doctor_id INT NULL, health_med_treatment_type_id INT NULL) DEFAULT CHARSET=latin1',
  'CREATE TABLE health_med_service_type (health_med_service_type_id INT PRIMARY KEY, health_med_service_type_name VARCHAR(150) NULL) DEFAULT CHARSET=latin1',
  'CREATE TABLE health_med_doctor (health_med_doctor_id INT PRIMARY KEY, health_med_doctor_name VARCHAR(150) NULL) DEFAULT CHARSET=latin1',
  'CREATE TABLE health_med_treatment_type (health_med_treatment_type_id INT PRIMARY KEY, health_med_treatment_type_name VARCHAR(150) NULL) DEFAULT CHARSET=latin1',
  'CREATE TABLE income (income VARCHAR(2) PRIMARY KEY, name VARCHAR(150) NULL) DEFAULT CHARSET=latin1',
  'CREATE TABLE drugitems (icode VARCHAR(7) PRIMARY KEY, name VARCHAR(150) NULL, strength VARCHAR(100) NULL, units VARCHAR(50) NULL, unitcost DECIMAL(12,2) NULL, stdprice DECIMAL(12,2) NULL) DEFAULT CHARSET=latin1',
  'CREATE TABLE ipt (an VARCHAR(9) PRIMARY KEY, vn VARCHAR(13) NULL, pttype VARCHAR(2) NULL) DEFAULT CHARSET=latin1',
  'CREATE TABLE nondrugitems (icode VARCHAR(7) PRIMARY KEY, name VARCHAR(150) NULL) DEFAULT CHARSET=latin1',
  `CREATE TABLE vn_stat (vn VARCHAR(13) PRIMARY KEY, ${Array.from({ length: 16 }, (_, i) => `inc${String(i + 1).padStart(2, '0')} DECIMAL(12,2) NOT NULL DEFAULT 0`).join(', ')}, paid_money DECIMAL(12,2) NOT NULL DEFAULT 0, rcpt_money DECIMAL(12,2) NOT NULL DEFAULT 0)`
];

/** Thai text as the latin1 string MariaDB would hold for its TIS-620 bytes. */
export const tis = (text: string) => Buffer.from([...text].map((ch) => { const code = ch.codePointAt(0)!; return code >= 0x0e01 && code <= 0x0e5b ? code - 0x0e01 + 0xa1 : code; })).toString('latin1');

/**
 * `diags[0]` is the main diagnosis (`diagtype` '1'), the rest '2'. `dental` lists the `dtmain` rows as [doctor, helper] codes;
 * a visit without any is not dental work. `icodes` go into `opitemrece`, as a code or [code, sum_price].
 */
export type FakeVisit = { vn: string; hn: string; vstdate: string; pttype: string; an?: string; diags: string[]; inc: number[]; paid: number; rcpt: number; dental?: [doctor: string, helper: string | null][]; icodes?: (string | [icode: string, price: number])[] };

export async function seedFakeHosxp(database: Database, data: { patients: [hn: string, pname: string, fname: string, lname: string][]; icd: [code: string, name: string][]; pttypes: [code: string, name: string, hipdata?: string][]; paccountopd: [pttype: string, paccount: string, year: number, lastModify?: string][]; paccounts: [paccount: string, year: number, name: string][]; visits: FakeVisit[]; doctors?: [code: string, name: string][] }): Promise<void> {
  for (const sql of FAKE_HOSXP_TABLES) await database.execute(sql);
  for (const [hn, pname, fname, lname] of data.patients) await database.execute('INSERT INTO patient VALUES (?, ?, ?, ?)', [hn, tis(pname), tis(fname), tis(lname)]);
  for (const [code, name] of data.icd) await database.execute('INSERT INTO icd101 VALUES (?, ?)', [code, tis(name)]);
  for (const [code, name, hipdata] of data.pttypes) await database.execute('INSERT INTO pttype (pttype, name, hipdata_code) VALUES (?, ?, ?)', [code, tis(name), hipdata ?? null]);
  for (const [pttype, paccount, year, lastModify] of data.paccountopd) await database.execute('INSERT INTO paccountopd VALUES (?, ?, ?, ?)', [pttype, paccount, year, lastModify ?? null]);
  for (const [code, name] of data.doctors ?? []) await database.execute('INSERT INTO doctor VALUES (?, ?)', [code, tis(name)]);
  for (const [paccount, year, name] of data.paccounts) await database.execute('INSERT INTO paccount VALUES (?, ?, ?)', [paccount, year, tis(name)]);
  for (const visit of data.visits) {
    await database.execute('INSERT INTO ovst (vn, hn, vstdate, pttype, an) VALUES (?, ?, ?, ?, ?)', [visit.vn, visit.hn, visit.vstdate, visit.pttype, visit.an ?? null]);
    for (const [index, icd10] of visit.diags.entries()) await database.execute('INSERT INTO ovstdiag (vn, icd10, diagtype) VALUES (?, ?, ?)', [visit.vn, icd10, index === 0 ? '1' : '2']);
    for (const [doctor, helper] of visit.dental ?? []) await database.execute('INSERT INTO dtmain (vn, hn, vstdate, doctor, doctor_helper) VALUES (?, ?, ?, ?, ?)', [visit.vn, visit.hn, visit.vstdate, doctor, helper]);
    for (const item of visit.icodes ?? []) { const [icode, price] = typeof item === 'string' ? [item, 0] : item; await database.execute('INSERT INTO opitemrece (vn, icode, sum_price) VALUES (?, ?, ?)', [visit.vn, icode, price]); }
    const inc = Array.from({ length: 16 }, (_, i) => visit.inc[i] ?? 0);
    await database.execute(`INSERT INTO vn_stat VALUES (?, ${inc.map(() => '?').join(', ')}, ?, ?)`, [visit.vn, ...inc, visit.paid, visit.rcpt]);
  }
}

/** One แพทย์แผนไทย service row; type, doctor and treatment are ids into the name tables. */
export type FakeTtmService = { vn: string | null; hn: string; an?: string; date: string; time: string | null; type: number; doctor: number; treatment: number };
/** One `opitemrece` line with its income and price. */
export type FakeTtmCharge = { vn: string; icode: string; income: string; qty: number; price: number };

/** Adds แพทย์แผนไทย data to tables `seedFakeHosxp` created (names stored as TIS-620 bytes). */
export async function seedFakeTtm(database: Database, data: { types: [id: number, name: string][]; doctors: [id: number, name: string][]; treatments: [id: number, name: string][]; incomes: [code: string, name: string][]; drugs: [icode: string, name: string][]; nondrugs: [icode: string, name: string][]; services: FakeTtmService[]; charges: FakeTtmCharge[] }): Promise<void> {
  for (const [id, name] of data.types) await database.execute('INSERT INTO health_med_service_type VALUES (?, ?)', [id, tis(name)]);
  for (const [id, name] of data.doctors) await database.execute('INSERT INTO health_med_doctor VALUES (?, ?)', [id, tis(name)]);
  for (const [id, name] of data.treatments) await database.execute('INSERT INTO health_med_treatment_type VALUES (?, ?)', [id, tis(name)]);
  for (const [code, name] of data.incomes) await database.execute('INSERT INTO income VALUES (?, ?)', [code, tis(name)]);
  for (const [icode, name] of data.drugs) await database.execute('INSERT INTO drugitems (icode, name) VALUES (?, ?)', [icode, tis(name)]);
  for (const [icode, name] of data.nondrugs) await database.execute('INSERT INTO nondrugitems VALUES (?, ?)', [icode, tis(name)]);
  for (const row of data.services) await database.execute('INSERT INTO health_med_service (vn, hn, an, service_date, service_time, health_med_service_type_id, health_med_doctor_id, health_med_treatment_type_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [row.vn, row.hn, row.an ?? null, row.date, row.time, row.type, row.doctor, row.treatment]);
  for (const row of data.charges) await database.execute('INSERT INTO opitemrece (vn, icode, income, qty, sum_price) VALUES (?, ?, ?, ?, ?)', [row.vn, row.icode, row.income, row.qty, row.price]);
}

/** One herbal drug line in `opitemrece` (OPD by vn, IPD with an too). */
export type FakeHerbDispense = { rxdate: string; vn: string; an?: string; hn: string; icode: string; qty: number; price: number };

/** Adds การจ่ายยาสมุนไพร data: drugs with their cost and standard price, admissions (`ipt.pttype`) and dispensed lines. */
export async function seedFakeHerb(database: Database, data: { drugs: [icode: string, name: string, strength: string | null, units: string | null, unitcost: number | null, stdprice: number | null][]; admissions: [an: string, vn: string, pttype: string][]; dispenses: FakeHerbDispense[] }): Promise<void> {
  for (const [icode, name, strength, units, unitcost, stdprice] of data.drugs) await database.execute('INSERT INTO drugitems (icode, name, strength, units, unitcost, stdprice) VALUES (?, ?, ?, ?, ?, ?)', [icode, tis(name), strength, units === null ? null : tis(units), unitcost, stdprice]);
  for (const [an, vn, pttype] of data.admissions) await database.execute('INSERT INTO ipt (an, vn, pttype) VALUES (?, ?, ?)', [an, vn, pttype]);
  for (const row of data.dispenses) await database.execute('INSERT INTO opitemrece (rxdate, vn, an, hn, icode, income, qty, sum_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [row.rxdate, row.vn, row.an ?? null, row.hn, row.icode, '17', row.qty, row.price]);
}
