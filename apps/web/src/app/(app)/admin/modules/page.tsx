import { lockedModules, moduleManagerRoles } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { adminPage } from '../../../../lib/admin-page';
import { moduleRegistry } from '../../../../lib/modules';
import { AdminMessage } from '../admin-message';
import { ModuleSettings, type ModuleSettingRow } from './module-settings';

export const dynamic = 'force-dynamic';

/** ตั้งค่าโปรแกรม: every live module with its switch and its ผู้จัดการ. */
export default async function AdminModulesPage() {
  const context = await adminPage();
  if (!context.ok) return <AdminMessage titleKey="adminModulesTitle" reason={context.reason} />;
  const [disabled, grants] = await Promise.all([context.queries.disabledModules(), context.queries.grants()]);
  const holders = (role: string) => grants.filter((grant) => grant.roleNames.includes(role as never)).map(({ personId, displayName, employeeCode, ownsHrData, active }) => ({ personId, displayName, employeeCode, ownsHrData, active }));
  const rows: ModuleSettingRow[] = moduleRegistry.filter((entry) => entry.status === 'live').map((entry) => {
    const managerRole = moduleManagerRoles[entry.code] ?? null;
    return { code: entry.code, label: t(entry.labelKey), description: t(entry.descriptionKey), enabled: !disabled.includes(entry.code), locked: lockedModules.includes(entry.code), managerRole, managers: managerRole ? holders(managerRole) : [] };
  });
  return <section className="admin-page">
    <h2>{t('adminModulesTitle')}</h2>
    <p className="admin-note">{t('adminModulesCopy')}</p>
    <ModuleSettings rows={rows} admins={holders('admin')} />
  </section>;
}
