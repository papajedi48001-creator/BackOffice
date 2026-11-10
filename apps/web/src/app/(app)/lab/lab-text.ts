import type { LabRequisitionStatus } from '@backoffice/contracts';
import { bangkokToday, formatBangkokDateOnly } from '../../../lib/bangkok-time';

/** A Bangkok date (`YYYY-MM-DD`) or a dash. */
export const labDate = (value: string | null | undefined) => (value ? formatBangkokDateOnly(value) : '—');
/** The default list range: the 30 days up to today. */
export const lastDays = (today: string, days: number) => new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
/** A `YYYY-MM-DD` search parameter when it is a real date, otherwise the fallback. */
export function dateParam(value: string | string[] | undefined, fallback: string): string {
  const text = Array.isArray(value) ? value[0] : value;
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`)) ? text : fallback;
}
export const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

/** Status pill colour for a ใบขอเบิก. */
export const requisitionTone: Record<LabRequisitionStatus, string> = { SUBMITTED: 'status-pending', RETURNED: 'status-returned', REJECTED: 'status-rejected', APPROVED: 'status-pending', ISSUED: 'status-approved', CANCELLED: 'status-cancelled' };

/** The Bangkok calendar day of a stored UTC instant. */
export const labDayOf = (instant: string) => bangkokToday(new Date(instant));
