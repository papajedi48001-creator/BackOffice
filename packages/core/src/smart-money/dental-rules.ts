/** ผังบัญชี UC-OP ใน CUP: has "UC" then "ใน CUP" (a "นอก CUP" ผังบัญชี does not match). Legacy `isUcInCup`. */
export const isUcInCup = (paccountName: string): boolean => /UC.*ใน\s*CUP/iu.test(paccountName);

/** ผังบัญชี left out of คาดการณ์รายรับทันตกรรม: UC-OP ใน CUP, or "PP" / "P&P" as a word. Legacy `isExcludedFromForecast`. */
export const isExcludedFromForecast = (paccountName: string): boolean =>
  isUcInCup(paccountName) || /(?<![A-Za-z])P\s*&?\s*P(?![A-Za-z])/u.test(paccountName);

/**
 * ค่าบริการฟันเทียม (`nondrugitems.icode`): a visit with any of these in `opitemrece` is งานฟันปลอม. Legacy `DENTURE_ICODES`;
 * constants, so the reader may inline them in its SQL.
 */
export const DENTURE_ICODES = [
  '3015284', // ฟันเทียมทั้งปาก 1 ชิ้น ฐานอคริลิก บนหรือล่าง
  '3013076', // ฟันเทียมทั้งปาก 1 ชิ้น บนหรือล่าง
  '3013077', // ฟันเทียมทั้งปากถอดได้ บนและล่าง
  '3013071', // ฟันเทียมบางส่วนถอดได้ 1-5 ซี่
  '3013073', // ฟันเทียมบางส่วนถอดได้ฐานโลหะ 1-5 ซี่
  '3013074', // ฟันเทียมบางส่วนถอดได้ฐานโลหะ มากกว่า 5 ซี่
  '3015289', // ฟันเทียมบางส่วนถอดได้ฐานโลหะ 1-5 ซี่
  '3015290', // ฟันเทียมบางส่วนถอดได้ฐานโลหะ 1-5 ซี่
  '3015287', // ฟันเทียมบางส่วนถอดได้ฐานอคริลิก 1-5 ซี่
  '3013072' // ฟันเทียมบางส่วนถอดได้ มากกว่า 5 ซี่
] as const;

/** สิทธิ shown as a red bar in "แยกตามสิทธิ" besides ผัง UC ใน CUP: 25 PP Workload (asked by งานประกัน 2026-11-19). */
export const RED_PTTYPES: readonly string[] = ['25'];

/**
 * สิทธิ counted only on visits with some icodes (asked by งานประกัน 2026-11-19): 23 OP ส่งเสริมและป้องกันโรค = visits with icode 3015628.
 * Constants, so the reader may inline them in its SQL.
 */
export const DENTAL_PTTYPE_ICODES: Readonly<Record<string, readonly string[]>> = { '23': ['3015628'] };

/**
 * A visit whose สิทธิ is in `DENTAL_PTTYPE_ICODES` is kept, at its full amounts, only when `opitemrece` holds one of those icodes
 * (`hasItems`); otherwise it is left out. Other สิทธิ are unchanged.
 */
export function applyPttypeItems<T extends { pttypeCode: string }>(row: T, hasItems: boolean | null): T | null {
  if (!(row.pttypeCode in DENTAL_PTTYPE_ICODES)) return row;
  return hasItems ? row : null;
}
