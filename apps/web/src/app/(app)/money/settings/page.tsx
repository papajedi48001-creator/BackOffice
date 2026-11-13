import { MoneyQueries } from '@backoffice/core';
import { MONEY_PAGES } from '../../../../lib/money-pages';
import { moneyContext, MoneyPageMessage } from '../money-page';
import { MemberForm, RemoveMember } from './member-form';

export const dynamic = 'force-dynamic';
const TITLE = 'ตั้งค่า Smart Money';

/** เจ้าหน้าที่ที่ได้รับอนุญาต and the pages each may open; ผู้ดูแล Smart Money only. */
export default async function MoneySettingsPage() {
  const context = await moneyContext({ page: 'manage' });
  if (!context.ok) return <MoneyPageMessage title={TITLE} reason={context.reason} />;
  const members = await new MoneyQueries(context.database).members();
  return <section className="money-settings">
    <h2>{TITLE}</h2>
    <section className="lab-block" aria-labelledby="money-members">
      <h3 id="money-members">เจ้าหน้าที่ที่ได้รับอนุญาต</h3>
      <p className="lab-hint">ผู้ดูแลระบบและผู้จัดการโมดูล Smart Money เห็นทุกหน้าโดยไม่ต้องเพิ่มชื่อ</p>
      <div className="lab-actions"><MemberForm /></div>
      {members.length === 0 ? <p className="lab-empty">ยังไม่มีเจ้าหน้าที่</p> : <div className="leave-table-scroll"><table>
        <thead><tr><th>ชื่อ</th><th>รหัสพนักงาน</th><th>หน้าที่เปิดดูได้</th><th></th></tr></thead>
        <tbody>{members.map((member) => <tr key={member.personId}>
          <td>{member.displayName}</td><td>{member.employeeCode ?? '—'}</td>
          <td><span className="money-chips">{member.pages.map((page) => <span key={page} className="money-chip">{MONEY_PAGES[page].title}</span>)}</span></td>
          <td className="request-actions"><MemberForm member={member} /><RemoveMember personId={member.personId} displayName={member.displayName} /></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </section>;
}
