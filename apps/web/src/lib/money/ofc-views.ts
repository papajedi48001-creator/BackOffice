import type { OfcStatus, OfcVisit } from '@backoffice/core';
import type { ImcTone } from './imc-views';

/** How Monitor Instrument OFC names and colours each visit's claim result. */
export const OFC_STATUS: Readonly<Record<OfcStatus, { text: string; tone: ImcTone }>> = {
  none: { text: 'ยังไม่มี REP', tone: 'warn' },
  denied: { text: 'ปฏิเสธ', tone: 'bad' },
  rep: { text: 'รอ Statement', tone: 'mute' },
  paid: { text: 'ได้รับแล้ว', tone: 'ok' }
};
export const OFC_STATUS_ORDER: readonly OfcStatus[] = ['none', 'denied', 'rep', 'paid'];

/** One chart line per item of each visit, for `imcBuckets` (code = icode). */
export const ofcChartLines = (visits: readonly OfcVisit[]) => visits.flatMap((visit) => visit.items.map((item) => ({ date: visit.date, code: item.icode, claim: item.claim })));

/** "✓ ชื่อไฟล์ (REP): 42 รายการ · ใหม่ 40 · แทนที่ของเดิม 2" after an upload. */
export function ofcUploadLine(fileName: string, answer: { kind: 'rep' | 'stm'; rows: number; added: number; updated: number; skipped: number }): string {
  const int = (n: number) => n.toLocaleString('en-US');
  return `✓ ${fileName} (${answer.kind === 'rep' ? 'REP' : 'Statement'}): ${int(answer.rows)} รายการ · ใหม่ ${int(answer.added)} · แทนที่ของเดิม ${int(answer.updated)}${answer.skipped ? ` · ข้าม ${int(answer.skipped)}` : ''}`;
}
