/** Browser-safe helpers for the Lab stock pages: posting to /api/lab, Thai error copy, number formatting and the FEFO preview. */

const errorMessages: Record<string, string> = {
  FORBIDDEN: 'ไม่มีสิทธิ์ทำรายการนี้',
  NOT_FOUND: 'ไม่พบรายการ อาจถูกลบหรือเปลี่ยนไปแล้ว',
  DUPLICATE: 'รหัสหรือชื่อนี้มีอยู่แล้ว',
  ITEM_HAS_STOCK: 'ปิดใช้วัสดุที่ยังมียอดคงเหลือไม่ได้',
  PROTECTED: 'รายการนี้ระบบใช้อยู่ ลบหรือปิดไม่ได้',
  WRONG_STATUS: 'สถานะเอกสารเปลี่ยนไปแล้ว โหลดหน้าใหม่แล้วลองอีกครั้ง',
  OPENING_NOT_CERTIFIED: 'ยังไม่เริ่มใช้งาน: รอรับรองยอดยกมา',
  CONFLICT_OF_INTEREST: 'ตัดสินใบขอเบิกของตัวเองไม่ได้',
  REASON_REQUIRED: 'กรุณาระบุเหตุผล',
  INSUFFICIENT_STOCK: 'ยอดคงเหลือไม่พอ',
  LOT_EXPIRED: 'ล็อตนี้หมดอายุแล้ว',
  FUTURE_DATE: 'วันที่ต้องไม่เกินวันนี้',
  EXPIRY_BEFORE_RECEIPT: 'วันหมดอายุต้องหลังวันที่รับ',
  RECEIPT_LOT_IN_USE: 'ล็อตจากใบรับนี้ถูกใช้หรือจ่ายไปแล้ว ยกเลิกใบรับไม่ได้',
  OVER_REQUESTED: 'จ่ายเกินจำนวนที่ขอไม่ได้',
  NOTE_REQUIRED: 'จ่ายน้อยกว่าที่ขอ ต้องระบุหมายเหตุ',
  MAIN_STORE: 'ตัดใช้จากคลังหลักไม่ได้ ให้ขอเบิกเข้าคลังย่อยก่อน',
  INVALID_CSV: 'ไฟล์มีข้อผิดพลาด ยังไม่ได้บันทึก',
  FILE_TOO_LARGE: 'ไฟล์ใหญ่เกิน 2 MB',
  invalid_input: 'ข้อมูลไม่ครบหรือไม่ถูกต้อง'
};

export function labErrorMessage(code: string | null): string {
  return (code && errorMessages[code]) || 'บันทึกไม่สำเร็จ ลองอีกครั้ง';
}

export type LabResponse = { error: string | null; result: Record<string, unknown> };

/** Sends JSON (or raw text for a CSV import) and turns a refusal into Thai copy; never throws. */
export async function sendLab(url: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown, raw = false): Promise<LabResponse> {
  try {
    const response = await fetch(url, { method, headers: { 'content-type': raw ? 'text/csv' : 'application/json' }, ...(body === undefined ? {} : { body: raw ? String(body) : JSON.stringify(body) }) });
    const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { error: response.ok ? null : labErrorMessage(typeof result.error === 'string' ? result.error : null), result };
  } catch { return { error: labErrorMessage(null), result: {} }; }
}

const integer = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });
const money = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatCount = (value: number) => integer.format(value);
const cost = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
/** ต้นทุนต่อหน่วยใช้ keeps its 4 decimals: `1.2345 บาท`. */
export const formatUnitCost = (value: number | string) => `${cost.format(Number(value))} บาท`;
/** `2,500.00 บาท`. */
export const formatBaht = (value: number | string) => `${money.format(Number(value))} บาท`;

/** `25 ขวด (2 กล่อง 5 ขวด)`: usage units first, whole receiving packs after when there is at least one. */
export function formatStock(quantity: number, useUnit: string, receiveUnit: string, unitsPerReceive: number): string {
  const base = `${integer.format(quantity)} ${useUnit}`;
  if (unitsPerReceive <= 1 || Math.abs(quantity) < unitsPerReceive) return base;
  const packs = Math.trunc(quantity / unitsPerReceive);
  const rest = quantity % unitsPerReceive;
  return `${base} (${integer.format(packs)} ${receiveUnit}${rest ? ` ${integer.format(rest)} ${useUnit}` : ''})`;
}

export type LabLot = { lotId: string; lotNo: string; expiryDate: string | null; quantity: number };

/**
 * What the server will take for a ตัดใช้ when no lot is chosen: lots already come in FEFO order from the API, so this skips
 * expired ones and takes from the top. A preview only; the server picks again under lock.
 */
export function previewFefo(lots: readonly LabLot[], quantity: number, entryDate: string): { picks: { lotId: string; quantity: number }[]; short: number } {
  const picks: { lotId: string; quantity: number }[] = [];
  let left = Math.max(0, quantity);
  for (const lot of lots) {
    if (left === 0) break;
    if (lot.quantity <= 0 || (lot.expiryDate !== null && lot.expiryDate < entryDate)) continue;
    const take = Math.min(left, lot.quantity);
    picks.push({ lotId: lot.lotId, quantity: take });
    left -= take;
  }
  return { picks, short: left };
}
