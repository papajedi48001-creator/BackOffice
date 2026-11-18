/** ติดตามกองทุนย่อย FDH upload: browser-side checks and result lines, the same as the legacy upload page. */
import { moneyErrorMessage } from '../money-client';

export const FDH_MAX_FILE_BYTES = 10 * 1024 * 1024;
/** A month of REP/STM as one .zip; each Excel file inside still has the 10 MB limit. */
export const FDH_MAX_ZIP_BYTES = 200 * 1024 * 1024;
export const FDH_ACCEPT = '.xls,.xlsx,.zip';

/** Why a picked file is skipped before it is read, or null. */
export function fdhFileProblem(file: { name: string; size: number }): string | null {
  if (file.name.startsWith('~$')) return 'ข้ามไฟล์ชั่วคราวของ Excel';
  if (!/\.(xls|xlsx|zip)$/i.test(file.name)) return 'รับเฉพาะไฟล์ .xls .xlsx (หรือ .zip ที่มีไฟล์เหล่านี้)';
  if (/\.zip$/i.test(file.name)) return file.size > FDH_MAX_ZIP_BYTES ? 'ไฟล์ .zip ใหญ่เกิน 200 MB' : null;
  if (file.size > FDH_MAX_FILE_BYTES) return 'ไฟล์ใหญ่เกิน 10 MB';
  return null;
}

export type FdhUploadAnswer = { ok: true; kind: 'rep' | 'stm'; docNo: string; period: string; items: number; replaced: boolean } | { error?: string; message?: string };

/** One result line: "✓ ไฟล์: REP … (… เคส) — แทนที่ข้อมูลเดิม", "✓ ไฟล์: STM … งวด … (… แถว)" or "✗ ไฟล์: เหตุผล". */
export function fdhUploadLine(fileName: string, answer: FdhUploadAnswer): { ok: boolean; text: string } {
  if ('ok' in answer && answer.ok) {
    const count = answer.items.toLocaleString('en-US');
    const what = answer.kind === 'rep' ? `REP ${answer.docNo} (${count} เคส)` : `STM ${answer.docNo} งวด ${answer.period || '-'} (${count} แถว)`;
    return { ok: true, text: `✓ ${fileName}: ${what}${answer.replaced ? ' — แทนที่ข้อมูลเดิม' : ''}` };
  }
  const failed = answer as { error?: string; message?: string };
  return { ok: false, text: `✗ ${fileName}: ${failed.message ?? moneyErrorMessage(failed.error ?? null)}` };
}
