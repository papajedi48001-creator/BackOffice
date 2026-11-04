'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OrganizationUnitType } from '@backoffice/contracts';
import { t } from '@backoffice/i18n';
import { FormDialog } from '../../../../../components/form-dialog';
import { headLabelKeys, unitTypeLabelKeys } from '../../../../../lib/organization-unit-type';
import { ThaiDateInput } from '../../../../../components/thai-date-input';

const errorKeys = { PERSON_NOT_ACTIVE: 'hrHeadPersonNotActive', EFFECTIVE_FROM_BEFORE_CURRENT: 'hrHeadStartsBeforeCurrent', ORGANIZATION_NOT_FOUND: 'hrOrganizationNotFound' } as const;

export function OrganizationForms({ organizationId, unitType, people, today }: { organizationId: string; unitType: OrganizationUnitType | null; people: { id: string; label: string }[]; today: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string>(unitType ?? '');
  const [headLabel, setHeadLabel] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [open, setOpen] = useState<'type' | 'head' | null>(null);
  const toggle = (which: 'type' | 'head') => (next: boolean) => { setError(null); setOpen(next ? which : null); };
  const labels = headLabelKeys(unitType);

  async function save(path: string, method: 'PUT' | 'POST', body: unknown): Promise<boolean> {
    setError(null);
    try {
      const response = await fetch(`/api/hr/organizations/${organizationId}/${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (response.ok) { router.refresh(); return true; }
      const code = ((await response.json()) as { error?: string }).error;
      setError(t(code && code in errorKeys ? errorKeys[code as keyof typeof errorKeys] : 'hrOrganizationActionFailed'));
    } catch { setError(t('hrOrganizationActionFailed')); }
    return false;
  }

  async function submitType(event: React.FormEvent) {
    event.preventDefault();
    return save('unit-type', 'PUT', { unitType: selectedType || null });
  }
  async function submitHead(event: React.FormEvent) {
    event.preventDefault();
    const person = people.find((candidate) => candidate.label === headLabel.trim());
    if (!person) { setError(t('hrChoosePersonFromList')); return false; }
    const saved = await save('heads', 'POST', { personId: person.id, effectiveFrom });
    if (saved) setHeadLabel('');
    return saved;
  }

  return <div className="organization-forms">
    {error && !open && <p role="alert" className="form-error">{error}</p>}
    <div className="row-actions">
      <FormDialog triggerLabel={t('hrEditUnitType')} triggerClassName="button-secondary" title={t('hrEditUnitType')} submitLabel={t('hrSaveUnitType')} open={open === 'type'} onOpenChange={toggle('type')} error={error} onSubmit={submitType}>
        <label>{t('hrUnitType')}
          <select value={selectedType} onChange={(event) => setSelectedType(event.target.value)}>
            <option value="">{t('hrUnitTypeNone')}</option>
            {(Object.keys(unitTypeLabelKeys) as OrganizationUnitType[]).map((type) => <option key={type} value={type}>{t(unitTypeLabelKeys[type])}</option>)}
          </select>
        </label>
      </FormDialog>
      <FormDialog triggerLabel={t(labels.assign)} title={t(labels.assign)} submitLabel={t(labels.assign)} open={open === 'head'} onOpenChange={toggle('head')} error={error} onSubmit={submitHead}>
        <label>{t(labels.newHead)}
          <input list="organization-head-people" value={headLabel} onChange={(event) => setHeadLabel(event.target.value)} />
        </label>
        <datalist id="organization-head-people">{people.map((person) => <option key={person.id} value={person.label} />)}</datalist>
        <label>{t(labels.startDate)}
          <ThaiDateInput value={effectiveFrom} onChange={(value) => setEffectiveFrom(value)} required />
        </label>
      </FormDialog>
    </div>
  </div>;
}
