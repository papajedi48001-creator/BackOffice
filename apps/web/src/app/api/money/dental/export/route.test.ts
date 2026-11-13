// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), loadMoneyMember: vi.fn(), load: vi.fn(), audit: vi.fn() }));
vi.mock('../../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../../../lib/hosxp', () => ({ dentalService: () => ({ load: mocks.load }) }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), loadMoneyMember: mocks.loadMoneyMember, recordDentalExport: mocks.audit }));

import { GET } from './route';

const person = { authenticated: true, personId: 'person-a', roles: [], dataOwnerModules: [] };
const row = { vn: '1', vstdate: '2026-11-03', hn: '000123', patientName: 'นาย ทดสอบ', diagCode: 'K021', diagName: 'ฟันผุ', pttypeCode: '89', pttypeName: 'บัตรทอง', paccountName: null, totalAmount: 100, paidMoney: 0, claimAmount: 100 };
const get = (query = 'start=2026-11-01&end=2026-11-30') => GET(new Request(`http://localhost/api/money/dental/export?${query}`));
const ready = (member: object | null) => { mocks.readSession.mockResolvedValue(person); mocks.getSharedDatabase.mockReturnValue({}); mocks.loadMoneyMember.mockResolvedValue(member); };

afterEach(() => vi.resetAllMocks());

describe('dental CSV export', () => {
  it('refuses a non-member and a member without the dental page', async () => {
    ready(null);
    expect((await get()).status).toBe(403);
    ready({ pages: [] });
    expect((await get()).status).toBe(403);
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('refuses a bad range without reading HOSxP', async () => {
    ready({ pages: ['dental'] });
    const response = await get('start=2026-01-01&end=2027-06-01');
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'RANGE_TOO_LONG' });
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('answers 503 when HOSxP cannot be read', async () => {
    ready({ pages: ['dental'] });
    mocks.load.mockResolvedValue({ ok: false, code: 'HOSXP_FAILED' });
    expect((await get()).status).toBe(503);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('sends the CSV to a member and audits the range and row count only', async () => {
    ready({ pages: ['dental'] });
    mocks.load.mockResolvedValue({ ok: true, rows: [row] });
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="dental_claims_2026-11-01_2026-11-30.csv"');
    const body = new Uint8Array(await response.arrayBuffer());
    expect([...body.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(mocks.load).toHaveBeenCalledWith('2026-11-01', '2026-11-30');
    expect(mocks.audit).toHaveBeenCalledWith({}, 'person-a', { start: '2026-11-01', end: '2026-11-30', rows: 1 });
  });
});
