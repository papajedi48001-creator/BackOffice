'use client';

import { useState } from 'react';

type ImportError = { file: 'organizations' | 'people'; row: number | null; column: string | null; code: string };
type ImportSummary = { organizationsCreated: number; organizationsUpdated: number; peopleCreated: number; peopleUpdated: number; assignmentsChanged: number };
type Outcome = { kind: 'checked' | 'imported'; summary: ImportSummary } | { kind: 'invalid'; errors: ImportError[] } | { kind: 'failed' };

const fileLabels = { organizations: 'หน่วยงาน', people: 'บุคลากร' } as const;
const errorMessages: Record<string, string> = {
  INVALID_CSV: 'อ่านไฟล์ CSV ไม่ได้ (เครื่องหมายคำพูดไม่ครบ)', MISSING_COLUMN: 'ไม่มีคอลัมน์ที่จำเป็น', TOO_MANY_ROWS: 'เกิน 5,000 แถว', REQUIRED: 'ต้องกรอก', TOO_LONG: 'ยาวเกินกำหนด',
  INVALID_NATIONAL_ID: 'เลขประจำตัวประชาชนไม่ถูกต้อง', INVALID_DATE: 'วันที่ไม่ถูกต้อง (ใช้ 2026-10-01 หรือ 1/10/2569)', INVALID_STATUS: 'สถานะต้องเป็น ACTIVE หรือ INACTIVE',
  DUPLICATE_CODE: 'รหัสซ้ำในไฟล์', DUPLICATE_NATIONAL_ID: 'เลขประจำตัวประชาชนซ้ำในไฟล์', NATIONAL_ID_CONFLICT: 'รหัสบุคลากรกับเลขประจำตัวประชาชนไม่ตรงกับข้อมูลเดิม',
  UNKNOWN_ORGANIZATION: 'ไม่พบรหัสหน่วยงาน', UNKNOWN_MANAGER: 'ไม่พบรหัสผู้บังคับบัญชา', SELF_MANAGER: 'ผู้บังคับบัญชาเป็นคนเดียวกับบุคลากร', PARENT_CYCLE: 'หน่วยงานแม่วนกลับมาที่ตัวเอง',
  EFFECTIVE_DATE_NOT_AFTER_CURRENT: 'วันที่มีผลต้องหลังวันที่ของการสังกัดปัจจุบัน'
};

export function MasterDataImportForm() {
  const [files, setFiles] = useState<{ organizations?: File; people?: File }>({});
  const [checkedFiles, setCheckedFiles] = useState<typeof files | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);

  function choose(field: 'organizations' | 'people', file: File | undefined) {
    setFiles((current) => ({ ...current, [field]: file }));
    setCheckedFiles(null);
    setOutcome(null);
  }

  async function send(mode: 'validate' | 'apply') {
    if (busy || (!files.organizations && !files.people)) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set('mode', mode);
      if (files.organizations) form.set('organizations', files.organizations);
      if (files.people) form.set('people', files.people);
      const response = await fetch('/api/hr/imports', { method: 'POST', body: form });
      const body = await response.json() as { summary?: ImportSummary; errors?: ImportError[] };
      if (response.ok && body.summary) {
        setOutcome({ kind: mode === 'apply' ? 'imported' : 'checked', summary: body.summary });
        setCheckedFiles(mode === 'validate' ? files : null);
      } else if (response.status === 422 && body.errors) {
        setOutcome({ kind: 'invalid', errors: body.errors });
        setCheckedFiles(null);
      } else setOutcome({ kind: 'failed' });
    } catch {
      setOutcome({ kind: 'failed' });
    } finally {
      setBusy(false);
    }
  }

  const canApply = !busy && checkedFiles === files && outcome?.kind === 'checked';
  return (
    <div className="master-data-import">
      <p>อัปโหลดไฟล์ CSV แบบ UTF-8 ตรวจสอบก่อน แล้วจึงนำเข้า ถ้ามีแถวผิดแม้แถวเดียว ระบบจะไม่บันทึกข้อมูลใดเลย</p>
      <label>ไฟล์หน่วยงาน (CSV)<input type="file" accept=".csv,text/csv" onChange={(event) => choose('organizations', event.target.files?.[0])} /></label>
      <p className="field-hint">คอลัมน์: code, name, parent_code</p>
      <label>ไฟล์บุคลากร (CSV)<input type="file" accept=".csv,text/csv" onChange={(event) => choose('people', event.target.files?.[0])} /></label>
      <p className="field-hint">คอลัมน์: employee_code, national_id, display_name, position_title, organization_code, manager_employee_code, effective_from, status</p>
      <div className="form-actions">
        <button type="button" disabled={busy || (!files.organizations && !files.people)} onClick={() => send('validate')}>{busy ? 'กำลังดำเนินการ' : 'ตรวจสอบไฟล์'}</button>
        <button type="button" disabled={!canApply} onClick={() => send('apply')}>นำเข้าข้อมูล</button>
      </div>
      {outcome?.kind === 'checked' && <p role="status">ตรวจสอบผ่าน: {describe(outcome.summary)}</p>}
      {outcome?.kind === 'imported' && <p role="status">นำเข้าเรียบร้อย: {describe(outcome.summary)}</p>}
      {outcome?.kind === 'failed' && <p className="form-error" role="alert">ไม่สามารถดำเนินการได้ โปรดลองอีกครั้ง</p>}
      {outcome?.kind === 'invalid' && (
        <>
          <p className="form-error" role="alert">พบ {outcome.errors.length} รายการที่ต้องแก้ไข ยังไม่ได้บันทึกข้อมูล</p>
          <table>
            <thead><tr><th>ไฟล์</th><th>แถว</th><th>คอลัมน์</th><th>ปัญหา</th></tr></thead>
            <tbody>{outcome.errors.map((error, index) => (
              <tr key={`${error.file}-${error.row}-${error.column}-${index}`}><td>{fileLabels[error.file]}</td><td>{error.row ?? '-'}</td><td>{error.column ?? '-'}</td><td>{errorMessages[error.code] ?? error.code}</td></tr>
            ))}</tbody>
          </table>
        </>
      )}
    </div>
  );
}

function describe(summary: ImportSummary): string {
  return `หน่วยงานใหม่ ${summary.organizationsCreated} แก้ไข ${summary.organizationsUpdated}, บุคลากรใหม่ ${summary.peopleCreated} แก้ไข ${summary.peopleUpdated}, การสังกัดที่เปลี่ยน ${summary.assignmentsChanged}`;
}
