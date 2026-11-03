import { describe, expect, it } from 'vitest';
import { lineAlertPayloadSchema, lineGroupIdSchema, lineGroupInputSchema, lineRouteInputSchema, lineUserIdSchema } from './line';
import { notificationEventPayloadSchema } from './notifications';

const group = `C${'a1'.repeat(16)}`;
const user = `U${'0f'.repeat(16)}`;

describe('LINE contracts', () => {
  it('accepts LINE group and user ids only in their exact shape', () => {
    expect(lineGroupIdSchema.safeParse(group).success).toBe(true);
    expect(lineGroupIdSchema.safeParse(group.toUpperCase()).success).toBe(false);
    expect(lineGroupIdSchema.safeParse('C123').success).toBe(false);
    expect(lineGroupIdSchema.safeParse(user).success).toBe(false);
    expect(lineUserIdSchema.safeParse(user).success).toBe(true);
  });

  it('trims a group name and lets a route clear its group', () => {
    expect(lineGroupInputSchema.parse({ groupId: ` ${group} `, displayName: '  หัวหน้างาน ' })).toEqual({ groupId: group, displayName: 'หัวหน้างาน' });
    expect(lineRouteInputSchema.parse({ groupId: null })).toEqual({ groupId: null });
    expect(lineRouteInputSchema.safeParse({ groupId: 'nope' }).success).toBe(false);
  });

  it('keeps actionRequired on a notification and carries only ids and a path to the LINE queue', () => {
    expect(notificationEventPayloadSchema.parse({ recipientPersonId: 'p', targetPath: '/rooms', subject: 'x', actionRequired: true }).actionRequired).toBe(true);
    expect(lineAlertPayloadSchema.parse({ recipientPersonId: 'p', moduleCode: 'room-booking', targetPath: '/rooms/bookings/1' })).toEqual({ recipientPersonId: 'p', moduleCode: 'room-booking', targetPath: '/rooms/bookings/1' });
    expect(lineAlertPayloadSchema.safeParse({ recipientPersonId: 'p', moduleCode: 'room-booking', targetPath: 'https://evil' }).success).toBe(false);
  });
});
