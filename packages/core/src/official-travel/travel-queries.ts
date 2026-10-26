import type { AccessSubject, LeaveEndHalf, LeaveStartHalf, RequestStatus, TravelFunding, TravelTypeCode, TravelVehicle } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import type { LeaveStepView } from '../leave/leave-queries';
import { canManageTravel } from './travel-access';
import { OFFICIAL_TRAVEL_MODULE } from './travel-module';
import { tripStatus, type TripStatus } from './travel-status';

const LIST_LIMIT = 1000;

export interface TravelListItem { travelId: string; subject: string; place: string; province: string; travelType: TravelTypeCode; startDate: string; endDate: string; startHalf: LeaveStartHalf; endHalf: LeaveEndHalf; days: number; status: TripStatus; leaderDisplayName: string | null; memberCount: number }
export interface TravelMemberView { requestId: string; personId: string; displayName: string | null; organizationName: string | null; status: RequestStatus; steps: LeaveStepView[]; canDecide: boolean }
export interface TravelDetail extends TravelListItem { organiser: string; vehicle: TravelVehicle; fundingSource: TravelFunding; costs: { allowance: number; lodging: number; transport: number; registration: number; total: number }; leaderPersonId: string; members: TravelMemberView[]; canEdit: boolean; canCancel: boolean }
export interface TravelPendingItem { requestId: string; travelId: string; personId: string; personDisplayName: string | null; organizationName: string | null; subject: string; place: string; travelType: TravelTypeCode; startDate: string; endDate: string; startHalf: LeaveStartHalf; endHalf: LeaveEndHalf; days: number; submittedAt: string | null }
export interface TravelFilter { from?: string; to?: string; travelType?: TravelTypeCode; status?: TripStatus }

type Reader = Pick<Database, 'query'>;
interface TripRow { travelId: string; subject: string; place: string; province: string; travelType: TravelTypeCode; startDate: string; endDate: string; startHalf: LeaveStartHalf; endHalf: LeaveEndHalf; days: string; leaderPersonId: string; leaderDisplayName: string | null; organiser: string; vehicle: TravelVehicle; fundingSource: TravelFunding; costAllowance: string; costLodging: string; costTransport: string; costRegistration: string }
interface MemberRow { travelId: string; requestId: string; personId: string; displayName: string | null; organizationName: string | null; status: RequestStatus }

const date = (column: string) => `DATE_FORMAT(${column}, '%Y-%m-%d')`;
const instant = (column: string) => `DATE_FORMAT(${column}, '%Y-%m-%dT%H:%i:%sZ')`;
const TRIPS = `SELECT t.id AS travelId, t.subject, t.place, t.province, t.travel_type AS travelType, ${date('t.start_date')} AS startDate, ${date('t.end_date')} AS endDate, t.start_half AS startHalf, t.end_half AS endHalf, CAST(t.days AS CHAR) AS days,
  t.leader_person_id AS leaderPersonId, lp.display_name AS leaderDisplayName, t.organiser, t.vehicle, t.funding_source AS fundingSource,
  CAST(t.cost_allowance AS CHAR) AS costAllowance, CAST(t.cost_lodging AS CHAR) AS costLodging, CAST(t.cost_transport AS CHAR) AS costTransport, CAST(t.cost_registration AS CHAR) AS costRegistration
  FROM official_travel t JOIN person lp ON lp.id = t.leader_person_id`;
const ACTIVE_DELEGATORS = `SELECT delegator_person_id FROM delegation WHERE delegate_person_id = ? AND module_code = '${OFFICIAL_TRAVEL_MODULE}' AND effective_from <= UTC_TIMESTAMP() AND effective_until > UTC_TIMESTAMP()`;

/** Reads for the ไปราชการ screens. Who may see a trip is decided here, on the server, for every read. */
export class OfficialTravelQueries {
  constructor(private readonly database: Reader) {}

  async mine(personId: string): Promise<TravelListItem[]> {
    return this.list('EXISTS (SELECT 1 FROM official_travel_member mm WHERE mm.travel_id = t.id AND mm.person_id = ?)', [personId]);
  }

  async detail(travelId: string, viewer: AccessSubject): Promise<TravelDetail | null> {
    if (!viewer.authenticated || !viewer.personId) return null;
    const [trip] = await this.database.query<TripRow>(`${TRIPS} WHERE t.id = ?`, [travelId]);
    if (!trip) return null;
    const members = await this.membersOf([travelId]);
    const steps = await this.database.query<{ requestId: string; sequence: string; assigneeId: string; assigneeDisplayName: string | null; status: string; decidedAt: string | null; decisionReason: string | null }>(
      `SELECT s.request_id AS requestId, s.sequence, JSON_VALUE(s.assignee_snapshot, '$.personId') AS assigneeId, p.display_name AS assigneeDisplayName, s.status, ${instant('d.created_at')} AS decidedAt, d.reason AS decisionReason
       FROM approval_step s LEFT JOIN person p ON p.id = JSON_VALUE(s.assignee_snapshot, '$.personId') LEFT JOIN approval_decision d ON d.approval_step_id = s.id
       WHERE s.request_id IN (?) ORDER BY CAST(s.sequence AS UNSIGNED)`, [members.map((member) => member.requestId)]
    );
    const delegators = new Set((await this.database.query<{ id: string }>(ACTIVE_DELEGATORS.replace('SELECT delegator_person_id', 'SELECT delegator_person_id AS id'), [viewer.personId])).map((row) => row.id));
    const currentOf = (member: MemberRow) => member.status === 'IN_REVIEW' ? steps.find((step) => step.requestId === member.requestId && step.status === 'PENDING') : undefined;
    const isMember = members.some((member) => member.personId === viewer.personId);
    const onSteps = steps.some((step) => step.assigneeId === viewer.personId);
    const delegate = members.some((member) => { const current = currentOf(member); return current !== undefined && delegators.has(current.assigneeId); });
    if (!isMember && !onSteps && !delegate && !canManageTravel(viewer)) return null;
    const leader = trip.leaderPersonId === viewer.personId;
    const statuses = members.map((member) => member.status);
    const costs = { allowance: Number(trip.costAllowance), lodging: Number(trip.costLodging), transport: Number(trip.costTransport), registration: Number(trip.costRegistration) };
    return {
      ...toItem(trip, members),
      organiser: trip.organiser, vehicle: trip.vehicle, fundingSource: trip.fundingSource, leaderPersonId: trip.leaderPersonId,
      costs: { ...costs, total: Math.round((costs.allowance + costs.lodging + costs.transport + costs.registration) * 100) / 100 },
      members: members.map((member) => {
        const current = currentOf(member);
        return {
          requestId: member.requestId, personId: member.personId, displayName: member.displayName, organizationName: member.organizationName, status: member.status,
          steps: steps.filter((step) => step.requestId === member.requestId).map((step) => ({ sequence: Number(step.sequence), assigneeDisplayName: step.assigneeDisplayName, status: step.status, decidedAt: step.decidedAt, decisionReason: step.decisionReason })),
          canDecide: member.personId !== viewer.personId && current !== undefined && (current.assigneeId === viewer.personId || delegators.has(current.assigneeId))
        };
      }),
      canEdit: leader && statuses.includes('RETURNED'),
      canCancel: leader && statuses.some((status) => status === 'IN_REVIEW' || status === 'RETURNED') && !statuses.includes('APPROVED')
    };
  }

  async travelIdOfRequest(requestId: string): Promise<string | null> {
    const [row] = await this.database.query<{ travelId: string }>('SELECT travel_id AS travelId FROM official_travel_member WHERE request_id = ?', [requestId]);
    return row?.travelId ?? null;
  }

  /** Each person on a trip whose คำขอ's current step waits on the viewer, directly or as a ผู้แทน. */
  async pendingForApprover(personId: string): Promise<TravelPendingItem[]> {
    const ids = await this.pendingIds(personId);
    if (ids.length === 0) return [];
    const rows = await this.database.query<Omit<TravelPendingItem, 'days'> & { days: string }>(
      `SELECT m.request_id AS requestId, t.id AS travelId, m.person_id AS personId, p.display_name AS personDisplayName, o.name AS organizationName, t.subject, t.place, t.travel_type AS travelType,
         ${date('t.start_date')} AS startDate, ${date('t.end_date')} AS endDate, t.start_half AS startHalf, t.end_half AS endHalf, CAST(t.days AS CHAR) AS days, ${instant('r.submitted_at')} AS submittedAt
       FROM official_travel_member m JOIN official_travel t ON t.id = m.travel_id JOIN request r ON r.id = m.request_id JOIN person p ON p.id = m.person_id
       LEFT JOIN organization o ON o.id = JSON_VALUE(r.organization_snapshot, '$.organizationId')
       WHERE m.request_id IN (?) ORDER BY t.start_date, t.id, p.display_name`, [ids]
    );
    return rows.map((row) => ({ ...row, days: Number(row.days) }));
  }

  async pendingCount(personId: string): Promise<number> {
    return (await this.pendingIds(personId)).length;
  }

  /** People in a current unit whose name contains the text, for adding ผู้ร่วมเดินทาง; only id, name and unit. */
  async people(text: string): Promise<Array<{ personId: string; displayName: string | null; organizationName: string | null }>> {
    const query = text.trim();
    if (query.length === 0) return [];
    const pattern = `%${query.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
    return this.database.query(
      `SELECT p.id AS personId, p.display_name AS displayName, MIN(o.name) AS organizationName FROM person p
       JOIN employment_assignment ea ON ea.person_id = p.id AND ea.effective_until IS NULL JOIN organization o ON o.id = ea.organization_id
       WHERE p.display_name LIKE ? ESCAPE '\\\\' GROUP BY p.id, p.display_name ORDER BY p.display_name LIMIT 20`, [pattern]
    );
  }

  /** HR's list of every trip; the status filter is the derived trip status. */
  async all(filter: TravelFilter): Promise<TravelListItem[]> {
    const clauses = ['1 = 1'];
    const parameters: unknown[] = [];
    if (filter.from) { clauses.push('t.end_date >= ?'); parameters.push(filter.from); }
    if (filter.to) { clauses.push('t.start_date <= ?'); parameters.push(filter.to); }
    if (filter.travelType) { clauses.push('t.travel_type = ?'); parameters.push(filter.travelType); }
    const items = await this.list(clauses.join(' AND '), parameters);
    return filter.status ? items.filter((item) => item.status === filter.status) : items;
  }

  private async list(where: string, parameters: unknown[]): Promise<TravelListItem[]> {
    const trips = await this.database.query<TripRow>(`${TRIPS} WHERE ${where} ORDER BY t.start_date DESC, t.created_at DESC LIMIT ${LIST_LIMIT}`, parameters as never);
    if (trips.length === 0) return [];
    const members = await this.membersOf(trips.map((trip) => trip.travelId));
    return trips.map((trip) => toItem(trip, members.filter((member) => member.travelId === trip.travelId)));
  }

  private membersOf(travelIds: string[]): Promise<MemberRow[]> {
    return this.database.query<MemberRow>(
      `SELECT m.travel_id AS travelId, m.request_id AS requestId, m.person_id AS personId, p.display_name AS displayName, o.name AS organizationName, r.status
       FROM official_travel_member m JOIN official_travel t ON t.id = m.travel_id JOIN request r ON r.id = m.request_id JOIN person p ON p.id = m.person_id
       LEFT JOIN organization o ON o.id = JSON_VALUE(r.organization_snapshot, '$.organizationId')
       WHERE m.travel_id IN (?) ORDER BY m.person_id = t.leader_person_id DESC, p.display_name, m.person_id`, [travelIds]
    );
  }

  private async pendingIds(personId: string): Promise<string[]> {
    const rows = await this.database.query<{ requestId: string }>(
      `SELECT s.request_id AS requestId FROM approval_step s JOIN request r ON r.id = s.request_id
       WHERE r.module_code = '${OFFICIAL_TRAVEL_MODULE}' AND r.status = 'IN_REVIEW' AND s.status = 'PENDING' AND r.requestor_person_id <> ?
         AND CAST(s.sequence AS UNSIGNED) = (SELECT MIN(CAST(s2.sequence AS UNSIGNED)) FROM approval_step s2 WHERE s2.request_id = s.request_id AND s2.status = 'PENDING')
         AND (JSON_VALUE(s.assignee_snapshot, '$.personId') = ? OR JSON_VALUE(s.assignee_snapshot, '$.personId') IN (${ACTIVE_DELEGATORS}))`,
      [personId, personId, personId]
    );
    return rows.map((row) => row.requestId);
  }
}

function toItem(trip: TripRow, members: MemberRow[]): TravelListItem {
  return { travelId: trip.travelId, subject: trip.subject, place: trip.place, province: trip.province, travelType: trip.travelType, startDate: trip.startDate, endDate: trip.endDate, startHalf: trip.startHalf, endHalf: trip.endHalf, days: Number(trip.days), status: tripStatus(members.map((member) => member.status)), leaderDisplayName: trip.leaderDisplayName, memberCount: members.length };
}
