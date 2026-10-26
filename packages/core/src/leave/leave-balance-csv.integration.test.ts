import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { exportLeaveBalancesCsv, LeaveBalanceImportService } from './leave-balance-csv';
import { loadBalance } from './leave-store';
import { createLeavePerson, LEAVE_TYPE_IDS } from './leave-fixtures';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
// A fiscal year no other test touches, so this file owns every opening balance in it.
const fiscalYear = 2590;

describeWithDatabase('leave balance CSV against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const service = new LeaveBalanceImportService(database);
  const actor = randomUUID();
  let person: string;
  let code: string;

  beforeAll(async () => {
    await runMigrations(database);
    person = await createLeavePerson(database, null);
    code = `L${person.slice(0, 8)}`;
    await database.execute('UPDATE person SET employee_code = ? WHERE id = ?', [code, person]);
    await createLeavePerson(database, null).then((id) => database.execute('UPDATE person SET employee_code = ?, employment_status = ? WHERE id = ?', [`X${id.slice(0, 8)}`, 'INACTIVE', id]));
    await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())', [actor, 'ciphertext', randomUUID()]);
  });
  afterAll(async () => { await database.close(); });

  it('exports every active person and entitled type, and re-importing it changes nothing', async () => {
    const text = await exportLeaveBalancesCsv(database, fiscalYear);
    expect(text.startsWith('﻿employee_code,display_name,leave_type,carried_days,used_days\r\n')).toBe(true);
    const lines = text.split('\r\n').filter((line) => line.startsWith(`${code},`));
    expect(lines.map((line) => line.split(',')[2])).toEqual(['SICK', 'PERSONAL', 'VACATION', 'MATERNITY', 'PATERNITY']);
    expect(text).not.toContain('ciphertext');
    expect(text).not.toMatch(/\nX/);
    expect(await service.apply(text, fiscalYear, actor)).toEqual({ ok: true, rowsChanged: 0 });
  });

  it('applies an edited carried value and the balance follows', async () => {
    const text = (await exportLeaveBalancesCsv(database, fiscalYear)).replace(`${code},บุคลากร ${person.slice(0, 8)},VACATION,0,0`, `${code},บุคลากร ${person.slice(0, 8)},VACATION,7.5,1`);
    expect(await service.apply(text, fiscalYear, actor)).toEqual({ ok: true, rowsChanged: 1 });
    expect(await loadBalance(database, person, { id: LEAVE_TYPE_IDS.VACATION, code: 'VACATION' }, fiscalYear)).toMatchObject({ carried: 7.5, used: 1 });
    const audits = await database.query<{ metadata: string }>("SELECT metadata FROM audit_event WHERE actor_person_id = ? AND action = 'leave.balance.import'", [actor]);
    expect(audits.map((audit) => JSON.parse(audit.metadata))).toContainEqual({ fiscalYear, rowsChanged: 1 });
  });

  it('applies nothing when any row has an error', async () => {
    const text = (await exportLeaveBalancesCsv(database, fiscalYear)).replace(`${code},บุคลากร ${person.slice(0, 8)},SICK,0,0`, `${code},บุคลากร ${person.slice(0, 8)},SICK,0,3`) + 'NOBODY,x,SICK,0,0\r\n';
    const result = await service.apply(text, fiscalYear, actor);
    expect(result.ok).toBe(false);
    expect(await loadBalance(database, person, { id: LEAVE_TYPE_IDS.SICK, code: 'SICK' }, fiscalYear)).toMatchObject({ used: 0 });
  });
});
