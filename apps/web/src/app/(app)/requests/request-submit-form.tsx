'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function RequestSubmitForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ moduleCode: 'maintenance', organizationId }),
      });
      if (!response.ok) throw new Error('REQUEST_NOT_ACCEPTED');
      const request = await response.json() as { id: string };
      router.push(`/requests/${encodeURIComponent(request.id)}`);
    } catch {
      setError('ไม่สามารถสร้างคำขอได้ โปรดลองอีกครั้ง');
    } finally {
      setIsSubmitting(false);
    }
  }

  return <section className="request-create"><h3>คำขอซ่อมบำรุง</h3><p>สร้างคำขอเพื่อส่งตามสายอนุมัติของหน่วยงาน</p><button type="button" disabled={isSubmitting} onClick={submit}>{isSubmitting ? 'กำลังสร้างคำขอ' : 'สร้างคำขอซ่อมบำรุง'}</button>{error && <p className="form-error" role="alert">{error}</p>}</section>;
}
