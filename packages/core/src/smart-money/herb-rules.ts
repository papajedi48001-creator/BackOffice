import type { TtmRightGroup } from '@backoffice/contracts';
import { ttmRules, ttmSplitList, type TtmRules } from './ttm-rules';

/**
 * อัตราชดเชยยาสมุนไพร (ontop) from the hospital's "ต้นทุนยาสมุนไพร2570.xlsx" (16 พ.ย. 2569), as the legacy `ontop_icodes.php`:
 * [icode, ชื่อในไฟล์, หน่วย, จำนวนต่อครั้ง, ชดเชยบาทต่อครั้ง | null, ชดเชย point ต่อครั้ง | null]. 23 pay baht, 15 pay points.
 * Not counted (no hospital icode): ยาหอมนวโกฐ, เจลพริกชี้ฟ้า, น้ำมันไพล, ยาประสะกระเพรา, ยาธาตุบรรจบ.
 */
export const HERB_ONTOP: readonly (readonly [string, string, string, number, number | null, number | null])[] = [
  ['1550006', 'เพชรสังฆาต CAP 500 MG', 'แคปซูล', 100, 204, null],
  ['1560022', 'ยาปราบชมพูทวีป 500 มก.', 'แคปซูล', 42, 170, null],
  ['1520003', 'ฟ้าทะลายโจร CAP 500 MG', 'แคปซูล', 20, 92, null],
  ['1680028', 'ยาน้ำแก้ไอมะขามป้อม 120 ML', 'ขวด', 1, 84, null],
  ['1550045', 'ชาชงขิง', 'ซอง', 1, 84, null],
  ['1660039', 'ยาธาตุอบเชย 120 ML', 'ขวด', 3, 84, null],
  ['1680026', 'ลูกประคบสมุนไพร', 'ห่อ', 1, 100, null],
  ['1000311', 'ยาอมมะแว้ง (16,000 มก.)', 'ซอง', 4, 50, null],
  ['1550043', 'ขี้ผึ้งไพล', 'กระปุก', 1, 43, null],
  ['1560004', 'ยาเขียวหอม', 'แคปซูล', 28, 70, null],
  ['1550009', 'ใบมะขามแขกแคปซูล', 'แคปซูล', 5, 31.5, null],
  ['1560007', 'มะระขี้นก', 'แคปซูล', 21, 46, null],
  ['1560005', 'สหัศธาราแคปซูล', 'แคปซูล', 42, 73, null],
  ['1680024', 'เถาวัลย์เปรียง', 'แคปซูล', 42, 60, null],
  ['1550015', 'พญายอ 5 GM', 'หลอด', 1, 33, null],
  ['1000302', 'ขมิ้นชัน CAP 500 MG', 'แคปซูล', 56, 56, null],
  ['1600019', 'ยาหอมเทพจิตร', 'ซอง', 6, 70, null],
  ['1550048', 'ทิงเจอร์ทองพันชั่ง', 'ขวด', 1, 48, null],
  ['1680009', 'ครีมไพล', 'หลอด', 1, 40, null],
  ['1600002', 'เหลืองปิดสมุทร', 'แคปซูล', 8, 37, null],
  ['1560021', 'ยาเลือดงาม', 'แคปซูล', 42, null, 264.5],
  ['1560029', 'ยาแก้ลมอัมพฤกษ์', 'ซอง', 2, null, 259],
  ['1560006', 'ยาบำรุงโลหิต', 'ซอง', 4, null, 218],
  ['1560028', 'ยาอำมฤควาที', 'ซอง', 1, null, 206],
  ['1560014', 'ยาธรณีสัณฑะฆาต', 'แคปซูล', 7, null, 204],
  ['1560017', 'ประสะจันทร์แดง', 'แคปซูล', 18, null, 177.5],
  ['1560020', 'ปลูกไฟธาตุ', 'แคปซูล', 42, null, 176.5],
  ['1560012', 'ยาหอมอินทจักร์', 'ซอง', 1, null, 175],
  ['1560008', 'เบญจกูล', 'แคปซูล', 34, null, 108],
  ['1560011', 'จันทน์ลีลา', 'แคปซูล', 18, null, 97],
  ['1560003', 'ประสะไพล', 'แคปซูล', 90, null, 67.5],
  ['1580008', 'ยาแคปซูลผสมรางจืด', 'แคปซูล', 42, null, 65],
  ['1560015', 'ยาตรีผลา', 'แคปซูล', 13, null, 65],
  ['1550046', 'ชุมเห็ดเทศ', 'ซอง', 1, null, 60.5],
  ['1560009', 'ยาแก้ไข้ห้าราก 350 มก.', 'แคปซูล', 9, null, 48],
  ['1570009', 'ชาชงหญ้าดอกขาว 2 กรัม', 'ซอง', 3, null, 42],
  ['1550044', 'ชาชงหญ้าหนวดแมว 2 G', 'ซอง', 2, null, 42],
  ['1550047', 'กระเจี๊ยบแดง', 'ซอง', 1, null, 166.5],
];

export type HerbOntopRate = { name: string; unit: string; stdQty: number; baht: number | null; points: number | null };
export type HerbRules = { herbIcodes: string[]; ontopRates: Record<string, HerbOntopRate>; rightMap: Record<string, TtmRightGroup>; pointBaht: number | null };
/** `HERB_POINT_BAHT` → point_baht; herb_icodes overrides the TTM list as the legacy `HerbSummary::rules` allowed. */
export type HerbSettings = { point_baht?: string; herb_icodes?: string | readonly string[] };

/** PHP `is_numeric` after `trim` (decimal or exponent only; no hex, no Infinity). */
const PHP_NUMERIC = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

/** The legacy `HerbSummary::rules`: the herb list and สิทธิ map come from the TTM rules, plus the ontop rates and the point rate. */
export function herbRules(custom: HerbSettings = {}, ttm: TtmRules = ttmRules()): HerbRules {
  const ontopRates: Record<string, HerbOntopRate> = {};
  for (const [icode, name, unit, stdQty, baht, points] of HERB_ONTOP) ontopRates[icode] = { name, unit, stdQty, baht, points };
  const rules: HerbRules = { herbIcodes: [...ttm.herbIcodes], ontopRates, rightMap: { ...ttm.rightMap }, pointBaht: null };
  if (custom.herb_icodes !== undefined) {
    const list = Array.isArray(custom.herb_icodes) ? custom.herb_icodes.map(String) : ttmSplitList(String(custom.herb_icodes));
    if (list.length > 0) rules.herbIcodes = list;
  }
  const point = (custom.point_baht ?? '').trim();
  if (PHP_NUMERIC.test(point) && Number(point) > 0) rules.pointBaht = Number(point);
  return rules;
}
