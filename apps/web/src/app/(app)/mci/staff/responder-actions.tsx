'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MciCommandRole } from '@backoffice/contracts';
import { FormDialog } from '../../../../components/form-dialog';
import { MCI_ROLES, mciRoleLabel, mciText, sendMci } from '../../../../lib/mci-labels';

/** ย้ายจุด / เปลี่ยนบทบาท for one responder. Only a ผู้บัญชาการเหตุ (`canAssignRole`) sees the role field; the server checks both again. */
export function ResponderEditForm({ responder, zones, canAssignRole }: {
  responder: { id: string; displayName: string; zoneId: string | null; commandRole: MciCommandRole };
  zones: ReadonlyArray<{ id: string; name: string }>;
  canAssignRole: boolean;
}) {
  const router = useRouter();
  const [zoneId, setZoneId] = useState(responder.zoneId ?? '');
  const [commandRole, setCommandRole] = useState<MciCommandRole>(responder.commandRole);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();
  async function submit(): Promise<boolean> {
    setError(null);
    const { error: failure } = await sendMci(`/api/mci/responders/${encodeURIComponent(responder.id)}`, 'PATCH', { zoneId: zoneId || null, commandRole });
    if (failure) { setError(failure); return false; }
    router.refresh();
    return true;
  }
  return <FormDialog title={`จัดจุด ${responder.displayName}`} triggerLabel="จัดจุด" triggerAriaLabel={`จัดจุด ${responder.displayName}`} triggerClassName="button-secondary" submitLabel={mciText.save} error={error}
    onOpenChange={(open) => { if (open) { setError(null); setZoneId(responder.zoneId ?? ''); setCommandRole(responder.commandRole); } }} onSubmit={submit}>
    <div className="mci-form-grid">
      <label htmlFor={`${ids}-zone`}>{mciText.zone}</label>
      <select id={`${ids}-zone`} value={zoneId} onChange={(event) => setZoneId(event.target.value)}>
        <option value="">{mciText.waitingZone}</option>
        {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
      </select>
      {canAssignRole && <>
        <label htmlFor={`${ids}-role`}>{mciText.role}</label>
        <select id={`${ids}-role`} value={commandRole} onChange={(event) => setCommandRole(event.target.value as MciCommandRole)}>
          {MCI_ROLES.map((role) => <option key={role} value={role}>{mciRoleLabel(role)}</option>)}
        </select>
      </>}
    </div>
  </FormDialog>;
}
