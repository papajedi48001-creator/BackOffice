import { datetime, mysqlTable, primaryKey, varchar } from 'drizzle-orm/mysql-core';

// Smart Money (migration 0038): เจ้าหน้าที่ Smart Money and the pages each may open. ผู้ดูแล are not listed here.
const uuid = (name: string) => varchar(name, { length: 36 });

export const moneyMembers = mysqlTable('money_member', { personId: uuid('person_id').primaryKey(), createdAt: datetime('created_at', { mode: 'date' }).notNull(), createdBy: uuid('created_by').notNull() });
export const moneyMemberPages = mysqlTable('money_member_page', { personId: uuid('person_id').notNull(), page: varchar('page', { length: 16 }).notNull() }, (t) => [primaryKey({ columns: [t.personId, t.page] })]);
