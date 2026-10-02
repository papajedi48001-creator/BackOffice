import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createDatabase: vi.fn(), readRuntimeValue: vi.fn(), requireAuthorized: vi.fn(), query: vi.fn(), close: vi.fn() }));
vi.mock('@backoffice/db', () => ({ createDatabase: mocks.createDatabase }));
vi.mock('../../../lib/runtime-env', () => ({ readRuntimeValue: mocks.readRuntimeValue }));
vi.mock('../../../lib/require-authorized', () => ({ requireAuthorized: mocks.requireAuthorized }));

import { GET } from './route';

afterEach(() => vi.clearAllMocks());

describe('GET /api/notifications', () => {
  it('returns only the signed-in recipient notifications and unread count', async () => {
    mocks.readRuntimeValue.mockReturnValue('mysql://test');
    mocks.requireAuthorized.mockResolvedValue({ personId: 'person-a' });
    mocks.query.mockResolvedValueOnce([{ id: 'notice-1', requestId: 'request-1', subject: 'มีคำขอรอพิจารณา', readAt: null, createdAt: '2026-10-02T00:00:00.000Z' }]).mockResolvedValueOnce([{ unreadCount: 1 }]);
    mocks.createDatabase.mockReturnValue({ query: mocks.query, close: mocks.close });

    const response = await GET(new Request('http://localhost/api/notifications'));

    expect(await response.json()).toEqual({ notifications: [{ id: 'notice-1', requestId: 'request-1', subject: 'มีคำขอรอพิจารณา', readAt: null, createdAt: '2026-10-02T00:00:00.000Z' }], unreadCount: 1 });
    expect(mocks.query).toHaveBeenNthCalledWith(1, expect.stringContaining('recipient_person_id = ?'), ['person-a', 'in_app']);
    expect(mocks.query).toHaveBeenNthCalledWith(2, expect.stringContaining('read_at IS NULL'), ['person-a', 'in_app']);
  });
});
