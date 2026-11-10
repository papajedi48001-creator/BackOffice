import { randomUUID } from 'node:crypto';
import { labDecisionInputSchema, labIssueInputSchema, labRequisitionInputSchema, type AccessSubject, type LabDecisionInput, type LabIssueInput, type LabRequisitionInput, type LabRequisitionStatus } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { canDecideOwnRequest } from '../access/active-role';
import { canManageLab, labCan, loadLabMember, type LabAction } from './lab-access';
import { labAudit } from './lab-db';
import { checkPicks, fiscalYearBE, nextRequisitionStatus, type RequisitionEvent } from './lab-rules';
import { LabRefusal, labBell, labToday, labTransaction, lockBalances, membersWithRole, move, nextDocNo, requireCertified } from './lab-stock-writer';

export type LabRequisitionCode = 'FORBIDDEN' | 'NOT_FOUND' | 'WRONG_STATUS' | 'OPENING_NOT_CERTIFIED' | 'CONFLICT_OF_INTEREST' | 'REASON_REQUIRED' | 'OVER_REQUESTED' | 'NOTE_REQUIRED' | 'LOT_EXPIRED' | 'INSUFFICIENT_STOCK';
type Result<T = object> = ({ ok: true } & T) | { ok: false; code: LabRequisitionCode };
type Row = { id: string; doc_no: string; section_id: string; status: LabRequisitionStatus; requested_by: string };
const path = (id: string) => `/lab/requisitions/${id}`;

/** ใบขอเบิก Lab: งาน asks คลังหลัก, หัวหน้า Lab decides, ผู้ดูแลคลัง Lab issues (คลังหลัก → คลังย่อย). */
export class LabRequisitionService {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID) {}

  async create(subject: AccessSubject, input: LabRequisitionInput): Promise<Result<{ requisitionId: string; docNo: string }>> {
    const requisition = labRequisitionInputSchema.parse(input);
    const actor = await this.allowed(subject, 'request', requisition.sectionId);
    if (!actor) return { ok: false, code: 'FORBIDDEN' };
    return labTransaction(this.database, async (database) => {
      await requireCertified(database);
      const requisitionId = this.createId();
      const docNo = await nextDocNo(database, 'LQ', fiscalYearBE(labToday()));
      await database.execute("INSERT INTO lab_requisition (id, doc_no, section_id, status, note, requested_by, requested_at) VALUES (?, ?, ?, 'SUBMITTED', ?, ?, UTC_TIMESTAMP())", [requisitionId, docNo, requisition.sectionId, requisition.note, actor]);
      await this.writeLines(database, requisitionId, requisition.lines);
      await labAudit(database, this.createId, actor, 'lab.requisition.submit', 'lab_requisition', requisitionId, { docNo, lines: requisition.lines.length });
      await this.tellHeads(database, requisitionId, docNo);
      return { ok: true as const, requisitionId, docNo };
    });
  }

  /** The requester sends a ตีกลับ ใบขอเบิก again with new lines. */
  async resubmit(subject: AccessSubject, id: string, input: LabRequisitionInput): Promise<Result> {
    const requisition = labRequisitionInputSchema.parse(input);
    const actor = await this.allowed(subject, 'request', requisition.sectionId);
    if (!actor) return { ok: false, code: 'FORBIDDEN' };
    return labTransaction(this.database, async (database) => {
      const row = await this.lock(database, id);
      if (row.requested_by !== actor && !canManageLab(subject)) throw new LabRefusal('FORBIDDEN');
      const status = this.next(row, 'RESUBMIT');
      await database.execute('UPDATE lab_requisition SET status = ?, section_id = ?, note = ?, requested_at = UTC_TIMESTAMP(), decided_by = NULL, decided_at = NULL, decision_reason = NULL WHERE id = ?', [status, requisition.sectionId, requisition.note, id]);
      await database.execute('DELETE FROM lab_requisition_line WHERE requisition_id = ?', [id]);
      await this.writeLines(database, id, requisition.lines);
      await labAudit(database, this.createId, actor, 'lab.requisition.resubmit', 'lab_requisition', id, { docNo: row.doc_no, lines: requisition.lines.length });
      await this.tellHeads(database, id, row.doc_no);
      return { ok: true as const };
    });
  }

  async cancel(subject: AccessSubject, id: string): Promise<Result> {
    if (!subject.personId) return { ok: false, code: 'FORBIDDEN' };
    const actor = subject.personId;
    return labTransaction(this.database, async (database) => {
      const row = await this.lock(database, id);
      if (row.requested_by !== actor && !canManageLab(subject)) throw new LabRefusal('FORBIDDEN');
      const status = this.next(row, 'CANCEL');
      await database.execute('UPDATE lab_requisition SET status = ? WHERE id = ?', [status, id]);
      await labAudit(database, this.createId, actor, 'lab.requisition.cancel', 'lab_requisition', id, { docNo: row.doc_no });
      return { ok: true as const };
    });
  }

  /** หัวหน้า Lab อนุมัติ / ตีกลับ / ไม่อนุมัติ. Deciding one's own ใบขอเบิก follows `canDecideOwnRequest` and needs a reason. */
  async decide(subject: AccessSubject, id: string, input: LabDecisionInput): Promise<Result> {
    const parsed = labDecisionInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: 'REASON_REQUIRED' };
    const decision = parsed.data;
    const actor = await this.allowed(subject, 'decide');
    if (!actor) return { ok: false, code: 'FORBIDDEN' };
    return labTransaction(this.database, async (database) => {
      const row = await this.lock(database, id);
      const selfApproval = row.requested_by === actor;
      if (selfApproval && !canDecideOwnRequest(subject.activeRole)) throw new LabRefusal('CONFLICT_OF_INTEREST');
      if (selfApproval && !decision.reason) throw new LabRefusal('REASON_REQUIRED');
      const status = this.next(row, decision.decision);
      await database.execute('UPDATE lab_requisition SET status = ?, decided_by = ?, decided_at = UTC_TIMESTAMP(), decision_reason = ? WHERE id = ?', [status, actor, decision.reason || null, id]);
      await labAudit(database, this.createId, actor, `lab.requisition.${decision.decision.toLowerCase()}`, 'lab_requisition', id, { docNo: row.doc_no, status, ...(selfApproval ? { selfApproval: true } : {}) });
      const label = { APPROVE: 'อนุมัติแล้ว', RETURN: 'ถูกตีกลับ', REJECT: 'ไม่อนุมัติ' }[decision.decision];
      await labBell(database, `lab-requisition-${status}:${id}:${this.createId()}`, row.requested_by, `ใบขอเบิก ${row.doc_no} ${label}`, path(id), this.createId);
      if (status === 'APPROVED') for (const keeper of await membersWithRole(database, 'KEEPER')) await labBell(database, `lab-requisition-approved:${id}`, keeper, `ใบขอเบิก ${row.doc_no} รอจ่าย`, path(id), this.createId);
      return { ok: true as const };
    });
  }

  /** จ่าย: moves the chosen lots from คลังหลัก to the งาน's คลังย่อย. Short lines need a note; nothing over the request. */
  async issue(subject: AccessSubject, id: string, input: LabIssueInput): Promise<Result> {
    const issue = labIssueInputSchema.parse(input);
    const actor = await this.allowed(subject, 'issue');
    if (!actor) return { ok: false, code: 'FORBIDDEN' };
    return labTransaction(this.database, async (database) => {
      await requireCertified(database);
      const row = await this.lock(database, id);
      const status = this.next(row, 'ISSUE');
      const lines = await database.query<{ id: string; item_id: string; quantity_requested: number }>('SELECT id, item_id, quantity_requested FROM lab_requisition_line WHERE requisition_id = ? ORDER BY line_no', [id]);
      const picksByLine = new Map(issue.lines.map((line) => [line.lineId, line.picks]));
      if ([...picksByLine.keys()].some((lineId) => !lines.some((line) => line.id === lineId))) throw new LabRefusal('NOT_FOUND');
      const issued = lines.map((line) => ({ line, picks: picksByLine.get(line.id) ?? [], total: (picksByLine.get(line.id) ?? []).reduce((sum, pick) => sum + pick.quantity, 0) }));
      if (issued.some((entry) => entry.total > Number(entry.line.quantity_requested))) throw new LabRefusal('OVER_REQUESTED');
      if (issued.some((entry) => entry.total < Number(entry.line.quantity_requested)) && !issue.note) throw new LabRefusal('NOTE_REQUIRED');
      const [main] = await database.query<{ id: string }>("SELECT id FROM lab_store WHERE kind = 'MAIN'");
      const [target] = await database.query<{ id: string }>('SELECT id FROM lab_store WHERE section_id = ?', [row.section_id]);
      const today = labToday();
      for (const entry of issued) {
        if (entry.picks.length) {
          const check = checkPicks(await lockBalances(database, main!.id, entry.line.item_id), entry.picks, today);
          if (!check.ok) throw new LabRefusal(check.code);
        }
        for (const pick of entry.picks) {
          await move(database, { lotId: pick.lotId, storeId: main!.id, quantity: -pick.quantity, kind: 'ISSUE_OUT', entryDate: today, refType: 'REQUISITION', refId: id, actorPersonId: actor }, this.createId);
          await move(database, { lotId: pick.lotId, storeId: target!.id, quantity: pick.quantity, kind: 'ISSUE_IN', entryDate: today, refType: 'REQUISITION', refId: id, actorPersonId: actor }, this.createId);
        }
        await database.execute('UPDATE lab_requisition_line SET quantity_issued = ? WHERE id = ?', [entry.total, entry.line.id]);
      }
      await database.execute('UPDATE lab_requisition SET status = ?, issued_by = ?, issued_at = UTC_TIMESTAMP(), issue_note = ? WHERE id = ?', [status, actor, issue.note || null, id]);
      await labAudit(database, this.createId, actor, 'lab.requisition.issue', 'lab_requisition', id, { docNo: row.doc_no, lines: issued.length, short: issued.some((entry) => entry.total < Number(entry.line.quantity_requested)) });
      await labBell(database, `lab-requisition-issued:${id}`, row.requested_by, `ใบขอเบิก ${row.doc_no} จ่ายของแล้ว`, path(id), this.createId);
      return { ok: true as const };
    });
  }

  private async allowed(subject: AccessSubject, action: LabAction, sectionId?: string): Promise<string | null> {
    if (!subject.personId) return null;
    return labCan(await loadLabMember(this.database, subject.personId), canManageLab(subject), action, sectionId) ? subject.personId : null;
  }

  private async lock(database: Database, id: string): Promise<Row> {
    const [row] = await database.query<Row>('SELECT id, doc_no, section_id, status, requested_by FROM lab_requisition WHERE id = ? FOR UPDATE', [id]);
    if (!row) throw new LabRefusal('NOT_FOUND');
    return row;
  }

  private next(row: Row, event: RequisitionEvent): LabRequisitionStatus {
    const status = nextRequisitionStatus(row.status, event);
    if (!status) throw new LabRefusal('WRONG_STATUS');
    return status;
  }

  private async writeLines(database: Database, requisitionId: string, lines: { itemId: string; quantity: number }[]): Promise<void> {
    for (const [index, line] of lines.entries()) await database.execute('INSERT INTO lab_requisition_line (id, requisition_id, line_no, item_id, quantity_requested) VALUES (?, ?, ?, ?, ?)', [this.createId(), requisitionId, index + 1, line.itemId, line.quantity]);
  }

  private async tellHeads(database: Database, id: string, docNo: string): Promise<void> {
    for (const head of await membersWithRole(database, 'HEAD')) await labBell(database, `lab-requisition-submit:${id}:${this.createId()}`, head, `ใบขอเบิก ${docNo} รออนุมัติ`, path(id), this.createId);
  }
}
