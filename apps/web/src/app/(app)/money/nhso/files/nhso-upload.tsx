'use client';

import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { readNhsoFile } from '../../../../../lib/money/nhso-sheet';
import { fileProblem, NHSO_ACCEPT, uploadLine, type NhsoUploadAnswer } from '../../../../../lib/money/nhso-upload';

type Line = { text: string; tone: 'ok' | 'error' | 'wait' | 'done' };

async function send(fileName: string, aoa: unknown[][]): Promise<NhsoUploadAnswer> {
  try {
    const response = await fetch('/api/money/nhso/datasets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileName, aoa }) });
    if (response.status === 413) return { message: 'ไฟล์ใหญ่เกินไป' };
    return (await response.json().catch(() => ({ message: `เซิร์ฟเวอร์ปฏิเสธ (HTTP ${response.status})` }))) as NhsoUploadAnswer;
  } catch { return { message: 'ส่งข้อมูลไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่' }; }
}

/**
 * อัปโหลดรายงานโอนเงิน: pick or drop many files or a .zip; each is read in the browser and sent one at a time, with a result
 * line per file, as the legacy upload page did.
 */
export function NhsoUpload() {
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
    const show = (line: Line) => { out.push(line); setLines([...out]); };
    let done = 0;
    let total = 0;
    for (const file of files) {
      const problem = fileProblem(file);
      if (problem) { total += 1; show({ text: `✗ ${file.name}: ${problem}`, tone: 'error' }); continue; }
      let sheets;
      try { sheets = await readNhsoFile(file); } catch { total += 1; show({ text: `✗ ${file.name}: อ่านไฟล์ไม่ได้`, tone: 'error' }); continue; }
      if (/\.zip$/i.test(file.name)) show({ text: `แตกไฟล์ ${file.name}: พบไฟล์ Excel ${sheets.length} ไฟล์`, tone: sheets.length ? 'wait' : 'error' });
      for (const sheet of sheets) {
        total += 1;
        if (sheet.problem) { show({ text: `✗ ${sheet.name}: ${sheet.problem}`, tone: 'error' }); continue; }
        const line = uploadLine(sheet.name, await send(sheet.name, sheet.aoa));
        if (line.ok) done += 1;
        show({ text: line.text, tone: line.ok ? 'ok' : 'error' });
      }
    }
    show({ text: `เสร็จแล้ว นำเข้าได้ ${done}/${total} ไฟล์`, tone: 'done' });
    if (input.current) input.current.value = '';
    setBusy(false);
    if (done > 0) router.refresh();
  }

  return <section className="money-card nhso-upload" aria-labelledby={`${inputId}-title`}>
    <h3 id={`${inputId}-title`}>อัปโหลดรายงานโอนเงิน</h3>
    <p className="money-note">ไฟล์ &quot;รายงานเอกสารการโอนเงินแยกตามหน่วยงาน&quot; จาก สปสช. เลือกได้หลายไฟล์พร้อมกัน หรือใช้ไฟล์ .zip ที่ดาวน์โหลดทั้งโฟลเดอร์จาก Google Drive ได้เลย ระบบอ่านรหัสหน่วยบริการและปีงบจากหัวรายงานเอง
      ถ้าอัปโหลดไฟล์ของ รพ. เดิมปีงบเดิมซ้ำ จะแทนที่ข้อมูลเดิมทั้งชุด (รายงานเป็นยอดสะสม)</p>
    <label htmlFor={inputId} className={`nhso-drop${over ? ' is-over' : ''}${busy ? ' is-busy' : ''}`}
      onDragOver={(event) => { event.preventDefault(); setOver(true); }} onDragEnter={(event) => { event.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)} onDrop={(event) => { event.preventDefault(); setOver(false); void addFiles(event.dataTransfer.files); }}>
      {busy ? 'กำลังนำเข้า…' : 'ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือก (.xlsx .xls .csv หรือ .zip ทั้งโฟลเดอร์)'}
      <input ref={input} id={inputId} className="visually-hidden" type="file" multiple accept={NHSO_ACCEPT} aria-label="เลือกไฟล์รายงานโอนเงิน" disabled={busy} onChange={(event) => void addFiles(event.target.files)} />
    </label>
    <ul className="nhso-results" aria-live="polite">{lines.map((line, index) => <li key={index} className={`is-${line.tone}`}>{line.text}</li>)}</ul>
  </section>;
}
