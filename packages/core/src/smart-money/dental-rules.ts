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
