'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ActionDialog } from '../../../../../components/action-dialog';
import { sendLab } from '../../../../../lib/lab-client';

type Step = 'APPROVE' | 'RETURN' | 'REJECT' | 'CANCEL';
const steps: Record<Step, { button: string; title: string; confirm: string; tone: 'primary' | 'danger' }> = {
  APPROVE: { button: 'อนุมัติ', title: 'อนุมัติใบขอเบิก', confirm: 'อนุมัติ', tone: 'primary' },
  RETURN: { button: 'ส่งกลับแก้ไข', title: 'ส่งกลับแก้ไข', confirm: 'ส่งกลับ', tone: 'primary' },
  REJECT: { button: 'ไม่อนุมัติ', title: 'ไม่อนุมัติใบขอเบิก', confirm: 'ไม่อนุมัติ', tone: 'danger' },
  CANCEL: { button: 'ยกเลิกใบขอเบิก', title: 'ยกเลิกใบขอเบิก', confirm: 'ยืนยันยกเลิก', tone: 'danger' }
};

/**
 * อนุมัติ / ส่งกลับแก้ไข / ไม่อนุมัติ for the หัวหน้า Lab, and ยกเลิก for the requester. Returning or rejecting needs a reason, and so does
 * deciding one's own ใบขอเบิก (`own`); the server applies the same rules.
 */
export function DecisionButtons({ requisitionId, docNo, decide, cancel, own }: { requisitionId: string; docNo: string; decide: boolean; cancel: boolean; own: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm(reason: string) {
    if (!step) return;
    setBusy(true); setError(null);
    const base = `/api/lab/requisitions/${encodeURIComponent(requisitionId)}`;
    const { error: failure } = step === 'CANCEL' ? await sendLab(`${base}/cancel`, 'POST') : await sendLab(`${base}/decision`, 'POST', { decision: step, reason });
    setBusy(false);
    if (failure) { setError(failure); return; }
    setStep(null);
    router.refresh();
  }
  const open = (next: Step) => { setError(null); setStep(next); };
  const current = step ? steps[step] : null;
  return <div className="request-actions">
    {decide && (['APPROVE', 'RETURN', 'REJECT'] as const).map((next) => <button key={next} type="button" className={next === 'APPROVE' ? undefined : next === 'REJECT' ? 'button-danger' : 'button-secondary'} onClick={() => open(next)}>{steps[next].button}</button>)}
    {cancel && <button type="button" className="button-secondary" onClick={() => open('CANCEL')}>{steps.CANCEL.button}</button>}
    {step && current && <ActionDialog title={current.title} message={`${docNo}${own && step !== 'CANCEL' ? ' เป็นใบขอเบิกของคุณเอง ต้องระบุเหตุผล' : ''}`} confirmLabel={current.confirm} tone={current.tone}
      reason={step === 'RETURN' || step === 'REJECT' || (own && step === 'APPROVE')} isSubmitting={busy} error={error} onConfirm={(reason) => void confirm(reason)} onClose={() => setStep(null)} />}
  </div>;
}
