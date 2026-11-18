import type { PttypeMappingInput } from '@backoffice/contracts';
import { formatBangkokDateOnly } from './bangkok-time';

const errorMessages: Record<string, string> = {
  FORBIDDEN: 'ไม่มีสิทธิ์แก้ไข Mapping สิทธิ',
  NOT_FOUND: 'ไม่พบสิทธินี้ใน HOSxP หรือสิทธิถูกปิดการใช้งานแล้ว',
  STALE: 'มีคนแก้สิทธินี้ไปแล้ว โหลดค่าล่าสุดแล้ว กรุณาตรวจอีกครั้ง',
  INVALID_ACCOUNT: 'ผังบัญชีที่เลือกไม่มีใน HOSxP หรือใช้กับฝั่งนี้ไม่ได้',
  NO_CHANGE: 'ค่าเหมือนเดิม ไม่มีอะไรต้องบันทึก',
  NO_WRITE_PERMISSION: 'บัญชี HOSxP ไม่มีสิทธิ์เขียนตาราง paccountopd / paccountipd ติดต่อผู้ดูแลระบบ',
  HOSXP_FAILED: 'เชื่อมต่อ HOSxP ไม่สำเร็จ ค่าใน HOSxP ยังไม่เปลี่ยน ลองอีกครั้ง',
  NOT_TRANSACTIONAL: 'ตาราง paccountopd / paccountipd ใน HOSxP ไม่ใช่ InnoDB จึงย้อนกลับไม่ได้หากบันทึกล้มเหลว ระบบจึงไม่แก้ไข ติดต่อผู้ดูแลระบบ',
  NOT_CONFIGURED: 'ยังไม่ได้ตั้งค่าการเชื่อมต่อ HOSxP',
  invalid_input: 'ข้อมูลไม่ครบหรือไม่ถูกต้อง'
};

/** Saves one สิทธิ and turns a refusal into Thai copy; never throws. `code` lets the caller react to STALE. */
export async function saveMapping(pttype: string, input: PttypeMappingInput): Promise<{ error: string | null; code: string | null }> {
  try {
    const response = await fetch(`/api/pttype-mapping/${encodeURIComponent(pttype)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
    if (response.ok) return { error: null, code: null };
    const result = (await response.json().catch(() => ({}))) as { error?: unknown };
    const code = typeof result.error === 'string' ? result.error : null;
    return { error: (code && errorMessages[code]) || 'บันทึกไม่สำเร็จ ลองอีกครั้ง', code };
  } catch { return { error: 'บันทึกไม่สำเร็จ ลองอีกครั้ง', code: null }; }
}

/** HOSxP `last_modify` ('2026-11-13 14:05:00', already Bangkok wall time) as "13 พ.ย. 2569 14:05". */
export function formatHosxpStamp(value: string): string {
  return `${formatBangkokDateOnly(value.slice(0, 10))} ${value.slice(11, 16)}`;
}
