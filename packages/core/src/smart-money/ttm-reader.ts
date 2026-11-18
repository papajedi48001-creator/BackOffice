import { createDatabase } from '@backoffice/db';
import { hosxpConnectionUrl } from '../holidays/hosxp-settings-service';
import type { TtmReader } from './ttm-service';
import type { TtmItem } from './ttm-rules';
import type { TtmServiceRow, TtmVisit } from './ttm-summary';
import { fixThaiText } from './thai-text';

/** vn that came for แพทย์แผนไทย in the range. */
const VN_SUBQUERY = 'SELECT hs.vn FROM health_med_service hs WHERE hs.service_date BETWEEN ? AND ?';

/**
 * The legacy `TtmRepository` queries, unchanged but for positional parameters. Services keep `h1.*` as the กลุ่มงาน query did (the AN
 * column is read only when the table has one).
 */
export const TTM_SQL = {
  services: `
    SELECT h1.*, h2.health_med_service_type_name, d1.health_med_doctor_name, h3.health_med_treatment_type_name,
           CONCAT(p.pname, p.fname, ' ', p.lname) AS patient_name
      FROM health_med_service h1
      LEFT OUTER JOIN health_med_service_type h2 ON h2.health_med_service_type_id = h1.health_med_service_type_id
      LEFT OUTER JOIN health_med_doctor d1 ON d1.health_med_doctor_id = h1.health_med_doctor_id
      LEFT OUTER JOIN health_med_treatment_type h3 ON h3.health_med_treatment_type_id = h1.health_med_treatment_type_id
      LEFT OUTER JOIN patient p ON p.hn = h1.hn
     WHERE h1.service_date BETWEEN ? AND ?
     ORDER BY h1.service_date, h1.service_time`,
  visits: `
    SELECT o.vn, o.an, o.pttype, pt.name AS pttype_name, pt.hipdata_code
      FROM ovst o
      LEFT JOIN pttype pt ON pt.pttype = o.pttype
     WHERE o.vn IN (${VN_SUBQUERY})`,
  items: `
    SELECT o.vn, o.icode, o.income,
           MAX(i.name) AS income_name,
           MAX(COALESCE(d.name, n.name)) AS item_name,
           MAX(CASE WHEN d.icode IS NULL THEN 0 ELSE 1 END) AS is_drug,
           SUM(o.qty) AS qty,
           SUM(o.sum_price) AS amount
      FROM opitemrece o
      LEFT JOIN income i ON i.income = o.income
      LEFT JOIN drugitems d ON d.icode = o.icode
      LEFT JOIN nondrugitems n ON n.icode = o.icode
     WHERE o.vn IN (${VN_SUBQUERY})
     GROUP BY o.vn, o.icode, o.income`
} as const;

/** The legacy guard: one statement that starts with SELECT and names no write or lock command. */
export function isTtmReadOnlySql(sql: string): boolean {
  const text = sql.trim().toUpperCase();
  if (!text.startsWith('SELECT') || text.includes(';')) return false;
  return !/\b(INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|CREATE|TRUNCATE|GRANT|RENAME|LOCK|CALL|INTO\s+OUTFILE)\b/.test(text);
}

type Raw = Record<string, unknown>;
const text = (value: unknown) => fixThaiText(value === null || value === undefined ? '' : String(value));
const plain = (value: unknown) => (value === null || value === undefined ? '' : String(value));

/**
 * The three SELECTs in one READ ONLY transaction on HOSxP, after the text guard; nothing is ever written there.
 * The URL holds the password, so it is built in memory only and never logged.
 */
export const readTtm: TtmReader = async (connection, start, end) => {
  const hosxp = createDatabase(hosxpConnectionUrl(connection));
  try {
    return await hosxp.transaction(async (tx) => {
      const select = (sql: string) => {
        if (!isTtmReadOnlySql(sql)) throw new Error('ttm: only SELECT is allowed');
        return tx.query<Raw>(sql, [start, end]);
      };
      const [services, visits, items] = [await select(TTM_SQL.services), await select(TTM_SQL.visits), await select(TTM_SQL.items)];
      return {
        services: services.map((row): TtmServiceRow => ({
          vn: plain(row.vn), hn: plain(row.hn), an: plain(row.an), serviceDate: plain(row.service_date).slice(0, 10), serviceTime: plain(row.service_time),
          typeId: plain(row.health_med_service_type_id), typeName: text(row.health_med_service_type_name), doctorName: text(row.health_med_doctor_name),
          treatmentName: text(row.health_med_treatment_type_name), patientName: text(row.patient_name)
        })),
        visits: visits.map((row): TtmVisit => ({ vn: plain(row.vn), an: plain(row.an), pttype: plain(row.pttype), pttypeName: text(row.pttype_name), hipdata: plain(row.hipdata_code) })),
        items: items.map((row): TtmItem => ({
          vn: plain(row.vn), icode: plain(row.icode), income: plain(row.income), incomeName: text(row.income_name), itemName: text(row.item_name),
          isDrug: Number(row.is_drug) === 1, qty: Number(row.qty ?? 0), amount: Number(row.amount ?? 0)
        }))
      };
    }, { readOnly: true });
  } finally { await hosxp.close(); }
};
