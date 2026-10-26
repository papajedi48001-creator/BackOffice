import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import type { Database } from '@backoffice/db';
import type { NationalIdProtector } from '../crypto/national-id';
import { MasterDataImportService } from '../hr/master-data-import';

// Synthetic data for a developer's own machine. Every national ID here is made up and only passes the checksum.
const syntheticNationalId = (prefix: string) => `${prefix}${(11 - ([...prefix].reduce((total, digit, index) => total + Number(digit) * (13 - index), 0) % 11)) % 10}`;

const organizations = 'code,name,parent_code\nHOSP,โรงพยาบาลวาริชภูมิ,\nNUR,กลุ่มการพยาบาล,HOSP\nIPD,งานผู้ป่วยใน,NUR\nER,งานอุบัติเหตุและฉุกเฉิน,NUR\nADM,กลุ่มงานบริหารทั่วไป,HOSP\nHR,งานทรัพยากรบุคคล,ADM\nLAB,กลุ่มงานเทคนิคการแพทย์,HOSP\nPHA,กลุ่มงานเภสัชกรรม,HOSP\n';
const people: Array<[code: string, nationalId: string, name: string, position: string, unit: string, manager: string]> = [
  ['DIR001', syntheticNationalId('110000000102'), 'นายแพทย์ธนพล สมมติชื่อ', 'ผู้อำนวยการโรงพยาบาล', 'HOSP', ''],
  ['HR001', syntheticNationalId('110000000101'), 'นางสาวกนกวรรณ ทดสอบดี', 'นักทรัพยากรบุคคล', 'HR', 'DIR001'],
  ['NUR001', syntheticNationalId('110000000103'), 'นางพรทิพย์ ตัวอย่างงาม', 'หัวหน้ากลุ่มการพยาบาล', 'NUR', 'DIR001'],
  ['NUR014', syntheticNationalId('110000000104'), 'นางสาวสุดารัตน์ ใจสมมติ', 'พยาบาลวิชาชีพชำนาญการ', 'IPD', 'NUR001'],
  ['NUR022', syntheticNationalId('110000000105'), 'นายวีรยุทธ ทดลองศรี', 'พยาบาลวิชาชีพปฏิบัติการ', 'ER', 'NUR001'],
  ['ADM003', syntheticNationalId('110000000106'), 'นางมาลัย ข้อมูลจำลอง', 'เจ้าพนักงานธุรการ', 'ADM', 'DIR001'],
  ['LAB002', syntheticNationalId('110000000107'), 'นายอรรถพล ตัวอย่างชัย', 'นักเทคนิคการแพทย์', 'LAB', 'DIR001'],
  ['PHA005', syntheticNationalId('110000000108'), 'เภสัชกรหญิงศิริพร สมมุติ', 'เภสัชกรชำนาญการ', 'PHA', 'DIR001']
];
const roles: Array<[code: string, role: string]> = [['HR001', 'hr-manager'], ['ADM003', 'room-manager'], ['ADM003', 'room-booking-approver'], ['ADM003', 'inventory-officer'], ['DIR001', 'inventory-supervisor']];

export interface LocalDemoSeedResult { accountsCreated: number; usernames: string[]; }

export async function seedLocalDemo(database: Database, protector: NationalIdProtector, options: { password: string }): Promise<LocalDemoSeedResult> {
  const hrLookup = protector.lookup(people[1]![1]);
  let [actor] = await database.query<{ id: string }>('SELECT id FROM person WHERE national_id_lookup = ? LIMIT 1', [hrLookup]);
  if (!actor) {
    actor = { id: randomUUID() };
    // The import matches this row by its lookup and fills in the rest, so the importer exists before the import.
    await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())', [actor.id, protector.encrypt(people[1]![1]), hrLookup]);
  }
  const peopleCsv = 'employee_code,national_id,display_name,position_title,organization_code,manager_employee_code,effective_from,status\n' + people.map(([code, nationalId, name, position, unit, manager]) => `${code},${nationalId},${name},${position},${unit},${manager},1/10/2569,ACTIVE`).join('\n') + '\n';
  const importer = new MasterDataImportService(database, protector);
  const imported = await retryOnDeadlock(() => importer.apply({ organizations, people: peopleCsv }, actor!.id));
  if (!imported.ok) throw new Error(`DEMO_IMPORT_FAILED: ${imported.errors.map((error) => error.code).join(',')}`);

  const usernames: string[] = [];
  for (const [code] of people) {
    const username = code.toLowerCase();
    const [person] = await database.query<{ id: string }>('SELECT id FROM person WHERE employee_code = ? LIMIT 1', [code]);
    if (!person || (await database.query('SELECT id FROM local_account WHERE username = ? LIMIT 1', [username])).length) continue;
    const salt = randomBytes(16).toString('base64url');
    await database.execute('INSERT INTO local_account (id, person_id, username, password_hash, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [randomUUID(), person.id, username, `scrypt$${salt}$${scryptSync(options.password, salt, 64).toString('base64url')}`]);
    usernames.push(username);
  }
  for (const [code, role] of roles) {
    if (!(await database.query('SELECT id FROM role WHERE name = ? LIMIT 1', [role])).length) await database.execute('INSERT INTO role (id, name, created_at) VALUES (?, ?, UTC_TIMESTAMP())', [randomUUID(), role]);
    await database.execute('INSERT INTO role_assignment (id, person_id, role_id, organization_id, created_at) SELECT ?, person.id, role.id, NULL, UTC_TIMESTAMP() FROM person JOIN role ON role.name = ? WHERE person.employee_code = ? AND NOT EXISTS (SELECT 1 FROM role_assignment existing WHERE existing.person_id = person.id AND existing.role_id = role.id AND existing.organization_id IS NULL)', [randomUUID(), role, code]);
  }
  await database.execute("INSERT INTO data_owner_assignment (id, module_code, organization_id, person_id, created_at) SELECT ?, 'hr', NULL, person.id, UTC_TIMESTAMP() FROM person WHERE person.employee_code = 'HR001' AND NOT EXISTS (SELECT 1 FROM data_owner_assignment existing WHERE existing.person_id = person.id AND existing.module_code = 'hr' AND existing.organization_id IS NULL)", [randomUUID()]);
  return { accountsCreated: usernames.length, usernames };
}

// The import locks whole tables, so it can deadlock with other writers (parallel test files, a running app); MariaDB rolls it back and a retry is safe.
async function retryOnDeadlock<T>(work: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try { return await work(); } catch (error) {
      if (attempt >= attempts || !(error && typeof error === 'object' && 'errno' in error && error.errno === 1213)) throw error;
    }
  }
}
