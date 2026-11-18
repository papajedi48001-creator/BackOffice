import { createDatabase } from '@backoffice/db';
import { hosxpConnectionUrl } from '../holidays/hosxp-settings-service';
import type { DentalReader } from './dental-service';
import type { DentalRow } from './dental-summary';
import { fixThaiText } from './thai-text';

/** The URL is built in memory only; it holds the password, so it is never logged or returned. */

const INC_SUM = `(${Array.from({ length: 16 }, (_, i) => `vn.inc${String(i + 1).padStart(2, '0')}`).join(' + ')})`;

/**
 * The legacy query (Smart Money `DentalClaimsRepository::fetch`) with one change: ผังบัญชี is the สิทธิ's ผังบัญชีปัจจุบัน, the
 * rule Mapping สิทธิ uses (the `paccountopd` row with the latest `last_modify`, then the lowest `paccount`; no year), named
 * from that code's latest `paccount_year`, instead of whatever row MariaDB happened to keep.
 * One row per visit × K00–K11 diagnosis, only visits with an amount to collect or not fully paid.
 */
const SQL = `
  SELECT ov.vn, v.vstdate, p.hn,
         CONCAT(COALESCE(p.pname, ''), COALESCE(p.fname, ''), ' ', COALESCE(p.lname, '')) AS patient_name,
         ov.icd10 AS diag_code, icd.name AS diag_name, pty.pttype AS pttype_code, pty.name AS pttype_name,
         (SELECT (SELECT pac.name FROM paccount pac WHERE pac.paccount = pa.paccount ORDER BY pac.paccount_year DESC LIMIT 1)
            FROM paccountopd pa WHERE pa.pttype = pty.pttype
           ORDER BY pa.last_modify IS NULL, pa.last_modify DESC, pa.paccount ASC LIMIT 1) AS paccount_name,
         ${INC_SUM} AS total_amount, vn.paid_money, vn.rcpt_money AS claim_amount
    FROM (SELECT d.vn, d.icd10 FROM ovstdiag d JOIN ovst o ON o.vn = d.vn
           WHERE o.vstdate BETWEEN ? AND ? AND (d.icd10 BETWEEN 'K00' AND 'K119' OR d.icd10 REGEXP '^K0[0-9]|^K1[0-1]')
           GROUP BY d.vn, d.icd10) ov
    JOIN ovst v ON v.vn = ov.vn
    LEFT JOIN patient p ON p.hn = v.hn
    LEFT JOIN icd101 icd ON icd.code = ov.icd10
    LEFT JOIN pttype pty ON pty.pttype = v.pttype
    LEFT JOIN vn_stat vn ON vn.vn = v.vn
   WHERE vn.rcpt_money > 0 OR vn.paid_money < ${INC_SUM}
   ORDER BY v.vstdate, v.hn, ov.vn, ov.icd10`;

type Raw = { vn: string; vstdate: string; hn: string | null; patient_name: string | null; diag_code: string; diag_name: string | null; pttype_code: string | null; pttype_name: string | null; paccount_name: string | null; total_amount: string | number; paid_money: string | number; claim_amount: string | number };

const text = (value: string | null) => fixThaiText(value ?? '');

/** One read-only SELECT on HOSxP; nothing is ever written there. */
export const readDentalClaims: DentalReader = async (connection, start, end) => {
  const hosxp = createDatabase(hosxpConnectionUrl(connection));
  try {
    const rows = await hosxp.query<Raw>(SQL, [start, end]);
    return rows.map((row): DentalRow => ({
      vn: String(row.vn), vstdate: String(row.vstdate).slice(0, 10), hn: row.hn ?? '', patientName: text(row.patient_name).trim(),
      diagCode: row.diag_code, diagName: text(row.diag_name), pttypeCode: row.pttype_code ?? '', pttypeName: text(row.pttype_name),
      paccountName: row.paccount_name === null ? null : text(row.paccount_name),
      totalAmount: Number(row.total_amount), paidMoney: Number(row.paid_money), claimAmount: Number(row.claim_amount)
    }));
  } finally { await hosxp.close(); }
};
