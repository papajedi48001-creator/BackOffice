'use client';

import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import type { NhsoCell } from '@backoffice/contracts';
import { addDpAnswer, DP_ACCEPT, dpFileProblem, dpParts, dpUploadLine, readDpFile, type DpAnswer, type DpSum } from '../../../../../lib/money/dp-sheet';
import { moneyErrorMessage } from '../../../../../lib/money-client';

type Line = { text: string; tone: 'ok' | 'error' | 'wait' | 'done' };
type Failed = { ok?: false; error?: string; message?: string };

async function send(fileName: string, uploadId: string, rows: NhsoCell[][]): Promise<DpAnswer | Failed> {
  try {
    const response = await fetch('/api/money/disability/records', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileName, uploadId, rows }) });
    if (response.status === 413) return { message: 'ข้อมูลใหญ่เกินไป' };
    return (await response.json().catch(() => ({ message: `เซิร์ฟเวอร์ตอบกลับผิดพลาด (HTTP ${response.status})` }))) as DpAnswer | Failed;
  } catch { return { message: 'ส่งข้อมูลไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่' }; }
}
const int = (n: number) => n.toLocaleString('en-US');

/**
 * อัปโหลดไฟล์บริการฟื้นฟู: pick or drop many .csv/.xlsx files or a .zip; each file is read in the browser and sent in parts of
 * 1,500 rows (with the header) under one upload id, as the legacy upload page did.
 */
export function DpUpload() {
  const router = useRouter();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  async function addFiles(list: FileList | File[] | null) {
    const files = list ? [...list] : [];
    if (files.length === 0 || busy) return;
    setBusy(true);
    const out: Line[] = [];
    const show = (line: Line) => { out.push(line); setLines([...out]); return out.length - 1; };
    const change = (at: number, line: Line) => { out[at] = line; setLines([...out]); };
    let done = 0;
    let total = 0;
    for (const file of files) {
      const zip = /\.zip$/i.test(file.name);
      const problem = dpFileProblem(file);
      if (problem) { total += 1; show({ text: `✗ ${file.name}: ${problem}`, tone: 'error' }); continue; }
      let read;
      try { read = await readDpFile(file); } catch {
        if (!zip) total += 1;
        show({ text: `✗ ${file.name}: ${zip ? 'แตกไฟล์ zip ไม่ได้' : 'อ่านไฟล์ไม่ได้'}`, tone: 'error' });
        continue;
      }
      if (zip) show({ text: `แตกไฟล์ ${file.name}: พบ ${read.length} ไฟล์`, tone: read.length ? 'wait' : 'error' });
      for (const sheet of read) {
        total += 1;
        if (sheet.problem) { show({ text: `✗ ${sheet.name}: ${sheet.problem}`, tone: 'error' }); continue; }
        const at = show({ text: `กำลังนำเข้า ${sheet.name} …`, tone: 'wait' });
        const uploadId = crypto.randomUUID();
        let sum: DpSum = { rows: 0, added: 0, updated: 0, skipped: 0, years: {} };
        let failure: string | null = null;
        let sent = 0;
        for (const part of dpParts(sheet.header, sheet.data)) {
          sent += part.length - 1;
          change(at, { text: `กำลังนำเข้า ${sheet.name} … ${int(sent)}/${int(sheet.data.length)} แถว`, tone: 'wait' });
          const answer = await send(sheet.name, uploadId, part);
          if (!answer.ok) { failure = answer.message ?? moneyErrorMessage(answer.error ?? null); break; }
          sum = addDpAnswer(sum, answer);
        }
        if (failure === null) done += 1;
        change(at, failure === null ? { text: dpUploadLine(sheet.name, sum), tone: 'ok' } : { text: `✗ ${sheet.name}: ${failure}`, tone: 'error' });
      }
    }
    show({ text: `เสร็จแล้ว นำเข้าได้ ${done}/${total} ไฟล์`, tone: 'done' });
    if (input.current) input.current.value = '';
    setBusy(false);
    if (done > 0) router.refresh();
  }

  return <section className="money-card nhso-upload" aria-labelledby={`${inputId}-title`}>
    <h3 id={`${inputId}-title`}>อัปโหลดไฟล์บริการฟื้นฟู</h3>
    <p className="money-note">รับไฟล์ .csv ที่ส่งออกจากโปรแกรมบริการฟื้นฟูของ สปสช. (ภาษาไทย TIS-620 หรือ UTF-8) ไฟล์ Excel ที่หัวคอลัมน์เหมือนกัน หรือ .zip ที่มีไฟล์เหล่านี้
      ระบบแยกปีงบจาก &quot;วันที่รับบริการ&quot; เอง แถวที่ &quot;เลขที่อ้างอิง&quot; ซ้ำของเดิมจะแทนที่ของเดิม ไม่นับซ้ำ อัปโหลดไฟล์ปีปัจจุบันซ้ำเมื่อข้อมูลเพิ่มได้เลย</p>
    <label htmlFor={inputId} className={`nhso-drop${over ? ' is-over' : ''}${busy ? ' is-busy' : ''}`}
      onDragOver={(event) => { event.preventDefault(); setOver(true); }} onDragEnter={(event) => { event.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)} onDrop={(event) => { event.preventDefault(); setOver(false); void addFiles(event.dataTransfer.files); }}>
      {busy ? 'กำลังนำเข้า…' : 'ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือก (.zip / .csv / .xlsx หลายไฟล์ได้)'}
      <input ref={input} id={inputId} className="visually-hidden" type="file" multiple accept={DP_ACCEPT} aria-label="เลือกไฟล์บริการฟื้นฟู" disabled={busy} onChange={(event) => void addFiles(event.target.files)} />
    </label>
    <ul className="nhso-results" aria-live="polite">{lines.map((line, index) => <li key={index} className={`is-${line.tone}`}>{line.text}</li>)}</ul>
  </section>;
}
