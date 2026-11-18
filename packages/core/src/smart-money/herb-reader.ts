import { createDatabase } from '@backoffice/db';
import { hosxpConnectionUrl } from '../holidays/hosxp-settings-service';
import type { HerbReader } from './herb-service';
import type { HerbRow } from './herb-summary';
import { fixThaiText } from './thai-text';
import { isTtmReadOnlySql, withReadOnlyFallback } from './ttm-reader';

/**
 * The legacy `HerbRepository` query: herbal `opitemrece` lines of every department (OPD and IPD) by `rxdate`, grouped by date, vn,
 * an and icode, with `drugitems` cost and standard price and the สิทธิ of the admission (`ipt`) or the visit (`ovst`).
 * `{icodes}` becomes one `?` per icode.
 */
export const HERB_SQL = `
    SELECT o.rxdate, o.vn, o.an, o.icode,
           MAX(o.hn) AS hn,
           SUM(o.qty) AS qty,
           SUM(o.sum_price) AS sum_price,
           MAX(CONCAT_WS(' ', d.name, d.strength)) AS drug_name,
           MAX(d.units) AS units,
           MAX(d.unitcost) AS unitcost,
           MAX(d.stdprice) AS stdprice,
           MAX(COALESCE(NULLIF(ip.pttype, ''), ov.pttype)) AS pttype,
           MAX(pt.name) AS pttype_name,
           MAX(pt.hipdata_code) AS hipdata_code
      FROM opitemrece o
     INNER JOIN drugitems d ON d.icode = o.icode
      LEFT JOIN ovst ov ON ov.vn = o.vn
      LEFT JOIN ipt ip ON ip.an = o.an
      LEFT JOIN pttype pt ON pt.pttype = COALESCE(NULLIF(ip.pttype, ''), ov.pttype)
     WHERE o.rxdate BETWEEN ? AND ?
       AND o.icode IN ({icodes})
     GROUP BY o.rxdate, o.vn, o.an, o.icode
     ORDER BY o.rxdate`;

/** The SQL and its parameters: icodes bound, never inlined, and de-duplicated; an empty list is refused as the legacy did. */
export function herbQuery(start: string, end: string, icodes: readonly string[]): { sql: string; params: string[] } {
  const codes = [...new Set(icodes.map(String))];
  if (codes.length === 0) throw new Error('herb: no herbal icode configured');
  return { sql: HERB_SQL.replace('{icodes}', codes.map(() => '?').join(', ')), params: [start, end, ...codes] };
}

type Raw = Record<string, unknown>;
const plain = (value: unknown) => (value === null || value === undefined ? '' : String(value));
const text = (value: unknown) => fixThaiText(plain(value));
const amount = (value: unknown) => (value === null || value === undefined || value === '' ? null : Number(value));

/** The one SELECT in a READ ONLY transaction on HOSxP, after the text guard. The URL holds the password, so it is never logged. */
export const readHerb: HerbReader = async (connection, start, end, icodes) => {
  const { sql, params } = herbQuery(start, end, icodes);
  if (!isTtmReadOnlySql(sql)) throw new Error('herb: only SELECT is allowed');
  const hosxp = createDatabase(hosxpConnectionUrl(connection));
  try {
    const rows = await withReadOnlyFallback(hosxp, (tx) => tx.query<Raw>(sql, params));
    return rows.map((row): HerbRow => ({
      rxdate: plain(row.rxdate).slice(0, 10), vn: plain(row.vn), an: plain(row.an), hn: plain(row.hn), icode: plain(row.icode),
      drugName: text(row.drug_name), units: text(row.units), qty: Number(row.qty ?? 0), sumPrice: Number(row.sum_price ?? 0),
      unitcost: amount(row.unitcost), stdprice: amount(row.stdprice), pttype: plain(row.pttype), pttypeName: text(row.pttype_name), hipdata: plain(row.hipdata_code)
    }));
  } finally { await hosxp.close(); }
};
