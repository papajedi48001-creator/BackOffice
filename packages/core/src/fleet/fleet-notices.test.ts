import { describe, expect, it } from 'vitest';
import { noticesFor } from './fleet-notices';

const request = (id: string) => `/fleet/requests/${id}`;
const trip = (id: string) => `/fleet/trips/${id}`;

describe('noticesFor', () => {
  it('tells every fleet manager but the requester that a ใบ from ไปราชการ waits for a car', () => {
    expect(noticesFor('waiting', { fleetRequestId: 'f1', actorPersonId: 'req', managerPersonIds: ['m1', 'req', 'm2'] })).toEqual([
      { recipientPersonId: 'm1', subject: 'มีใบขอใช้รถรอจัดรถ', targetPath: request('f1') },
      { recipientPersonId: 'm2', subject: 'มีใบขอใช้รถรอจัดรถ', targetPath: request('f1') }
    ]);
  });

  it('tells the requester the registration and the driver of new work on การจัดรถ', () => {
    expect(noticesFor('assigned', { fleetRequestId: 'f1', tripId: 't1', actorPersonId: 'm1', requesterPersonIds: ['req'], driverPersonId: 'd1', registration: 'กข 1234' })).toEqual([
      { recipientPersonId: 'req', subject: 'จัดรถแล้ว > กข 1234', targetPath: request('f1') },
      { recipientPersonId: 'd1', subject: 'มีงานขับใหม่', targetPath: trip('t1') }
    ]);
  });

  it('tells the requester of ไม่จัดรถ', () => {
    expect(noticesFor('declined', { fleetRequestId: 'f1', actorPersonId: 'm1', requesterPersonIds: ['req'] })).toEqual([{ recipientPersonId: 'req', subject: 'ไม่จัดรถ', targetPath: request('f1') }]);
  });

  it('tells each requester on the เที่ยวรถ and the old and new driver of a change, once each', () => {
    expect(noticesFor('changed', { tripId: 't1', actorPersonId: 'm1', requesters: [{ personId: 'r1', fleetRequestId: 'f1' }, { personId: 'r2', fleetRequestId: 'f2' }], driverPersonId: 'd2', previousDriverPersonId: 'd1' })).toEqual([
      { recipientPersonId: 'r1', subject: 'เปลี่ยนรถหรือเวลา', targetPath: request('f1') },
      { recipientPersonId: 'r2', subject: 'เปลี่ยนรถหรือเวลา', targetPath: request('f2') },
      { recipientPersonId: 'd2', subject: 'เปลี่ยนรถหรือเวลา', targetPath: trip('t1') },
      { recipientPersonId: 'd1', subject: 'เปลี่ยนรถหรือเวลา', targetPath: trip('t1') }
    ]);
    expect(noticesFor('changed', { tripId: 't1', actorPersonId: 'm1', requesters: [], driverPersonId: 'd1', previousDriverPersonId: 'd1' })).toHaveLength(1);
  });

  it('tells the fleet managers and the driver when a requester cancels an assigned ใบ', () => {
    expect(noticesFor('requester-cancelled', { fleetRequestId: 'f1', tripId: 't1', actorPersonId: 'req', managerPersonIds: ['m1'], driverPersonId: 'd1' })).toEqual([
      { recipientPersonId: 'm1', subject: 'ผู้ขอยกเลิกใบขอใช้รถ', targetPath: request('f1') },
      { recipientPersonId: 'd1', subject: 'ผู้ขอยกเลิกใบขอใช้รถ', targetPath: trip('t1') }
    ]);
    expect(noticesFor('requester-cancelled', { fleetRequestId: 'f1', tripId: 't1', actorPersonId: 'req', managerPersonIds: ['m1'], driverPersonId: null })).toEqual([
      { recipientPersonId: 'm1', subject: 'ผู้ขอยกเลิกใบขอใช้รถ', targetPath: request('f1') }
    ]);
  });

  it('tells the driver a เที่ยวรถ is cancelled, unless the driver did it', () => {
    expect(noticesFor('trip-cancelled', { tripId: 't1', actorPersonId: 'm1', driverPersonId: 'd1' })).toEqual([{ recipientPersonId: 'd1', subject: 'ยกเลิกงานขับ', targetPath: trip('t1') }]);
    expect(noticesFor('trip-cancelled', { tripId: 't1', actorPersonId: 'd1', driverPersonId: 'd1' })).toEqual([]);
  });
});
