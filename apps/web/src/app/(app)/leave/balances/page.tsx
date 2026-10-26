import { fiscalYearOf } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { bangkokToday } from '../../../../lib/bangkok-time';
import { HrPageMessage } from '../hr-page-message';
import { hrLeaveContext } from '../leave-page';
import { BalanceUploadForm } from './balance-upload';

export default async function LeaveBalancesPage() {
  const context = await hrLeaveContext();
  if (!context.ok) return <HrPageMessage titleKey="leaveBalances" reason={context.reason} />;
  const fiscalYear = fiscalYearOf(bangkokToday());
  return <section>
    <h2>{t('leaveBalances')}</h2>
    <p className="permission-notice">{t('leaveBalancesHelp')}</p>
    <form aria-label={t('leaveDownloadBalances')} className="reason-form" method="post" action="/api/leave/balances/export">
      <div className="form-field"><label htmlFor="balance-year">{t('leaveFiscalYear')}</label><input id="balance-year" name="fiscalYear" type="number" min={2500} max={2700} required defaultValue={fiscalYear} /></div>
      <label htmlFor="balance-reason">{t('leaveExportReason')}</label>
      <input id="balance-reason" name="reason" required maxLength={500} />
      <div className="form-actions"><button type="submit">{t('leaveDownloadBalances')}</button></div>
    </form>
    <BalanceUploadForm fiscalYear={fiscalYear} />
  </section>;
}
