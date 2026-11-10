import { describe, expect, it } from 'vitest';
import { buildMciBroadcast, MciLineBroadcastConsumer } from './mci-line-broadcast-consumer';
import { NotificationConsumer } from './notification-consumer';

const group = `C${'cd'.repeat(16)}`;
const incidentId = '0b6f3c1e-5d1a-4c8e-9a51-2f7c1d9e8b10';
const event = (payload: Record<string, unknown>) => ({ id: '11111111-2222-3333-4444-555555555555', type: 'mci.line.broadcast', idempotencyKey: 'k', payload, occurredAt: new Date().toISOString(), processedAt: null });

function setup(options: { route?: string | null; incident?: { title: string; kind: 'REAL' | 'DRILL' } | null; status?: number; client?: boolean } = {}) {
  const pushes: Array<{ to: string; messages: unknown[]; retryKey: string }> = [];
  const store = { routeFor: async () => (options.route === null ? null : { groupId: options.route ?? group }), incidentHeading: async () => (options.incident === undefined ? { title: 'รถบัสคว่ำ', kind: 'REAL' as const } : options.incident) };
  const client = options.client === false ? null : { push: async (to: string, messages: unknown[], retryKey: string) => { pushes.push({ to, messages, retryKey }); return options.status ?? 200; } };
  return { pushes, consumer: new MciLineBroadcastConsumer(store, client, 'https://192.168.1.20:8443/') };
}

describe('buildMciBroadcast', () => {
  it('announces a real เหตุ with the check-in link and marks a drill', () => {
    expect(buildMciBroadcast('REAL', 'OPENED', 'รถบัสคว่ำ', 'https://h/mci')).toEqual({ type: 'text', text: '[อุบัติเหตุหมู่] ประกาศเหตุ: รถบัสคว่ำ\nรายงานตัว: https://h/mci' });
    expect(buildMciBroadcast('DRILL', 'OPENED', 'ซ้อม', null).text).toBe('[ซ้อมแผน] [อุบัติเหตุหมู่] ประกาศเหตุ: ซ้อม');
    expect(buildMciBroadcast('REAL', 'CLOSED', 'รถบัสคว่ำ', 'https://h/mci').text).toBe('[อุบัติเหตุหมู่] ปิดเหตุแล้ว: รถบัสคว่ำ');
  });
});

describe('MciLineBroadcastConsumer', () => {
  it('pushes one message to the module group with the event id as the retry key', async () => {
    const { pushes, consumer } = setup();
    await consumer.consume(event({ incidentId, event: 'OPENED' }));
    expect(pushes).toEqual([{ to: group, retryKey: '11111111-2222-3333-4444-555555555555', messages: [buildMciBroadcast('REAL', 'OPENED', 'รถบัสคว่ำ', 'https://192.168.1.20:8443/mci')] }]);
  });

  it('does nothing without LINE, a group or the เหตุ', async () => {
    for (const options of [{ client: false }, { route: null }, { incident: null }]) {
      const { pushes, consumer } = setup(options);
      await consumer.consume(event({ incidentId, event: 'OPENED' }));
      expect(pushes).toEqual([]);
    }
  });

  it('treats 409 as sent, throws on any other failure and rejects a bad payload', async () => {
    await expect(setup({ status: 409 }).consumer.consume(event({ incidentId, event: 'CLOSED' }))).resolves.toBeUndefined();
    await expect(setup({ status: 500 }).consumer.consume(event({ incidentId, event: 'CLOSED' }))).rejects.toThrow('LINE_PUSH_FAILED');
    await expect(setup().consumer.consume(event({ incidentId: 'x', event: 'OPENED' }))).rejects.toThrow('INVALID_NOTIFICATION_EVENT');
  });

  it('is reached through the notification consumer', async () => {
    const seen: string[] = [];
    const consumer = new NotificationConsumer({ claim: async () => true }, { deliverEmail: async () => undefined }, { deliverInApp: async () => undefined }, undefined, undefined, { consume: async (received) => { seen.push(received.type); } });
    await consumer.consume(event({ incidentId, event: 'OPENED' }));
    expect(seen).toEqual(['mci.line.broadcast']);
  });
});
