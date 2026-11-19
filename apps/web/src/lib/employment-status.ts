import { t } from '@backoffice/i18n';

/** ปฏิบัติงาน, ย้าย or ลาออก. Plain module (no 'use client') so server and client components can both call it. */
export function employmentStatusLabel(status: string): string {
  return t(status === 'ACTIVE' ? 'employmentActive' : status === 'TRANSFERRED' ? 'employmentTransferred' : 'employmentInactive');
}
