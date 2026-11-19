import { createDatabase } from '@backoffice/db';
import { hosxpConnectionUrl } from '../holidays/hosxp-settings-service';
import type { DentalReader } from './dental-service';
import type { DentalRow } from './dental-summary';
import { DENTURE_ICODES } from './dental-rules';
import { isReadOnlySelect, withReadOnlyFallback } from './hosxp-read-only';
import { fixThaiText } from './thai-text';

/** The URL is built in memory only; it holds the password, so it is never logged or returned. */

const INC_SUM = `(${Array.from({ length: 16 }, (_, i) => `vn.inc${String(i + 1).padStart(2, '0')}`).join(' + ')})`;

const DENTURE_IN = DENTURE_ICODES.map((code) => `'${code}'`).join(', ');

/**
 * The legacy query (Smart Money `DentalClaimsRepository::fetch`, latest version) with one change: ผังบัญชี is the สิทธิ's
 * ผังบัญชีปัจจุบัน, the rule Mapping สิทธิ uses (the `paccountopd` row with the latest `last_modify`, then the lowest `paccount`;
 * no year), named from that code's latest `paccount_year`.
 * One row per visit with dental work (`dtmain`, lowest doctor codes), its main diagnosis (`diagtype` '1'), งานฟันปลอม when
 * `opitemrece` holds a denture icode, ลูกหนี้ = ค่ารักษารวม − ชำระแล้ว (not below 0); only visits with an amount to collect
 * or not fully paid. Dates are bound; the denture icodes are constants.
 */
export const DENTAL_SQL = `
  SELECT d1.vn, d1.vstdate, d1.hn,
         CONCAT(COALESCE(p.pname, ''), COALESCE(p.fname, ''), '  ', COALESCE(p.lname, '')) AS patient_name,
         d3.name AS doctor_name, d4.name AS helper_name,
         pdx.icd10 AS diag_code, pdx_icd.name AS diag_name,
         EXISTS (SELECT 1 FROM opitemrece oi WHERE oi.vn = d1.vn AND oi.icode IN (${DENTURE_IN})) AS is_denture,
         pty.pttype AS pttype_code, pty.name AS pttype_name,
         (SELECT (SELECT pac.name FROM paccount pac WHERE pac.paccount = pa.paccount ORDER BY pac.paccount_year DESC LIMIT 1)
            FROM paccountopd pa WHERE pa.pttype = pty.pttype
           ORDER BY pa.last_modify IS NULL, pa.last_modify DESC, pa.paccount ASC LIMIT 1) AS paccount_name,
         ${INC_SUM} AS total_amount, vn.paid_money,
         GREATEST(${INC_SUM} - COALESCE(vn.paid_money, 0), 0) AS claim_amount
    FROM (SELECT vn, hn, vstdate, MIN(doctor) AS doctor, MIN(doctor_helper) AS doctor_helper
            FROM dtmain WHERE vstdate BETWEEN ? AND ? GROUP BY vn, hn, vstdate) d1
    LEFT JOIN doctor d3 ON d3.code = d1.doctor
    LEFT JOIN doctor d4 ON d4.code = d1.doctor_helper
    LEFT JOIN patient p ON p.hn = d1.hn
    LEFT JOIN ovstdiag pdx ON pdx.vn = d1.vn AND pdx.diagtype = '1'
    LEFT JOIN icd101 pdx_icd ON pdx_icd.code = pdx.icd10
    LEFT JOIN ovst v ON v.vn = d1.vn
    LEFT JOIN pttype pty ON pty.pttype = v.pttype
    LEFT JOIN vn_stat vn ON vn.vn = d1.vn
   WHERE vn.rcpt_money > 0 OR vn.paid_money < ${INC_SUM}
   ORDER BY d1.vstdate, d1.vn, pdx.icd10`;

type Raw = { vn: string; vstdate: string; hn: string | null; patient_name: string | null; doctor_name: string | null; helper_name: string | null; diag_code: string | null; diag_name: string | null; is_denture: string | number; pttype_code: string | null; pttype_name: string | null; paccount_name: string | null; total_amount: string | number; paid_money: string | number; claim_amount: string | number };

const text = (value: string | null) => fixThaiText(value ?? '');

/** The one SELECT in a READ ONLY transaction on HOSxP, after the text guard; nothing is ever written there. */
export const readDentalClaims: DentalReader = async (connection, start, end) => {
  if (!isReadOnlySelect(DENTAL_SQL)) throw new Error('dental: only SELECT is allowed');
  const hosxp = createDatabase(hosxpConnectionUrl(connection));
  try {
    const rows = await withReadOnlyFallback(hosxp, (tx) => tx.query<Raw>(DENTAL_SQL, [start, end]));
    return rows.map((row): DentalRow => ({
      vn: String(row.vn), vstdate: String(row.vstdate).slice(0, 10), hn: row.hn ?? '', patientName: text(row.patient_name).trim(),
      diagCode: row.diag_code ?? '', diagName: text(row.diag_name), doctorName: text(row.doctor_name), helperName: text(row.helper_name), isDenture: Number(row.is_denture) === 1, pttypeCode: row.pttype_code ?? '', pttypeName: text(row.pttype_name),
      paccountName: row.paccount_name === null ? null : text(row.paccount_name),
      totalAmount: Number(row.total_amount), paidMoney: Number(row.paid_money), claimAmount: Number(row.claim_amount)
    }));
  } finally { await hosxp.close(); }
};
