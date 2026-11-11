'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ActionDialog } from '../../../../components/action-dialog';

const errors: Record<string, string> = {
  TOO_LARGE: 'รูปใหญ่เกิน 3 MB กรุณาย่อขนาดรูปก่อนอัปโหลด',
  INVALID_IMAGE: 'รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP'
};

/** ผู้ดูแลระบบ > หน้าตาระบบ: the hospital photo behind the sign-in page. */
export function LoginPhotoSettings({ version }: { version: string | null }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function upload() {
    if (!file || busy) return;
    setBusy(true); setError(null);
    try {
      const form = new FormData();
      form.set('file', file);
      const response = await fetch('/api/admin/site-image', { method: 'POST', body: form });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        setError(errors[body.error ?? ''] ?? 'อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่');
        return;
      }
      setFile(null);
      router.refresh();
    } catch {
      setError('อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่');
    } finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true); setError(null);
    try {
      const response = await fetch('/api/admin/site-image', { method: 'DELETE' });
      if (!response.ok) { setError('ลบรูปไม่สำเร็จ กรุณาลองใหม่'); return; }
      setConfirming(false);
      router.refresh();
    } catch {
      setError('ลบรูปไม่สำเร็จ กรุณาลองใหม่');
    } finally { setBusy(false); }
  }

  return <div className="login-photo-settings">
    <h3>รูปโรงพยาบาลบนหน้าเข้าสู่ระบบ</h3>
    <p className="admin-note">แสดงเป็นพื้นหลังฝั่งซ้ายของหน้าเข้าสู่ระบบ ใต้ฟิล์มสีน้ำเงินให้อ่านตัวหนังสือชัด แนะนำภาพแนวนอนหรือแนวตั้ง กว้างอย่างน้อย 1200 px ไฟล์ JPG, PNG หรือ WebP ไม่เกิน 3 MB</p>
    {version
      ? <img className="login-photo-preview" src={`/api/site/login-photo?v=${version}`} alt="รูปโรงพยาบาลบนหน้าเข้าสู่ระบบ" />
      : <p className="admin-note">ยังไม่มีรูป หน้าเข้าสู่ระบบใช้พื้นสีน้ำเงิน</p>}
    <div className="login-photo-actions">
      <label className="form-field">
        <span>เลือกรูป (JPG, PNG, WebP)</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(null); }} />
      </label>
      <button type="button" onClick={() => void upload()} disabled={!file || busy}>{busy && file ? 'กำลังอัปโหลด' : 'อัปโหลดรูป'}</button>
      {version && <button type="button" className="secondary-button" onClick={() => { setConfirming(true); setError(null); }} disabled={busy}>ลบรูป</button>}
    </div>
    {error && !confirming && <p className="form-error" role="alert">{error}</p>}
    {confirming && <ActionDialog title="ลบรูปโรงพยาบาล" message="หน้าเข้าสู่ระบบจะกลับไปใช้พื้นสีน้ำเงิน" confirmLabel="ลบรูป" tone="danger" isSubmitting={busy} error={error} onConfirm={() => void remove()} onClose={() => setConfirming(false)} />}
  </div>;
}
