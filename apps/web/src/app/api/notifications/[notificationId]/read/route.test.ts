import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createDatabase: vi.fn(), readRuntimeValue: vi.fn(), requireAuthorized: vi.fn(), query: vi.fn(), execute: vi.fn(), close: vi.fn() }));
vi.mock('@backoffice/db', () => ({ createDatabase: mocks.createDatabase }));
vi.mock('../../../../../lib/runtime-env', () => ({ readRuntimeValue: mocks.readRuntimeValue }));
vi.mock('../../../../../lib/require-authorized', () => ({ requireAuthorized: mocks.requireAuthorized }));

import { PATCH } from './route';

afterEach(() => vi.clearAllMocks());

describe('PATCH /api/notifications/:notificationId/read', () => {
  it('returns the linked request only after a recipient-owned notification is marked read', async () => {
    mocks.readRuntimeValue.mockReturnValue('mysql://test');
    mocks.requireAuthorized.mockResolvedValue({ personId: 'person-a' });
    mocks.query.mockResolvedValue([{ requestId: 'request-1' }]);
    mocks.createDatabase.mockReturnValue({ query: mocks.query, execute: mocks.execute, close: mocks.close });

    const response = await PATCH(new Request('http://localhost'), { params: Promise.resolve({ notificationId: 'notice-1' }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ requestId: 'request-1' });
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('recipient_person_id = ?'), ['notice-1', 'person-a', 'in_app']);
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('WHERE id = ? AND recipient_person_id = ? AND read_at IS NULL'), ['notice-1', 'person-a']);
  });

  it('returns the same not-found response for an unknown or non-owned notification', async () => {
    mocks.readRuntimeValue.mockReturnValue('mysql://test');
    mocks.requireAuthorized.mockResolvedValue({ personId: 'person-a' });
    mocks.query.mockResolvedValue([]);
    mocks.createDatabase.mockReturnValue({ query: mocks.query, execute: mocks.execute, close: mocks.close });

    const response = await PATCH(new Request('http://localhost'), { params: Promise.resolve({ notificationId: 'other-person-notice' }) });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
