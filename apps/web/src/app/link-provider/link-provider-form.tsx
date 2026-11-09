'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

const errors: Record<string, string> = {
  already_linked: 'บัญชีบุคลากรนี้ผูกกับ Provider ID อื่นแล้ว กรุณาติดต่อผู้ดูแลระบบ',
  ticket_expired: 'หมดเวลาผูกบัญชี กรุณาเข้าสู่ระบบด้วย Provider ID ใหม่',
  login_locked: 'บัญชีถูกล็อกชั่วคราวเพราะกรอกรหัสผ่านผิดหลายครั้ง กรุณาลองใหม่ภายหลัง',
  invalid_credentials: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'
};

export function LinkProviderForm() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    if (!username.trim() || !password) {
      setError('กรอกชื่อผู้ใช้และรหัสผ่านให้ครบ');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/provider/link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: username.trim(), password }) });
      const result = await response.json().catch(() => ({})) as { mustChangePassword?: boolean; error?: string };
      if (!response.ok) {
        setError((result.error && errors[result.error]) || 'ไม่สามารถผูกบัญชีได้ กรุณาลองใหม่');
        return;
      }
      router.push(result.mustChangePassword ? '/change-password' : '/dashboard');
    } catch {
      setError('ไม่สามารถผูกบัญชีได้ กรุณาลองใหม่');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="sign-in-form" noValidate onSubmit={submit}>
      <div className="form-field">
        <label htmlFor="link-username">ชื่อผู้ใช้</label>
        <input id="link-username" name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} aria-invalid={Boolean(error)} />
      </div>
      <div className="form-field">
        <label htmlFor="link-password">รหัสผ่าน</label>
        <input id="link-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(error)} />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'กำลังผูกบัญชี' : 'ผูกบัญชีและเข้าสู่ระบบ'}</button>
    </form>
  );
}
