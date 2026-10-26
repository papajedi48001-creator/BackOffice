import { loadTravelTypes } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { HrPageMessage } from '../../leave/hr-page-message';
import { hrTravelContext } from '../travel-page';
import { TravelTypeTargets } from './travel-type-targets';

export default async function TravelSettingsPage() {
  const context = await hrTravelContext();
  if (!context.ok) return <HrPageMessage titleKey="travelSettings" reason={context.reason} />;
  const types = await loadTravelTypes(context.database);
  return <section>
    <h2>{t('travelSettings')}</h2>
    <p className="permission-notice">{t('travelSettingsHelp')}</p>
    <TravelTypeTargets types={types.map(({ code, approvalTarget }) => ({ code, approvalTarget }))} />
  </section>;
}
