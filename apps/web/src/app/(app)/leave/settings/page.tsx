import { EmploymentTypeService, LeaveSettingsService } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { HrPageMessage } from '../hr-page-message';
import { hrLeaveContext } from '../leave-page';
import { EntitlementForm, LeaveTypeForm, MinWorkingDaysForm } from './settings-forms';

export default async function LeaveSettingsPage() {
  const context = await hrLeaveContext();
  if (!context.ok) return <HrPageMessage titleKey="leaveSettings" reason={context.reason} />;
  const settings = new LeaveSettingsService(context.database);
  const [types, entitlements, employmentTypes, minimum] = await Promise.all([settings.listTypes(), settings.listEntitlements(), new EmploymentTypeService(context.database).list({ activeOnly: true }), settings.getMinWorkingDays()]);
  const nextOrder = Math.max(0, ...types.map((type) => type.sortOrder)) + 1;
  return <section className="leave-settings">
    <h2>{t('leaveSettings')}</h2>
    <h3>{t('leaveMinWorkingDays')}</h3>
    <MinWorkingDaysForm value={minimum} />
    <h3>{t('leaveTypes')}</h3>
    <div className="profile">
      {types.map((type) => <LeaveTypeForm key={type.id} type={type} />)}
      <LeaveTypeForm type={{ code: '', name: '', counting: 'WORKING_DAYS', approvalTarget: 'HOSPITAL', attachmentRequiredFromDays: null, isActive: true, sortOrder: nextOrder }} />
    </div>
    <h3>{t('leaveEntitlements')}</h3>
    {employmentTypes.map((employmentType) => <section key={employmentType.id} aria-label={employmentType.name} className="leave-entitlements">
      <h4>{employmentType.name}</h4>
      <div className="leave-entitlement-grid">
        {types.filter((type) => type.isActive).map((type) => <EntitlementForm key={type.id} employmentType={employmentType} leaveType={type} value={entitlements.find((row) => row.employmentTypeId === employmentType.id && row.leaveTypeId === type.id) ?? null} />)}
      </div>
    </section>)}
  </section>;
}
