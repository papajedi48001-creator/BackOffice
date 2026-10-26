import { randomUUID } from 'node:crypto';
import { officialTravelInputSchema, type OfficialTravelErrorCode, type OfficialTravelInput } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';
import { lockPerson } from '../leave/leave-service';
import { activeUnitsOfPerson, loadPersonContext } from '../leave/leave-store';
import { DatabaseWorkflowRepository } from '../workflow/database-workflow-repository';
import { RequestService, type ApproverResolver } from '../workflow/request-service';
import { OFFICIAL_TRAVEL_MODULE } from './travel-module';
import { activeTravelUnitsOfPerson, loadTravelTypes, travelUnits, type TravelType } from './travel-store';

/** A คำขอไปราชการ as filed; the halves, costs and other people default as the schema says. */
export type OfficialTravelDraft = Parameters<typeof officialTravelInputSchema.parse>[0];
export type TravelFailure = { ok: false; code: OfficialTravelErrorCode; personId?: string };
export type TravelSubmitResult = { ok: true; travelId: string } | TravelFailure;

interface Checked { days: number; type: TravelType; organizations: Map<string, string> }
interface MemberRow { requestId: string; personId: string; status: string }

/** Thrown inside a transaction so a failure for one person undoes everything written for the others. */
class PersonFailure extends Error {
  constructor(readonly code: OfficialTravelErrorCode, readonly personId: string) { super(code); }
}

/** Files a คำขอไปราชการ as one คำขอ per ผู้ร่วมเดินทาง; only the หัวหน้าคณะ edits, resubmits or cancels it. */
export class OfficialTravelService {
  constructor(private readonly database: Database, private readonly approvers: ApproverResolver, private readonly createId: () => string = randomUUID) {}

  async submit(leaderPersonId: string, draft: OfficialTravelDraft): Promise<TravelSubmitResult> {
    const input = officialTravelInputSchema.parse(draft);
    const people = [leaderPersonId, ...input.memberPersonIds.filter((id) => id !== leaderPersonId)];
    return this.withPersonFailures(() => this.database.transaction(async (database) => {
      const checked = await this.check(database, people, input);
      if (!('days' in checked)) return checked;
      const travelId = this.createId();
      await database.execute(
        'INSERT INTO official_travel (id, leader_person_id, subject, organiser, place, province, travel_type, vehicle, start_date, end_date, start_half, end_half, days, funding_source, cost_allowance, cost_lodging, cost_transport, cost_registration, attachment_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP())',
        [travelId, leaderPersonId, input.subject, input.organiser, input.place, input.province, input.travelType, input.vehicle, input.startDate, input.endDate, input.startHalf, input.endHalf, checked.days, input.fundingSource, input.costAllowance, input.costLodging, input.costTransport, input.costRegistration]
      );
      const requests = new RequestService(new DatabaseWorkflowRepository(database), this.approvers, this.createId);
      for (const personId of people) {
        const request = await this.forPerson(personId, () => requests.submitRequest({ moduleCode: OFFICIAL_TRAVEL_MODULE, requestorPersonId: personId, organizationSnapshot: { organizationId: checked.organizations.get(personId)! }, target: checked.type.approvalTarget }));
        await database.execute('INSERT INTO official_travel_member (request_id, travel_id, person_id, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())', [request.id, travelId, personId]);
      }
      await this.audit(database, 'official_travel.submitted', travelId, leaderPersonId, { travelType: input.travelType, memberCount: people.length, startDate: input.startDate, endDate: input.endDate, days: checked.days });
      return { ok: true as const, travelId };
    }, { isolationLevel: 'READ COMMITTED' }));
  }

  /** The หัวหน้าคณะ edits the trip and sends each RETURNED and APPROVED คำขอ up a fresh chain. The people cannot change. */
  async resubmit(leaderPersonId: string, travelId: string, draft: OfficialTravelDraft): Promise<{ ok: true } | TravelFailure> {
    const input = officialTravelInputSchema.parse(draft);
    return this.withPersonFailures(() => this.database.transaction(async (database) => {
      const members = await this.lockTrip(database, travelId, leaderPersonId);
      if (!members) return { ok: false as const, code: 'NOT_FOUND' as const };
      const returned = members.filter((member) => member.status === 'RETURNED');
      if (returned.length === 0) return { ok: false as const, code: 'NOT_RETURNED' as const };
      const going = members.filter((member) => member.status !== 'REJECTED' && member.status !== 'CANCELLED').map((member) => member.personId);
      const checked = await this.check(database, going, input, travelId);
      if (!('days' in checked)) return checked;
      await database.execute(
        'UPDATE official_travel SET subject = ?, organiser = ?, place = ?, province = ?, travel_type = ?, vehicle = ?, start_date = ?, end_date = ?, start_half = ?, end_half = ?, days = ?, funding_source = ?, cost_allowance = ?, cost_lodging = ?, cost_transport = ?, cost_registration = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?',
        [input.subject, input.organiser, input.place, input.province, input.travelType, input.vehicle, input.startDate, input.endDate, input.startHalf, input.endHalf, checked.days, input.fundingSource, input.costAllowance, input.costLodging, input.costTransport, input.costRegistration, travelId]
      );
      const requests = new RequestService(new DatabaseWorkflowRepository(database), this.approvers, this.createId);
      // The trip itself changed, so anyone already approved goes back up with the returned people; their approver sees the new details.
      const repository = new DatabaseWorkflowRepository(database);
      for (const member of members.filter((candidate) => candidate.status === 'APPROVED')) {
        const request = await repository.getRequestForUpdate(member.requestId);
        if (request) await repository.saveRequest({ ...request, status: 'RETURNED' });
      }
      for (const member of members.filter((candidate) => candidate.status === 'RETURNED' || candidate.status === 'APPROVED')) await this.forPerson(member.personId, () => requests.resubmitRequest({ requestId: member.requestId, actorPersonId: leaderPersonId, target: checked.type.approvalTarget }, { actorAuthorized: true }));
      await this.audit(database, 'official_travel.resubmitted', travelId, leaderPersonId, { travelType: input.travelType, memberCount: going.length, startDate: input.startDate, endDate: input.endDate, days: checked.days });
      return { ok: true as const };
    }, { isolationLevel: 'READ COMMITTED' }));
  }

  /** Withdraws every IN_REVIEW or RETURNED คำขอ of the trip while nobody is approved yet; an approved trip stays as it is in round 1. */
  async cancel(leaderPersonId: string, travelId: string, reason: string): Promise<{ ok: true } | { ok: false; code: 'NOT_FOUND' | 'NOT_PENDING' }> {
    return this.database.transaction(async (database) => {
      const members = await this.lockTrip(database, travelId, leaderPersonId);
      if (!members) return { ok: false as const, code: 'NOT_FOUND' as const };
      const waiting = members.filter((member) => member.status === 'IN_REVIEW' || member.status === 'RETURNED');
      // Someone already approved is going; round 1 does not take an approved trip back.
      if (waiting.length === 0 || members.some((member) => member.status === 'APPROVED')) return { ok: false as const, code: 'NOT_PENDING' as const };
      const requests = new RequestService(new DatabaseWorkflowRepository(database), this.approvers, this.createId);
      for (const member of waiting) await requests.cancelRequest({ requestId: member.requestId, actorPersonId: leaderPersonId, reason }, { actorAuthorized: true });
      await this.audit(database, 'official_travel.cancelled', travelId, leaderPersonId, { memberCount: waiting.length });
      return { ok: true as const };
    });
  }

  /** Locks every person in a stable order, then checks each one; the first failure names its person. */
  private async check(database: Database, people: readonly string[], input: OfficialTravelInput, excludeTravelId?: string): Promise<Checked | TravelFailure> {
    for (const personId of [...people].sort()) await lockPerson(database, personId);
    const units = travelUnits(input);
    if (units.length === 0) return { ok: false, code: 'NO_TRAVEL_DAYS' };
    const type = (await loadTravelTypes(database)).find((candidate) => candidate.code === input.travelType);
    if (!type) return { ok: false, code: 'NOT_FOUND' };
    const organizations = new Map<string, string>();
    for (const personId of people) {
      const person = await loadPersonContext(database, personId);
      if (!person) return { ok: false, code: 'INVALID_MEMBERS', personId };
      if (!person.organizationId) return { ok: false, code: 'NO_ORGANIZATION', personId };
      organizations.set(personId, person.organizationId);
      const leave = new Set(await activeUnitsOfPerson(database, personId, input.startDate, input.endDate));
      if (units.some((unit) => leave.has(unit))) return { ok: false, code: 'OVERLAPS_LEAVE', personId };
      const travel = new Set(await activeTravelUnitsOfPerson(database, personId, input.startDate, input.endDate, excludeTravelId));
      if (units.some((unit) => travel.has(unit))) return { ok: false, code: 'OVERLAPS_TRAVEL', personId };
    }
    return { days: units.length / 2, type, organizations };
  }

  /** The trip's people and their คำขอ status, with the trip and its คำขอ locked so no decision lands in between; null unless the trip exists and the person leads it. */
  private async lockTrip(database: Database, travelId: string, leaderPersonId: string): Promise<MemberRow[] | null> {
    const [trip] = await database.query<{ leader: string }>('SELECT leader_person_id AS leader FROM official_travel WHERE id = ? FOR UPDATE', [travelId]);
    if (!trip || trip.leader !== leaderPersonId) return null;
    return database.query<MemberRow>('SELECT m.request_id AS requestId, m.person_id AS personId, r.status FROM official_travel_member m JOIN request r ON r.id = m.request_id WHERE m.travel_id = ? ORDER BY m.person_id FOR UPDATE', [travelId]);
  }

  private async forPerson<T>(personId: string, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof Error && error.message === 'NO_APPROVER') throw new PersonFailure('NO_APPROVER', personId);
      throw error;
    }
  }

  private async withPersonFailures<T>(work: () => Promise<T>): Promise<T | TravelFailure> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof PersonFailure) return { ok: false, code: error.code, personId: error.personId };
      throw error;
    }
  }

  private audit(database: Pick<Database, 'execute'>, action: string, targetId: string, actorPersonId: string, metadata: Record<string, unknown>): Promise<void> {
    return new AuditService(new DatabaseAuditRepository(database), this.createId).recordAudit({ actorPersonId, action, targetType: 'official_travel', targetId, result: 'SUCCESS', metadata });
  }
}
