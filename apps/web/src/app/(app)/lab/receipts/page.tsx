import Link from 'next/link';
import { formatBaht } from '../../../../lib/lab-client';
import { labContext, LabPageMessage, NotCertifiedBanner, formOptions } from '../lab-page';
import { dateParam, labDate, lastDays } from '../lab-text';
import { ReceiptForm } from './receipt-form';

export const dynamic = 'force-dynamic';
const TITLE = 'รับเข้า';

/** ใบรับเข้าคลังหลัก of the last 90 days; ผู้ดูแลคลัง Lab (and ผู้จัดการ) only. */
export default async function LabReceiptsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await labContext({ needs: ['receive'] });
  if (!context.ok) return <LabPageMessage title={TITLE} reason={context.reason} />;
  const { queries, settings, today, certified } = context;
  const params = await searchParams;
  const to = dateParam(params.to, today);
  const from = dateParam(params.from, lastDays(to, 90));
  const rows = await queries.receipts(from, to);
  const options = formOptions(settings);
  return <section className="lab-receipts">
    <h2>{TITLE}</h2>
    <NotCertifiedBanner certified={certified} />
    <div className="lab-actions"><ReceiptForm vendors={options.vendors} items={options.items} today={today} disabled={!certified || options.vendors.length === 0} /></div>
    {options.vendors.length === 0 && <p className="lab-hint">ยังไม่มีผู้ขาย เพิ่มได้ที่ ตั้งค่า</p>}
    <p className="lab-range">{labDate(from)} ถึง {labDate(to)}</p>
    {rows.length === 0 ? <p className="lab-empty">ยังไม่มีใบรับในช่วงนี้</p> : <div className="leave-table-scroll"><table>
      <thead><tr><th>เลขที่</th><th>วันที่รับ</th><th>ผู้ขาย</th><th>ใบส่งของ</th><th className="lab-number">รายการ</th><th className="lab-number">มูลค่า</th><th>สถานะ</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id} className={row.status === 'VOIDED' ? 'lab-row-void' : undefined}>
        <td><Link href={`/lab/receipts/${row.id}`}>{row.docNo}</Link></td><td>{labDate(row.receivedOn)}</td><td>{row.vendorName}</td><td>{row.invoiceNo || '—'}</td>
        <td className="lab-number">{row.lineCount}</td><td className="lab-number">{formatBaht(row.total)}</td>
        <td>{row.status === 'VOIDED' ? <span className="status status-cancelled">ยกเลิกแล้ว</span> : <span className="status status-approved">รับแล้ว</span>}</td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}
