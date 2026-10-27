import { t } from '@backoffice/i18n';
import { vehicleKindLabel, vehicleStatusLabel } from '../../../../lib/fleet-labels';
import { fleetContext, FleetPageMessage } from '../fleet-page';
import { AddDriverForm, DriverRow } from './driver-form';
import { VehicleForm } from './vehicle-form';

/** ตั้งค่า for the หัวหน้าหมวดยานพาหนะ: the car register and the driver list. */
export default async function FleetSettingsPage() {
  const context = await fleetContext({ manager: true });
  if (!context.ok) return <FleetPageMessage titleKey="fleetSettings" reason={context.reason} />;
  const [vehicles, drivers] = await Promise.all([context.queries.vehicles(), context.queries.drivers()]);
  return <section className="fleet-settings">
    <h2>{t('fleetSettings')}</h2>
    <h3>{t('fleetVehicles')}</h3>
    {vehicles.length === 0 ? <p>{t('fleetNoVehicles')}</p> : <div className="leave-table-scroll"><table>
      <thead><tr><th>{t('fleetRegistration')}</th><th>{t('fleetMakeModel')}</th><th>{t('fleetKind')}</th><th>{t('fleetSeats')}</th><th>{t('status')}</th><th>{t('fleetNote')}</th><th></th></tr></thead>
      <tbody>{vehicles.map((vehicle) => <tr key={vehicle.id}>
        <td>{vehicle.registration}</td><td>{vehicle.makeModel}</td><td>{vehicleKindLabel(vehicle.kind)}</td><td>{vehicle.seats}</td><td>{vehicleStatusLabel(vehicle.status)}</td><td>{vehicle.note || '—'}</td>
        <td><details><summary>{t('fleetEdit')}</summary><VehicleForm vehicle={vehicle} /></details></td>
      </tr>)}</tbody>
    </table></div>}
    <details className="fleet-add"><summary>{t('fleetAddVehicle')}</summary><VehicleForm /></details>

    <h3>{t('fleetDrivers')}</h3>
    {drivers.length === 0 ? <p>{t('fleetNoDrivers')}</p> : <div className="leave-table-scroll"><table>
      <thead><tr><th>{t('fleetDriver')}</th><th>{t('fleetWorkPhone')}</th><th>{t('status')}</th><th></th></tr></thead>
      <tbody>{drivers.map((driver) => <DriverRow key={driver.personId} driver={driver} />)}</tbody>
    </table></div>}
    <details className="fleet-add"><summary>{t('fleetAddDriver')}</summary><AddDriverForm /></details>
  </section>;
}
