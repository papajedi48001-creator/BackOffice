'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

/** A page inside the app to go to after signing in: one leading slash, no second slash or backslash that would leave the site. */
export function safeNext(next: string | undefined): string {
  return next && /^\/(?![/\\])[^\\\s]*$/.test(next) ? next : '/dashboard';
}

export function LocalSignInForm({ next }: { next?: string } = {}) {
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
      const result = await response.json().catch(() => ({})) as { mustChangePassword?: boolean };
      // After a reset the person sets a new password and signs in again before using the system.
      router.push(result.mustChangePassword ? '/change-password' : safeNext(next));
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
        <div className="input-with-icon">
          <svg className="input-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>
          <input id="username" name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'sign-in-error' : undefined} />
        </div>
      </div>
      <div className="form-field">
        <label htmlFor="password">รหัสผ่าน</label>
        <div className="input-with-icon input-with-toggle">
          <svg className="input-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
          <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'sign-in-error' : undefined} />
          <button type="button" className="password-eye" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} aria-pressed={showPassword}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              {showPassword
                ? <><path d="M10.7 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.2 3.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20"/></>
                : <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>}
            </svg>
          </button>
        </div>
      </div>
      {error && <p id="sign-in-error" className="form-error" role="alert">{error}</p>}
      <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'กำลังเข้าสู่ระบบ' : 'เข้าสู่ระบบ'}</button>
    </form>
  );
}
