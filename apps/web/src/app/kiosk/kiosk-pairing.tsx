'use client';

import { useId, useState } from 'react';

/** The box's first screen: type the 8-digit รหัสจับคู่ the ผู้ดูแลระบบ was shown. Spaces are ignored. */
export function KioskPairing({ onPair, busy = false, error }: { onPair: (code: string) => void; busy?: boolean; error?: string | null }) {
  const id = useId();
  const [code, setCode] = useState('');
  const [invalid, setInvalid] = useState(false);
  const submit = () => {
    const digits = code.replace(/\s+/g, '');
    if (!/^\d{8}$/.test(digits)) { setInvalid(true); return; }
    setInvalid(false);
    onPair(digits);
  };
  const message = invalid ? 'กรอกรหัสจับคู่ 8 หลัก' : error;
  return <form className="kiosk-pairing" aria-label="จับคู่กล่องลงเวลา" onSubmit={(event) => { event.preventDefault(); submit(); }}>
    <h1>จับคู่กล่องลงเวลา</h1>
    <p>ขอรหัสจับคู่ 8 หลักจากผู้ดูแลระบบ (หน้า กล่องและจุดลงเวลา) แล้วกรอกที่นี่</p>
    <label htmlFor={`${id}-code`}>รหัสจับคู่</label>
    <input id={`${id}-code`} inputMode="numeric" autoComplete="off" value={code} maxLength={9} onChange={(event) => setCode(event.target.value)} />
    {message && <p role="alert">{message}</p>}
    <button type="button" onClick={submit} disabled={busy}>จับคู่เครื่อง</button>
  </form>;
}
