import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  redirect: vi.fn(),
  createDatabase: vi.fn(),
  readRuntimeValue: vi.fn(),
  readSession: vi.fn(),
  query: vi.fn(),
  close: vi.fn()
}));

vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@backoffice/db', () => ({ createDatabase: mocks.createDatabase }));
vi.mock('../../../../lib/runtime-env', () => ({ readRuntimeValue: mocks.readRuntimeValue }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));

import AuditPage from './page';

afterEach(() => { vi.clearAllMocks(); });

describe('AuditPage', () => {
  it('queries only the signed-in actor events and closes the database', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockReturnValue({ authenticated: true, personId: 'person-a', roles: [] });
    mocks.readRuntimeValue.mockReturnValue('mysql://backoffice:local-development-only@127.0.0.1:3307/backoffice');
    mocks.query.mockResolvedValue([{ createdAt: '2026-10-01T07:00:00.000Z', action: 'workflow.request.submitted', result: 'SUCCESS', metadata: '{"requestReference":"REQ-request-1","password":"do-not-render"}' }]);
    mocks.createDatabase.mockReturnValue({ query: mocks.query, close: mocks.close });

    render(await AuditPage());

    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('actor_person_id = ?'), ['person-a']);
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(screen.getByText('REQ-request-1')).toBeInTheDocument();
    expect(screen.queryByText('do-not-render')).not.toBeInTheDocument();
  });

  it('keeps cancellation and resubmission events', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockReturnValue({ authenticated: true, personId: 'person-a', roles: [] });
    mocks.readRuntimeValue.mockReturnValue('mysql://test');
    mocks.query.mockResolvedValue([
      { createdAt: '2026-10-01T07:00:00.000Z', action: 'workflow.request.cancelled', result: 'SUCCESS', metadata: '{"requestReference":"REQ-cancelled"}' },
      { createdAt: '2026-10-01T08:00:00.000Z', action: 'workflow.request.resubmitted', result: 'SUCCESS', metadata: '{"requestReference":"REQ-resubmitted"}' }
    ]);
    mocks.createDatabase.mockReturnValue({ query: mocks.query, close: mocks.close });

    render(await AuditPage());

    expect(screen.getByText('REQ-cancelled')).toBeInTheDocument();
    expect(screen.getByText('REQ-resubmitted')).toBeInTheDocument();
  });

  it('redirects unauthenticated users before querying audit data', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockReturnValue(null);

    await AuditPage();

    expect(mocks.redirect).toHaveBeenCalledWith('/');
    expect(mocks.createDatabase).not.toHaveBeenCalled();
  });

  it('shows inventory events with the reference from their metadata', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockReturnValue({ authenticated: true, personId: 'person-a', roles: [] });
    mocks.readRuntimeValue.mockReturnValue('mysql://backoffice:local-development-only@127.0.0.1:3307/backoffice');
    mocks.query.mockResolvedValue([{ createdAt: '2026-10-01T07:00:00.000Z', action: 'inventory.receipt.voided', result: 'SUCCESS', metadata: '{"reference":"RC-2569-0004","status":"VOIDED","lineCount":1}' }]);
    mocks.createDatabase.mockReturnValue({ query: mocks.query, close: mocks.close });

    render(await AuditPage());

    expect(screen.getByText('ยกเลิกใบรับเข้า')).toBeInTheDocument();
    expect(screen.getByText('RC-2569-0004')).toBeInTheDocument();
  });
  it('shows fleet events by their ใบ reference or, for a เที่ยวรถ, the car registration', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockReturnValue({ authenticated: true, personId: 'person-a', roles: [] });
    mocks.readRuntimeValue.mockReturnValue('mysql://test');
    mocks.query.mockResolvedValue([
      { createdAt: '2026-10-01T07:00:00.000Z', action: 'fleet.request.assigned', result: 'SUCCESS', metadata: '{"reference":"VR-2570-0001","status":"ASSIGNED"}' },
      { createdAt: '2026-10-01T08:00:00.000Z', action: 'fleet.trip.departed', result: 'SUCCESS', metadata: '{"registration":"กข 1234","status":"DEPARTED","odometer":1200}' }
    ]);
    mocks.createDatabase.mockReturnValue({ query: mocks.query, close: mocks.close });

    render(await AuditPage());

    expect(screen.getByText('VR-2570-0001')).toBeInTheDocument();
    expect(screen.getByText('กข 1234')).toBeInTheDocument();
    expect(screen.getByText('ออกเดินทาง')).toBeInTheDocument();
  });
});
