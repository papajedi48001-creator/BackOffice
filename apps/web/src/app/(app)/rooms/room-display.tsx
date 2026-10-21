import { t, type MessageKey } from '@backoffice/i18n';
import type { RoomBookingHistoryAction, RoomBookingStatus } from '@backoffice/contracts';

const statusLabel: Record<RoomBookingStatus, MessageKey> = { PENDING: 'roomStatusPending', APPROVED: 'roomStatusApproved', REJECTED: 'roomStatusRejected', CANCELLED: 'roomStatusCancelled' };
const historyLabel: Record<RoomBookingHistoryAction, MessageKey> = { SUBMITTED: 'historySubmitted', APPROVED: 'historyApproved', REJECTED: 'historyRejected', CANCELLED: 'historyCancelled', DAYS_RELEASED: 'historyDaysReleased' };

/** `expired` marks a pending booking whose days have all ended without a decision. */
export function RoomStatusBadge({ status, expired = false }: { status: RoomBookingStatus; expired?: boolean }) {
  if (expired) return <span className="status status-expired">{t('roomStatusExpired')}</span>;
  return <span className={`status status-${status.toLowerCase()}`}>{t(statusLabel[status])}</span>;
}

export function historyActionLabel(action: RoomBookingHistoryAction): string { return t(historyLabel[action]); }

export function roomErrorMessage(code: unknown): string {
  const key = `roomError${String(code)}`;
  return key in messagesWithErrors ? t(key as MessageKey) : t('roomActionFailed');
}

const messagesWithErrors = Object.fromEntries((['INVALID_INPUT', 'INVALID_DATES', 'INVALID_TIME_RANGE', 'OUTSIDE_BOOKING_WINDOW', 'OVER_CAPACITY', 'INVALID_ADDON', 'REASON_REQUIRED', 'FORBIDDEN', 'CONFLICT_OF_INTEREST', 'ROOM_NOT_FOUND', 'BOOKING_NOT_FOUND', 'ROOM_NOT_BOOKABLE', 'BOOKING_NOT_PENDING', 'CANCEL_NOT_ALLOWED', 'NOTHING_TO_RELEASE', 'BOOKING_CONFLICT'] as const).map((code) => [`roomError${code}`, true]));
