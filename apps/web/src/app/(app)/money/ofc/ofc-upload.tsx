'use client';

import { useId, useRef, useState } from 'react';
import { FormDialog } from '../../../../components/form-dialog';
import { moneyErrorMessage } from '../../../../lib/money-client';
import { OFC_ACCEPT, readOfcFile } from '../../../../lib/money/ofc-sheet';
import { ofcUploadLine } from '../../../../lib/money/ofc-views';

type Line = { text: string; tone: 'ok' | 'error' | 'wait' | 'done' };
type Answer = { ok: true; kind: 'rep' | 'stm'; rows: number; added: number; updated: number; skipped: number };
type Failed = { ok?: false; error?: string; message?: string };

async function send(fileName: string, sheets: object): Promise<Answer | Failed> {
  try {
    const response = await fetch('/api/money/ofc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileName, sheets }) });
    if (response.status === 413) return { message: 'ไฟล์ใหญ่เกินไป' };
    return (await response.json().catch(() => ({ message: `เซิร์ฟเวอร์ตอบกลับผิดพลาด (HTTP ${response.status})` }))) as Answer | Failed;
  } catch { return { message: 'ส่งข้อมูลไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่' }; }
}

/** นำเข้า REP / Statement ของ OFC: each file is read in the browser and sent once; the server finds which kind it is. `onDone` reloads the page. */
export function OfcUpload({ onDone }: { onDone: () => void }) {
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
      let read;
      try { read = await readOfcFile(file); } catch { show({ text: `✗ ${file.name}: อ่านไฟล์ไม่ได้`, tone: 'error' }); continue; }
      if (read.problem) { show({ text: `✗ ${read.name}: ${read.problem}`, tone: 'error' }); continue; }
      const at = show({ text: `กำลังนำเข้า ${read.name} …`, tone: 'wait' });
      const answer = await send(read.name, read.sheets);
      if (answer.ok) { done += 1; change(at, { text: ofcUploadLine(read.name, answer), tone: 'ok' }); }
      else change(at, { text: `✗ ${read.name}: ${answer.message ?? moneyErrorMessage(answer.error ?? null)}`, tone: 'error' });
    }
    show({ text: `เสร็จแล้ว นำเข้าได้ ${done}/${files.length} ไฟล์`, tone: 'done' });
    if (input.current) input.current.value = '';
    setBusy(false);
    if (done > 0) onDone();
  }

  return <FormDialog title="นำเข้า REP / Statement" triggerLabel="นำเข้า REP / Statement" wide isSubmitting={busy} onOpenChange={(open) => { if (open) setLines([]); }}>
    <div className="nhso-upload">
      <p className="money-note">รับไฟล์ <b>REP</b> (eclaim_…_OPCS_….xls มีชีต Detail และ Data Instrument) และ <b>Statement</b> (STM_…_OP….xls มีชีตพึงรับ)
        ระบบดูจากชีตเองว่าเป็นไฟล์ใด จับคู่กับ HOSxP ด้วย SEQ NO (VN) รายการที่เคยนำเข้าแล้วจะถูกแทนที่ ไม่นับซ้ำ
        ระบบเก็บเฉพาะเลขอ้างอิงและยอดเงิน ไม่เก็บชื่อหรือเลขบัตรประชาชน</p>
      <label htmlFor={inputId} className={`nhso-drop${over ? ' is-over' : ''}${busy ? ' is-busy' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setOver(true); }} onDragEnter={(event) => { event.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)} onDrop={(event) => { event.preventDefault(); setOver(false); void addFiles(event.dataTransfer.files); }}>
        {busy ? 'กำลังนำเข้า…' : 'ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือก (.xls / .xlsx หลายไฟล์ได้)'}
        <input ref={input} id={inputId} className="visually-hidden" type="file" multiple accept={OFC_ACCEPT} aria-label="เลือกไฟล์ REP หรือ Statement ของ OFC" disabled={busy} onChange={(event) => void addFiles(event.target.files)} />
      </label>
      <ul className="nhso-results" aria-live="polite">{lines.map((line, index) => <li key={index} className={`is-${line.tone}`}>{line.text}</li>)}</ul>
    </div>
  </FormDialog>;
}
