import Link from 'next/link';
import { formatBaht, formatStock } from '../../../../lib/lab-client';
import { labContext, LabPageMessage, NotCertifiedBanner } from '../lab-page';
import { labDate, one } from '../lab-text';

export const dynamic = 'force-dynamic';
const TITLE = 'ยอดคงเหลือ';
const ALL = 'ALL';

/** ยอดคงเหลือ per store, or รวมทั้ง Lab for everyone but a เจ้าหน้าที่ Lab, who sees their own คลังย่อย only. */
export default async function LabStockPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await labContext({ needs: ['viewStock'] });
  if (!context.ok) return <LabPageMessage title={TITLE} reason={context.reason} />;
  const { queries, stores, member, manages, certified, today } = context;
  const choices = [...(manages || member?.role !== 'STAFF' ? [{ id: ALL, name: 'รวมทั้ง Lab' }] : []), ...stores('viewStock')];
  const asked = one((await searchParams).store);
  const store = choices.find((choice) => choice.id === asked)?.id ?? choices[0]?.id;
  if (!store) return <LabPageMessage title={TITLE} reason="forbidden" />;
  const rows = await queries.balances(store);
  const total = rows.reduce((sum, row) => sum + Number(row.value), 0);
  const soon = (expiry: string | null) => expiry !== null && expiry <= new Date(Date.parse(`${today}T00:00:00Z`) + 90 * 86_400_000).toISOString().slice(0, 10);
  return <section className="lab-stock">
    <h2>{TITLE}</h2>
    <NotCertifiedBanner certified={certified} />
    <form className="lab-filter" method="get">
      <label htmlFor="lab-store">คลัง</label>
      <select id="lab-store" name="store" defaultValue={store}>{choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.name}</option>)}</select>
      <button type="submit">แสดง</button>
    </form>
    {rows.length === 0 ? <p className="lab-empty">ยังไม่มียอดคงเหลือ</p> : <div className="leave-table-scroll"><table>
      <thead><tr><th>รหัส</th><th>วัสดุ</th><th className="lab-number">คงเหลือ</th><th className="lab-number">มูลค่า</th><th>หมดอายุใกล้สุด</th><th></th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.itemId}>
        <td>{row.code}</td><td><Link href={`/lab/stock/${row.itemId}?store=${encodeURIComponent(store)}`}>{row.name}</Link></td>
        <td className="lab-number">{formatStock(row.quantity, row.useUnit, row.receiveUnit, row.unitsPerReceive)}</td><td className="lab-number">{formatBaht(row.value)}</td>
        <td className={soon(row.nearestExpiry) ? 'lab-warn' : undefined}>{labDate(row.nearestExpiry)}</td>
        <td>{row.belowReorder && <span className="status status-returned">ถึงจุดสั่งซื้อ</span>}</td>
      </tr>)}</tbody>
      <tfoot><tr><th colSpan={3}>มูลค่ารวม</th><td className="lab-number"><strong>{formatBaht(total)}</strong></td><td colSpan={2}></td></tr></tfoot>
    </table></div>}
  </section>;
}
