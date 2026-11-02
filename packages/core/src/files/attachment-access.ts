import type { AccessSubject, Attachment, DownloadInput } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { isAdmin } from '../access/authorization-service';
import { LeaveQueries } from '../leave/leave-queries';
import { profileAccess } from '../hr/profile-access';
import { OfficialTravelQueries } from '../official-travel/travel-queries';
import type { DownloadAuthorizer } from './attachment-service';

/** Who may open a ไฟล์แนบส่วนตัว: its uploader, or anyone the record holding it lets see that record (a ใบลา, a trip, a person's ก.พ.7, a chat with ผู้ดูแลระบบ). */
export class AttachmentAccess implements DownloadAuthorizer {
  constructor(private readonly database: Pick<Database, 'query'>, private readonly viewer: AccessSubject) {}

  async canDownload(input: DownloadInput, attachment: Attachment): Promise<boolean> {
    if (!this.viewer.authenticated || this.viewer.personId !== input.actorPersonId) return false;
    if (attachment.createdByPersonId === input.actorPersonId) return true;
    const leaves = await this.database.query<{ id: string }>('SELECT request_id AS id FROM leave_request WHERE attachment_id = ?', [attachment.id]);
    for (const leave of leaves) if (await new LeaveQueries(this.database).detail(leave.id, this.viewer)) return true;
    const trips = await this.database.query<{ id: string }>('SELECT id FROM official_travel WHERE attachment_id = ?', [attachment.id]);
    for (const trip of trips) if (await new OfficialTravelQueries(this.database).detail(trip.id, this.viewer)) return true;
    // A ก.พ.7 file: whoever may see that person's private boxes.
    const holders = await this.database.query<{ personId: string; organizationId: string | null }>(
      `SELECT pr.person_id AS personId, (SELECT a.organization_id FROM employment_assignment a WHERE a.person_id = pr.person_id AND a.effective_until IS NULL ORDER BY a.effective_from DESC LIMIT 1) AS organizationId
       FROM hr_person_profile pr WHERE pr.kp7_attachment_id = ?`, [attachment.id]);
    for (const holder of holders) if (profileAccess(this.viewer, holder).viewPrivate) return true;
    // A picture in แชตกับผู้ดูแลระบบ: the conversation's person and every ผู้ดูแลระบบ.
    const chats = await this.database.query<{ personId: string }>('SELECT c.person_id AS personId FROM support_message m JOIN support_conversation c ON c.id = m.conversation_id WHERE m.attachment_id = ?', [attachment.id]);
    if (chats.length > 0 && (isAdmin(this.viewer) || chats.some((chat) => chat.personId === this.viewer.personId))) return true;
    return false;
  }
}
