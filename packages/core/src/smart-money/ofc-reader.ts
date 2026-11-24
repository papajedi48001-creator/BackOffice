import { createDatabase } from '@backoffice/db';
import { hosxpConnectionUrl } from '../holidays/hosxp-settings-service';
import { isReadOnlySelect, withReadOnlyFallback } from './hosxp-read-only';
import type { OfcReader } from './ofc-service';
import type { OfcRow } from './ofc-summary';
import { fixThaiText } from './thai-text';

/** Instrument (อวัยวะเทียมและอุปกรณ์บำบัดรักษา) ADP code counted by Monitor Instrument OFC. */
export const OFC_ADP_CODE = '8610';
/** สิทธิข้าราชการ: `pttype.hipdata_code`. */
export const OFC_HIPDATA = 'OFC';

/**
 * Outpatient visits of สิทธิ OFC (`ovst.pttype` → `pttype.hipdata_code`) in the range with an `opitemrece` line whose
 * `nondrugitems.nhso_adp_code` is the instrument code; one row per vn and icode with qty and sum_price summed.
 */
export const OFC_SQL = `
    SELECT ov.vstdate, o.vn, MAX(ov.hn) AS hn, o.icode,
           MAX(CONCAT_WS(' ', p.pname, p.fname, p.lname)) AS patient_name,
           MAX(n.name) AS item_name,
           SUM(o.qty) AS qty,
           SUM(o.sum_price) AS sum_price,
           MAX(ov.pttype) AS pttype,
           MAX(pt.name) AS pttype_name
      FROM ovst ov
     INNER JOIN pttype pt ON pt.pttype = ov.pttype
     INNER JOIN opitemrece o ON o.vn = ov.vn
     INNER JOIN nondrugitems n ON n.icode = o.icode
      LEFT JOIN patient p ON p.hn = ov.hn
     WHERE ov.vstdate BETWEEN ? AND ?
       AND n.nhso_adp_code = ?
       AND pt.hipdata_code = ?
     GROUP BY ov.vstdate, o.vn, o.icode
     ORDER BY ov.vstdate, o.vn, o.icode`;

/** The SQL and its parameters; the codes are bound, never inlined. */
export function ofcQuery(start: string, end: string): { sql: string; params: string[] } {
  return { sql: OFC_SQL, params: [start, end, OFC_ADP_CODE, OFC_HIPDATA] };
}

type Raw = Record<string, unknown>;
const plain = (value: unknown) => (value === null || value === undefined ? '' : value instanceof Date ? value.toISOString() : String(value));
const text = (value: unknown) => fixThaiText(plain(value)).trim();

/** The one SELECT in a READ ONLY transaction on HOSxP, after the text guard. The URL holds the password, so it is never logged. */
export const readOfc: OfcReader = async (connection, start, end) => {
  const { sql, params } = ofcQuery(start, end);
  if (!isReadOnlySelect(sql)) throw new Error('ofc: only SELECT is allowed');
  const hosxp = createDatabase(hosxpConnectionUrl(connection));
  try {
    const rows = await withReadOnlyFallback(hosxp, (tx) => tx.query<Raw>(sql, params));
    return rows.map((row): OfcRow => ({
      vstdate: plain(row.vstdate).slice(0, 10), vn: plain(row.vn), hn: plain(row.hn), name: text(row.patient_name), icode: plain(row.icode),
      itemName: text(row.item_name), qty: Number(row.qty ?? 0), sumPrice: Number(row.sum_price ?? 0), pttype: plain(row.pttype), pttypeName: text(row.pttype_name)
    }));
  } finally { await hosxp.close(); }
};
