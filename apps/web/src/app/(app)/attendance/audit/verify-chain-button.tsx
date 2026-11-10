'use client';

import { useState } from 'react';
import { sendAttendance } from '../../../../lib/attendance-labels';

/** ตรวจสอบความต่อเนื่อง: re-hashes the whole chain on the server and says whether any audited row was changed afterwards. */
export function VerifyChainButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function verify() {
    setBusy(true);
    const { error, result } = await sendAttendance('/api/attendance/audit/verify', 'POST');
    setBusy(false);
    if (error) { setMessage({ ok: false, text: error }); return; }
    setMessage(result.ok === true ? { ok: true, text: `ต่อเนื่องครบ ${Number(result.length).toLocaleString('th-TH')} รายการ` } : { ok: false, text: `พบความผิดปกติที่ลำดับ ${Number(result.brokenAtSeq).toLocaleString('th-TH')} — มีการแก้หรือลบข้อมูลหลังบันทึก แจ้งผู้ดูแลระบบและเก็บหลักฐานไว้` });
  }
  return <div className="attendance-verify">
    <button type="button" onClick={() => void verify()} disabled={busy}>{busy ? 'กำลังตรวจสอบ…' : 'ตรวจสอบความต่อเนื่อง'}</button>
    {message && <p role={message.ok ? 'status' : 'alert'} className={message.ok ? 'status status-approved' : 'status status-rejected'}>{message.text}</p>}
  </div>;
}
