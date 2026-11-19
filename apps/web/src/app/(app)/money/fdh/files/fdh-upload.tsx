'use client';

import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { FormDialog } from '../../../../../components/form-dialog';
import type { NhsoCell } from '@backoffice/contracts';
import { readFdhFile } from '../../../../../lib/money/fdh-sheet';
import { FDH_ACCEPT, fdhFileProblem, fdhUploadLine, type FdhUploadAnswer } from '../../../../../lib/money/fdh-upload';

type Line = { text: string; tone: 'ok' | 'error' | 'wait' | 'done' };

async function send(fileName: string, sheets: Record<string, NhsoCell[][]>): Promise<FdhUploadAnswer> {
  try {
    const response = await fetch('/api/money/fdh/documents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileName, sheets }) });
    if (response.status === 413) return { message: 'ไฟล์ใหญ่เกินไป' };
    return (await response.json().catch(() => ({ message: `เซิร์ฟเวอร์ตอบกลับผิดพลาด (HTTP ${response.status})` }))) as FdhUploadAnswer;
  } catch { return { message: 'ส่งข้อมูลไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่' }; }
}

/**
 * อัปโหลดไฟล์ REP / STM: pick or drop many .xls files or a .zip of a whole month; each workbook is read in the browser and sent
 * one at a time, and the server tells REP from STM by its content, as the legacy upload page did.
 */
export function FdhUpload() {
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
      const zip = /\.zip$/i.test(file.name);
      const problem = fdhFileProblem(file);
      if (problem) { total += 1; show({ text: `✗ ${file.name}: ${problem}`, tone: 'error' }); continue; }
      let read;
      try { read = await readFdhFile(file); } catch {
        if (!zip) total += 1;
        show({ text: `✗ ${file.name}: ${zip ? 'แตกไฟล์ zip ไม่ได้' : 'อ่านไฟล์ไม่ได้'}`, tone: 'error' });
        continue;
      }
      if (zip) show({ text: `แตกไฟล์ ${file.name}: พบไฟล์ Excel ${read.length} ไฟล์`, tone: read.length ? 'wait' : 'error' });
      for (const workbook of read) {
        total += 1;
        if (workbook.problem) { show({ text: `✗ ${workbook.name}: ${workbook.problem}`, tone: 'error' }); continue; }
        const line = fdhUploadLine(workbook.name, await send(workbook.name, workbook.sheets));
        if (line.ok) done += 1;
        show({ text: line.text, tone: line.ok ? 'ok' : 'error' });
      }
    }
    show({ text: `เสร็จแล้ว นำเข้าได้ ${done}/${total} ไฟล์`, tone: 'done' });
    if (input.current) input.current.value = '';
    setBusy(false);
    if (done > 0) router.refresh();
  }

  return <FormDialog title="อัปโหลดไฟล์ REP / STM" triggerLabel="อัปโหลดไฟล์ REP / STM" wide isSubmitting={busy} onOpenChange={(open) => { if (open) setLines([]); }}>
    <div className="nhso-upload">
      <p className="money-note">ลากไฟล์ .zip ของ REP และ STM ทั้งเดือนมาวางพร้อมกันได้เลย ระบบแตก zip และแยกเองว่าไฟล์ไหนเป็น REP หรือ STM จากเนื้อหาในไฟล์
        ไฟล์ที่เลขที่เอกสารซ้ำของเดิมจะแทนที่ของเดิม ไม่นับซ้ำ เดือนใหม่อัปโหลดเพิ่มได้เรื่อย ๆ</p>
      <label htmlFor={inputId} className={`nhso-drop${over ? ' is-over' : ''}${busy ? ' is-busy' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setOver(true); }} onDragEnter={(event) => { event.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)} onDrop={(event) => { event.preventDefault(); setOver(false); void addFiles(event.dataTransfer.files); }}>
        {busy ? 'กำลังนำเข้า…' : 'ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือก (.zip ทั้งเดือน หรือ .xls หลายไฟล์)'}
        <input ref={input} id={inputId} className="visually-hidden" type="file" multiple accept={FDH_ACCEPT} aria-label="เลือกไฟล์ REP / STM" disabled={busy} onChange={(event) => void addFiles(event.target.files)} />
      </label>
      <ul className="nhso-results" aria-live="polite">{lines.map((line, index) => <li key={index} className={`is-${line.tone}`}>{line.text}</li>)}</ul>
    </div>
  </FormDialog>;
}
