import type { Database } from '@backoffice/db';

export interface LinkedAttachment { attachmentId: string; filename: string | null }

/** A record may hold only a file its own person uploaded. */
export async function ownsAttachment(database: Pick<Database, 'query'>, attachmentId: string, personId: string): Promise<boolean> {
  return (await database.query('SELECT id FROM attachment WHERE id = ? AND created_by_person_id = ?', [attachmentId, personId])).length > 0;
}

/** The file a row of `table` holds, for showing a link to it. */
export async function linkedAttachment(database: Pick<Database, 'query'>, table: 'leave_request' | 'official_travel', keyColumn: 'request_id' | 'id', key: string): Promise<LinkedAttachment | null> {
  const [row] = await database.query<LinkedAttachment>(`SELECT a.id AS attachmentId, a.original_filename AS filename FROM ${table} r JOIN attachment a ON a.id = r.attachment_id WHERE r.${keyColumn} = ?`, [key]);
  return row ?? null;
}
