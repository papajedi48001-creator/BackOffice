import { char, date, datetime, decimal, int, longtext, mysqlEnum, mysqlTable, primaryKey, smallint, varchar } from 'drizzle-orm/mysql-core';

// Smart Money (migration 0038): เจ้าหน้าที่ Smart Money and the pages each may open. ผู้ดูแล are not listed here.
const uuid = (name: string) => varchar(name, { length: 36 });

export const moneyMembers = mysqlTable('money_member', { personId: uuid('person_id').primaryKey(), createdAt: datetime('created_at', { mode: 'date' }).notNull(), createdBy: uuid('created_by').notNull() });
export const moneyMemberPages = mysqlTable('money_member_page', { personId: uuid('person_id').notNull(), page: varchar('page', { length: 16 }).notNull() }, (t) => [primaryKey({ columns: [t.personId, t.page] })]);

// เงินโอน สปสช. (migration 0041): one report per หน่วยบริการ and ปีงบ; a new upload replaces it. `rows_json` is the sheet as the browser read it.
export const moneyNhsoDatasets = mysqlTable('money_nhso_dataset', {
  hcode: char('hcode', { length: 5 }).notNull(), fy: smallint('fy').notNull(), name: varchar('name', { length: 255 }).notNull(), region: varchar('region', { length: 255 }).notNull(),
  dateFrom: date('date_from', { mode: 'string' }), dateTo: date('date_to', { mode: 'string' }), fileName: varchar('file_name', { length: 255 }).notNull(),
  rowCount: int('row_count').notNull(), transferTotal: decimal('transfer_total', { precision: 15, scale: 2 }).notNull(), rowsJson: longtext('rows_json').notNull(),
  uploadedAt: datetime('uploaded_at', { mode: 'date' }).notNull(), uploadedBy: uuid('uploaded_by').notNull()
}, (t) => [primaryKey({ columns: [t.hcode, t.fy] })]);

/** ติดตามกองทุนย่อย FDH: one REP or STM document; the parsed document (with PID and names) is stored encrypted. */
export const moneyFdhDocuments = mysqlTable('money_fdh_document', {
  kind: mysqlEnum('kind', ['rep', 'stm']).notNull(), docNo: varchar('doc_no', { length: 100 }).notNull(), hcode: char('hcode', { length: 5 }),
  hname: varchar('hname', { length: 255 }).notNull(), period: varchar('period', { length: 50 }).notNull(), reportDate: date('report_date', { mode: 'string' }),
  fileName: varchar('file_name', { length: 255 }).notNull(), itemCount: int('item_count').notNull(), moneySum: decimal('money_sum', { precision: 15, scale: 2 }).notNull(),
  documentCiphertext: longtext('document_ciphertext').notNull(), uploadedAt: datetime('uploaded_at', { mode: 'date' }).notNull(), uploadedBy: uuid('uploaded_by').notNull()
}, (t) => [primaryKey({ columns: [t.kind, t.docNo] })]);
