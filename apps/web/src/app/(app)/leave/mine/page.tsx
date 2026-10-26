import Link from 'next/link';
import { LeaveQueries } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { getSharedDatabase } from '../../../../lib/database';
import { chosenFiscalYear, leaveSession } from '../leave-page';
import { LeaveTable } from '../leave-list';

export default async function MyLeavePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await leaveSession();
  if (!session) return null;
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('leaveMine')}</h2><p role="alert">{t('leaveLoadError')}</p></section>;
  const fiscalYear = chosenFiscalYear((await searchParams).fy);
  const queries = new LeaveQueries(database);
  const [balances, items] = await Promise.all([queries.balances(session.personId, fiscalYear), queries.myLeave(session.personId, fiscalYear)]);
  return <section>
    <div className="page-heading"><h2>{t('leaveMine')}</h2><div className="page-actions"><Link className="button-link" href="/leave/new">{t('leaveNew')}</Link></div></div>
    <p className="permission-notice">{t('leaveFiscalYear')} {fiscalYear} · <Link href={`/leave/mine?fy=${fiscalYear - 1}`}>{fiscalYear - 1}</Link> · <Link href={`/leave/mine?fy=${fiscalYear + 1}`}>{fiscalYear + 1}</Link></p>
    <h3>{t('leaveBalanceTitle')}</h3>
    {balances.length === 0 ? <p>{t('leaveNoBalances')}</p> : <div className="leave-balances">
      {balances.map(({ leaveType, balance }) => <section key={leaveType.id} aria-label={leaveType.name} className="leave-balance">
        <h4>{leaveType.name}</h4>
        <p className="leave-balance-remaining"><span>{t('leaveRemaining')}</span><strong>{balance.remaining}</strong></p>
        <dl>
          <div><dt>{t('leaveEntitled')}</dt><dd>{balance.entitled}</dd></div>
          {balance.carried > 0 && <div><dt>{t('leaveCarried')}</dt><dd>{balance.carried}</dd></div>}
          <div><dt>{t('leaveUsed')}</dt><dd>{balance.used}</dd></div>
          <div><dt>{t('leavePendingDays')}</dt><dd>{balance.pending}</dd></div>
        </dl>
      </section>)}
    </div>}
    <h3>{t('leaveRequest')}</h3>
    {items.length === 0 ? <p>{t('leaveNoRequests')}</p> : <LeaveTable items={items} />}
  </section>;
}
