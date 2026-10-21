import type { RoomActor, RoomBookingDayStatus, RoomBookingHistoryAction, RoomBookingStatus } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { AuthorizationService } from '../access/authorization-service';
import { fromMariaDbDate, fromMariaDbDatetime, toMariaDbDatetime } from './database-room-booking-repository';
import type { RoomAddonDetails, RoomDetails } from './room-catalog-service';

export interface RoomListItem extends RoomDetails { ownerOrganizationName: string | null; }
/** Public calendar entry: what every signed-in person may see. */
export interface RoomCalendarEntry { bookingId: string; reference: string; roomId: string; roomName: string; date: string; startsAt: Date; endsAt: Date; status: RoomBookingStatus; title: string; bookerName: string | null; bookerOrganizationName: string | null; }
export interface RoomBookingSummary { id: string; reference: string; roomName: string; title: string; status: RoomBookingStatus; firstDate: string; lastDate: string; startMinute: number; endMinute: number; activeDayCount: number; lastEndsAt: Date | null; bookerName: string | null; bookerOrganizationName: string | null; }
export interface RoomBookingDetail extends RoomBookingSummary {
  roomId: string; roomPlace: string; attendeeCount: number; bookerPersonId: string;
  days: { id: string; date: string; startsAt: Date; endsAt: Date; status: RoomBookingDayStatus }[];
  addons: { addonName: string; addonUnit: string; quantity: number; note: string | null }[];
  history: { action: RoomBookingHistoryAction; actorName: string | null; reason: string | null; createdAt: Date }[];
  viewerIsBooker: boolean; viewerCanDecide: boolean;
}

type SummaryRow = Omit<RoomBookingSummary, 'firstDate' | 'lastDate' | 'lastEndsAt' | 'activeDayCount' | 'startMinute' | 'endMinute'> & { firstDate: Date | string; lastDate: Date | string; lastEndsAt: Date | string | null; activeDayCount: number | string; startMinute: number | string; endMinute: number | string };

const summarySelect = `SELECT b.id, b.reference, r.name AS roomName, b.title, b.status, b.start_minute AS startMinute, b.end_minute AS endMinute,
  MIN(d.booking_date) AS firstDate, MAX(d.booking_date) AS lastDate, SUM(d.status = 'ACTIVE') AS activeDayCount, MAX(CASE WHEN d.status = 'ACTIVE' THEN d.ends_at END) AS lastEndsAt,
  p.display_name AS bookerName, o.name AS bookerOrganizationName
  FROM room_booking b JOIN room r ON r.id = b.room_id JOIN room_booking_day d ON d.booking_id = b.id
  LEFT JOIN person p ON p.id = b.booker_person_id LEFT JOIN organization o ON o.id = b.booker_organization_id`;
const summaryGroup = 'GROUP BY b.id, b.reference, r.name, b.title, b.status, b.start_minute, b.end_minute, p.display_name, o.name';

function toSummary(row: SummaryRow): RoomBookingSummary {
  return { ...row, startMinute: Number(row.startMinute), endMinute: Number(row.endMinute), firstDate: fromMariaDbDate(row.firstDate), lastDate: fromMariaDbDate(row.lastDate), activeDayCount: Number(row.activeDayCount), lastEndsAt: row.lastEndsAt ? fromMariaDbDatetime(row.lastEndsAt) : null };
}

export class RoomBookingQueries {
  constructor(private readonly database: Pick<Database, 'query'>, private readonly authorizer: AuthorizationService = new AuthorizationService()) {}

  async listRooms(options: { bookableOnly: boolean }): Promise<RoomListItem[]> {
    const rows = await this.database.query<Omit<RoomListItem, 'isBookable'> & { isBookable: number }>(
      `SELECT r.id, r.name, r.place, r.capacity, r.equipment, r.owner_organization_id AS ownerOrganizationId, r.is_bookable AS isBookable, o.name AS ownerOrganizationName
       FROM room r LEFT JOIN organization o ON o.id = r.owner_organization_id ${options.bookableOnly ? 'WHERE r.is_bookable = 1' : ''} ORDER BY r.name`
    );
    return rows.map((row) => ({ ...row, capacity: Number(row.capacity), isBookable: Boolean(row.isBookable) }));
  }

  async listAddons(options: { activeOnly: boolean }): Promise<RoomAddonDetails[]> {
    const rows = await this.database.query<Omit<RoomAddonDetails, 'isActive'> & { isActive: number }>(`SELECT id, name, unit, is_active AS isActive FROM room_addon ${options.activeOnly ? 'WHERE is_active = 1' : ''} ORDER BY name`);
    return rows.map((row) => ({ ...row, isActive: Boolean(row.isActive) }));
  }

  async calendar(from: Date, to: Date, roomId?: string): Promise<RoomCalendarEntry[]> {
    const rows = await this.database.query<Omit<RoomCalendarEntry, 'date' | 'startsAt' | 'endsAt'> & { date: Date | string; startsAt: Date | string; endsAt: Date | string }>(
      `SELECT b.id AS bookingId, b.reference, r.id AS roomId, r.name AS roomName, d.booking_date AS date, d.starts_at AS startsAt, d.ends_at AS endsAt, b.status, b.title, p.display_name AS bookerName, o.name AS bookerOrganizationName
       FROM room_booking_day d JOIN room_booking b ON b.id = d.booking_id JOIN room r ON r.id = d.room_id
       LEFT JOIN person p ON p.id = b.booker_person_id LEFT JOIN organization o ON o.id = b.booker_organization_id
       WHERE d.status = 'ACTIVE' AND b.status IN ('PENDING', 'APPROVED') AND d.starts_at < ? AND d.ends_at > ? ${roomId ? 'AND d.room_id = ?' : ''}
       ORDER BY d.starts_at, r.name`,
      [toMariaDbDatetime(to), toMariaDbDatetime(from), ...(roomId ? [roomId] : [])]
    );
    return rows.map((row) => ({ ...row, date: fromMariaDbDate(row.date), startsAt: fromMariaDbDatetime(row.startsAt), endsAt: fromMariaDbDatetime(row.endsAt) }));
  }

  async myBookings(personId: string): Promise<RoomBookingSummary[]> {
    return (await this.database.query<SummaryRow>(`${summarySelect} WHERE b.booker_person_id = ? ${summaryGroup} ORDER BY firstDate DESC, b.reference DESC`, [personId])).map(toSummary);
  }

  async pendingForApprover(actor: RoomActor): Promise<RoomBookingSummary[]> {
    const scope = this.authorizer.organizationScope(this.subject(actor), 'room.booking.decide');
    if (scope !== 'all' && scope.length === 0) return [];
    const scoped = scope === 'all' ? '' : `AND r.owner_organization_id IN (${scope.map(() => '?').join(', ')})`;
    return (await this.database.query<SummaryRow>(`${summarySelect} WHERE b.status = 'PENDING' ${scoped} ${summaryGroup} ORDER BY firstDate, b.reference`, scope === 'all' ? [] : scope)).map(toSummary);
  }

  /** Full booking for its booker or an approver in scope; `null` for anyone else so the page answers not-found. */
  async detail(bookingId: string, actor: RoomActor): Promise<RoomBookingDetail | null> {
    const row = (await this.database.query<SummaryRow & { roomId: string; roomPlace: string; attendeeCount: number; bookerPersonId: string; ownerOrganizationId: string }>(
      `${summarySelect.replace('SELECT b.id,', 'SELECT b.id, r.id AS roomId, r.place AS roomPlace, b.attendee_count AS attendeeCount, b.booker_person_id AS bookerPersonId, r.owner_organization_id AS ownerOrganizationId,')} WHERE b.id = ? ${summaryGroup}, r.id, r.place, b.attendee_count, b.booker_person_id, r.owner_organization_id`,
      [bookingId]
    ))[0];
    if (!row) return null;
    const viewerIsBooker = row.bookerPersonId === actor.personId;
    const viewerCanDecide = (await this.authorizer.canAccess(this.subject(actor), 'room.booking.decide', { moduleCode: 'room-booking', organizationId: row.ownerOrganizationId })).allowed;
    if (!viewerIsBooker && !viewerCanDecide) return null;
    const days = await this.database.query<{ id: string; date: Date | string; startsAt: Date | string; endsAt: Date | string; status: RoomBookingDayStatus }>('SELECT id, booking_date AS date, starts_at AS startsAt, ends_at AS endsAt, status FROM room_booking_day WHERE booking_id = ? ORDER BY starts_at', [bookingId]);
    const addons = await this.database.query<{ addonName: string; addonUnit: string; quantity: number; note: string | null }>('SELECT addon_name AS addonName, addon_unit AS addonUnit, quantity, note FROM room_booking_addon WHERE booking_id = ? ORDER BY addon_name', [bookingId]);
    const history = await this.database.query<{ action: RoomBookingHistoryAction; actorName: string | null; reason: string | null; createdAt: Date | string }>('SELECT h.action, p.display_name AS actorName, h.reason, h.created_at AS createdAt FROM room_booking_history h LEFT JOIN person p ON p.id = h.actor_person_id WHERE h.booking_id = ? ORDER BY h.created_at', [bookingId]);
    const { ownerOrganizationId: _owner, ...rest } = row;
    void _owner;
    return {
      ...toSummary(rest), roomId: row.roomId, roomPlace: row.roomPlace, attendeeCount: Number(row.attendeeCount), bookerPersonId: row.bookerPersonId,
      days: days.map((day) => ({ ...day, date: fromMariaDbDate(day.date), startsAt: fromMariaDbDatetime(day.startsAt), endsAt: fromMariaDbDatetime(day.endsAt) })),
      addons: addons.map((addon) => ({ ...addon, quantity: Number(addon.quantity) })),
      history: history.map((entry) => ({ ...entry, createdAt: fromMariaDbDatetime(entry.createdAt) })),
      viewerIsBooker, viewerCanDecide
    };
  }

  private subject(actor: RoomActor) { return { authenticated: true, personId: actor.personId, roles: actor.roles, dataOwnerModules: [] }; }
}
