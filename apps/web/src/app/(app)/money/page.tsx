import Link from 'next/link';
import { MONEY_PAGES } from '../../../lib/money-pages';
import { moneyContext, MoneyPageMessage } from './money-page';

export const dynamic = 'force-dynamic';
const TITLE = 'Smart Money';

/** ภาพรวม: one tile per page this person may open, like the legacy Smart Money home. */
export default async function MoneyOverviewPage() {
  const context = await moneyContext();
  if (!context.ok) return <MoneyPageMessage title={TITLE} reason={context.reason} />;
  return <section className="money-overview">
    <h2>{TITLE}</h2>
    <p className="money-lead">ติดตามการเงินและการเรียกเก็บค่ารักษาพยาบาล โรงพยาบาลวาริชภูมิ</p>
    <ul className="money-tiles">{context.pages.map((page) => <li key={page}>
      <Link className="money-tile" href={MONEY_PAGES[page].href}><strong>{MONEY_PAGES[page].title}</strong><span>{MONEY_PAGES[page].description}</span></Link>
    </li>)}</ul>
  </section>;
}
