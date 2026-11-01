import { datetime, mysqlTable, tinyint, varchar } from 'drizzle-orm/mysql-core';

/** ตั้งค่าโปรแกรม: a module switched off by a ผู้ดูแลระบบ. No row means the module is on. */
export const adminModuleSettings = mysqlTable('admin_module_setting', { moduleCode: varchar('module_code', { length: 64 }).primaryKey(), enabled: tinyint('enabled').notNull().default(1), updatedByPersonId: varchar('updated_by_person_id', { length: 36 }), updatedAt: datetime('updated_at', { mode: 'date' }).notNull() });
