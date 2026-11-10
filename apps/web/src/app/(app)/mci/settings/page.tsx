import { PositionCatalogService } from '@backoffice/core';
import { mciContext, MciPageMessage } from '../mci-page';
import { ContactForm, RulesForm, SettingRowForm, type SettingKind, type SettingRow } from './settings-forms';

export const dynamic = 'force-dynamic';
const TITLE = 'ตั้งค่าอุบัติเหตุหมู่';
const onOff = (active: boolean) => active ? <span className="status status-approved">เปิดใช้</span> : <span className="status status-cancelled">ปิดใช้</span>;

/** ตั้งค่า, for ผู้บัญชาการเหตุ (mci.command): จุด, สีคัดกรอง, สถานะ, สายวิชาชีพ, กฎจัดจุด and the public contact phone. */
export default async function MciSettingsPage() {
  const context = await mciContext({ commander: true });
  if (!context.ok) return <MciPageMessage title={TITLE} reason={context.reason} />;
  const { settings, database } = context;
  const positions = (await new PositionCatalogService(database).list({ activeOnly: true })).map(({ id, name }) => ({ id, name }));
  const next = (rows: readonly { sortOrder: number }[]) => Math.min(999, Math.max(0, ...rows.map((row) => row.sortOrder)) + 10);
  const table = (kind: SettingKind, heading: string, rows: readonly SettingRow[], extra?: (row: SettingRow) => React.ReactNode) => <section className="mci-settings-block" aria-labelledby={`mci-${kind}`}>
    <h3 id={`mci-${kind}`}>{heading}</h3>
    <div className="leave-table-scroll"><table>
      <thead><tr><th>ชื่อ</th>{extra && <th>รายละเอียด</th>}<th>ลำดับ</th><th>สถานะ</th><th></th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id}>
        <td>{row.colorHex && <span className="mci-triage-pill" style={{ '--triage': row.colorHex } as React.CSSProperties}>{row.name}</span>}{!row.colorHex && row.name}</td>
        {extra && <td>{extra(row)}</td>}
        <td>{row.sortOrder}</td><td>{onOff(row.isActive)}</td>
        <td className="request-actions"><SettingRowForm kind={kind} row={row} positions={positions} /></td>
      </tr>)}</tbody>
    </table></div>
    <SettingRowForm kind={kind} positions={positions} nextSortOrder={next(rows)} />
  </section>;
  const positionName = new Map(positions.map((position) => [position.id, position.name]));
  const activeZones = settings.zones.filter((zone) => zone.isActive);
  const activeProfessions = settings.professions.filter((profession) => profession.isActive);
  const zoneName = (zoneId: string | null) => activeZones.find((zone) => zone.id === zoneId)?.name ?? 'รอจัดจุด';
  return <section className="mci-settings">
    <h2>{TITLE}</h2>
    {table('zones', 'จุดปฏิบัติงาน', settings.zones)}
    {table('triage', 'สีคัดกรอง', settings.triageLevels, (row) => <>{row.description || '—'}{settings.triageLevels.find((level) => level.id === row.id)?.isDeceased ? ' (ผูกกับสถานะเสียชีวิต)' : ''}</>)}
    {table('statuses', 'สถานะผู้ป่วย', settings.statuses, (row) => {
      const status = settings.statuses.find((entry) => entry.id === row.id);
      return [status?.isDeceased && 'เสียชีวิต (สีดำ)', status?.needsDestination && 'ต้องระบุโรงพยาบาลปลายทาง', status?.isDischarged && 'กลับบ้าน'].filter(Boolean).join(' · ') || '—';
    })}
    {table('professions', 'สายวิชาชีพ', settings.professions, (row) => (row.positionIds ?? []).map((positionId) => positionName.get(positionId)).filter(Boolean).join(', ') || '—')}
    <section className="mci-settings-block" aria-labelledby="mci-rules">
      <h3 id="mci-rules">กฎจัดจุดเมื่อรายงานตัว</h3>
      <ul>{activeProfessions.map((profession) => <li key={profession.id}>{profession.name} → {zoneName(settings.rules.find((rule) => rule.professionId === profession.id)?.zoneId ?? null)}</li>)}</ul>
      <RulesForm professions={activeProfessions.map(({ id, name }) => ({ id, name }))} zones={activeZones.map(({ id, name }) => ({ id, name }))} rules={settings.rules} />
    </section>
    <section className="mci-settings-block" aria-labelledby="mci-contact">
      <h3 id="mci-contact">เบอร์จุดประชาสัมพันธ์</h3>
      <p>{settings.publicContactPhone || 'ยังไม่ได้ตั้ง'}</p>
      <ContactForm phone={settings.publicContactPhone} />
    </section>
  </section>;
}
