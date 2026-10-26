'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CommandChainTarget } from '@backoffice/contracts';
import { t } from '@backoffice/i18n';
import { leaveTargetLabel } from '../../../../lib/leave-labels';
import { travelErrorMessage, travelTypeLabel } from '../../../../lib/travel-labels';

const targets: CommandChainTarget[] = ['NEAREST_HEAD', 'SECTION', 'DIVISION', 'HOSPITAL'];

/** One row per ประเภทการเดินทาง; saving a row changes only new and resubmitted คำขอ. */
export function TravelTypeTargets({ types }: { types: Array<{ code: string; approvalTarget: CommandChainTarget }> }) {
  const router = useRouter();
  const [values, setValues] = useState(Object.fromEntries(types.map((type) => [type.code, type.approvalTarget])));
  const [message, setMessage] = useState<{ code: string; text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(code: string) {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/travel/types/${encodeURIComponent(code)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ approvalTarget: values[code] }) });
      if (response.ok) { setMessage({ code, text: t('travelSaved'), error: false }); router.refresh(); return; }
      setMessage({ code, text: travelErrorMessage(((await response.json()) as { error?: string }).error), error: true });
    } catch { setMessage({ code, text: travelErrorMessage(null), error: true }); } finally { setBusy(false); }
  }

  return <div className="leave-table-scroll"><table>
    <thead><tr><th>{t('travelType')}</th><th>{t('leaveApprovalTarget')}</th><th></th></tr></thead>
    <tbody>{types.map((type) => <tr key={type.code}>
      <td>{travelTypeLabel(type.code)}</td>
      <td><select aria-label={`${t('leaveApprovalTarget')} ${travelTypeLabel(type.code)}`} value={values[type.code]} onChange={(event) => setValues({ ...values, [type.code]: event.target.value as CommandChainTarget })}>{targets.map((target) => <option key={target} value={target}>{leaveTargetLabel(target)}</option>)}</select></td>
      <td><button type="button" disabled={busy} onClick={() => void save(type.code)}>{t('leaveSave')}</button>{message?.code === type.code && <span role={message.error ? 'alert' : 'status'} className={message.error ? 'form-error' : undefined}> {message.text}</span>}</td>
    </tr>)}</tbody>
  </table></div>;
}
