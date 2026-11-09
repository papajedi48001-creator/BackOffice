'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@backoffice/i18n';
import { ActionDialog } from '../../../../components/action-dialog';
import { FormDialog } from '../../../../components/form-dialog';
import { sendAdmin } from '../../../../lib/admin-labels';
import { formatBangkokDateTime } from '../../../../lib/bangkok-time';
import { PersonPicker, type PickedPerson } from '../person-picker';

export interface PendingLoginRow { id: string; displayName: string | null; lastSeenAt: string }
export interface LinkedPersonRow { personId: string; personName: string | null; displayName: string | null; linkedAt: string; linkedByAdmin: boolean }

/** บัญชี Provider ID: logins waiting for a บุคลากร, and the people already linked. Every change opens a popup; the server checks ผู้ดูแลระบบ again. */
export function ProviderLinksManager({ pending, links }: { pending: PendingLoginRow[]; links: LinkedPersonRow[] }) {
  const [linking, setLinking] = useState<PendingLoginRow | null>(null);
  const [unlinking, setUnlinking] = useState<LinkedPersonRow | null>(null);
  return <>
    <h3>{t('adminProviderPending')}</h3>
    {pending.length === 0 ? <p>{t('adminProviderNoPending')}</p> : <div className="leave-table-scroll"><table className="admin-grant-table">
      <thead><tr><th>{t('adminProviderName')}</th><th>{t('adminProviderLastSeen')}</th><th></th></tr></thead>
      <tbody>{pending.map((row) => <tr key={row.id}>
        <td><strong>{row.displayName ?? '—'}</strong></td>
        <td>{formatBangkokDateTime(row.lastSeenAt)}</td>
        <td className="request-actions"><button type="button" aria-label={`${t('adminProviderLinkTo')} ${row.displayName ?? ''}`} onClick={() => setLinking(row)}>{t('adminProviderLinkTo')}</button></td>
      </tr>)}</tbody>
    </table></div>}
    <h3>{t('adminProviderLinked')}</h3>
    {links.length === 0 ? <p>{t('adminProviderNoLinks')}</p> : <div className="leave-table-scroll"><table className="admin-grant-table">
      <thead><tr><th>{t('adminPerson')}</th><th>{t('adminProviderName')}</th><th>{t('adminProviderLinkedAt')}</th><th></th></tr></thead>
      <tbody>{links.map((row) => <tr key={row.personId}>
        <td><strong>{row.personName ?? '—'}</strong></td>
        <td>{row.displayName ?? '—'}</td>
        <td>{formatBangkokDateTime(row.linkedAt)}<small className="admin-muted">{t(row.linkedByAdmin ? 'adminProviderByAdmin' : 'adminProviderBySelf')}</small></td>
        <td className="request-actions"><button type="button" className="button-secondary" aria-label={`${t('adminProviderUnlink')} ${row.personName ?? ''}`} onClick={() => setUnlinking(row)}>{t('adminProviderUnlink')}</button></td>
      </tr>)}</tbody>
    </table></div>}
    {linking && <LinkDialog pending={linking} onClose={() => setLinking(null)} />}
    {unlinking && <UnlinkDialog link={unlinking} onClose={() => setUnlinking(null)} />}
  </>;
}

function LinkDialog({ pending, onClose }: { pending: PendingLoginRow; onClose: () => void }) {
  const router = useRouter();
  const [person, setPerson] = useState<PickedPerson | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (!person) return;
    setBusy(true); setError(null);
    const sent = await sendAdmin('/api/admin/provider-links', 'POST', { pendingId: pending.id, personId: person.personId });
    setBusy(false);
    if (sent.error) { setError(sent.error); return; }
    onClose();
    router.refresh();
  }
  return <FormDialog open onOpenChange={(open) => { if (!open) onClose(); }} title={`${t('adminProviderLinkTo')}: ${pending.displayName ?? '—'}`} submitLabel={t('adminProviderLinkSubmit')} ready={Boolean(person)} isSubmitting={busy} error={error} onSubmit={() => save()}>
    <p className="admin-note">{t('adminProviderLinkNote')}</p>
    <PersonPicker person={person} onPick={setPerson} />
  </FormDialog>;
}

function UnlinkDialog({ link, onClose }: { link: LinkedPersonRow; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function remove(reason: string) {
    setBusy(true); setError(null);
    const sent = await sendAdmin(`/api/admin/provider-links/${encodeURIComponent(link.personId)}`, 'DELETE', { reason });
    setBusy(false);
    if (sent.error) { setError(sent.error); return; }
    onClose();
    router.refresh();
  }
  return <ActionDialog title={`${t('adminProviderUnlink')}: ${link.personName ?? '—'}`} message={t('adminProviderUnlinkMessage')} confirmLabel={t('adminProviderUnlink')} tone="danger" reason maxLength={500} isSubmitting={busy} error={error} onConfirm={(reason) => void remove(reason)} onClose={onClose} />;
}
