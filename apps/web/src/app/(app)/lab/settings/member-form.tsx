'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { labMemberRoleSchema, type LabMemberRole } from '@backoffice/contracts';
import { ActionDialog } from '../../../../components/action-dialog';
import { FormDialog } from '../../../../components/form-dialog';
import { sendLab } from '../../../../lib/lab-client';
import { labRoleLabel } from '../../../../lib/lab-labels';
import { PersonPicker, type PickedPerson } from '../../admin/person-picker';

export interface MemberValues { personId: string; displayName: string; role: LabMemberRole; sectionIds: string[] }

/** เพิ่ม/แก้ไขสมาชิก (ผู้จัดการวัสดุคงคลัง Lab only): a เจ้าหน้าที่ Lab needs at least one งาน; หัวหน้า and ผู้ดูแลคลัง work across the Lab. */
export function MemberForm({ member, sections }: { member?: MemberValues; sections: ReadonlyArray<{ id: string; name: string }> }) {
  const router = useRouter();
  const ids = useId();
  const [person, setPerson] = useState<PickedPerson | null>(null);
  const [role, setRole] = useState<LabMemberRole>(member?.role ?? 'STAFF');
  const [sectionIds, setSectionIds] = useState<string[]>(member?.sectionIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const personId = member?.personId ?? person?.personId ?? '';
  const ready = personId !== '' && (role === 'STAFF' ? sectionIds.length > 0 : true);
  async function submit(): Promise<boolean> {
    setError(null);
    const { error: failure } = await sendLab('/api/lab/members', 'PUT', { personId, role, sectionIds: role === 'STAFF' ? sectionIds : [] });
    if (failure) { setError(failure); return false; }
    router.refresh();
    return true;
  }
  return <FormDialog title={member ? `แก้ไขสมาชิก ${member.displayName}` : 'เพิ่มสมาชิก'} triggerLabel={member ? 'แก้ไข' : 'เพิ่มสมาชิก'} triggerClassName={member ? 'button-secondary' : undefined} submitLabel="บันทึก" ready={ready} error={error}
    onOpenChange={(open) => { if (open) { setError(null); setPerson(null); setRole(member?.role ?? 'STAFF'); setSectionIds(member?.sectionIds ?? []); } }} onSubmit={submit}>
    {member ? <p className="admin-picked"><strong>{member.displayName}</strong></p> : <PersonPicker person={person} onPick={setPerson} searchUrl="/api/lab/people" />}
    <fieldset className="lab-choice"><legend>บทบาท</legend>
      {labMemberRoleSchema.options.map((option) => <label key={option}><input type="radio" name={`${ids}-role`} value={option} checked={role === option} onChange={() => setRole(option)} /> {labRoleLabel(option)}</label>)}
    </fieldset>
    {role === 'STAFF' && <fieldset className="lab-choice"><legend>งานที่ทำ</legend>
      {sections.map((section) => <label key={section.id}><input type="checkbox" checked={sectionIds.includes(section.id)} onChange={(event) => setSectionIds((current) => (event.target.checked ? [...current, section.id] : current.filter((id) => id !== section.id)))} /> {section.name}</label>)}
    </fieldset>}
  </FormDialog>;
}

/** นำออกจากสมาชิก after confirmation. */
export function RemoveMember({ personId, displayName }: { personId: string; displayName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    setBusy(true); setError(null);
    const { error: failure } = await sendLab(`/api/lab/members/${encodeURIComponent(personId)}`, 'DELETE');
    setBusy(false);
    if (failure) { setError(failure); return; }
    setOpen(false);
    router.refresh();
  }
  return <>
    <button type="button" className="button-danger" aria-label={`นำ ${displayName} ออก`} onClick={() => { setError(null); setOpen(true); }}>นำออก</button>
    {open && <ActionDialog title="นำออกจากสมาชิก" message={`${displayName} จะใช้ระบบวัสดุคงคลัง Lab ไม่ได้อีก ประวัติที่บันทึกไว้ยังอยู่`} confirmLabel="นำออก" tone="danger" isSubmitting={busy} error={error} onConfirm={() => void confirm()} onClose={() => setOpen(false)} />}
  </>;
}
