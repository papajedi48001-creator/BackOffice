import { labContext, LabPageMessage, NotCertifiedBanner, formOptions } from '../lab-page';
import { dateParam, labDate, lastDays } from '../lab-text';
import { formatCount } from '../../../../lib/lab-client';
import { ReverseUsageButton } from './reverse-usage-button';
import { UsageForm } from './usage-form';

export const dynamic = 'force-dynamic';
const TITLE = 'ตัดใช้';

/** การตัดใช้ of the 30 days up to today in the งาน the person works in; the recorder (or ผู้ดูแลคลัง) may ยกเลิก. */
export default async function LabUsagePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await labContext({ needs: ['use'] });
  if (!context.ok) return <LabPageMessage title={TITLE} reason={context.reason} />;
  const { queries, stores, settings, today, can, session, certified } = context;
  const params = await searchParams;
  const to = dateParam(params.to, today);
  const from = dateParam(params.from, lastDays(to, 30));
  const useStores = stores('use').filter((store) => store.sectionId !== null);
  const storeName = new Map(useStores.map((store) => [store.id, store.name]));
  const rows = await queries.usages({ storeIds: useStores.map((store) => store.id), from, to });
  const options = formOptions(settings);
  return <section className="lab-usage">
    <h2>{TITLE}</h2>
    <NotCertifiedBanner certified={certified} />
    <div className="lab-actions"><UsageForm stores={useStores} items={options.items} usageTypes={options.usageTypes} today={today} disabled={!certified} /></div>
    <p className="lab-range">{labDate(from)} ถึง {labDate(to)}</p>
    {rows.length === 0 ? <p className="lab-empty">ยังไม่มีการตัดใช้ในช่วงนี้</p> : <div className="leave-table-scroll"><table>
      <thead><tr><th>วันที่</th><th>งาน</th><th>วัสดุ</th><th className="lab-number">จำนวน</th><th>ประเภทการใช้</th><th>ผู้บันทึก</th><th>หมายเหตุ</th><th></th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id} className={row.status === 'POSTED' ? undefined : 'lab-row-void'}>
        <td>{labDate(row.entryDate)}</td><td>{storeName.get(row.storeId) ?? '—'}</td><td>{row.code} {row.name}</td>
        <td className="lab-number">{formatCount(row.quantity)} {row.useUnit}</td><td>{row.usageTypeName}</td><td>{row.creatorName}</td><td>{row.note || '—'}</td>
        <td>{row.status === 'POSTED' ? ((row.createdBy === session.personId || can('reverseAnyUse')) && <ReverseUsageButton usageId={row.id} label={`${row.code} ${formatCount(row.quantity)} ${row.useUnit}`} />) : <span className="status status-cancelled">ยกเลิกแล้ว</span>}</td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}
