import type { LabRequisitionStatus } from '@backoffice/contracts';

/** One lot's stock in one store, as the FEFO picker and the pick checker see it. Dates are `YYYY-MM-DD`. */
export type LotOption = { lotId: string; expiryDate: string | null; createdAt: string; available: number };
export type Pick = { lotId: string; quantity: number };

const isExpired = (lot: LotOption, entryDate: string) => lot.expiryDate !== null && lot.expiryDate < entryDate;

/** หมดอายุก่อนจ่ายก่อน: earliest expiry first, lots without expiry last, older lots first on a tie; expired lots are skipped. */
export function fefoOrder(lots: readonly LotOption[], entryDate: string): LotOption[] {
  return lots.filter((lot) => lot.available > 0 && !isExpired(lot, entryDate)).sort((a, b) =>
    (a.expiryDate ?? '9999-12-31').localeCompare(b.expiryDate ?? '9999-12-31') || a.createdAt.localeCompare(b.createdAt) || a.lotId.localeCompare(b.lotId));
}

export function pickFefo(lots: readonly LotOption[], quantity: number, entryDate: string): { ok: true; picks: Pick[] } | { ok: false; code: 'INSUFFICIENT_STOCK' } {
  const picks: Pick[] = [];
  let left = quantity;
  for (const lot of fefoOrder(lots, entryDate)) {
    if (left === 0) break;
    const take = Math.min(left, lot.available);
    picks.push({ lotId: lot.lotId, quantity: take });
    left -= take;
  }
  return left === 0 ? { ok: true, picks } : { ok: false, code: 'INSUFFICIENT_STOCK' };
}

/** Checks lots a person chose by hand against what the store holds on `entryDate`. */
export function checkPicks(lots: readonly LotOption[], picks: readonly Pick[], entryDate: string): { ok: true } | { ok: false; code: 'LOT_EXPIRED' | 'INSUFFICIENT_STOCK' | 'NOT_FOUND' } {
  const byId = new Map(lots.map((lot) => [lot.lotId, lot]));
  const used = new Map<string, number>();
  for (const pick of picks) {
    const lot = byId.get(pick.lotId);
    if (!lot) return { ok: false, code: 'NOT_FOUND' };
    if (isExpired(lot, entryDate)) return { ok: false, code: 'LOT_EXPIRED' };
    const total = (used.get(pick.lotId) ?? 0) + pick.quantity;
    if (total > lot.available) return { ok: false, code: 'INSUFFICIENT_STOCK' };
    used.set(pick.lotId, total);
  }
  return { ok: true };
}

/** ต้นทุนต่อหน่วยใช้ = ราคาต่อหน่วยรับ ÷ อัตราแปลง, 4 decimals, half up. Computed in integers to avoid float drift. */
export function unitCost(pricePerReceive: number, unitsPerReceive: number): string {
  const tenThousandths = Math.round(pricePerReceive * 100) * 100;
  const rounded = Math.floor((2 * tenThousandths + unitsPerReceive) / (2 * unitsPerReceive));
  return `${Math.floor(rounded / 10000)}.${String(rounded % 10000).padStart(4, '0')}`;
}

const number = (value: number) => value.toLocaleString('en-US');

/** `25 ขวด (2 กล่อง 5 ขวด)`; just `5 ขวด` when it does not fill one pack or the units are the same. */
export function formatQuantity(quantity: number, useUnit: string, receiveUnit: string, unitsPerReceive: number): string {
  const base = `${number(quantity)} ${useUnit}`;
  if (unitsPerReceive <= 1 || Math.abs(quantity) < unitsPerReceive) return base;
  const packs = Math.trunc(quantity / unitsPerReceive);
  const rest = quantity % unitsPerReceive;
  return `${base} (${number(packs)} ${receiveUnit}${rest ? ` ${number(rest)} ${useUnit}` : ''})`;
}

/** ปีงบประมาณ พ.ศ.: 1 October starts the next year. */
export function fiscalYearBE(date: string): number {
  const [year, month] = date.split('-').map(Number) as [number, number];
  return year + 543 + (month >= 10 ? 1 : 0);
}

export function formatDocNo(prefix: 'LR' | 'LQ', fiscalYear: number, n: number): string {
  return `${prefix}-${fiscalYear}-${String(n).padStart(4, '0')}`;
}

export type RequisitionEvent = 'APPROVE' | 'RETURN' | 'REJECT' | 'RESUBMIT' | 'CANCEL' | 'ISSUE';
const transitions: Partial<Record<LabRequisitionStatus, Partial<Record<RequisitionEvent, LabRequisitionStatus>>>> = {
  SUBMITTED: { APPROVE: 'APPROVED', RETURN: 'RETURNED', REJECT: 'REJECTED', CANCEL: 'CANCELLED' },
  RETURNED: { RESUBMIT: 'SUBMITTED', CANCEL: 'CANCELLED' },
  APPROVED: { ISSUE: 'ISSUED' }
};

/** The status a ใบขอเบิก moves to, or `null` when the event is not allowed from `current`. */
export function nextRequisitionStatus(current: LabRequisitionStatus, event: RequisitionEvent): LabRequisitionStatus | null {
  return transitions[current]?.[event] ?? null;
}
