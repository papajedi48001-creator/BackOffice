'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CommandChainTarget } from '@backoffice/contracts';
import { t } from '@backoffice/i18n';
import { FormDialog } from '../../../../components/form-dialog';
import { leaveTargetLabel } from '../../../../lib/leave-labels';
import { travelErrorMessage, travelTypeLabel } from '../../../../lib/travel-labels';

const targets: CommandChainTarget[] = ['NEAREST_HEAD', 'SECTION', 'DIVISION', 'HOSPITAL'];

/** One row per ประเภทการเดินทาง; saving a row changes only new and resubmitted คำขอ. */
export function TravelTypeTargets({ types }: { types: Array<{ code: string; approvalTarget: CommandChainTarget }> }) {
  const router = useRouter();
  const [values, setValues] = useState(Object.fromEntries(types.map((type) => [type.code, type.approvalTarget])));
  const [message, setMessage] = useState<{ code: string; text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(code: string): Promise<boolean> {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/travel/types/${encodeURIComponent(code)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ approvalTarget: values[code] }) });
      if (response.ok) { setMessage({ code, text: t('travelSaved'), error: false }); router.refresh(); return true; }
      setMessage({ code, text: travelErrorMessage(((await response.json()) as { error?: string }).error), error: true });
    } catch { setMessage({ code, text: travelErrorMessage(null), error: true }); } finally { setBusy(false); }
    return false;
  }

  return <div className="leave-table-scroll"><table>
    <thead><tr><th>{t('travelType')}</th><th>{t('leaveApprovalTarget')}</th><th></th></tr></thead>
    <tbody>{types.map((type) => {
      const label = travelTypeLabel(type.code);
      const title = `${t('formEdit')} ${t('leaveApprovalTarget')} ${label}`;
      return <tr key={type.code}>
        <td>{label}</td>
        <td>{leaveTargetLabel(type.approvalTarget)}</td>
        <td><FormDialog title={title} triggerLabel={t('formEdit')} triggerAriaLabel={title} triggerClassName="button-secondary" submitLabel={t('leaveSave')} isSubmitting={busy}
          error={message?.code === type.code && message.error ? message.text : null}
          onOpenChange={(open) => { setMessage(null); if (open) setValues((current) => ({ ...current, [type.code]: type.approvalTarget })); }}
          onSubmit={(event) => { event.preventDefault(); return save(type.code); }}>
          <label>{t('leaveApprovalTarget')}<select value={values[type.code]} onChange={(event) => setValues({ ...values, [type.code]: event.target.value as CommandChainTarget })}>{targets.map((target) => <option key={target} value={target}>{leaveTargetLabel(target)}</option>)}</select></label>
        </FormDialog>{message?.code === type.code && !message.error && <span role="status"> {message.text}</span>}</td>
      </tr>;
    })}</tbody>
  </table></div>;
}
