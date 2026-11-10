'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormDialog } from '../../../../components/form-dialog';
import { sendLab } from '../../../../lib/lab-client';

const kinds = {
  items: { title: 'นำเข้าทะเบียนวัสดุ', note: 'เพิ่มหรือปรับวัสดุตามรหัส' },
  opening: { title: 'นำเข้ายอดยกมา', note: 'แทนที่ร่างยอดยกมาเดิมทั้งชุด' }
} as const;

/** Uploads a CSV made from the แม่แบบ. The whole file is checked first; on any error nothing is saved and every bad row is listed. */
export function OpeningImport({ kind }: { kind: keyof typeof kinds }) {
  const router = useRouter();
  const ids = useId();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<{ row: number; message: string }[]>([]);
  async function submit(): Promise<boolean> {
    if (!file) return false;
    setError(null); setRows([]);
    const { error: failure, result } = await sendLab(`/api/lab/opening/import?kind=${kind}`, 'POST', await file.text(), true);
    if (failure) { setError(failure); setRows(Array.isArray(result.errors) ? (result.errors as { row: number; message: string }[]) : []); return false; }
    router.refresh();
    return true;
  }
  return <FormDialog title={kinds[kind].title} triggerLabel={kinds[kind].title} triggerClassName="button-secondary" submitLabel="ตรวจและนำเข้า" ready={file !== null} error={error}
    onOpenChange={(open) => { if (open) { setFile(null); setError(null); setRows([]); } }} onSubmit={submit}>
    <p>{kinds[kind].note} ใช้ไฟล์ CSV จาก <a href={`/api/lab/opening/template?kind=${kind}`}>แม่แบบ</a> (บันทึกจาก Excel เป็น CSV UTF-8)</p>
    <div className="action-dialog-field">
      <label htmlFor={`${ids}-file`}>ไฟล์ CSV</label>
      <input id={`${ids}-file`} type="file" accept=".csv,text/csv" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
    </div>
    {rows.length > 0 && <ul className="lab-csv-errors" aria-label="แถวที่ต้องแก้">{rows.slice(0, 100).map((row, index) => <li key={`${row.row}-${index}`}>แถว {row.row}: {row.message}</li>)}</ul>}
  </FormDialog>;
}
