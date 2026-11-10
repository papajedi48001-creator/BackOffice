import { lineAlertPayloadSchema, type OutboxEvent } from '@backoffice/contracts';

export interface WorkerLineStore { routeFor(moduleCode: string): Promise<{ groupId: string } | null>; lineUserIdOf(personId: string): Promise<string | null>; }
/** Sends one push request and returns LINE's HTTP status; throws only when LINE could not be reached. */
export interface WorkerLineClient { push(to: string, messages: unknown[], retryKey: string): Promise<number>; }
export interface LineTextV2Message { type: 'textV2'; text: string; substitution: { m: { type: 'mention'; mentionee: { type: 'user'; userId: string } } } }

/** Module names as the web registry shows them (checked against @backoffice/i18n in the test); the worker loads no i18n at run time. */
export const lineModuleLabels: Readonly<Record<string, string>> = {
  requests: 'คำขอ',
  'room-booking': 'จองห้องประชุม',
  leave: 'การลา',
  'official-travel': 'ไปราชการ',
  inventory: 'คลังพัสดุ',
  fleet: 'ยานพาหนะ',
  'mass-casualty': 'อุบัติเหตุหมู่'
};

/** `@ชื่อ [โมดูล] มีคำขอใหม่ 1 รายการ` and the page link. Nothing about the requester or the request leaves the hospital. */
export function buildLineAlertMessage(moduleLabel: string, lineUserId: string, link: string | null): LineTextV2Message {
  return { type: 'textV2', text: `{m} [${moduleLabel}] มีคำขอใหม่ 1 รายการ${link ? `\n${link}` : ''}`, substitution: { m: { type: 'mention', mentionee: { type: 'user', userId: lineUserId } } } };
}

/**
 * `notification.line`: pushes the alert into the module's กลุ่มแจ้งเตือน and @mentions the recipient. Nothing is sent, and the
 * event counts as done, when LINE is not configured, the module has no group (or the bot left it), or the recipient has not
 * connected LINE. The outbox event id is LINE's retry key, so a retried event is never shown twice (LINE answers 409).
 */
export class LineAlertConsumer {
  constructor(private readonly store: WorkerLineStore, private readonly client: WorkerLineClient | null, private readonly publicUrl: string | null) {}

  async consume(event: OutboxEvent): Promise<void> {
    const parsed = lineAlertPayloadSchema.safeParse(event.payload);
    if (!parsed.success) throw new Error('INVALID_NOTIFICATION_EVENT');
    if (!this.client) return;
    const alert = parsed.data;
    const route = await this.store.routeFor(alert.moduleCode);
    if (!route) return;
    const lineUserId = await this.store.lineUserIdOf(alert.recipientPersonId);
    if (!lineUserId) return;
    const link = this.publicUrl ? `${this.publicUrl.replace(/\/+$/, '')}${alert.targetPath}` : null;
    const label = lineModuleLabels[alert.moduleCode] ?? 'Back Office';
    const status = await this.client.push(route.groupId, [buildLineAlertMessage(label, lineUserId, link)], event.id);
    if ((status >= 200 && status < 300) || status === 409) return;
    throw new Error('LINE_PUSH_FAILED');
  }
}
