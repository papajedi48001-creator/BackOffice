'use client';

import { useId, useRef, useState } from 'react';
import { FormDialog } from '../../../../components/form-dialog';
import type { NhsoCell } from '@backoffice/contracts';
import { IMC_ACCEPT, imcParts, imcUploadLine, readImcFile, type ImcKind, type ImcSum } from '../../../../lib/money/imc-sheet';
import { moneyErrorMessage } from '../../../../lib/money-client';

type Line = { text: string; tone: 'ok' | 'error' | 'wait' | 'done' };
type Answer = { ok: true } & ImcSum;
type Failed = { ok?: false; error?: string; message?: string };

async function send(kind: ImcKind, fileName: string, uploadId: string, rows: NhsoCell[][]): Promise<Answer | Failed> {
  try {
    const response = await fetch('/api/money/disability/imc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, fileName, uploadId, rows }) });
    if (response.status === 413) return { message: 'ข้อมูลใหญ่เกินไป' };
    return (await response.json().catch(() => ({ message: `เซิร์ฟเวอร์ตอบกลับผิดพลาด (HTTP ${response.status})` }))) as Answer | Failed;
  } catch { return { message: 'ส่งข้อมูลไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่' }; }
}
const int = (n: number) => n.toLocaleString('en-US');

/**
 * นำเข้าไฟล์ IMC: pick or drop the ทะเบียนคนไข้ IMC CSV and/or the REP individual Excel; each file is read in the browser, its kind
 * found from its header, and sent in parts of 1,500 rows under one upload id. A line already stored is replaced, so a file can be
 * imported again when it grows. `onDone` reloads Monitor IMC once a file went in.
 */
export function ImcUpload({ onDone }: { onDone: () => void }) {
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
    for (const file of files) {
      let sheet;
      try { sheet = await readImcFile(file); } catch { show({ text: `✗ ${file.name}: อ่านไฟล์ไม่ได้`, tone: 'error' }); continue; }
      if (!sheet.kind) { show({ text: `✗ ${sheet.name}: ${sheet.problem ?? 'อ่านไฟล์ไม่ได้'}`, tone: 'error' }); continue; }
      const kind = sheet.kind;
      const at = show({ text: `กำลังนำเข้า ${sheet.name} …`, tone: 'wait' });
      const uploadId = crypto.randomUUID();
      const sum: ImcSum = { rows: 0, added: 0, updated: 0, skipped: 0 };
      let failure: string | null = null;
      let sent = 0;
      for (const part of imcParts(sheet.head, sheet.data)) {
        sent += part.length - sheet.head.length;
        change(at, { text: `กำลังนำเข้า ${sheet.name} … ${int(sent)}/${int(sheet.data.length)} แถว`, tone: 'wait' });
        const answer = await send(kind, sheet.name, uploadId, part);
        if (!answer.ok) { failure = answer.message ?? moneyErrorMessage(answer.error ?? null); break; }
        sum.rows += answer.rows; sum.added += answer.added; sum.updated += answer.updated; sum.skipped += answer.skipped;
      }
      if (failure === null) done += 1;
      change(at, failure === null ? { text: imcUploadLine(sheet.name, kind, sum), tone: 'ok' } : { text: `✗ ${sheet.name}: ${failure}`, tone: 'error' });
    }
    show({ text: `เสร็จแล้ว นำเข้าได้ ${done}/${files.length} ไฟล์`, tone: 'done' });
    if (input.current) input.current.value = '';
    setBusy(false);
    if (done > 0) onDone();
  }

  return <FormDialog title="นำเข้าไฟล์ IMC" triggerLabel="นำเข้าไฟล์ IMC" wide isSubmitting={busy} onOpenChange={(open) => { if (open) setLines([]); }}>
    <div className="nhso-upload">
      <p className="money-note">รับไฟล์ <b>ทะเบียนคนไข้ IMC</b> (.csv จากโปรแกรมบริการฟื้นฟูของ สปสช. ภาษาไทย TIS-620 หรือ UTF-8) และไฟล์ <b>REP individual</b> (.xlsx)
        ระบบดูจากหัวคอลัมน์เองว่าเป็นไฟล์ใด รายการที่เคยนำเข้าแล้วจะถูกแทนที่ ไม่นับซ้ำ นำเข้าไฟล์เดิมซ้ำเมื่อข้อมูลเพิ่มได้เลย
        (ไฟล์การให้บริการ IMC ไม่ต้องนำเข้า เพราะข้อมูลอยู่ในทะเบียนแล้ว)</p>
      <label htmlFor={inputId} className={`nhso-drop${over ? ' is-over' : ''}${busy ? ' is-busy' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setOver(true); }} onDragEnter={(event) => { event.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)} onDrop={(event) => { event.preventDefault(); setOver(false); void addFiles(event.dataTransfer.files); }}>
        {busy ? 'กำลังนำเข้า…' : 'ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือก (.csv / .xlsx หลายไฟล์ได้)'}
        <input ref={input} id={inputId} className="visually-hidden" type="file" multiple accept={IMC_ACCEPT} aria-label="เลือกไฟล์ทะเบียน IMC หรือ REP" disabled={busy} onChange={(event) => void addFiles(event.target.files)} />
      </label>
      <ul className="nhso-results" aria-live="polite">{lines.map((line, index) => <li key={index} className={`is-${line.tone}`}>{line.text}</li>)}</ul>
    </div>
  </FormDialog>;
}
