import { char, customType, datetime, mysqlTable, tinyint, varchar } from 'drizzle-orm/mysql-core';

/** ตั้งค่าโปรแกรม: a module switched off by a ผู้ดูแลระบบ. No row means the module is on. */
export const adminModuleSettings = mysqlTable('admin_module_setting', { moduleCode: varchar('module_code', { length: 64 }).primaryKey(), enabled: tinyint('enabled').notNull().default(1), mode: varchar('mode', { length: 16 }).notNull().default('ON'), updatedByPersonId: varchar('updated_by_person_id', { length: 36 }), updatedAt: datetime('updated_at', { mode: 'date' }).notNull() });

/** MariaDB MEDIUMBLOB (up to 16 MB) read and written as a Buffer. */
const mediumBlob = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'mediumblob' });

/** หน้าตาระบบ: a picture the ผู้ดูแลระบบ sets for the whole site (migration 0036, SiteImageService). */
export const siteImages = mysqlTable('site_image', { slot: varchar('slot', { length: 32 }).primaryKey(), contentType: varchar('content_type', { length: 32 }).notNull(), data: mediumBlob('data').notNull(), version: char('version', { length: 16 }).notNull(), updatedByPersonId: char('updated_by_person_id', { length: 36 }).notNull(), updatedAt: datetime('updated_at', { mode: 'date' }).notNull() });
