// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readSession: vi.fn(), getSharedDatabase: vi.fn(), loadLabMember: vi.fn(),
  saveItem: vi.fn(), saveSection: vi.fn(), saveVendor: vi.fn(), saveUsageType: vi.fn(), saveMember: vi.fn(), removeMember: vi.fn(),
  importItems: vi.fn(), importOpening: vi.fn(), saveLine: vi.fn(), deleteLine: vi.fn(), submit: vi.fn(), decideOpening: vi.fn(),
  createReceipt: vi.fn(), voidReceipt: vi.fn(),
  createRequisition: vi.fn(), resubmit: vi.fn(), cancel: vi.fn(), decide: vi.fn(), issue: vi.fn(),
  record: vi.fn(), reverse: vi.fn(),
  balances: vi.fn(), lots: vi.fn(), fefoSuggestion: vi.fn(), requisition: vi.fn(), storeSection: vi.fn()
}));
vi.mock('../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@backoffice/core')>(),
  loadLabMember: mocks.loadLabMember,
  LabSettingsService: class { saveItem = mocks.saveItem; saveSection = mocks.saveSection; saveVendor = mocks.saveVendor; saveUsageType = mocks.saveUsageType; saveMember = mocks.saveMember; removeMember = mocks.removeMember; },
  LabOpeningService: class { importItems = mocks.importItems; importOpening = mocks.importOpening; saveLine = mocks.saveLine; deleteLine = mocks.deleteLine; submit = mocks.submit; decide = mocks.decideOpening; },
  LabReceiptService: class { create = mocks.createReceipt; void = mocks.voidReceipt; },
  LabRequisitionService: class { create = mocks.createRequisition; resubmit = mocks.resubmit; cancel = mocks.cancel; decide = mocks.decide; issue = mocks.issue; },
  LabUsageService: class { record = mocks.record; reverse = mocks.reverse; },
  LabQueries: class { balances = mocks.balances; lots = mocks.lots; fefoSuggestion = mocks.fefoSuggestion; requisition = mocks.requisition; }
}));

import { POST as ADD_SETTING } from './settings/[kind]/route';
import { PUT as SAVE_MEMBER } from './members/route';
import { GET as TEMPLATE } from './opening/template/route';
import { POST as IMPORT } from './opening/import/route';
import { POST as DECIDE_OPENING } from './opening/decision/route';
import { POST as RECEIVE } from './receipts/route';
import { POST as REQUEST } from './requisitions/route';
import { POST as DECIDE } from './requisitions/[id]/decision/route';
import { POST as ISSUE } from './requisitions/[id]/issue/route';
import { GET as FEFO } from './requisitions/[id]/fefo/route';
import { POST as USE } from './usages/route';
import { POST as REVERSE } from './usages/[id]/reversal/route';
import { GET as STOCK } from './stock/route';
import { GET as LOTS } from './stock/[itemId]/lots/route';

const uuid = '0b6f3c1e-5d1a-4c8e-9a51-2f7c1d9e8b10';
const chemStore = '00000000-0000-4000-b000-000000000011';
const hemaStore = '00000000-0000-4000-b000-000000000012';
const person = { authenticated: true, personId: 'person-a', roles: [], dataOwnerModules: [] };
const json = (method: string, value: unknown = {}, target = 'http://localhost/api/lab/x') => new Request(target, { method, body: JSON.stringify(value) });
const params = <T extends object>(value: T) => ({ params: Promise.resolve(value) });
const id = params({ id: 'id-1' });
const ready = (session: object | null = person, member: object | null = { role: 'STAFF', sectionIds: [uuid] }) => {
  mocks.readSession.mockResolvedValue(session);
  mocks.getSharedDatabase.mockReturnValue({ query: mocks.storeSection });
  mocks.loadLabMember.mockResolvedValue(member);
  mocks.storeSection.mockImplementation(async (_sql: string, values: string[]) => (values[0] === chemStore ? [{ kind: 'SECTION', section_id: uuid }] : values[0] === hemaStore ? [{ kind: 'SECTION', section_id: 'hema' }] : []));
};
const usage = { storeId: chemStore, itemId: uuid, quantity: 2, usageTypeId: uuid, entryDate: '2026-11-10' };

afterEach(() => vi.resetAllMocks());

describe('signed out', () => {
  it('answers 401 on every write and read', async () => {
    ready(null);
    for (const response of [await USE(json('POST', usage)), await RECEIVE(json('POST', {})), await REQUEST(json('POST', {})), await STOCK(new Request('http://localhost/api/lab/stock?store=ALL')), await TEMPLATE(new Request('http://localhost/api/lab/opening/template?kind=items'))]) expect(response.status).toBe(401);
  });
});

describe('body validation', () => {
  it('answers 400 naming the fields only', async () => {
    ready();
    const response = await USE(json('POST', { ...usage, quantity: 0, note: 'ข้อความลับ'.repeat(100) }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: 'invalid_input', fields: expect.arrayContaining(['quantity', 'note']) });
    expect(JSON.stringify(body)).not.toContain('ข้อความลับ');
  });
});

describe('service results', () => {
  it('passes the session and parsed input to the service and maps codes to statuses', async () => {
    ready();
    mocks.record.mockResolvedValueOnce({ ok: true, usageId: 'u-1', picks: [] }).mockResolvedValueOnce({ ok: false, code: 'INSUFFICIENT_STOCK' }).mockResolvedValueOnce({ ok: false, code: 'FORBIDDEN' });
    expect((await USE(json('POST', usage))).status).toBe(201);
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ personId: 'person-a' }), { ...usage, note: '', picks: null });
    expect((await USE(json('POST', usage))).status).toBe(409);
    expect((await USE(json('POST', usage))).status).toBe(403);
    mocks.reverse.mockResolvedValueOnce({ ok: false, code: 'NOT_FOUND' });
    expect((await REVERSE(json('POST', { reason: 'ผิด' }), id)).status).toBe(404);
    mocks.decide.mockResolvedValueOnce({ ok: false, code: 'CONFLICT_OF_INTEREST' });
    expect((await DECIDE(json('POST', { decision: 'APPROVE' }), id)).status).toBe(409);
    mocks.issue.mockResolvedValueOnce({ ok: true });
    expect((await ISSUE(json('POST', { lines: [{ lineId: uuid, picks: [] }] }), id)).status).toBe(200);
    mocks.decideOpening.mockResolvedValueOnce({ ok: false, code: 'WRONG_STATUS' });
    expect((await DECIDE_OPENING(json('POST', { decision: 'CERTIFY' }))).status).toBe(409);
  });

  it('routes each settings kind and 404s an unknown one', async () => {
    ready();
    mocks.saveVendor.mockResolvedValueOnce({ ok: true, id: 'v' });
    expect((await ADD_SETTING(json('POST', { name: 'ผู้ขาย', isActive: true }), params({ kind: 'vendors' }))).status).toBe(201);
    expect((await ADD_SETTING(json('POST', {}), params({ kind: 'secrets' }))).status).toBe(404);
    mocks.saveMember.mockResolvedValueOnce({ ok: false, code: 'FORBIDDEN' });
    expect((await SAVE_MEMBER(json('PUT', { personId: uuid, role: 'KEEPER', sectionIds: [] }))).status).toBe(403);
  });

  it('imports a CSV body and returns its row errors', async () => {
    ready();
    mocks.importOpening.mockResolvedValueOnce({ ok: false, code: 'INVALID_CSV', errors: [{ row: 3, message: 'ไม่พบรหัสวัสดุ' }] });
    const response = await IMPORT(new Request('http://localhost/api/lab/opening/import?kind=opening', { method: 'POST', body: 'csv text' }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'INVALID_CSV', errors: [{ row: 3, message: 'ไม่พบรหัสวัสดุ' }] });
    expect(mocks.importOpening).toHaveBeenCalledWith(expect.anything(), 'csv text');
  });
});

describe('templates', () => {
  it('download as UTF-8 CSV with a byte-order mark', async () => {
    ready();
    const response = await TEMPLATE(new Request('http://localhost/api/lab/opening/template?kind=opening'));
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect((await TEMPLATE(new Request('http://localhost/api/lab/opening/template?kind=x'))).status).toBe(400);
  });
});

describe('stock reads', () => {
  it('lets a เจ้าหน้าที่ read their own คลังย่อย only', async () => {
    ready();
    mocks.balances.mockResolvedValue([]);
    expect((await STOCK(new Request(`http://localhost/api/lab/stock?store=${chemStore}`))).status).toBe(200);
    expect((await STOCK(new Request(`http://localhost/api/lab/stock?store=${hemaStore}`))).status).toBe(403);
    expect((await STOCK(new Request('http://localhost/api/lab/stock?store=ALL'))).status).toBe(403);
    expect((await LOTS(new Request(`http://localhost/api/lab/stock/i/lots?store=${hemaStore}`), params({ itemId: 'i' }))).status).toBe(403);
    expect(mocks.balances).toHaveBeenCalledTimes(1);
  });

  it('refuses a non-member and lets a ผู้ดูแลคลัง read the whole Lab and the FEFO suggestion', async () => {
    ready(person, null);
    expect((await STOCK(new Request('http://localhost/api/lab/stock?store=ALL'))).status).toBe(403);
    expect((await FEFO(new Request('http://localhost/api/lab/requisitions/id-1/fefo'), id)).status).toBe(403);
    ready(person, { role: 'KEEPER', sectionIds: [] });
    mocks.balances.mockResolvedValue([{ itemId: 'i' }]);
    mocks.fefoSuggestion.mockResolvedValue([]);
    expect((await STOCK(new Request('http://localhost/api/lab/stock?store=ALL'))).status).toBe(200);
    expect((await FEFO(new Request('http://localhost/api/lab/requisitions/id-1/fefo'), id)).status).toBe(200);
  });
});
