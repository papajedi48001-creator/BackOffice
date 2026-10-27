import type { AccessSubject, DispatchStatus, FleetRequestStatus, RequestStatus, TripStatus, VehicleKind, VehicleStatus } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { bangkokToday } from '../official-travel/travel-store';
import { canManageFleet } from './fleet-access';
import { FLEET_MODULE } from './fleet-module';
import { canCancel, fleetRequestStatus } from './fleet-status';
import { OVERLAPPING_TRIP, toSqlDatetime } from './fleet-store';

const LIST_LIMIT = 1000;
const DAY = 86_400_000;
const WEEK_START = /^\d{4}-\d{2}-\d{2}$/;

export interface FleetRequestListItem { id: string; reference: string; purpose: string; destination: string; departAt: string; returnAt: string; status: FleetRequestStatus }
export interface FleetHistoryEntry { action: string; actorName: string | null; reason: string | null; createdAt: string }
export interface FleetTripSummary { id: string; registration: string; makeModel: string; driverName: string | null; driverPhone: string; status: TripStatus }
export interface FleetRequestDetail extends FleetRequestListItem {
  requesterPersonId: string; requesterName: string | null; organizationName: string | null; province: string; passengerCount: number; passengerNames: string; officialTravelId: string | null; requestId: string | null; filedAt: string;
  history: FleetHistoryEntry[]; trip: FleetTripSummary | null; canCancel: boolean; canResubmit: boolean; canDispatch: boolean;
}
export interface QueueItem { id: string; reference: string; requesterName: string | null; organizationName: string | null; purpose: string; destination: string; province: string; departAt: string; returnAt: string; passengerCount: number; soon: boolean; overdue: boolean }
export interface BoardTrip { id: string; startsAt: string; endsAt: string; driverName: string | null; status: TripStatus; requestCount: number }
/** A PLANNED เที่ยวรถ whose car is no longer ACTIVE, for reassignment. */
export interface FlaggedTrip extends BoardTrip { registration: string; vehicleStatus: VehicleStatus }
export interface VehicleOption { id: string; registration: string; makeModel: string; kind: VehicleKind; seats: number }
export interface DriverOption { personId: string; displayName: string | null; phone: string }
export interface TripOption { id: string; registration: string; driverName: string | null; startsAt: string; endsAt: string }
export interface VehicleView extends VehicleOption { status: VehicleStatus; note: string }
export interface DriverView extends DriverOption { isActive: boolean }
export interface CalendarBlock { startsAt: string; endsAt: string; province: string; status: TripStatus }
export interface DriverTripRequest { id: string; reference: string; requesterName: string | null; requesterPhone: string | null; destination: string; passengerCount: number }
export interface DriverTrip { id: string; startsAt: string; endsAt: string; status: TripStatus; registration: string; makeModel: string; odometerOut: number | null; odometerIn: number | null; requests: DriverTripRequest[] }
export interface FleetTripDetail extends DriverTrip { vehicleId: string; driverPersonId: string; driverName: string | null; driverPhone: string; departedAt: string | null; returnedAt: string | null }
export interface FleetDashboard {
  counts: { waiting: number; tripsToday: number; out: number; inRepair: number };
  queue: QueueItem[]; board: Array<{ vehicle: { id: string; registration: string; makeModel: string; status: VehicleStatus }; trips: BoardTrip[] }>; flagged: FlaggedTrip[];
}
/** The signed-in person asking; `personId` is null for a signed-out visitor. */
export type FleetViewer = AccessSubject;

type Reader = Pick<Database, 'query'>;
interface RequestRow { id: string; reference: string; requesterPersonId: string; requesterName: string | null; organizationName: string | null; purpose: string; destination: string; province: string; departAt: string; returnAt: string; passengerCount: number; passengerNames: string; officialTravelId: string | null; requestId: string | null; filedAt: string; dispatchStatus: DispatchStatus; headStatus: RequestStatus | null; tripId: string | null; tripStatus: TripStatus | null }

const instant = (column: string) => `DATE_FORMAT(${column}, '%Y-%m-%dT%H:%i:%s.000Z')`;
/** Oldest first within a second, where `created_at` ties. */
const ACTION_ORDER = ['SUBMITTED', 'RESUBMITTED', 'ASSIGNED', 'UNASSIGNED', 'DECLINED', 'CANCELLED'];
const REQUESTS = `SELECT f.id, f.reference, f.requester_person_id AS requesterPersonId, rp.display_name AS requesterName, o.name AS organizationName, f.purpose, f.destination, f.province, ${instant('f.depart_at')} AS departAt, ${instant('f.return_at')} AS returnAt,
  f.passenger_count AS passengerCount, f.passenger_names AS passengerNames, f.official_travel_id AS officialTravelId, f.request_id AS requestId, ${instant('f.created_at')} AS filedAt, f.dispatch_status AS dispatchStatus, r.status AS headStatus, f.trip_id AS tripId, t.status AS tripStatus
  FROM fleet_request f JOIN person rp ON rp.id = f.requester_person_id LEFT JOIN organization o ON o.id = f.organization_id LEFT JOIN request r ON r.id = f.request_id LEFT JOIN fleet_trip t ON t.id = f.trip_id`;
const statusOf = (row: RequestRow) => fleetRequestStatus({ headStatus: row.headStatus, dispatchStatus: row.dispatchStatus, tripStatus: row.tripStatus });
const TRIP_REQUESTS = `SELECT f.trip_id AS tripId, f.id, f.reference, p.display_name AS requesterName, hp.phone AS requesterPhone, f.destination, f.passenger_count AS passengerCount
  FROM fleet_request f JOIN person p ON p.id = f.requester_person_id LEFT JOIN hr_person_profile hp ON hp.person_id = f.requester_person_id WHERE f.dispatch_status = 'ASSIGNED' AND f.trip_id IN (?) ORDER BY f.depart_at, f.reference`;

/** Reads for the ยานพาหนะ screens. Who may see a ใบ or a เที่ยวรถ is decided here, on the server, for every read; times are ISO UTC strings. */
export class FleetQueries {
  constructor(private readonly database: Reader, private readonly now: () => Date = () => new Date()) {}

  async mine(personId: string): Promise<FleetRequestListItem[]> {
    const rows = await this.database.query<RequestRow>(`${REQUESTS} WHERE f.requester_person_id = ? ORDER BY f.created_at DESC, f.id LIMIT ${LIST_LIMIT}`, [personId]);
    return rows.map((row) => ({ id: row.id, reference: row.reference, purpose: row.purpose, destination: row.destination, departAt: row.departAt, returnAt: row.returnAt, status: statusOf(row) }));
  }

  /** The full ใบ for its requester, the head-stage assignee or an active ผู้แทน, the driver of its เที่ยวรถ and the หัวหน้าหมวด; null for anyone else. */
  async detail(id: string, viewer: FleetViewer): Promise<FleetRequestDetail | null> {
    const personId = viewer.authenticated ? viewer.personId : null;
    if (!personId) return null;
    const [row] = await this.database.query<RequestRow>(`${REQUESTS} WHERE f.id = ?`, [id]);
    if (!row) return null;
    const manager = canManageFleet(viewer);
    const trip = row.tripId && row.dispatchStatus === 'ASSIGNED' ? (await this.database.query<FleetTripSummary & { driverPersonId: string }>(
      `SELECT t.id, v.registration, v.make_model AS makeModel, t.driver_person_id AS driverPersonId, dp.display_name AS driverName, COALESCE(d.phone, '') AS driverPhone, t.status
       FROM fleet_trip t JOIN fleet_vehicle v ON v.id = t.vehicle_id JOIN person dp ON dp.id = t.driver_person_id LEFT JOIN fleet_driver d ON d.person_id = t.driver_person_id WHERE t.id = ?`, [row.tripId]))[0] ?? null : null;
    const requester = row.requesterPersonId === personId;
    if (!requester && !manager && trip?.driverPersonId !== personId && !(await this.onHeadStage(row.requestId, personId))) return null;
    const history = await this.database.query<FleetHistoryEntry>(
      `SELECT h.action, p.display_name AS actorName, h.reason, ${instant('h.created_at')} AS createdAt FROM fleet_request_history h LEFT JOIN person p ON p.id = h.actor_person_id WHERE h.fleet_request_id = ?`, [id]);
    history.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || ACTION_ORDER.indexOf(a.action) - ACTION_ORDER.indexOf(b.action));
    const status = statusOf(row);
    return {
      id: row.id, reference: row.reference, purpose: row.purpose, destination: row.destination, departAt: row.departAt, returnAt: row.returnAt, status,
      requesterPersonId: row.requesterPersonId, requesterName: row.requesterName, organizationName: row.organizationName, province: row.province, passengerCount: Number(row.passengerCount), passengerNames: row.passengerNames,
      officialTravelId: row.officialTravelId, requestId: row.requestId, filedAt: row.filedAt, history,
      trip: trip ? { id: trip.id, registration: trip.registration, makeModel: trip.makeModel, driverName: trip.driverName, driverPhone: trip.driverPhone, status: trip.status } : null,
      canCancel: requester && canCancel(status), canResubmit: requester && status === 'RETURNED', canDispatch: manager && status === 'WAITING'
    };
  }

  async idOfHeadRequest(requestId: string): Promise<string | null> {
    const [row] = await this.database.query<{ id: string }>('SELECT id FROM fleet_request WHERE request_id = ?', [requestId]);
    return row?.id ?? null;
  }

  async waitingCount(): Promise<number> { return (await this.waitingRows()).length; }

  /** Today's PLANNED เที่ยวรถ of the driver. */
  async driverTodayCount(personId: string): Promise<number> {
    const { start, end } = this.today();
    const [row] = await this.database.query<{ count: number }>("SELECT COUNT(*) AS count FROM fleet_trip WHERE driver_person_id = ? AND status = 'PLANNED' AND starts_at < ? AND ends_at > ?", [personId, end, start]);
    return Number(row?.count ?? 0);
  }

  async dashboard(): Promise<FleetDashboard> {
    const now = this.now();
    const { start, end } = this.today();
    const waiting = await this.waitingRows();
    const [counts] = await this.database.query<{ tripsToday: number; out: number; inRepair: number }>(
      `SELECT (SELECT COUNT(*) FROM fleet_trip WHERE ${OVERLAPPING_TRIP}) AS tripsToday, (SELECT COUNT(*) FROM fleet_trip WHERE status = 'DEPARTED') AS \`out\`, (SELECT COUNT(*) FROM fleet_vehicle WHERE status = 'IN_REPAIR') AS inRepair`, [end, start]);
    const vehicles = await this.database.query<{ id: string; registration: string; makeModel: string; status: VehicleStatus }>("SELECT id, registration, make_model AS makeModel, status FROM fleet_vehicle WHERE status IN ('ACTIVE', 'IN_REPAIR') ORDER BY registration, id");
    const trips = await this.database.query<BoardTrip & { vehicleId: string }>(`${TRIPS} AND t.starts_at < ? AND t.ends_at > ? ORDER BY t.starts_at, t.id`, [end, start]);
    const flagged = await this.database.query<FlaggedTrip>(`${TRIPS} AND t.status = 'PLANNED' AND v.status <> 'ACTIVE' AND t.ends_at > ? ORDER BY t.starts_at, t.id`, [toSqlDatetime(now)]);
    const soonLimit = now.getTime() + DAY;
    return {
      counts: { waiting: waiting.length, tripsToday: Number(counts?.tripsToday ?? 0), out: Number(counts?.out ?? 0), inRepair: Number(counts?.inRepair ?? 0) },
      queue: waiting.map((row) => {
        const departs = Date.parse(row.departAt);
        const overdue = departs < now.getTime();
        return { id: row.id, reference: row.reference, requesterName: row.requesterName, organizationName: row.organizationName, purpose: row.purpose, destination: row.destination, province: row.province, departAt: row.departAt, returnAt: row.returnAt, passengerCount: Number(row.passengerCount), soon: !overdue && departs < soonLimit, overdue };
      }),
      board: vehicles.map((vehicle) => ({ vehicle, trips: trips.filter((trip) => trip.vehicleId === vehicle.id).map(boardTrip) })),
      flagged: flagged.map((trip) => ({ ...boardTrip(trip), registration: trip.registration, vehicleStatus: trip.vehicleStatus }))
    };
  }

  /** Free ACTIVE cars and free active drivers for the range, by the same overlap rule the server enforces, and the PLANNED เที่ยวรถ that cover it. */
  async availability(from: Date, to: Date): Promise<{ vehicles: VehicleOption[]; drivers: DriverOption[]; trips: TripOption[] }> {
    const range = [toSqlDatetime(to), toSqlDatetime(from)];
    const vehicles = await this.database.query<VehicleOption>(
      `SELECT v.id, v.registration, v.make_model AS makeModel, v.kind, v.seats FROM fleet_vehicle v WHERE v.status = 'ACTIVE' AND NOT EXISTS (SELECT 1 FROM fleet_trip WHERE vehicle_id = v.id AND ${OVERLAPPING_TRIP}) ORDER BY v.registration, v.id`, range);
    const drivers = await this.database.query<DriverOption>(
      `SELECT d.person_id AS personId, p.display_name AS displayName, d.phone FROM fleet_driver d JOIN person p ON p.id = d.person_id WHERE d.is_active = 1 AND NOT EXISTS (SELECT 1 FROM fleet_trip WHERE driver_person_id = d.person_id AND ${OVERLAPPING_TRIP}) ORDER BY p.display_name, d.person_id`, range);
    const trips = await this.database.query<TripOption>(
      `SELECT t.id, v.registration, p.display_name AS driverName, ${instant('t.starts_at')} AS startsAt, ${instant('t.ends_at')} AS endsAt FROM fleet_trip t JOIN fleet_vehicle v ON v.id = t.vehicle_id JOIN person p ON p.id = t.driver_person_id
       WHERE t.status = 'PLANNED' AND t.starts_at <= ? AND t.ends_at >= ? ORDER BY t.starts_at, t.id`, [range[1], range[0]]);
    return { vehicles, drivers, trips };
  }

  /** The week of seven Bangkok days from `weekStart` (`YYYY-MM-DD`): car, time range, province and status only. */
  async calendar(weekStart: string): Promise<Array<{ vehicle: { id: string; registration: string; makeModel: string; status: VehicleStatus }; blocks: CalendarBlock[] }>> {
    if (!WEEK_START.test(weekStart) || Number.isNaN(Date.parse(`${weekStart}T00:00:00Z`))) throw new RangeError('weekStart must be YYYY-MM-DD');
    const start = new Date(Date.parse(`${weekStart}T00:00:00+07:00`));
    const vehicles = await this.database.query<{ id: string; registration: string; makeModel: string; status: VehicleStatus }>("SELECT id, registration, make_model AS makeModel, status FROM fleet_vehicle WHERE status IN ('ACTIVE', 'IN_REPAIR') ORDER BY registration, id");
    const blocks = await this.database.query<CalendarBlock & { vehicleId: string }>(
      `SELECT t.vehicle_id AS vehicleId, ${instant('t.starts_at')} AS startsAt, ${instant('t.ends_at')} AS endsAt, t.status,
         COALESCE((SELECT GROUP_CONCAT(DISTINCT f.province ORDER BY f.province SEPARATOR ', ') FROM fleet_request f WHERE f.trip_id = t.id AND f.dispatch_status = 'ASSIGNED'), '') AS province
       FROM fleet_trip t WHERE ${OVERLAPPING_TRIP.replace(/\b(status|starts_at|ends_at)\b/g, 't.$1')} ORDER BY t.starts_at, t.id`, [toSqlDatetime(new Date(start.getTime() + 7 * DAY)), toSqlDatetime(start)]);
    return vehicles.map((vehicle) => ({ vehicle, blocks: blocks.filter((block) => block.vehicleId === vehicle.id).map(({ startsAt, endsAt, province, status }) => ({ startsAt, endsAt, province, status })) }));
  }

  /** The driver's DEPARTED เที่ยวรถ (even overdue), PLANNED ones ending today or later, and today's RETURNED ones. */
  async driving(personId: string): Promise<DriverTrip[]> {
    const { start } = this.today();
    const rows = await this.database.query<TripRow>(`${TRIP_DETAIL} WHERE t.driver_person_id = ? AND (t.status = 'DEPARTED' OR (t.status = 'PLANNED' AND t.ends_at >= ?) OR (t.status = 'RETURNED' AND t.returned_at >= ?)) ORDER BY t.starts_at, t.id`, [personId, start, start]);
    return this.withRequests(rows);
  }

  /** A เที่ยวรถ for the หัวหน้าหมวด and its driver; null for anyone else. */
  async trip(tripId: string, viewer: FleetViewer): Promise<FleetTripDetail | null> {
    const personId = viewer.authenticated ? viewer.personId : null;
    if (!personId) return null;
    const [row] = await this.database.query<TripRow>(`${TRIP_DETAIL} WHERE t.id = ?`, [tripId]);
    if (!row || (row.driverPersonId !== personId && !canManageFleet(viewer))) return null;
    const [trip] = await this.withRequests([row]);
    return { ...trip!, vehicleId: row.vehicleId, driverPersonId: row.driverPersonId, driverName: row.driverName, driverPhone: row.driverPhone, departedAt: row.departedAt, returnedAt: row.returnedAt };
  }

  async vehicles(): Promise<VehicleView[]> {
    const rows = await this.database.query<VehicleView>('SELECT id, registration, make_model AS makeModel, kind, seats, status, note FROM fleet_vehicle ORDER BY registration, id');
    return rows.map((row) => ({ ...row, seats: Number(row.seats) }));
  }

  async drivers(): Promise<DriverView[]> {
    const rows = await this.database.query<DriverView>('SELECT d.person_id AS personId, p.display_name AS displayName, d.phone, d.is_active AS isActive FROM fleet_driver d JOIN person p ON p.id = d.person_id ORDER BY p.display_name, d.person_id');
    return rows.map((row) => ({ ...row, isActive: Number(row.isActive) === 1 }));
  }

  /** The Bangkok day of `now` as UTC DATETIME literals, start inclusive and end exclusive. */
  private today(): { start: string; end: string } {
    const start = new Date(Date.parse(`${bangkokToday(this.now())}T00:00:00+07:00`));
    return { start: toSqlDatetime(start), end: toSqlDatetime(new Date(start.getTime() + DAY)) };
  }

  /** Every ใบ whose derived status is รอจัดรถ, soonest departure first. */
  private async waitingRows(): Promise<RequestRow[]> {
    const rows = await this.database.query<RequestRow>(`${REQUESTS} WHERE f.dispatch_status = 'WAITING' ORDER BY f.depart_at, f.reference`);
    return rows.filter((row) => statusOf(row) === 'WAITING');
  }

  /** The assignee of any head step of the คำขอ, or an active ผู้แทน of its pending step. */
  private async onHeadStage(requestId: string | null, personId: string): Promise<boolean> {
    if (!requestId) return false;
    const [row] = await this.database.query<{ found: number }>(
      `SELECT 1 AS found FROM approval_step s WHERE s.request_id = ? AND (JSON_VALUE(s.assignee_snapshot, '$.personId') = ?
         OR (s.status = 'PENDING' AND JSON_VALUE(s.assignee_snapshot, '$.personId') IN (SELECT delegator_person_id FROM delegation WHERE delegate_person_id = ? AND module_code = '${FLEET_MODULE}' AND effective_from <= UTC_TIMESTAMP() AND effective_until > UTC_TIMESTAMP()))) LIMIT 1`,
      [requestId, personId, personId]);
    return row !== undefined;
  }

  private async withRequests(rows: TripRow[]): Promise<FleetTripDetail[]> {
    if (rows.length === 0) return [];
    const requests = await this.database.query<DriverTripRequest & { tripId: string }>(TRIP_REQUESTS, [rows.map((row) => row.id)]);
    return rows.map((row) => ({
      id: row.id, startsAt: row.startsAt, endsAt: row.endsAt, status: row.status, registration: row.registration, makeModel: row.makeModel,
      odometerOut: row.odometerOut === null ? null : Number(row.odometerOut), odometerIn: row.odometerIn === null ? null : Number(row.odometerIn),
      vehicleId: row.vehicleId, driverPersonId: row.driverPersonId, driverName: row.driverName, driverPhone: row.driverPhone, departedAt: row.departedAt, returnedAt: row.returnedAt,
      requests: requests.filter((request) => request.tripId === row.id).map(({ id, reference, requesterName, requesterPhone, destination, passengerCount }) => ({ id, reference, requesterName, requesterPhone: requesterPhone || null, destination, passengerCount: Number(passengerCount) }))
    }));
  }
}

interface TripRow { id: string; startsAt: string; endsAt: string; status: TripStatus; registration: string; makeModel: string; odometerOut: number | null; odometerIn: number | null; vehicleId: string; driverPersonId: string; driverName: string | null; driverPhone: string; departedAt: string | null; returnedAt: string | null }
const TRIP_DETAIL = `SELECT t.id, ${instant('t.starts_at')} AS startsAt, ${instant('t.ends_at')} AS endsAt, t.status, v.registration, v.make_model AS makeModel, t.odometer_out AS odometerOut, t.odometer_in AS odometerIn, t.vehicle_id AS vehicleId,
  t.driver_person_id AS driverPersonId, dp.display_name AS driverName, COALESCE(d.phone, '') AS driverPhone, ${instant('t.departed_at')} AS departedAt, ${instant('t.returned_at')} AS returnedAt
  FROM fleet_trip t JOIN fleet_vehicle v ON v.id = t.vehicle_id JOIN person dp ON dp.id = t.driver_person_id LEFT JOIN fleet_driver d ON d.person_id = t.driver_person_id`;
const TRIPS = `SELECT t.id, t.vehicle_id AS vehicleId, v.registration, v.status AS vehicleStatus, ${instant('t.starts_at')} AS startsAt, ${instant('t.ends_at')} AS endsAt, p.display_name AS driverName, t.status,
  (SELECT COUNT(*) FROM fleet_request f WHERE f.trip_id = t.id AND f.dispatch_status = 'ASSIGNED') AS requestCount
  FROM fleet_trip t JOIN fleet_vehicle v ON v.id = t.vehicle_id JOIN person p ON p.id = t.driver_person_id WHERE t.status <> 'CANCELLED'`;
const boardTrip = (trip: BoardTrip): BoardTrip => ({ id: trip.id, startsAt: trip.startsAt, endsAt: trip.endsAt, driverName: trip.driverName, status: trip.status, requestCount: Number(trip.requestCount) });
