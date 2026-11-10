import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { LabRequisitionService } from './lab-requisition-service';
import { findOrCreateLot, labToday, move } from './lab-stock-writer';
import { addLabMember, insertLabItem, insertLabPerson, LAB_SEED, labSubject, setOpeningStatus } from './lab-test-fixtures';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('LabRequisitionService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const service = new LabRequisitionService(database);
  let keeper: string; let head: string; let otherHead: string; let staff: string;
  let item: { id: string; code: string };
  let goodLot: string; let expiredLot: string;
  const today = labToday();
  const balance = async (storeId: string) => Number((await database.query<{ q: number | null }>('SELECT SUM(b.quantity) AS q FROM lab_lot_balance b JOIN lab_lot l ON l.id = b.lot_id WHERE l.item_id = ? AND b.store_id = ?', [item.id, storeId]))[0]?.q ?? 0);
  const request = async (quantity = 3, by = staff) => {
    const result = await service.create(labSubject(by), { sectionId: LAB_SEED.sections.chem, note: '', lines: [{ itemId: item.id, quantity }] });
    if (!result.ok) throw new Error(result.code);
    return result.requisitionId;
  };
  const lineOf = async (requisitionId: string) => (await database.query<{ id: string }>('SELECT id FROM lab_requisition_line WHERE requisition_id = ?', [requisitionId]))[0]!.id;
  const approved = async (quantity = 3) => { const id = await request(quantity); expect(await service.decide(labSubject(head), id, { decision: 'APPROVE', reason: '' })).toEqual({ ok: true }); return id; };

  beforeAll(async () => {
    await runMigrations(database);
    [keeper, head, otherHead, staff] = await Promise.all([insertLabPerson(database), insertLabPerson(database), insertLabPerson(database), insertLabPerson(database)]);
    await addLabMember(database, keeper, 'KEEPER');
    await addLabMember(database, head, 'HEAD');
    await addLabMember(database, otherHead, 'HEAD');
    await addLabMember(database, staff, 'STAFF', [LAB_SEED.sections.chem]);
    await setOpeningStatus(database, 'CERTIFIED');
    item = await insertLabItem(database, 10);
    await database.transaction(async (tx) => {
      goodLot = await findOrCreateLot(tx, { itemId: item.id, lotNo: 'G', expiryDate: '2099-12-31', unitCost: '10.0000', source: 'OPENING' });
      expiredLot = await findOrCreateLot(tx, { itemId: item.id, lotNo: 'E', expiryDate: '2001-01-01', unitCost: '10.0000', source: 'OPENING' });
      await move(tx, { lotId: goodLot, storeId: LAB_SEED.stores.main, quantity: 10, kind: 'OPENING', entryDate: today, refType: 'TEST', refId: randomUUID(), actorPersonId: keeper });
      await move(tx, { lotId: expiredLot, storeId: LAB_SEED.stores.main, quantity: 10, kind: 'OPENING', entryDate: today, refType: 'TEST', refId: randomUUID(), actorPersonId: keeper });
    });
  });
  afterAll(async () => { await database.close(); });

  it('lets a เจ้าหน้าที่ request only for their own งาน', async () => {
    expect(await service.create(labSubject(staff), { sectionId: LAB_SEED.sections.hema, note: '', lines: [{ itemId: item.id, quantity: 1 }] })).toEqual({ ok: false, code: 'FORBIDDEN' });
    const id = await request();
    const [row] = await database.query<{ status: string; doc_no: string }>('SELECT status, doc_no FROM lab_requisition WHERE id = ?', [id]);
    expect(row).toMatchObject({ status: 'SUBMITTED', doc_no: expect.stringMatching(/^LQ-\d{4}-\d{4,}$/) });
  });

  it('returns with a reason, resubmits, and refuses a decision from a ผู้ดูแลคลัง', async () => {
    const id = await request();
    expect(await service.decide(labSubject(keeper), id, { decision: 'APPROVE', reason: '' })).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(await service.decide(labSubject(head), id, { decision: 'RETURN', reason: '' })).toEqual({ ok: false, code: 'REASON_REQUIRED' });
    expect(await service.decide(labSubject(head), id, { decision: 'RETURN', reason: 'ลดจำนวน' })).toEqual({ ok: true });
    expect(await service.resubmit(labSubject(staff), id, { sectionId: LAB_SEED.sections.chem, note: '', lines: [{ itemId: item.id, quantity: 2 }] })).toEqual({ ok: true });
    expect(await service.cancel(labSubject(staff), id)).toEqual({ ok: true });
    expect(await service.cancel(labSubject(staff), id)).toEqual({ ok: false, code: 'WRONG_STATUS' });
  });

  it('keeps a หัวหน้า Lab in the employee tier from deciding their own request, and records a manager-tier self approval', async () => {
    const own = await request(1, head);
    expect(await service.decide(labSubject(head), own, { decision: 'APPROVE', reason: '' })).toEqual({ ok: false, code: 'CONFLICT_OF_INTEREST' });
    const manager = labSubject(head, 'lab-manager');
    expect(await service.decide(manager, own, { decision: 'APPROVE', reason: '' })).toEqual({ ok: false, code: 'REASON_REQUIRED' });
    expect(await service.decide(manager, own, { decision: 'APPROVE', reason: 'เร่งด่วน ไม่มีผู้อนุมัติอื่น' })).toEqual({ ok: true });
    const [audit] = await database.query<{ metadata: string }>("SELECT metadata FROM audit_event WHERE action = 'lab.requisition.approve' AND target_id = ?", [own]);
    expect(JSON.parse(audit!.metadata)).toMatchObject({ selfApproval: true });
    expect(audit!.metadata).not.toContain('เร่งด่วน');
  });

  it('issues an approved request into the งาน store, refusing over-issue, a silent short issue and an expired lot', async () => {
    const id = await approved(3);
    const lineId = await lineOf(id);
    expect(await service.issue(labSubject(keeper), id, { note: '', lines: [{ lineId, picks: [{ lotId: goodLot, quantity: 4 }] }] })).toEqual({ ok: false, code: 'OVER_REQUESTED' });
    expect(await service.issue(labSubject(keeper), id, { note: '', lines: [{ lineId, picks: [{ lotId: goodLot, quantity: 2 }] }] })).toEqual({ ok: false, code: 'NOTE_REQUIRED' });
    expect(await service.issue(labSubject(keeper), id, { note: '', lines: [{ lineId, picks: [{ lotId: expiredLot, quantity: 3 }] }] })).toEqual({ ok: false, code: 'LOT_EXPIRED' });
    expect(await service.issue(labSubject(staff), id, { note: '', lines: [{ lineId, picks: [{ lotId: goodLot, quantity: 3 }] }] })).toEqual({ ok: false, code: 'FORBIDDEN' });
    const main = await balance(LAB_SEED.stores.main);
    expect(await service.issue(labSubject(keeper), id, { note: '', lines: [{ lineId, picks: [{ lotId: goodLot, quantity: 3 }] }] })).toEqual({ ok: true });
    expect(await balance(LAB_SEED.stores.main)).toBe(main - 3);
    expect(await balance(LAB_SEED.stores.chem)).toBe(3);
    expect(await service.issue(labSubject(keeper), id, { note: '', lines: [{ lineId, picks: [{ lotId: goodLot, quantity: 3 }] }] })).toEqual({ ok: false, code: 'WRONG_STATUS' });
  });

  it('lets only one of two issues take the last units', async () => {
    const left = Number((await database.query<{ q: number }>('SELECT quantity AS q FROM lab_lot_balance WHERE lot_id = ? AND store_id = ?', [goodLot, LAB_SEED.stores.main]))[0]!.q);
    const [a, b] = [await approved(left), await approved(left)];
    const [lineA, lineB] = [await lineOf(a), await lineOf(b)];
    const results = await Promise.all([
      service.issue(labSubject(keeper), a, { note: '', lines: [{ lineId: lineA, picks: [{ lotId: goodLot, quantity: left }] }] }),
      service.issue(labSubject(keeper), b, { note: '', lines: [{ lineId: lineB, picks: [{ lotId: goodLot, quantity: left }] }] })
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toEqual({ ok: false, code: 'INSUFFICIENT_STOCK' });
    expect(Number((await database.query<{ q: number }>('SELECT quantity AS q FROM lab_lot_balance WHERE lot_id = ? AND store_id = ?', [goodLot, LAB_SEED.stores.main]))[0]!.q)).toBe(0);
  });

  it('refuses a request before the ยอดยกมา is certified', async () => {
    await setOpeningStatus(database, 'DRAFT');
    expect(await service.create(labSubject(staff), { sectionId: LAB_SEED.sections.chem, note: '', lines: [{ itemId: item.id, quantity: 1 }] })).toEqual({ ok: false, code: 'OPENING_NOT_CERTIFIED' });
    await setOpeningStatus(database, 'CERTIFIED');
  });
});
