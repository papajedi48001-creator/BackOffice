'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { moneyPageSchema, type MoneyPage } from '@backoffice/contracts';
import { ActionDialog } from '../../../../components/action-dialog';
import { FormDialog } from '../../../../components/form-dialog';
import { sendMoney } from '../../../../lib/money-client';
import { MONEY_PAGES } from '../../../../lib/money-pages';
import { PersonPicker, type PickedPerson } from '../../admin/person-picker';

export interface MoneyMemberValues { personId: string; displayName: string; pages: MoneyPage[] }

/** เพิ่ม/แก้ไขเจ้าหน้าที่ (ผู้ดูแล Smart Money only): a person and at least one page they may open. */
export function MemberForm({ member }: { member?: MoneyMemberValues }) {
  const router = useRouter();
  const [person, setPerson] = useState<PickedPerson | null>(null);
  const [pages, setPages] = useState<MoneyPage[]>(member?.pages ?? []);
  const [error, setError] = useState<string | null>(null);
  const personId = member?.personId ?? person?.personId ?? '';
  const ready = personId !== '' && pages.length > 0;
  async function submit(): Promise<boolean> {
    setError(null);
    const { error: failure } = await sendMoney('/api/money/members', 'PUT', { personId, pages });
    if (failure) { setError(failure); return false; }
    router.refresh();
    return true;
  }
  return <FormDialog title={member ? `แก้ไขสิทธิ์ ${member.displayName}` : 'เพิ่มเจ้าหน้าที่'} triggerLabel={member ? 'แก้ไข' : 'เพิ่มเจ้าหน้าที่'} triggerClassName={member ? 'button-secondary' : undefined} submitLabel="บันทึก" ready={ready} error={error}
    onOpenChange={(open) => { if (open) { setError(null); setPerson(null); setPages(member?.pages ?? []); } }} onSubmit={submit}>
    {member ? <p className="admin-picked"><strong>{member.displayName}</strong></p> : <PersonPicker person={person} onPick={setPerson} searchUrl="/api/money/people" />}
    <fieldset className="lab-choice"><legend>หน้าที่เปิดดูได้</legend>
      {moneyPageSchema.options.map((page) => <label key={page}><input type="checkbox" checked={pages.includes(page)} onChange={(event) => setPages((current) => (event.target.checked ? [...current, page] : current.filter((value) => value !== page)))} /> {MONEY_PAGES[page].title}</label>)}
    </fieldset>
  </FormDialog>;
}

/** ถอดสิทธิ์ after confirmation. */
export function RemoveMember({ personId, displayName }: { personId: string; displayName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    setBusy(true); setError(null);
    const { error: failure } = await sendMoney(`/api/money/members/${encodeURIComponent(personId)}`, 'DELETE');
    setBusy(false);
    if (failure) { setError(failure); return; }
    setOpen(false);
    router.refresh();
  }
  return <>
    <button type="button" className="button-danger" aria-label={`ถอดสิทธิ์ ${displayName}`} onClick={() => { setError(null); setOpen(true); }}>ถอดสิทธิ์</button>
    {open && <ActionDialog title="ถอดสิทธิ์ Smart Money" message={`${displayName} จะเปิดดู Smart Money ไม่ได้อีก`} confirmLabel="ถอดสิทธิ์" tone="danger" isSubmitting={busy} error={error} onConfirm={() => void confirm()} onClose={() => setOpen(false)} />}
  </>;
}
