import type { MciCommandRole, MciGender, MciIncidentKind } from '@backoffice/contracts';

/** Thai copy of the อุบัติเหตุหมู่ screens. Kept here, beside the module, rather than in the shared dictionary. */
export const mciText = {
  module: 'อุบัติเหตุหมู่',
  drillBanner: 'ซ้อมแผน ไม่ใช่เหตุจริง',
  noIncident: 'ขณะนี้ไม่มีเหตุอุบัติเหตุหมู่',
  boardTitle: 'สถานะผู้ป่วยอุบัติเหตุหมู่',
  boardByTriage: 'ยอดผู้ป่วยตามสี',
  boardByStatus: 'ยอดผู้ป่วยตามสถานะ',
  boardTotal: 'ผู้ป่วยทั้งหมด',
  boardPeople: 'รายชื่อผู้ป่วย',
  boardSearch: 'ค้นหาชื่อผู้ป่วย',
  boardName: 'ชื่อ',
  boardPlace: 'อยู่ที่',
  boardNoPeople: 'ยังไม่มีรายชื่อ',
  boardNoMatch: 'ไม่พบชื่อที่ค้นหา',
  boardContact: 'สอบถามข้อมูลเพิ่มเติม จุดประชาสัมพันธ์',
  boardUpdated: 'ข้อมูล ณ',
  boardRefresh: 'ข้อมูลปรับทุก 30 วินาที',
  boardLink: 'ดูกระดานสถานะผู้ป่วย (ญาติดูได้ ไม่ต้องเข้าระบบ)',
  occurredAt: 'เกิดเหตุ',
  checkIn: 'รายงานตัว',
  checkInTitle: 'รายงานตัวเข้าเหตุ',
  checkInConfirm: 'ยืนยันรายงานตัว',
  checkInMessage: 'ระบบจะจัดจุดให้ตามสายวิชาชีพ หัวหน้าจุดหรือผู้บัญชาการเหตุย้ายจุดได้ภายหลัง',
  profession: 'สายวิชาชีพ',
  chooseProfession: 'เลือกสายวิชาชีพ',
  checkOut: 'ออกจากเวร',
  checkOutTitle: 'ออกจากเวร',
  checkOutConfirm: 'ยืนยันออกจากเวร',
  checkOutMessage: 'เมื่อออกจากเวรแล้ว ต้องรายงานตัวใหม่หากกลับมาช่วยอีก',
  newPatient: 'บันทึกผู้ป่วยใหม่',
  save: 'บันทึก',
  triage: 'สีคัดกรอง',
  zone: 'จุด',
  status: 'สถานะ',
  destination: 'โรงพยาบาลปลายทาง',
  firstName: 'ชื่อ',
  lastName: 'นามสกุล',
  gender: 'เพศ',
  age: 'อายุ (ประมาณ)',
  hn: 'HN',
  publicHidden: 'ไม่เปิดเผยบนกระดานสาธารณะ',
  newTag: 'ป้ายผู้ป่วยหมายเลข',
  newTagHint: 'เขียนหมายเลขนี้บนป้ายข้อมือผู้ป่วย',
  waitingZone: 'รอจัดจุด',
  notCheckedIn: 'คุณยังไม่ได้รายงานตัวในเหตุนี้',
  checkedInAs: 'คุณรายงานตัวแล้ว',
  role: 'บทบาท',
  loadError: 'โหลดข้อมูลอุบัติเหตุหมู่ไม่สำเร็จ',
  noAccess: 'คุณไม่มีสิทธิ์ดูหน้านี้'
} as const;

const roleLabels: Record<MciCommandRole, string> = { COMMANDER: 'ผู้บัญชาการเหตุ', ZONE_LEAD: 'หัวหน้าจุด', RECORDER: 'ผู้บันทึก', STAFF: 'เจ้าหน้าที่' };
const kindLabels: Record<MciIncidentKind, string> = { REAL: 'เหตุจริง', DRILL: 'ซ้อมแผน' };
const genderLabels: Record<MciGender, string> = { MALE: 'ชาย', FEMALE: 'หญิง', UNKNOWN: 'ไม่ทราบ' };
export const MCI_ROLES: readonly MciCommandRole[] = ['COMMANDER', 'ZONE_LEAD', 'RECORDER', 'STAFF'];
export const MCI_GENDERS: readonly MciGender[] = ['UNKNOWN', 'MALE', 'FEMALE'];
export const mciRoleLabel = (role: MciCommandRole) => roleLabels[role];
export const mciKindLabel = (kind: MciIncidentKind) => kindLabels[kind];
export const mciGenderLabel = (gender: MciGender) => genderLabels[gender];

const errors: Record<string, string> = {
  NOT_FOUND: 'ไม่พบรายการนี้ อาจถูกลบหรือเปลี่ยนไปแล้ว',
  FORBIDDEN: 'บทบาทของคุณทำรายการนี้ไม่ได้',
  INCIDENT_ALREADY_OPEN: 'มีเหตุที่เปิดอยู่แล้ว ปิดเหตุเดิมก่อนเปิดเหตุใหม่',
  INCIDENT_CLOSED: 'เหตุนี้ปิดแล้ว',
  INCIDENT_OPEN: 'ส่งออกได้หลังปิดเหตุแล้วเท่านั้น',
  NO_OPEN_INCIDENT: 'ขณะนี้ไม่มีเหตุที่เปิดอยู่',
  ALREADY_OUT: 'ออกจากเวรไปแล้ว',
  DUPLICATE_NAME: 'ชื่อนี้มีอยู่แล้ว',
  PROTECTED: 'ปิดใช้สีหรือสถานะที่ผูกกับผู้เสียชีวิตไม่ได้',
  DESTINATION_REQUIRED: 'กรุณาระบุโรงพยาบาลปลายทาง',
  TRIAGE_REQUIRED: 'ผู้ป่วยยังเป็นสีดำ เปลี่ยนสีคัดกรองก่อนเปลี่ยนสถานะ',
  invalid_input: 'ข้อมูลไม่ครบหรือไม่ถูกต้อง'
};
/** Thai text for an อุบัติเหตุหมู่ error code from the API; anything unknown is the generic failure. */
export const mciErrorMessage = (code: string | null | undefined) => (code && errors[code]) || 'ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง';

/** Sends JSON to an /api/mci route; the Thai error text, or null when it worked. */
export async function sendMci(url: string, method: 'POST' | 'PUT' | 'PATCH', body?: unknown): Promise<{ error: string | null; result: Record<string, unknown> }> {
  try {
    const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { error: response.ok ? null : mciErrorMessage(typeof result.error === 'string' ? result.error : null), result };
  } catch { return { error: mciErrorMessage(null), result: {} }; }
}
