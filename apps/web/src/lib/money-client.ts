/** Browser-safe helpers for the Smart Money pages: calling /api/money and Thai error copy. */

const errorMessages: Record<string, string> = {
  FORBIDDEN: 'ไม่มีสิทธิ์ทำรายการนี้',
  NOT_FOUND: 'ไม่พบรายการ อาจถูกลบหรือเปลี่ยนไปแล้ว',
  invalid_input: 'ข้อมูลไม่ครบหรือไม่ถูกต้อง'
};

export function moneyErrorMessage(code: string | null): string {
  return (code && errorMessages[code]) || 'บันทึกไม่สำเร็จ ลองอีกครั้ง';
}

/** Sends JSON and turns a refusal into Thai copy; never throws. */
export async function sendMoney(url: string, method: 'PUT' | 'DELETE', body?: unknown): Promise<{ error: string | null }> {
  try {
    const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { error: response.ok ? null : moneyErrorMessage(typeof result.error === 'string' ? result.error : null) };
  } catch { return { error: moneyErrorMessage(null) }; }
}
