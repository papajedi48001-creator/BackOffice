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

  it('accepts a notification that links to a page other than a request', () => {
    expect(notificationEventPayloadSchema.parse({ recipientPersonId: 'person-1', subject: 'การจองห้องได้รับอนุมัติ (RB-2569-0001)', targetPath: '/rooms/bookings/booking-1' }))
      .toEqual({ recipientPersonId: 'person-1', subject: 'การจองห้องได้รับอนุมัติ (RB-2569-0001)', targetPath: '/rooms/bookings/booking-1' });
  });

  it('keeps the code of the module that sent the notification', () => {
    expect(notificationEventPayloadSchema.parse({ recipientPersonId: 'person-1', subject: 'การจองห้องได้รับอนุมัติ', targetPath: '/rooms/bookings/booking-1', moduleCode: 'room-booking' }))
      .toMatchObject({ moduleCode: 'room-booking' });
  });

  it.each(['Room Booking', 'room_booking', '1rooms', ''])('rejects a malformed module code %s', (moduleCode) => {
    expect(notificationEventPayloadSchema.safeParse({ recipientPersonId: 'person-1', subject: 'แจ้งเตือน', requestId: 'request-1', moduleCode }).success).toBe(false);
  });

  it.each(['//evil.example/path', 'https://evil.example', 'rooms/bookings/1', '/rooms?reason=x'])('rejects an unsafe target path %s', (targetPath) => {
    expect(notificationEventPayloadSchema.safeParse({ recipientPersonId: 'person-1', subject: 'แจ้งเตือน', targetPath }).success).toBe(false);
  });
});
