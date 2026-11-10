import Link from 'next/link';
import { formatCount, formatUnitCost } from '../../../../../lib/lab-client';
import { labMovementKindLabel } from '../../../../../lib/lab-labels';
import { labContext, LabPageMessage } from '../../lab-page';
import { dateParam, labDate, lastDays, one } from '../../lab-text';
import { LedgerRange } from './ledger-range';

export const dynamic = 'force-dynamic';
const TITLE = 'บัญชีวัสดุ';

/** One item in one store (or รวมทั้ง Lab): its lots now, and every movement in the range with the running balance. */
export default async function LabItemLedgerPage({ params, searchParams }: { params: Promise<{ itemId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await labContext({ needs: ['viewStock'] });
  if (!context.ok) return <LabPageMessage title={TITLE} reason={context.reason} />;
  const { queries, stores, member, manages, settings, today } = context;
  const { itemId } = await params;
  const query = await searchParams;
  const allowed = stores('viewStock');
  const mayAll = manages || member?.role !== 'STAFF';
  const asked = one(query.store);
  const store = asked === 'ALL' && mayAll ? 'ALL' : allowed.find((choice) => choice.id === asked)?.id ?? (mayAll ? 'ALL' : allowed[0]?.id);
  const item = settings.items.find((entry) => entry.id === itemId);
  if (!store || !item) return <LabPageMessage title={TITLE} reason="forbidden" />;
  const to = dateParam(query.to, today);
  const from = dateParam(query.from, lastDays(to, 30));
  const [lots, ledger] = await Promise.all([queries.lots(itemId, store), queries.ledger(itemId, store, from <= to ? from : to, to)]);
  const storeName = new Map([[settings.mainStoreId, 'คลังหลัก'], ...settings.sections.map((section) => [section.storeId, section.name] as [string, string])]);
  return <section className="lab-ledger">
    <p><Link href={`/lab/stock?store=${encodeURIComponent(store)}`}>← ยอดคงเหลือ</Link></p>
    <h2>{TITLE}: {item.code} {item.name}</h2>
    <p className="lab-me">{store === 'ALL' ? 'รวมทั้ง Lab' : storeName.get(store)} · หน่วยใช้ {item.useUnit} (1 {item.receiveUnit} = {formatCount(item.unitsPerReceive)} {item.useUnit})</p>
    <h3>ล็อตที่มีอยู่</h3>
    {lots.length === 0 ? <p className="lab-empty">ไม่มียอดคงเหลือ</p> : <div className="leave-table-scroll"><table>
      <thead><tr><th>เลขล็อต</th>{store === 'ALL' && <th>คลัง</th>}<th>หมดอายุ</th><th className="lab-number">คงเหลือ</th><th className="lab-number">ต้นทุนต่อหน่วยใช้</th></tr></thead>
      <tbody>{lots.map((lot) => <tr key={`${lot.lotId}-${lot.storeId}`} className={lot.expiryDate !== null && lot.expiryDate < today ? 'lab-row-void' : undefined}>
        <td>{lot.lotNo}</td>{store === 'ALL' && <td>{storeName.get(lot.storeId) ?? '—'}</td>}<td>{labDate(lot.expiryDate)}</td>
        <td className="lab-number">{formatCount(lot.quantity)}</td><td className="lab-number">{formatUnitCost(lot.unitCost)}</td>
      </tr>)}</tbody>
    </table></div>}
    <h3>ความเคลื่อนไหว</h3>
    <LedgerRange path={`/lab/stock/${itemId}`} store={store} from={from} to={to} />
    <div className="leave-table-scroll"><table>
      <thead><tr><th>วันที่</th><th>รายการ</th><th>เอกสาร</th><th>เลขล็อต</th>{store === 'ALL' && <th>คลัง</th>}<th className="lab-number">เข้า/ออก</th><th className="lab-number">คงเหลือ</th><th>ผู้บันทึก</th><th>หมายเหตุ</th></tr></thead>
      <tbody>
        <tr className="lab-row-carry"><td>{labDate(from)}</td><td>ยกมา</td><td colSpan={store === 'ALL' ? 3 : 2}></td><td></td><td className="lab-number">{formatCount(ledger.openingBalance)}</td><td colSpan={2}></td></tr>
        {ledger.rows.map((row) => <tr key={row.id}>
          <td>{labDate(row.entryDate)}</td><td>{labMovementKindLabel(row.kind)}{row.usageTypeName ? ` · ${row.usageTypeName}` : ''}</td><td>{row.docNo ?? '—'}</td><td>{row.lotNo}</td>
          {store === 'ALL' && <td>{storeName.get(row.storeId) ?? '—'}</td>}
          <td className="lab-number">{row.quantity > 0 ? '+' : ''}{formatCount(row.quantity)}</td><td className="lab-number">{formatCount(row.balance)}</td><td>{row.actorName}</td><td>{row.note || '—'}</td>
        </tr>)}
      </tbody>
    </table></div>
  </section>;
}
