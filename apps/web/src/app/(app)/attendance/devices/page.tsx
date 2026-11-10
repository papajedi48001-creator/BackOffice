import { AttendanceSettingsQueries, canManageAttendanceDevices, DeviceQueries } from '@backoffice/core';
import { attendanceContext, AttendancePageMessage } from '../attendance-page';
import { DeviceForm, LocationForm, NewPairingCodeButton, RevokeDeviceButton } from './device-forms';

export const dynamic = 'force-dynamic';
const TITLE = 'กล่องและจุดลงเวลา';
const seen = (iso: string | null) => iso ? new Date(iso).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }) : '-';
const deviceStatus = (device: { paired: boolean; revoked: boolean; online: boolean }) => {
  if (device.revoked) return <span className="status status-cancelled">ถอนสิทธิ์แล้ว</span>;
  if (!device.paired) return <span className="status status-pending">ยังไม่จับคู่</span>;
  return device.online ? <span className="status status-approved">ออนไลน์</span> : <span className="status status-rejected">ออฟไลน์</span>;
};

/** จุดลงเวลา and กล่องลงเวลา: pairing codes, online status and revoking. */
export default async function AttendanceDevicesPage() {
  const context = await attendanceContext(canManageAttendanceDevices);
  if (!context.ok) return <AttendancePageMessage title={TITLE} reason={context.reason} />;
  const settingsQueries = new AttendanceSettingsQueries(context.database);
  const [locations, devices, settings] = await Promise.all([settingsQueries.locations(), new DeviceQueries(context.database).list(), settingsQueries.settings()]);
  const activeLocations = locations.filter((location) => location.isActive).map(({ id, name }) => ({ id, name }));
  return <section className="attendance-page">
    <h2>{TITLE}</h2>
    <section aria-labelledby="attendance-locations">
      <h3 id="attendance-locations">จุดลงเวลา</h3>
      {locations.length === 0 ? <p>ยังไม่มีจุดลงเวลา เพิ่มจุดก่อนแล้วจึงเพิ่มกล่อง</p> : <div className="leave-table-scroll"><table>
        <thead><tr><th>ชื่อจุด</th><th>พิกัด</th><th>รัศมี</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>{locations.map((location) => <tr key={location.id}>
          <td>{location.name}</td><td>{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</td><td>{location.radiusMeters} ม.</td>
          <td>{location.isActive ? <span className="status status-approved">เปิดใช้</span> : <span className="status status-cancelled">ปิดใช้</span>}</td>
          <td className="request-actions"><LocationForm row={location} /></td>
        </tr>)}</tbody>
      </table></div>}
      <LocationForm defaultRadius={settings.defaultRadiusMeters} />
    </section>
    <section aria-labelledby="attendance-devices">
      <h3 id="attendance-devices">กล่องลงเวลา</h3>
      {devices.length === 0 ? <p>ยังไม่มีกล่องลงเวลา</p> : <div className="leave-table-scroll"><table>
        <thead><tr><th>ชื่อกล่อง</th><th>จุดลงเวลา</th><th>สถานะ</th><th>ติดต่อล่าสุด</th><th></th></tr></thead>
        <tbody>{devices.map((device) => <tr key={device.id}>
          <td>{device.name}</td><td>{device.locationName}</td><td>{deviceStatus(device)}</td><td>{seen(device.lastSeenAt)}</td>
          <td className="request-actions">{!device.revoked && <><NewPairingCodeButton deviceId={device.id} deviceName={device.name} /><RevokeDeviceButton deviceId={device.id} deviceName={device.name} /></>}</td>
        </tr>)}</tbody>
      </table></div>}
      <DeviceForm locations={activeLocations} />
    </section>
  </section>;
}
