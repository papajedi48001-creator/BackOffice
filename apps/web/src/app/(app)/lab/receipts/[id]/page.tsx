import Link from 'next/link';
import { formatBangkokDateTime } from '../../../../../lib/bangkok-time';
import { formatBaht, formatCount } from '../../../../../lib/lab-client';
import { labContext, LabPageMessage } from '../../lab-page';
import { labDate } from '../../lab-text';
import { VoidReceiptButton } from './void-receipt-button';

export const dynamic = 'force-dynamic';
const TITLE = 'ใบรับ';

export default async function LabReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await labContext({ needs: ['receive'] });
  if (!context.ok) return <LabPageMessage title={TITLE} reason={context.reason} />;
  const receipt = await context.queries.receipt((await params).id);
  if (!receipt) return <LabPageMessage title={TITLE} reason="forbidden" />;
  const total = receipt.lines.reduce((sum, line) => sum + Number(line.total), 0);
  return <section className="lab-receipt">
    <p><Link href="/lab/receipts">← ใบรับทั้งหมด</Link></p>
    <h2>{TITLE} {receipt.docNo} {receipt.status === 'VOIDED' ? <span className="status status-cancelled">ยกเลิกแล้ว</span> : <span className="status status-approved">รับแล้ว</span>}</h2>
    <dl className="lab-facts">
      <dt>วันที่รับ</dt><dd>{labDate(receipt.receivedOn)}</dd>
      <dt>ผู้ขาย</dt><dd>{receipt.vendorName}</dd>
      <dt>เลขที่ใบส่งของ</dt><dd>{receipt.invoiceNo || '—'}</dd>
      <dt>ผู้บันทึก</dt><dd>{receipt.creatorName} · {formatBangkokDateTime(receipt.createdAt)}</dd>
      {receipt.voidReason && <><dt>เหตุผลที่ยกเลิก</dt><dd>{receipt.voidReason}</dd></>}
    </dl>
    <div className="leave-table-scroll"><table>
      <thead><tr><th>วัสดุ</th><th>เลขล็อต</th><th>หมดอายุ</th><th className="lab-number">จำนวนรับ</th><th className="lab-number">เป็นหน่วยใช้</th><th className="lab-number">ราคาต่อหน่วยรับ</th><th className="lab-number">รวม</th></tr></thead>
      <tbody>{receipt.lines.map((line) => <tr key={line.id}>
        <td>{line.code} {line.name}</td><td>{line.lotNo}</td><td>{labDate(line.expiryDate)}</td>
        <td className="lab-number">{formatCount(line.quantityReceive)} {line.receiveUnit}</td><td className="lab-number">{formatCount(line.quantityReceive * line.unitsPerReceive)} {line.useUnit}</td>
        <td className="lab-number">{formatBaht(line.pricePerReceive)}</td><td className="lab-number">{formatBaht(line.total)}</td>
      </tr>)}</tbody>
      <tfoot><tr><th colSpan={6}>รวมทั้งใบ</th><td className="lab-number"><strong>{formatBaht(total)}</strong></td></tr></tfoot>
    </table></div>
    {receipt.status === 'POSTED' && <div className="lab-actions"><VoidReceiptButton receiptId={receipt.id} docNo={receipt.docNo} /></div>}
  </section>;
}
