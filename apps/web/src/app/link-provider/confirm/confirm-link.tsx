'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ActionDialog } from '../../../components/action-dialog';

const messages: Record<string, string> = {
  link_expired: 'หมดเวลายืนยัน กรุณากลับไปเริ่มใหม่ที่หน้าผูกบัญชี',
  link_failed: 'ผูกบัญชีไม่สำเร็จ บัญชีนี้อาจผูกกับ Provider ID อื่นอยู่แล้ว กรุณาติดต่อผู้ดูแลระบบ'
};

/** The link happens only from this ActionDialog's confirm button; the server checks the sealed link and the ticket again. */
export function ConfirmLink() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(): Promise<void> {
    setSaving(true); setError(null);
    try {
      const response = await fetch('/api/auth/thaid/link', { method: 'POST' });
      const body = await response.json().catch(() => ({})) as { next?: string; error?: string };
      if (response.ok && typeof body.next === 'string' && body.next.startsWith('/')) { router.push(body.next); return; }
      setError(messages[body.error ?? ''] ?? 'ระบบไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง');
    } catch { setError('ระบบไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง'); }
    setSaving(false);
  }

  return <>
    <button type="button" className="provider-sign-in-button" onClick={() => { setError(null); setOpen(true); }}><span className="provider-sign-in-label">ผูกบัญชีและเข้าสู่ระบบ</span></button>
    {open ? <ActionDialog title="ยืนยันผูกบัญชี" message="ผูกบัญชี Provider ID นี้กับคุณ ครั้งต่อไปเข้าสู่ระบบด้วย Provider ID หรือ ThaID ก็ได้" confirmLabel="ยืนยันผูกบัญชี"
      isSubmitting={saving} error={error} onConfirm={() => void confirm()} onClose={() => { setOpen(false); setError(null); }} /> : null}
  </>;
}
