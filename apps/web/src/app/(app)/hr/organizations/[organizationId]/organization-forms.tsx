'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OrganizationUnitType } from '@backoffice/contracts';
import { t } from '@backoffice/i18n';
import { unitTypeLabelKeys } from '../../../../../lib/organization-unit-type';

const errorKeys = { PERSON_NOT_ACTIVE: 'hrHeadPersonNotActive', EFFECTIVE_FROM_BEFORE_CURRENT: 'hrHeadStartsBeforeCurrent', ORGANIZATION_NOT_FOUND: 'hrOrganizationNotFound' } as const;

export function OrganizationForms({ organizationId, unitType, people, today }: { organizationId: string; unitType: OrganizationUnitType | null; people: { id: string; label: string }[]; today: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string>(unitType ?? '');
  const [headLabel, setHeadLabel] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(today);

  async function save(path: string, method: 'PUT' | 'POST', body: unknown): Promise<void> {
    setError(null);
    try {
      const response = await fetch(`/api/hr/organizations/${organizationId}/${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (response.ok) { router.refresh(); return; }
      const code = ((await response.json()) as { error?: string }).error;
      setError(t(code && code in errorKeys ? errorKeys[code as keyof typeof errorKeys] : 'hrOrganizationActionFailed'));
    } catch { setError(t('hrOrganizationActionFailed')); }
  }

  async function submitType(event: React.FormEvent) {
    event.preventDefault();
    await save('unit-type', 'PUT', { unitType: selectedType || null });
  }
  async function submitHead(event: React.FormEvent) {
    event.preventDefault();
    const person = people.find((candidate) => candidate.label === headLabel.trim());
    if (!person) { setError(t('hrChoosePersonFromList')); return; }
    await save('heads', 'POST', { personId: person.id, effectiveFrom });
    setHeadLabel('');
  }

  return <div className="organization-forms">
    {error && <p role="alert" className="form-error">{error}</p>}
    <form className="organization-form" onSubmit={submitType}>
      <label>{t('hrUnitType')}
        <select value={selectedType} onChange={(event) => setSelectedType(event.target.value)}>
          <option value="">{t('hrUnitTypeNone')}</option>
          {(Object.keys(unitTypeLabelKeys) as OrganizationUnitType[]).map((type) => <option key={type} value={type}>{t(unitTypeLabelKeys[type])}</option>)}
        </select>
      </label>
      <button type="submit">{t('hrSaveUnitType')}</button>
    </form>
    <form className="organization-form" onSubmit={submitHead}>
      <label>{t('hrNewHead')}
        <input list="organization-head-people" value={headLabel} onChange={(event) => setHeadLabel(event.target.value)} />
      </label>
      <datalist id="organization-head-people">{people.map((person) => <option key={person.id} value={person.label} />)}</datalist>
      <label>{t('hrHeadStartDate')}
        <input type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} required />
      </label>
      <button type="submit">{t('hrAssignHead')}</button>
    </form>
  </div>;
}
