import { describe, expect, it } from 'vitest';
import { notificationEventPayloadSchema } from './notifications';

describe('notificationEventPayloadSchema', () => {
  it.each([
    [{ requestId: 'request-1', subject: 'มีคำขอรอพิจารณา' }, 'recipientPersonId'],
    [{ recipientPersonId: 'person-1', subject: 'มีคำขอรอพิจารณา' }, 'requestId'],
    [{ recipientPersonId: 'person-1', requestId: 'request-1', subject: '' }, 'subject']
  ])('rejects an in-app event without %s', (payload, field) => {
    const result = notificationEventPayloadSchema.safeParse(payload);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual([field]);
  });

  it('accepts the minimum safe payload for a request notification', () => {
    expect(notificationEventPayloadSchema.parse({
      recipientPersonId: 'person-1',
      requestId: 'request-1',
      subject: 'มีคำขอรอพิจารณา'
    })).toEqual({ recipientPersonId: 'person-1', requestId: 'request-1', subject: 'มีคำขอรอพิจารณา' });
  });
});
