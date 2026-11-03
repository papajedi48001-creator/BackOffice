import { describe, expect, it } from 'vitest';
import { lineAlertModuleCodes } from '@backoffice/contracts';
import { th } from '@backoffice/i18n';
import { buildLineAlertMessage, LineAlertConsumer, lineModuleLabels } from './line-alert-consumer';

const user = `U${'ab'.repeat(16)}`;
const group = `C${'cd'.repeat(16)}`;
const event = (payload: Record<string, unknown>) => ({ id: '11111111-2222-3333-4444-555555555555', type: 'notification.line', idempotencyKey: 'notification.line:e', payload, occurredAt: new Date().toISOString(), processedAt: null });
const alert = { recipientPersonId: 'person-1', moduleCode: 'room-booking', targetPath: '/rooms/bookings/b-1' };

function setup(options: { route?: string | null; lineUserId?: string | null; status?: number; client?: boolean; publicUrl?: string | null } = {}) {
  const pushes: Array<{ to: string; messages: unknown[]; retryKey: string }> = [];
  const store = { routeFor: async () => (options.route === null ? null : { groupId: options.route ?? group }), lineUserIdOf: async () => (options.lineUserId === undefined ? user : options.lineUserId) };
  const client = options.client === false ? null : { push: async (to: string, messages: unknown[], retryKey: string) => { pushes.push({ to, messages, retryKey }); return options.status ?? 200; } };
  return { pushes, consumer: new LineAlertConsumer(store, client, options.publicUrl === undefined ? 'https://192.168.1.20:8443/' : options.publicUrl) };
}

describe('buildLineAlertMessage', () => {
  it('mentions the person, names the module and links the page', () => {
    expect(buildLineAlertMessage('จองห้องประชุม', user, 'https://h/rooms/bookings/b-1')).toEqual({
      type: 'textV2', text: '{m} [จองห้องประชุม] มีคำขอใหม่ 1 รายการ\nhttps://h/rooms/bookings/b-1',
      substitution: { m: { type: 'mention', mentionee: { type: 'user', userId: user } } }
    });
    expect(buildLineAlertMessage('การลา', user, null).text).toBe('{m} [การลา] มีคำขอใหม่ 1 รายการ');
  });

  it('uses the same module names as the web app', () => {
    expect(Object.keys(lineModuleLabels)).toEqual([...lineAlertModuleCodes]);
    expect(lineModuleLabels).toEqual({ requests: th.requests, 'room-booking': th.moduleRoomBooking, leave: th.moduleLeave, 'official-travel': th.moduleTravel, inventory: th.moduleInventory, fleet: th.moduleFleet });
  });
});

describe('LineAlertConsumer', () => {
  it('pushes to the module group with the event id as the retry key', async () => {
    const { pushes, consumer } = setup();
    await consumer.consume(event(alert));
    expect(pushes).toEqual([{ to: group, retryKey: '11111111-2222-3333-4444-555555555555', messages: [buildLineAlertMessage('จองห้องประชุม', user, 'https://192.168.1.20:8443/rooms/bookings/b-1')] }]);
  });

  it.each([
    ['LINE is not configured', { client: false }],
    ['the module has no group (or the bot left it)', { route: null }],
    ['the recipient has not connected LINE', { lineUserId: null }]
  ] as const)('sends nothing when %s', async (_name, options) => {
    const { pushes, consumer } = setup(options);
    await expect(consumer.consume(event(alert))).resolves.toBeUndefined();
    expect(pushes).toEqual([]);
  });

  it('treats 409 (this retry key was already accepted) as sent, and fails on other errors so the outbox retries', async () => {
    await expect(setup({ status: 409 }).consumer.consume(event(alert))).resolves.toBeUndefined();
    await expect(setup({ status: 500 }).consumer.consume(event(alert))).rejects.toThrow('LINE_PUSH_FAILED');
    await expect(setup({ status: 429 }).consumer.consume(event(alert))).rejects.toThrow('LINE_PUSH_FAILED');
  });

  it('refuses a payload that is not a LINE alert', async () => {
    await expect(setup().consumer.consume(event({ recipientPersonId: 'p', moduleCode: 'leave', targetPath: 'https://evil' }))).rejects.toThrow('INVALID_NOTIFICATION_EVENT');
  });

  it('leaves the link line out without a public URL', async () => {
    const { pushes, consumer } = setup({ publicUrl: null });
    await consumer.consume(event(alert));
    expect((pushes[0]!.messages[0] as { text: string }).text).toBe('{m} [จองห้องประชุม] มีคำขอใหม่ 1 รายการ');
  });
});
