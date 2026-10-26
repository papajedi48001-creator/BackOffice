import Link from 'next/link';
import { EmploymentTypeService, LeaveSettingsService } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { HrPageMessage } from '../hr-page-message';
import { hrLeaveContext } from '../leave-page';
import { EntitlementForm, LeaveTypeForm, MinWorkingDaysForm } from './settings-forms';

const TYPES_TAB = 'types';
const NEW_TYPE = 'new';

/** One tab per ประเภทการจ้าง with its สิทธิ์การลา, and a last tab for the minimum working days and ประเภทการลา, one type at a time. */
export default async function LeaveSettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; type?: string }> }) {
  const context = await hrLeaveContext();
  if (!context.ok) return <HrPageMessage titleKey="leaveSettings" reason={context.reason} />;
  const { tab, type: typeTab } = await searchParams;
  const settings = new LeaveSettingsService(context.database);
  const [types, entitlements, employmentTypes, minimum] = await Promise.all([settings.listTypes(), settings.listEntitlements(), new EmploymentTypeService(context.database).list({ activeOnly: true }), settings.getMinWorkingDays()]);
  const current = tab === TYPES_TAB ? TYPES_TAB : employmentTypes.find((employmentType) => employmentType.id === tab)?.id ?? employmentTypes[0]?.id ?? TYPES_TAB;
  const employmentType = employmentTypes.find((candidate) => candidate.id === current);
  const nextOrder = Math.max(0, ...types.map((type) => type.sortOrder)) + 1;
  const currentType = typeTab === NEW_TYPE ? NEW_TYPE : types.find((type) => type.id === typeTab)?.id ?? types[0]?.id ?? NEW_TYPE;
  const editedType = types.find((type) => type.id === currentType);
  const typeTabs = [...types.map((type) => ({ id: type.id, label: type.name })), { id: NEW_TYPE, label: t('leaveAddType') }];
  const tabs = [...employmentTypes.map((candidate) => ({ id: candidate.id, label: candidate.name })), { id: TYPES_TAB, label: t('leaveSettingsTypesTab') }];
  return <section className="leave-settings">
    <h2>{t('leaveSettings')}</h2>
    <nav className="leave-tabs" aria-label={t('leaveSettings')}>
      <ul>{tabs.map((item) => <li key={item.id}><Link href={`/leave/settings?tab=${encodeURIComponent(item.id)}`} aria-current={item.id === current ? 'page' : undefined}>{item.label}</Link></li>)}</ul>
    </nav>
    {employmentType ? <section aria-label={employmentType.name} className="leave-entitlements">
      <h3>{t('leaveEntitlements')}: {employmentType.name}</h3>
      <div className="leave-entitlement-grid">
        {types.filter((type) => type.isActive).map((type) => <EntitlementForm key={type.id} employmentType={employmentType} leaveType={type} value={entitlements.find((row) => row.employmentTypeId === employmentType.id && row.leaveTypeId === type.id) ?? null} />)}
      </div>
    </section> : <>
      <h3>{t('leaveMinWorkingDays')}</h3>
      <MinWorkingDaysForm value={minimum} />
      <h3>{t('leaveTypes')}</h3>
      <nav className="leave-tabs leave-tabs-sub" aria-label={t('leaveTypes')}>
        <ul>{typeTabs.map((item) => <li key={item.id}><Link href={`/leave/settings?tab=${TYPES_TAB}&type=${encodeURIComponent(item.id)}`} aria-current={item.id === currentType ? 'page' : undefined}>{item.label}</Link></li>)}</ul>
      </nav>
      <div className="profile">
        {editedType ? <LeaveTypeForm key={editedType.id} type={editedType} /> : <LeaveTypeForm type={{ code: '', name: '', counting: 'WORKING_DAYS', approvalTarget: 'HOSPITAL', attachmentRequiredFromDays: null, isActive: true, sortOrder: nextOrder }} />}
      </div>
    </>}
  </section>;
}
