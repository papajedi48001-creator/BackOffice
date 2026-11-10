import { MCI_MODULE, mciLineBroadcastPayloadSchema, type MciIncidentKind, type OutboxEvent } from '@backoffice/contracts';
import type { WorkerLineClient } from './line-alert-consumer.ts';

export interface WorkerMciStore { routeFor(moduleCode: string): Promise<{ groupId: string } | null>; incidentHeading(incidentId: string): Promise<{ title: string; kind: MciIncidentKind } | null>; }
export interface LineTextMessage { type: 'text'; text: string }

/** `[อุบัติเหตุหมู่] ประกาศเหตุ: <ชื่อเหตุ>` and the รายงานตัว link, or the closing line; a drill is marked `[ซ้อมแผน]`. */
export function buildMciBroadcast(kind: MciIncidentKind, event: 'OPENED' | 'CLOSED', title: string, link: string | null): LineTextMessage {
  const prefix = kind === 'DRILL' ? '[ซ้อมแผน] ' : '';
  const text = event === 'OPENED' ? `${prefix}[อุบัติเหตุหมู่] ประกาศเหตุ: ${title}${link ? `\nรายงานตัว: ${link}` : ''}` : `${prefix}[อุบัติเหตุหมู่] ปิดเหตุแล้ว: ${title}`;
  return { type: 'text', text };
}

/**
 * `mci.line.broadcast`: one message to the อุบัติเหตุหมู่ LINE group when a เหตุ opens or closes (a group message, not one
 * @mention per person, so calling a hundred people is one message). Done without sending when LINE, the group or the เหตุ is missing.
 */
export class MciLineBroadcastConsumer {
  constructor(private readonly store: WorkerMciStore, private readonly client: WorkerLineClient | null, private readonly publicUrl: string | null) {}

  async consume(event: OutboxEvent): Promise<void> {
    const parsed = mciLineBroadcastPayloadSchema.safeParse(event.payload);
    if (!parsed.success) throw new Error('INVALID_NOTIFICATION_EVENT');
    if (!this.client) return;
    const route = await this.store.routeFor(MCI_MODULE);
    if (!route) return;
    const incident = await this.store.incidentHeading(parsed.data.incidentId);
    if (!incident) return;
    const link = this.publicUrl ? `${this.publicUrl.replace(/\/+$/, '')}/mci` : null;
    const status = await this.client.push(route.groupId, [buildMciBroadcast(incident.kind, parsed.data.event, incident.title, link)], event.id);
    if ((status >= 200 && status < 300) || status === 409) return;
    throw new Error('LINE_PUSH_FAILED');
  }
}
