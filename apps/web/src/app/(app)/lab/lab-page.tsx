import type { Session } from '@backoffice/contracts';
import { canManageLab, labCan, LabQueries, LabSettingsQueries, labToday, loadLabMember, type LabAction, type LabMember, type LabSettings } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { getSharedDatabase } from '../../../lib/database';
import { leaveSession } from '../leave/leave-page';

export type LabStoreOption = { id: string; name: string; sectionId: string | null };
type LabSession = Session & { personId: string };
export type LabContext = {
  ok: true; session: LabSession; database: Database; queries: LabQueries; settings: LabSettings; member: LabMember; manages: boolean; today: string;
  /** The same rule the services apply (spec table); a เจ้าหน้าที่ Lab only in their own งาน. */
  can(action: LabAction, sectionId?: string | null): boolean;
  /** Active stores the person may `action` in: คลังหลัก first (when allowed), then each คลังย่อย. */
  stores(action: LabAction): LabStoreOption[];
  certified: boolean;
} | { ok: false; reason: 'none' | 'forbidden' | 'unavailable' };

export const MAIN_STORE_NAME = 'คลังหลัก';

/** Session, membership and settings for a Lab page. `needs` (any one of them) is checked here, on the server, before the page renders. */
export async function labContext({ needs = [] }: { needs?: LabAction[] } = {}): Promise<LabContext> {
  const session = await leaveSession();
  if (!session) return { ok: false, reason: 'none' };
  const database = getSharedDatabase();
  if (!database) return { ok: false, reason: 'unavailable' };
  const manages = canManageLab(session);
  const member = await loadLabMember(database, session.personId);
  if (!manages && !member) return { ok: false, reason: 'forbidden' };
  const can = (action: LabAction, sectionId?: string | null) => labCan(member, manages, action, sectionId);
  const anySection = (action: LabAction) => manages || member?.role !== 'STAFF' ? can(action) : member.sectionIds.some((sectionId) => can(action, sectionId));
  if (needs.length > 0 && !needs.some(anySection)) return { ok: false, reason: 'forbidden' };
  const settings = await new LabSettingsQueries(database).settings();
  const stores = (action: LabAction): LabStoreOption[] => [
    ...(can(action, null) ? [{ id: settings.mainStoreId, name: MAIN_STORE_NAME, sectionId: null }] : []),
    ...settings.sections.filter((section) => section.isActive && can(action, section.id)).map((section) => ({ id: section.storeId, name: section.name, sectionId: section.id }))
  ];
  return { ok: true, session, database, queries: new LabQueries(database), settings, member, manages, today: labToday(), can, stores, certified: settings.openingStatus === 'CERTIFIED' };
}

/** The page title and why it cannot show: nothing while a visitor is sent to sign in, otherwise a no-access or load-error notice. */
export function LabPageMessage({ title, reason }: { title: string; reason: 'none' | 'forbidden' | 'unavailable' }) {
  if (reason === 'none') return null;
  return <section><h2>{title}</h2><p role="alert">{reason === 'forbidden' ? 'ยังไม่ได้รับสิทธิ์ใช้งานระบบนี้ ติดต่อผู้จัดการโมดูล' : 'โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง'}</p></section>;
}

/** Shown on every page until the หัวหน้า Lab รับรองยอดยกมา; the server refuses stock work until then. */
export function NotCertifiedBanner({ certified }: { certified: boolean }) {
  if (certified) return null;
  return <p className="lab-banner" role="note">ยังไม่เริ่มใช้งาน: รอรับรองยอดยกมา</p>;
}

/** Item, usage type and vendor options for the forms: active rows only. */
export function formOptions(settings: LabSettings) {
  return {
    items: settings.items.filter((item) => item.isActive).map(({ id, code, name, receiveUnit, useUnit, unitsPerReceive }) => ({ id, code, name, receiveUnit, useUnit, unitsPerReceive })),
    usageTypes: settings.usageTypes.filter((type) => type.isActive).map(({ id, name }) => ({ id, name })),
    vendors: settings.vendors.filter((vendor) => vendor.isActive).map(({ id, name }) => ({ id, name }))
  };
}
