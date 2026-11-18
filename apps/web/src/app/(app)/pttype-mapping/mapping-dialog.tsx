'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AccountOption, MappedAccount, MappingSide, PttypeRight } from '@backoffice/core';
import { FormDialog } from '../../../components/form-dialog';
import { saveMapping } from '../../../lib/pttype-mapping-client';

const SIDE_LABEL: Record<MappingSide, string> = { opd: 'ผังบัญชี OPD', ipd: 'ผังบัญชี IPD' };
export const accountLabel = (account: MappedAccount | null) => (account ? `${account.code} · ${account.name ?? '(ไม่พบในผังบัญชี)'}` : 'ยังไม่ผูก');

/** popup ผูกผังบัญชี of one สิทธิ: OPD and IPD with what they were; saved straight to HOSxP. Closes from its buttons only. */
export function MappingDialog({ right, opdAccounts, ipdAccounts, onClose }: { right: PttypeRight; opdAccounts: readonly AccountOption[]; ipdAccounts: readonly AccountOption[]; onClose: () => void }) {
  const router = useRouter();
  const ids = useId();
  const expected = { opd: right.opd?.code ?? null, ipd: right.ipd?.code ?? null };
  const [values, setValues] = useState(expected);
  const [error, setError] = useState<string | null>(null);
  const changed = values.opd !== expected.opd || values.ipd !== expected.ipd;
  async function submit(): Promise<boolean> {
    setError(null);
    const result = await saveMapping(right.code, { ...values, expected });
    if (result.error) { setError(result.error); if (result.code === 'STALE') router.refresh(); return false; }
    router.refresh();
    return true;
  }
  const select = (side: MappingSide, options: readonly AccountOption[]) => {
    const current = right[side];
    // A code still mapped in HOSxP but gone from ผังบัญชี stays choosable, so saving the other side does not clear it.
    const missing = current && !options.some((option) => option.code === current.code) ? [{ code: current.code, name: current.name ?? '(ไม่พบในผังบัญชี)' }] : [];
    return <div className="mapping-field">
      <label htmlFor={`${ids}-${side}`}>{SIDE_LABEL[side]}</label>
      <select id={`${ids}-${side}`} value={values[side] ?? ''} onChange={(event) => setValues((now) => ({ ...now, [side]: event.target.value || null }))}>
        <option value="">— ยังไม่ผูก —</option>
        {[...missing, ...options].map((option) => <option key={option.code} value={option.code}>{option.code} · {option.name}</option>)}
      </select>
      <small className="mapping-was">เดิม: {accountLabel(current)}</small>
    </div>;
  };
  return <FormDialog title={`ผูกผังบัญชี · ${right.code} ${right.name}`} open onOpenChange={(open) => { if (!open) onClose(); }} wide submitLabel="บันทึกลง HOSxP" ready={changed} error={error} onSubmit={submit}>
    {select('opd', opdAccounts)}
    {select('ipd', ipdAccounts)}
    <p className="mapping-note">บันทึกแล้วจะเขียนลงตาราง paccountopd / paccountipd ใน HOSxP ทันที และเก็บค่าเดิม → ค่าใหม่ไว้ในประวัติการแก้ไข</p>
  </FormDialog>;
}
