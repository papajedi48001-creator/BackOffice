import Link from 'next/link';
import type { Session } from '@backoffice/contracts';
import { canManagePttypeMapping } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { getSharedDatabase } from '../../../lib/database';
import { leaveSession } from '../leave/leave-page';

export type MappingContext = { ok: true; session: Session & { personId: string }; database: Database } | { ok: false; reason: 'none' | 'forbidden' | 'unavailable' };

/** Session for a Mapping สิทธิ page; only ผู้ดูแลระบบ and ผู้จัดการโมดูล get past it, checked here on the server. */
export async function mappingContext(): Promise<MappingContext> {
  const session = await leaveSession();
  if (!session) return { ok: false, reason: 'none' };
  if (!canManagePttypeMapping(session)) return { ok: false, reason: 'forbidden' };
  const database = getSharedDatabase();
  return database ? { ok: true, session, database } : { ok: false, reason: 'unavailable' };
}

const copy = {
  forbidden: 'หน้านี้สำหรับผู้ดูแลระบบและผู้จัดการโมดูล Mapping สิทธิเท่านั้น',
  unavailable: 'โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง',
  NOT_CONFIGURED: 'ยังไม่ได้ตั้งค่าการเชื่อมต่อ HOSxP',
  HOSXP_FAILED: 'เชื่อมต่อ HOSxP ไม่สำเร็จ ลองใหม่อีกครั้ง หรือตรวจการตั้งค่าการเชื่อมต่อ'
} as const;

/** The title and why the page cannot show; ผู้ดูแลระบบ also gets the link to ตั้งค่าการเชื่อมต่อ for a HOSxP problem. */
export function MappingPageMessage({ title, reason, connectionLink = false }: { title: string; reason: 'none' | keyof typeof copy; connectionLink?: boolean }) {
  if (reason === 'none') return null;
  return <section><h2>{title}</h2><p role="alert">{copy[reason]}</p>
    {connectionLink && (reason === 'NOT_CONFIGURED' || reason === 'HOSXP_FAILED') ? <p><Link href="/admin/connections">ไปที่ตั้งค่าการเชื่อมต่อ</Link></p> : null}
  </section>;
}
