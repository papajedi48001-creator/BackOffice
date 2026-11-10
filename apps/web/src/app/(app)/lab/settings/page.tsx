import { formatCount } from '../../../../lib/lab-client';
import { labRoleLabel } from '../../../../lib/lab-labels';
import { labContext, LabPageMessage, MAIN_STORE_NAME } from '../lab-page';
import { MemberForm, RemoveMember } from './member-form';
import { ItemForm, SectionForm, UsageTypeForm, VendorForm } from './settings-forms';

export const dynamic = 'force-dynamic';
const TITLE = 'ตั้งค่าวัสดุคงคลัง Lab';
const onOff = (active: boolean) => (active ? <span className="status status-approved">เปิดใช้</span> : <span className="status status-cancelled">ปิดใช้</span>);
const next = (rows: readonly { sortOrder: number }[]) => Math.min(9999, Math.max(0, ...rows.map((row) => row.sortOrder)) + 10);

/** วัสดุ, งาน, ผู้ขาย and ประเภทการใช้ for the ผู้ดูแลคลัง Lab; สมาชิก for the ผู้จัดการวัสดุคงคลัง Lab only. */
export default async function LabSettingsPage() {
  const context = await labContext({ needs: ['manageSettings'] });
  if (!context.ok) return <LabPageMessage title={TITLE} reason={context.reason} />;
  const { settings, can } = context;
  const stores = [{ id: settings.mainStoreId, name: MAIN_STORE_NAME }, ...settings.sections.filter((section) => section.isActive).map((section) => ({ id: section.storeId, name: section.name }))];
  const sectionName = new Map(settings.sections.map((section) => [section.id, section.name]));
  const activeSections = settings.sections.filter((section) => section.isActive).map(({ id, name }) => ({ id, name }));
  const manageMembers = can('manageMembers');
  return <section className="lab-settings">
    <h2>{TITLE}</h2>
    <section className="lab-block" aria-labelledby="lab-items">
      <h3 id="lab-items">วัสดุ</h3>
      <div className="lab-actions"><ItemForm stores={stores} /></div>
      {settings.items.length === 0 ? <p className="lab-empty">ยังไม่มีวัสดุ เพิ่มทีละรายการหรือนำเข้าจากไฟล์ที่หน้า ยอดยกมา</p> : <div className="leave-table-scroll"><table>
        <thead><tr><th>รหัส</th><th>ชื่อ</th><th>หน่วย</th><th className="lab-number">เตือนหมดอายุ</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>{settings.items.map((item) => <tr key={item.id}>
          <td>{item.code}</td><td>{item.name}</td><td>1 {item.receiveUnit} = {formatCount(item.unitsPerReceive)} {item.useUnit}</td><td className="lab-number">{item.expiryWarnDays} วัน</td><td>{onOff(item.isActive)}</td>
          <td className="request-actions"><ItemForm item={item} stores={stores} /></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
    <section className="lab-block" aria-labelledby="lab-sections">
      <h3 id="lab-sections">งาน (คลังย่อย)</h3>
      <div className="lab-actions"><SectionForm nextSortOrder={next(settings.sections)} /></div>
      <div className="leave-table-scroll"><table>
        <thead><tr><th>รหัส</th><th>ชื่องาน</th><th className="lab-number">ลำดับ</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>{settings.sections.map((section) => <tr key={section.id}><td>{section.code}</td><td>{section.name}</td><td className="lab-number">{section.sortOrder}</td><td>{onOff(section.isActive)}</td><td className="request-actions"><SectionForm section={section} /></td></tr>)}</tbody>
      </table></div>
    </section>
    <section className="lab-block" aria-labelledby="lab-vendors">
      <h3 id="lab-vendors">ผู้ขาย</h3>
      <div className="lab-actions"><VendorForm /></div>
      {settings.vendors.length === 0 ? <p className="lab-empty">ยังไม่มีผู้ขาย</p> : <div className="leave-table-scroll"><table>
        <thead><tr><th>ชื่อ</th><th>โทรศัพท์</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>{settings.vendors.map((vendor) => <tr key={vendor.id}><td>{vendor.name}</td><td>{vendor.phone || '—'}</td><td>{onOff(vendor.isActive)}</td><td className="request-actions"><VendorForm vendor={vendor} /></td></tr>)}</tbody>
      </table></div>}
    </section>
    <section className="lab-block" aria-labelledby="lab-usage-types">
      <h3 id="lab-usage-types">ประเภทการใช้</h3>
      <div className="lab-actions"><UsageTypeForm nextSortOrder={next(settings.usageTypes)} /></div>
      <div className="leave-table-scroll"><table>
        <thead><tr><th>ชื่อ</th><th className="lab-number">ลำดับ</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>{settings.usageTypes.map((type) => <tr key={type.id}><td>{type.name}</td><td className="lab-number">{type.sortOrder}</td><td>{onOff(type.isActive)}</td><td className="request-actions"><UsageTypeForm usageType={type} /></td></tr>)}</tbody>
      </table></div>
    </section>
    <section className="lab-block" aria-labelledby="lab-members">
      <h3 id="lab-members">สมาชิก</h3>
      {manageMembers ? <div className="lab-actions"><MemberForm sections={activeSections} /></div> : <p className="lab-hint">เพิ่มหรือแก้ไขสมาชิกได้เฉพาะผู้จัดการวัสดุคงคลัง Lab</p>}
      {settings.members.length === 0 ? <p className="lab-empty">ยังไม่มีสมาชิก</p> : <div className="leave-table-scroll"><table>
        <thead><tr><th>ชื่อ</th><th>บทบาท</th><th>งาน</th>{manageMembers && <th></th>}</tr></thead>
        <tbody>{settings.members.map((member) => <tr key={member.personId}>
          <td>{member.displayName}</td><td>{labRoleLabel(member.role)}</td><td>{member.sectionIds.map((id) => sectionName.get(id)).filter(Boolean).join(', ') || 'ทุกงาน'}</td>
          {manageMembers && <td className="request-actions"><MemberForm member={member} sections={activeSections} /><RemoveMember personId={member.personId} displayName={member.displayName} /></td>}
        </tr>)}</tbody>
      </table></div>}
    </section>
  </section>;
}
