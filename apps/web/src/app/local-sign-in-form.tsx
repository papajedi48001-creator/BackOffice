'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export function LocalSignInForm() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      const response = await fetch('/api/auth/local', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!response.ok) throw new Error('AUTHENTICATION_REJECTED');
      router.push('/dashboard');
    } catch {
      setError('ไม่สามารถเข้าสู่ระบบได้ โปรดตรวจสอบชื่อผู้ใช้และรหัสผ่าน');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="sign-in-form" noValidate onSubmit={submit}>
      <p className="sign-in-caption">บัญชีท้องถิ่นสำหรับโครงการนำร่อง</p>
      <div className="form-field">
        <label htmlFor="username">ชื่อผู้ใช้</label>
        <input id="username" name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'sign-in-error' : undefined} />
      </div>
      <div className="form-field">
        <label htmlFor="password">รหัสผ่าน</label>
        <div className="password-field">
          <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'sign-in-error' : undefined} />
          <button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}>
            {showPassword ? 'ซ่อน' : 'แสดง'}
          </button>
        </div>
      </div>
      {error && <p id="sign-in-error" className="form-error" role="alert">{error}</p>}
      <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'กำลังเข้าสู่ระบบ' : 'เข้าสู่ระบบ'}</button>
    </form>
  );
}
