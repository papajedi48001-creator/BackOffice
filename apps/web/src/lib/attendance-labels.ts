/** Thai copy for ระบบลงเวลา pages and the error codes the attendance APIs answer with. */
export const attendanceText = {
  title: 'ลงเวลาปฏิบัติงาน',
  noAccess: 'คุณไม่มีสิทธิ์ใช้หน้านี้',
  noSection: 'ยังไม่มีหน้าที่คุณใช้ได้ในระบบลงเวลา',
  loadError: 'โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง',
  save: 'บันทึก'
} as const;

const errors: Record<string, string> = {
  DUPLICATE_NAME: 'มีชื่อนี้อยู่แล้ว',
  NOT_FOUND: 'ไม่พบรายการนี้ หรือรายการถูกปิดใช้แล้ว',
  DEVICE_REVOKED: 'กล่องนี้ถูกถอนสิทธิ์แล้ว',
  PAIRING_CODE_INVALID: 'รหัสจับคู่ไม่ถูกต้องหรือหมดอายุ ขอรหัสใหม่จากผู้ดูแลระบบ',
  MODULE_OFF: 'ระบบลงเวลาปิดใช้งานอยู่',
  CLOCK_SKEW: 'นาฬิกาของกล่องไม่ตรงกับเซิร์ฟเวอร์ ตรวจการตั้งเวลาอัตโนมัติของเครื่อง',
  RATE_LIMITED: 'ลองหลายครั้งเกินไป รอสักครู่แล้วลองใหม่',
  forbidden: 'คุณไม่มีสิทธิ์ทำรายการนี้',
  invalid_input: 'ข้อมูลไม่ครบหรือไม่ถูกต้อง'
};

export const attendanceErrorMessage = (code: string | null | undefined) => (code && errors[code]) || 'ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง';

/** JSON request to an attendance API; the error is already a Thai message. */
export async function sendAttendance(url: string, method: 'POST' | 'PUT', body?: unknown): Promise<{ error: string | null; result: Record<string, unknown> }> {
  try {
    const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { error: response.ok ? null : attendanceErrorMessage(typeof result.error === 'string' ? result.error : null), result };
  } catch { return { error: attendanceErrorMessage(null), result: {} }; }
}

/** "เลิกวันถัดไป (12 ชั่วโมง)" for a shift that ends the next day, "8 ชั่วโมง 30 นาที" style length otherwise. */
export function shiftSpanLabel(startTime: string, endTime: string): string | null {
  const minute = (time: string) => /^\d{2}:\d{2}$/.test(time) ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : null;
  const start = minute(startTime);
  const end = minute(endTime);
  if (start === null || end === null || start === end) return null;
  const length = (end - start + 1440) % 1440;
  const text = `${Math.floor(length / 60)} ชั่วโมง${length % 60 ? ` ${length % 60} นาที` : ''}`;
  return end < start ? `เลิกวันถัดไป (${text})` : text;
}
