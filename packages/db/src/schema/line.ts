import { datetime, mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';

/** บัญชี LINE ที่เชื่อมต่อ: one LINE user id per person and one person per LINE user id. */
export const lineAccountLinks = mysqlTable('line_account_link', { personId: varchar('person_id', { length: 36 }).primaryKey(), lineUserId: varchar('line_user_id', { length: 33 }).notNull(), linkedAt: datetime('linked_at', { mode: 'date' }).notNull() }, (t) => [uniqueIndex('line_account_link_user_unique').on(t.lineUserId)]);
/** รหัสเชื่อมต่อ LINE: only the sha256 of the code is kept; one live code per person. */
export const lineLinkCodes = mysqlTable('line_link_code', { codeHash: varchar('code_hash', { length: 64 }).primaryKey(), personId: varchar('person_id', { length: 36 }).notNull(), expiresAt: datetime('expires_at', { mode: 'date' }).notNull(), createdAt: datetime('created_at', { mode: 'date' }).notNull() }, (t) => [uniqueIndex('line_link_code_person_unique').on(t.personId)]);
/** กลุ่ม LINE: a group the bot joined (WEBHOOK) or that ผู้ดูแลระบบ typed in (MANUAL). */
export const lineGroups = mysqlTable('line_group', { groupId: varchar('group_id', { length: 33 }).primaryKey(), displayName: varchar('display_name', { length: 120 }), source: varchar('source', { length: 16 }).notNull(), joinedAt: datetime('joined_at', { mode: 'date' }).notNull(), leftAt: datetime('left_at', { mode: 'date' }) });
/** กลุ่มแจ้งเตือนของโมดูล. */
export const lineModuleRoutes = mysqlTable('line_module_route', { moduleCode: varchar('module_code', { length: 64 }).primaryKey(), groupId: varchar('group_id', { length: 33 }).notNull(), updatedByPersonId: varchar('updated_by_person_id', { length: 36 }).notNull(), updatedAt: datetime('updated_at', { mode: 'date' }).notNull() });
