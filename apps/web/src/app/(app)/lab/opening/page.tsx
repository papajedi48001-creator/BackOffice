import { formatBaht, formatCount, formatUnitCost } from '../../../../lib/lab-client';
import { labOpeningStatusLabel } from '../../../../lib/lab-labels';
import { labContext, LabPageMessage, MAIN_STORE_NAME, formOptions } from '../lab-page';
import { labDate } from '../lab-text';
import { DeleteOpeningLine, OpeningActions, OpeningLineForm } from './opening-actions';
import { OpeningImport } from './opening-import';

export const dynamic = 'force-dynamic';
const TITLE = 'ยอดยกมา';

/** ยอดยกมา: the ผู้ดูแลคลัง Lab imports or types the draft and sends it; the หัวหน้า Lab sees totals per store and certifies. */
export default async function LabOpeningPage() {
  const context = await labContext({ needs: ['editOpening', 'certifyOpening', 'manageSettings'] });
  if (!context.ok) return <LabPageMessage title={TITLE} reason={context.reason} />;
  const { queries, settings, can } = context;
  const lines = await queries.openingLines();
  const status = settings.openingStatus;
  const storeName = new Map([[settings.mainStoreId, MAIN_STORE_NAME], ...settings.sections.map((section) => [section.storeId, section.name] as [string, string])]);
  const byStore = [...storeName.entries()].map(([id, name]) => {
    const rows = lines.filter((line) => line.storeId === id);
    return { id, name, count: rows.length, value: rows.reduce((sum, line) => sum + line.quantity * Number(line.unitCost), 0) };
  }).filter((entry) => entry.count > 0);
  const totalValue = byStore.reduce((sum, entry) => sum + entry.value, 0);
  const summary = `${formatCount(lines.length)} แถว มูลค่ารวม ${formatBaht(totalValue)}`;
  const editing = can('editOpening') && status === 'DRAFT';
  const stores = [...storeName.entries()].map(([id, name]) => ({ id, name }));
  const items = formOptions(settings).items;
  return <section className="lab-opening">
    <h2>{TITLE} <span className={`status ${status === 'CERTIFIED' ? 'status-approved' : 'status-pending'}`}>{labOpeningStatusLabel(status)}</span></h2>
    <div className="lab-actions">
      {can('manageSettings') && <OpeningImport kind="items" />}
      {editing && <OpeningImport kind="opening" />}
      {editing && <OpeningLineForm stores={stores} items={items} />}
      <OpeningActions submit={editing} decide={can('certifyOpening') && status === 'SUBMITTED'} summary={summary} />
    </div>
    <h3>สรุปต่อคลัง</h3>
    {byStore.length === 0 ? <p className="lab-empty">ยังไม่มียอดยกมา</p> : <div className="leave-table-scroll"><table>
      <thead><tr><th>คลัง</th><th className="lab-number">แถว</th><th className="lab-number">มูลค่า</th></tr></thead>
      <tbody>{byStore.map((entry) => <tr key={entry.id}><td>{entry.name}</td><td className="lab-number">{formatCount(entry.count)}</td><td className="lab-number">{formatBaht(entry.value)}</td></tr>)}</tbody>
      <tfoot><tr><th>รวม</th><td className="lab-number">{formatCount(lines.length)}</td><td className="lab-number"><strong>{formatBaht(totalValue)}</strong></td></tr></tfoot>
    </table></div>}
    {lines.length > 0 && <>
      <h3>รายการ</h3>
      <div className="leave-table-scroll"><table>
        <thead><tr><th>คลัง</th><th>วัสดุ</th><th>เลขล็อต</th><th>หมดอายุ</th><th className="lab-number">จำนวน</th><th className="lab-number">ต้นทุนต่อหน่วยใช้</th>{editing && <th></th>}</tr></thead>
        <tbody>{lines.map((line) => <tr key={line.id}>
          <td>{storeName.get(line.storeId) ?? '—'}</td><td>{line.code} {line.name}</td><td>{line.lotNo}</td><td>{labDate(line.expiryDate)}</td>
          <td className="lab-number">{formatCount(line.quantity)} {line.useUnit}</td><td className="lab-number">{formatUnitCost(line.unitCost)}</td>
          {editing && <td className="request-actions"><OpeningLineForm stores={stores} items={items} line={line} /><DeleteOpeningLine id={line.id} label={`${line.code} ล็อต ${line.lotNo}`} /></td>}
        </tr>)}</tbody>
      </table></div>
    </>}
  </section>;
}
