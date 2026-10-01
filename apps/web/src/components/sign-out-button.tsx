'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function SignOutButton() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function signOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try { await fetch('/api/auth/local/sign-out', { method: 'POST' }); } finally { router.replace('/'); }
  }

  return <button type="button" className="sign-out-button" disabled={isSigningOut} onClick={signOut}>{isSigningOut ? 'กำลังออกจากระบบ' : 'ออกจากระบบ'}</button>;
}
