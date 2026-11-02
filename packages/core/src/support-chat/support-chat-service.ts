import { randomUUID } from 'node:crypto';
import { supportChatImageContentTypeSchema, supportMessageInputSchema, type AccessSubject, type SupportConversationSummary, type SupportMessage, type SupportMessageInput } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { isAdmin } from '../access/authorization-service';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';

type Tx = Pick<Database, 'execute' | 'query'>;
export type SupportChatFailure = 'FORBIDDEN' | 'NOT_FOUND' | 'EMPTY_MESSAGE' | 'INVALID_ATTACHMENT';
type Failure = { ok: false; code: SupportChatFailure };
export type SentMessage = { ok: true; id: string; conversationId: string } | Failure;

const MESSAGE_LIMIT = 200;
const iso = (column: string) => `DATE_FORMAT(${column}, '%Y-%m-%dT%H:%i:%s.%fZ')`;
type MessageRow = { id: string; fromAdmin: number; senderName: string | null; body: string | null; attachmentId: string | null; createdAt: string };

/**
 * แชตกับผู้ดูแลระบบ. A person has one conversation, always with ผู้ดูแลระบบ as a group, so there is no recipient to choose and
 * no way to reach another person. Every ผู้ดูแลระบบ reads and answers every conversation. Every check is made here, on the server.
 * A message, its conversation's timestamp and its audit row share one transaction; the audit row never holds the text.
 */
export class SupportChatService {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID) {}

  async sendAsPerson(subject: AccessSubject, input: SupportMessageInput): Promise<SentMessage> {
    const personId = subject.authenticated ? subject.personId : null;
    if (!personId) return { ok: false, code: 'FORBIDDEN' };
    const message = supportMessageInputSchema.safeParse(input);
    if (!message.success) return { ok: false, code: 'EMPTY_MESSAGE' };
    return this.database.transaction(async (tx) => {
      if (message.data.attachmentId && !(await this.isOwnPicture(tx, message.data.attachmentId, personId))) return { ok: false as const, code: 'INVALID_ATTACHMENT' as const };
      // INSERT IGNORE on the unique person_id, so two first messages at once still share one conversation.
      await tx.execute('INSERT IGNORE INTO support_conversation (id, person_id, created_at, last_message_at) VALUES (?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))', [this.createId(), personId]);
      const [conversation] = await tx.query<{ id: string }>('SELECT id FROM support_conversation WHERE person_id = ? FOR UPDATE', [personId]);
      return this.append(tx, conversation!.id, personId, false, message.data);
    });
  }

  async sendAsAdmin(subject: AccessSubject, conversationId: string, input: SupportMessageInput): Promise<SentMessage> {
    if (!isAdmin(subject)) return { ok: false, code: 'FORBIDDEN' };
    const adminId = subject.personId!;
    const message = supportMessageInputSchema.safeParse(input);
    if (!message.success) return { ok: false, code: 'EMPTY_MESSAGE' };
    return this.database.transaction(async (tx) => {
      const [conversation] = await tx.query<{ id: string }>('SELECT id FROM support_conversation WHERE id = ? FOR UPDATE', [conversationId]);
      if (!conversation) return { ok: false as const, code: 'NOT_FOUND' as const };
      if (message.data.attachmentId && !(await this.isOwnPicture(tx, message.data.attachmentId, adminId))) return { ok: false as const, code: 'INVALID_ATTACHMENT' as const };
      return this.append(tx, conversation.id, adminId, true, message.data);
    });
  }

  /** The signed-in person's own conversation, oldest first; empty before their first message. */
  async myMessages(subject: AccessSubject): Promise<SupportMessage[]> {
    const conversationId = await this.ownConversationId(subject);
    return conversationId ? this.messages(conversationId, 'person') : [];
  }

  async adminMessages(subject: AccessSubject, conversationId: string): Promise<{ ok: true; person: { id: string; displayName: string | null; positionTitle: string | null }; messages: SupportMessage[] } | Failure> {
    if (!isAdmin(subject)) return { ok: false, code: 'FORBIDDEN' };
    const [row] = await this.database.query<{ id: string; displayName: string | null; positionTitle: string | null }>('SELECT p.id, p.display_name AS displayName, p.position_title AS positionTitle FROM support_conversation c JOIN person p ON p.id = c.person_id WHERE c.id = ?', [conversationId]);
    if (!row) return { ok: false, code: 'NOT_FOUND' };
    return { ok: true, person: row, messages: await this.messages(conversationId, 'admin') };
  }

  /** Every conversation, newest first, with how many of the person's messages no ผู้ดูแลระบบ has read yet. */
  async adminInbox(subject: AccessSubject): Promise<{ ok: true; conversations: SupportConversationSummary[] } | Failure> {
    if (!isAdmin(subject)) return { ok: false, code: 'FORBIDDEN' };
    const rows = await this.database.query<Omit<SupportConversationSummary, 'lastHasImage' | 'unread'> & { lastHasImage: number | null; unread: number }>(`
      SELECT c.id, c.person_id AS personId, p.display_name AS displayName, p.position_title AS positionTitle, ${iso('c.last_message_at')} AS lastMessageAt,
        (SELECT m.body FROM support_message m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS lastMessage,
        (SELECT m.attachment_id IS NOT NULL FROM support_message m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS lastHasImage,
        (SELECT COUNT(*) FROM support_message m WHERE m.conversation_id = c.id AND m.from_admin = 0 AND (c.admin_read_at IS NULL OR m.created_at > c.admin_read_at)) AS unread
      FROM support_conversation c JOIN person p ON p.id = c.person_id ORDER BY c.last_message_at DESC LIMIT 200`);
    return { ok: true, conversations: rows.map((row) => ({ ...row, lastHasImage: Boolean(row.lastHasImage), unread: Number(row.unread) })) };
  }

  async markReadByPerson(subject: AccessSubject): Promise<void> {
    const conversationId = await this.ownConversationId(subject);
    if (conversationId) await this.database.execute('UPDATE support_conversation SET person_read_at = last_message_at WHERE id = ?', [conversationId]);
  }

  async markReadByAdmin(subject: AccessSubject, conversationId: string): Promise<{ ok: true } | Failure> {
    if (!isAdmin(subject)) return { ok: false, code: 'FORBIDDEN' };
    await this.database.execute('UPDATE support_conversation SET admin_read_at = last_message_at WHERE id = ?', [conversationId]);
    return { ok: true };
  }

  /** For the chat button: ผู้ดูแลระบบ see how many conversations wait for them; anyone else, how many replies they have not read. */
  async unreadCount(subject: AccessSubject): Promise<number> {
    if (!subject.authenticated || !subject.personId) return 0;
    if (isAdmin(subject)) {
      const [row] = await this.database.query<{ total: number }>('SELECT COUNT(DISTINCT c.id) AS total FROM support_conversation c JOIN support_message m ON m.conversation_id = c.id WHERE m.from_admin = 0 AND (c.admin_read_at IS NULL OR m.created_at > c.admin_read_at)');
      return Number(row?.total ?? 0);
    }
    const [row] = await this.database.query<{ total: number }>('SELECT COUNT(*) AS total FROM support_conversation c JOIN support_message m ON m.conversation_id = c.id WHERE c.person_id = ? AND m.from_admin = 1 AND (c.person_read_at IS NULL OR m.created_at > c.person_read_at)', [subject.personId]);
    return Number(row?.total ?? 0);
  }

  private async ownConversationId(subject: AccessSubject): Promise<string | null> {
    if (!subject.authenticated || !subject.personId) return null;
    const [row] = await this.database.query<{ id: string }>('SELECT id FROM support_conversation WHERE person_id = ?', [subject.personId]);
    return row?.id ?? null;
  }

  /** `side`: whose view this is. ผู้ดูแลระบบ see every admin reply as their side of the chat, whoever wrote it. */
  private async messages(conversationId: string, side: 'person' | 'admin'): Promise<SupportMessage[]> {
    const rows = await this.database.query<MessageRow>(`SELECT * FROM (
        SELECT m.id, m.from_admin AS fromAdmin, p.display_name AS senderName, m.body, m.attachment_id AS attachmentId, ${iso('m.created_at')} AS createdAt, m.created_at AS sortAt
        FROM support_message m JOIN person p ON p.id = m.sender_person_id WHERE m.conversation_id = ? ORDER BY m.created_at DESC, m.id DESC LIMIT ${MESSAGE_LIMIT}
      ) recent ORDER BY sortAt, id`, [conversationId]);
    return rows.map((row) => ({ id: row.id, fromAdmin: Boolean(row.fromAdmin), senderName: row.senderName, body: row.body, attachmentId: row.attachmentId, createdAt: row.createdAt, mine: Boolean(row.fromAdmin) === (side === 'admin') }));
  }

  private async isOwnPicture(tx: Tx, attachmentId: string, personId: string): Promise<boolean> {
    const [row] = await tx.query<{ contentType: string }>('SELECT content_type AS contentType FROM attachment WHERE id = ? AND created_by_person_id = ?', [attachmentId, personId]);
    return Boolean(row && supportChatImageContentTypeSchema.safeParse(row.contentType).success);
  }

  private async append(tx: Tx, conversationId: string, senderPersonId: string, fromAdmin: boolean, message: SupportMessageInput): Promise<SentMessage> {
    const id = this.createId();
    await tx.execute('INSERT INTO support_message (id, conversation_id, sender_person_id, from_admin, body, attachment_id, created_at) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))', [id, conversationId, senderPersonId, fromAdmin ? 1 : 0, message.body ?? null, message.attachmentId ?? null]);
    // A sender has read everything up to their own message. The time is the message's own, so read markers compare exactly.
    const sentAt = '(SELECT created_at FROM support_message WHERE id = ?)';
    await tx.execute(`UPDATE support_conversation SET last_message_at = GREATEST(last_message_at, ${sentAt}), ${fromAdmin ? 'admin_read_at' : 'person_read_at'} = GREATEST(last_message_at, ${sentAt}) WHERE id = ?`, [id, id, conversationId]);
    await new AuditService(new DatabaseAuditRepository(tx), this.createId).recordAudit({ actorPersonId: senderPersonId, action: 'support.message.sent', targetType: 'support_conversation', targetId: conversationId, result: 'SUCCESS', metadata: { conversationId, hasAttachment: Boolean(message.attachmentId) } });
    return { ok: true, id, conversationId };
  }
}
