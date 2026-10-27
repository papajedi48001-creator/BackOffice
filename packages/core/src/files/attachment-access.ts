import type { AccessSubject, Attachment, DownloadInput } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { LeaveQueries } from '../leave/leave-queries';
import { OfficialTravelQueries } from '../official-travel/travel-queries';
import type { DownloadAuthorizer } from './attachment-service';

/** Who may open a ไฟล์แนบส่วนตัว: its uploader, or anyone the record holding it lets see that record. */
export class AttachmentAccess implements DownloadAuthorizer {
  constructor(private readonly database: Pick<Database, 'query'>, private readonly viewer: AccessSubject) {}

  async canDownload(input: DownloadInput, attachment: Attachment): Promise<boolean> {
    if (!this.viewer.authenticated || this.viewer.personId !== input.actorPersonId) return false;
    if (attachment.createdByPersonId === input.actorPersonId) return true;
    const leaves = await this.database.query<{ id: string }>('SELECT request_id AS id FROM leave_request WHERE attachment_id = ?', [attachment.id]);
    for (const leave of leaves) if (await new LeaveQueries(this.database).detail(leave.id, this.viewer)) return true;
    const trips = await this.database.query<{ id: string }>('SELECT id FROM official_travel WHERE attachment_id = ?', [attachment.id]);
    for (const trip of trips) if (await new OfficialTravelQueries(this.database).detail(trip.id, this.viewer)) return true;
    return false;
  }
}
