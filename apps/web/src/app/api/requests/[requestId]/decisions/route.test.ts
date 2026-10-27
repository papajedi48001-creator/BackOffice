// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireAuthorized: vi.fn(), query: vi.fn(), close: vi.fn(), decideRequest: vi.fn(), fileFromTravelDecision: vi.fn() }));
vi.mock('../../../../../lib/require-authorized', () => ({ requireAuthorized: mocks.requireAuthorized }));
vi.mock('../../../../../lib/runtime-env', () => ({ readRuntimeValue: (name: string) => (name === 'DATABASE_URL' ? 'mysql://test' : undefined) }));
vi.mock('@backoffice/db', () => ({ createDatabase: () => ({ query: mocks.query, close: mocks.close }) }));
vi.mock('@backoffice/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@backoffice/core')>(),
  ApprovalService: class { decideRequest = mocks.decideRequest; },
  FleetRequestService: class { fileFromTravelDecision = mocks.fileFromTravelDecision; }
}));

import { POST } from './route';

const decide = (decision: string) => POST(new Request('http://localhost/api/requests/request-1/decisions', { method: 'POST', body: JSON.stringify({ decision, ...(decision === 'APPROVE' ? {} : { reason: 'เหตุผล' }) }) }), { params: Promise.resolve({ requestId: 'request-1' }) });

function ready(moduleCode: string) {
  mocks.requireAuthorized.mockResolvedValue({ authenticated: true, personId: 'approver-1' });
  mocks.query.mockResolvedValue([{ moduleCode }]);
  mocks.decideRequest.mockImplementation(async (input: { decision: string }) => ({ id: 'decision-1', requestId: 'request-1', decision: input.decision }));
  mocks.fileFromTravelDecision.mockResolvedValue({ fleetRequestId: 'fleet-1' });
}

afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); });

describe('POST /api/requests/[requestId]/decisions', () => {
  it('files the ใบขอใช้รถ for a ไปราชการ คำขอ after an approval or a rejection, as the approver', async () => {
    for (const decision of ['APPROVE', 'REJECT']) {
      ready('official-travel');
      expect((await decide(decision)).status).toBe(200);
      expect(mocks.fileFromTravelDecision).toHaveBeenCalledWith('request-1', 'approver-1');
      vi.clearAllMocks();
    }
  });

  it('files nothing after a return, or for another module', async () => {
    ready('official-travel');
    await decide('RETURN');
    ready('leave');
    await decide('APPROVE');
    expect(mocks.fileFromTravelDecision).not.toHaveBeenCalled();
  });

  it('keeps the decision when the automatic filing fails, logging only the error code', async () => {
    ready('official-travel');
    mocks.fileFromTravelDecision.mockRejectedValue(Object.assign(new Error('Deadlock found for นายเอ'), { code: 'ER_LOCK_DEADLOCK' }));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await decide('APPROVE');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 'decision-1' });
    expect(log).toHaveBeenCalledWith('fleet.auto_file_failed', 'ER_LOCK_DEADLOCK');
    expect(JSON.stringify(log.mock.calls)).not.toContain('นายเอ');
  });

  it('files nothing when the decision is refused', async () => {
    ready('official-travel');
    mocks.decideRequest.mockRejectedValue(new Error('REQUEST_NOT_PENDING'));
    expect((await decide('APPROVE')).status).toBe(400);
    expect(mocks.fileFromTravelDecision).not.toHaveBeenCalled();
  });
});
