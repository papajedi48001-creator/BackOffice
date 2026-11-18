/**
 * monitor แพทย์แผนไทย: how one HOSxP charge line, สิทธิ and service row are counted. A port of the legacy `TtmSummary` rules
 * (Smart Money `modules/ttm_monitor`); round 6 (การจ่ายยาสมุนไพร) uses the same herb list and สิทธิ groups.
 */

import { TTM_CATEGORIES, TTM_KINDS, TTM_RIGHT_GROUPS, type TtmCategory, type TtmKind, type TtmProcedureKind, type TtmRightGroup } from '@backoffice/contracts';

export { TTM_CATEGORIES, TTM_KINDS, TTM_RIGHT_GROUPS, type TtmCategory, type TtmKind, type TtmProcedureKind, type TtmRightGroup };

/** ค่าบริการผู้ป่วยนอก (ในเวลา 50 บาท): 3015968 IMC Intermidiate Care. */
export const TTM_DEFAULT_OPD_FEE_ICODES = ['3015968'] as const;

/** หัตถการแพทย์แผนไทยของ รพ. [icode, รายบริการ, ชื่อ] in the order of the กลุ่มงาน list of 13 พ.ย. 2569; legacy `procedure_icodes.php`. */
export const TTM_PROCEDURES: readonly (readonly [string, TtmProcedureKind, string])[] = [
  ['3015174', 'thai_massage', 'M1 นวด+ประคบ รักษาโรคที่เกิดจากความผิดปกติของกล้ามเนื้อ เส้นเอ็น กระดูก ข้อต่อ เลือด'],
  ['3015003', 'thai_massage', 'M10 นวดเฉพาะจุด (ช่วงล่างจากเอวถึงปลายเท้า)'],
  ['3015002', 'thai_massage', 'M11 นวดเฉพาะจุด (ช่วงบนจากเอวขึ้นถึงศีรษะ)'],
  ['3015001', 'thai_massage', 'M12 นวดทั้งตัว (บำบัด ฟื้นฟู รักษา) + ประคบ'],
  ['3015175', 'thai_massage', 'M2 นวด+ประคบ ฟื้นฟูสมรรถภาพ โรคอัมพฤกษ์ อัมพาต สันนิบาต'],
  ['3015005', 'steam', 'M3 อบไอน้ำสมุนไพรเพื่อรักษา/ฟื้นฟูโรคหอบหืด ภูมิแพ้'],
  ['3015176', 'thai_massage', 'M4 นวดรักษาโรคที่เกิดจากความผิดปกติของกล้ามเนื้อ เส้นเอ็น กระดูก ข้อต่อ เลือดลม'],
  ['3015177', 'thai_massage', 'M5 นวดฟื้นฟูสมรรถภาพ โรคอัมพฤกษ์ อัมพาต สันนิบาต'],
  ['3015007', 'thai_massage', 'M7 นวดเพื่อรักษาโรค'],
  ['3015008', 'thai_massage', 'M8 นวดน้ำมัน'],
  ['3015009', 'thai_massage', 'M9 นวดเท้า'],
  ['3015993', 'other_proc', 'การแช่ยาสมุนไพร'],
  ['3015936', 'thai_massage', 'การนวดด้วยวิธีการแพทย์แผนไทยแบบราชสำนัก(ขา)'],
  ['3015937', 'thai_massage', 'การนวดด้วยวิธีการแพทย์แผนไทยแบบราชสำนัก(ต้นขา)'],
  ['3015938', 'thai_massage', 'การนวดด้วยวิธีการแพทย์แผนไทยแบบราชสำนัก(หัวเข่า)'],
  ['3015986', 'thai_massage', 'การนวดแผนไทย'],
  ['3015989', 'thai_massage', 'การนวดสมุนไพรและประคบสมุนไพร'],
  ['3015340', 'postpartum', 'การบริบาลหญิงหลังคลอดด้วยการเข้ากระโจม'],
  ['3015335', 'postpartum', 'การบริบาลหญิงหลังคลอดด้วยการใช้ยาสมุนไพร'],
  ['3015337', 'postpartum', 'การบริบาลหญิงหลังคลอดด้วยการทับหม้อเกลือ'],
  ['3015338', 'postpartum', 'การบริบาลหญิงหลังคลอดด้วยการนวด'],
  ['3015480', 'postpartum', 'การบริบาลหญิงหลังคลอดด้วยการปฏิบัติตัวสำหรับหลังคลอด'],
  ['3015339', 'postpartum', 'การบริบาลหญิงหลังคลอดด้วยการประคบสมุนไพร'],
  ['3015336', 'postpartum', 'การบริบาลหญิงหลังคลอดด้วยการรัดหน้าท้อง'],
  ['3015341', 'postpartum', 'การบริบาลหญิงหลังคลอดด้วยการอบไอน้ำสมุนไพร'],
  ['3015006', 'compress', 'การประคบด้วยลูกประคบ'],
  ['3015987', 'compress', 'การประคบแผนไทย'],
  ['3015995', 'other_proc', 'การเผายาสมุนไพร'],
  ['3015990', 'knee', 'การพอกท้อง'],
  ['3015447', 'knee', 'การพอกยาสมุนไพร'],
  ['3015935', 'knee', 'การพอกยาสมุนไพร (หัวเข่า)'],
  ['3015992', 'other_proc', 'การรมยาสมุนไพร'],
  ['3015988', 'steam', 'การอบไอน้ำสมุนไพร'],
  ['3015994', 'other_proc', 'การอาบยาสมุนไพร'],
  ['3015656', 'postpartum', 'ค่าทับหม้อเกลือเพื่อการฟื้นฟูมารดาหลังคลอด'],
  ['3015421', 'thai_massage', 'ค่านวดประคบสมุนไพรเพื่อการบำบัดรักษาโรค'],
  ['3015415', 'thai_massage', 'ค่านวดเพื่อบำบัดรักษาโรค'],
  ['3015416', 'thai_massage', 'ค่านวดเพื่อการฟื้นฟูสมรรถภาพ'],
  ['3015910', 'thai_massage', 'ค่านวดและประคบสมุนไพรเพื่อการฟื้นฟูสมรรถภาพสำหรับผู้ป่วยโรคอัมพฤกษ์ อัมพาต'],
  ['3015422', 'other_proc', 'ค่าบริการฝังเข็ม และ อื่น ๆ (ไม่บอกรายละเอียด)'],
  ['3015417', 'compress', 'ค่าประคบสมุนไพรเพื่อการฟื้นฟูสมรรถภาพสำหรับผู้ป่วยโรคอัมพฤกษ์'],
  ['3015418', 'compress', 'ค่าประคบสมุนไพรสำหรับการบำบัดโรค การฟื้นฟูสมรรถภาพผู้ป่วย'],
  ['3015911', 'steam', 'ค่าอบไอน้ำสมุนไพร สำหรับการบำบัดรักษาโรคหอบ หืด ภูมิแพ้ การฟื้นฟูสมรรถภาพ'],
  ['3015420', 'steam', 'ค่าอบไอน้ำสมุนไพร สำหรับการบำบัดรักษาโรคหอบ หืด ภูมิแพ้ การฟื้นฟูสมรรถภาพ'],
  ['3015004', 'compress', 'ประคบสมุนไพรรักษาโรค'],
  ['3015991', 'knee', 'พอกตา'],
  ['3015985', 'other_proc', 'เวชกรรมแพทย์แผนไทย']
];

/** ยาสมุนไพรของ รพ. [icode, ชื่อ]; legacy `herb_icodes.php` (no flu vaccine, antivenom, charcoal or multivitamin). Round 6 uses it too. */
export const TTM_HERB_ICODES: readonly (readonly [string, string])[] = [
  ['1630008', 'แก้ลม แก้เส้น 2 g.'],
  ['1640111', 'แก้ลม แก้เส้น 500 mg.'],
  ['1560029', 'แก้ลมอัมพฤกษ์ 15 g.'],
  ['1000302', 'ขมิ้นชัน 500 mg.'],
  ['1550043', 'ขี้ผึ้งไพล 10 g.'],
  ['1560004', 'เขียวหอม 500 mg.'],
  ['1680009', 'ครีมไพล 14%'],
  ['1560011', 'จันทน์ลีลา 400 mg.'],
  ['1550047', 'ชาชงกระเจี๊ยบแดง 2 g.'],
  ['1550045', 'ชาชงขิง 3 g.'],
  ['1550046', 'ชาชงชุมเห็ดเทศ 3 g.'],
  ['1550039', 'ชาชงรางจืด 2 g.'],
  ['1550044', 'ชาชงหญ้าหนวดแมว 3 g.'],
  ['1590006', 'ต้มประสานน้ำนม 380 กรัม'],
  ['1560015', 'ตรีผลา 500'],
  ['1680024', 'เถาวัลย์เปรียง 450 mg.'],
  ['1550048', 'ทองพันชั่งทิงเจอร์ 60 ml.'],
  ['1630060', 'ทำลายพระสุเมรุ 2 g.'],
  ['1560014', 'ธรณีสัณฑะฆาต 500 mg.'],
  ['1660039', 'ธาตุอบเชย 120 ml.'],
  ['1640115', 'น้ำมันกัญชา อ.เดชา 2 mg./ml.'],
  ['1560006', 'บำรุงโลหิต (ผง) 15 g.'],
  ['1560008', 'เบญจกูล 500'],
  ['1560017', 'ประสะจันทน์แดง 500 mg.'],
  ['1560003', 'ประสะไพล 500 mg.'],
  ['1000311', 'ประสะมะแว้ง 200 mg.'],
  ['1560022', 'ปราบชมพูทวีป 500 mg.'],
  ['1560020', 'ปลูกไฟธาตุ 500 mg.'],
  ['1550015', 'พญายอ ครีม 4%'],
  ['1590007', 'พอกดูดพิษ 20 กรัม'],
  ['1550006', 'เพชรสังฆาต 500 mg.'],
  ['1520003', 'ฟ้าทะลายโจร 400 mg.'],
  ['1560018', 'ไฟประลัยกัลป์'],
  ['1560019', 'ไฟห้ากอง 500 mg.'],
  ['1550009', 'มะขามแขก (senokot) 450 mg'],
  ['1560007', 'มะระขี้นก 500 mg.'],
  ['1680028', 'ยาแก้ไอผสมมะขามป้อม 25%'],
  ['1570009', 'ยาชงหญ้าดอกขาว 2 g.'],
  ['1550050', 'ยาต้มโคคลาน 150 กรัม'],
  ['1650046', 'ยาทาริดสีดวงทวารหนักและโรคผิวหนัง 2 กรัม'],
  ['1640109', 'ยาทำลายพระสุเมรุ 500 mg.'],
  ['1640013', 'ยาน้ำมันกัญชาทั้ง 5 312.5 mg.'],
  ['1610027', 'ยาปรุงผู้ป่วยเฉพาะราย (เดี่ยว)'],
  ['1570007', 'ยาปรุงผู้ป่วยเฉพาะราย (ตำรับ)'],
  ['1580008', 'รางจืด (เม็ด) 400 mg.'],
  ['1680026', 'ลูกประคบสมุนไพร'],
  ['1560021', 'เลือดงาม 500 mg.'],
  ['1670014', 'โลชั่นทากันยุง 13%'],
  ['1630006', 'ศุขไสยาศน์ 2 g.'],
  ['1640107', 'ศุขไสยาศน์ 500 mg.'],
  ['1560027', 'สตรีหลังคลอด 150 g.'],
  ['1560005', 'สหัศธารา 500 mg.'],
  ['1000308', 'เสลดพังพอน กลีเซอรีน 10 ml.'],
  ['1550049', 'เสลดพังพอนทิงเจอร์ 60 ml.'],
  ['1600019', 'หอมเทพจิตร 200 mg.'],
  ['1560012', 'หอมอินทจักร 15 g.'],
  ['1560009', 'ห้าราก 350 mg.'],
  ['1600002', 'เหลืองปิดสมุทร 500 mg.'],
  ['1560028', 'อำมฤควาที 15 g.'],
  ['1550051', '(จาก SQL เดิม)'],
  ['1560001', '(จาก SQL เดิม)'],
  ['1560010', '(จาก SQL เดิม)']
];

/** One `opitemrece` line of a visit, summed by vn, icode and income. */
export type TtmItem = { vn: string; icode: string; income: string; incomeName: string; itemName: string; isDrug: boolean; qty: number; amount: number };

export interface TtmRules {
  autoDetect: boolean;
  opdFeeIcodes: string[]; massageIcodes: string[]; herbIcodes: string[];
  massageIncome: string[]; herbIncome: string[];
  opdFeeKeywords: string[]; massageKeywords: string[]; herbKeywords: string[];
  afterHoursFrom: string;
  rightMap: Record<string, TtmRightGroup>;
  kindMap: Record<string, TtmKind>;
}

/** The legacy settings by their config keys (`TTM_AUTO_DETECT` → `auto_detect` …); lists as "a,b" text or arrays. */
export type TtmSettingKey = 'auto_detect' | 'massage_income' | 'herb_income' | 'massage_icodes' | 'herb_icodes' | 'opd_fee_icodes' | 'after_hours_from' | 'kind_map' | 'right_map' | 'opd_fee_keywords' | 'massage_keywords' | 'herb_keywords';
export type TtmSettings = Partial<Record<TtmSettingKey, string | readonly string[] | boolean | undefined>>;

const KIND_KEYWORDS: readonly (readonly [TtmProcedureKind, readonly string[]])[] = [
  ['postpartum', ['หลังคลอด', 'มารดา', 'ทับหม้อเกลือ', 'อยู่ไฟ', 'เข้ากระโจม']],
  ['knee', ['พอก']],
  ['steam', ['อบไอน้ำ', 'อบสมุนไพร', 'อบตัว', 'การอบ', 'อบ ']],
  ['thai_massage', ['นวด']],
  ['compress', ['ประคบ']]
];

const defaultKindMap = (): Record<string, TtmKind> => Object.fromEntries(TTM_PROCEDURES.map(([code, kind]) => [code, kind]));

/** The default settings (legacy `defaultRules`). */
export function ttmDefaultRules(): TtmRules {
  return {
    autoDetect: true,
    opdFeeIcodes: [...TTM_DEFAULT_OPD_FEE_ICODES],
    massageIcodes: TTM_PROCEDURES.map(([code]) => code),
    herbIcodes: TTM_HERB_ICODES.map(([code]) => code),
    massageIncome: [],
    herbIncome: [],
    opdFeeKeywords: ['ค่าบริการผู้ป่วยนอก', 'ค่าบริการทางการแพทย์ผู้ป่วยนอก'],
    massageKeywords: ['นวด', 'ประคบ', 'อบไอน้ำ', 'อบสมุนไพร', 'พอกเข่า', 'พอก', 'ทับหม้อเกลือ', 'หลังคลอด', 'หัตถการ', 'แผนไทย'],
    herbKeywords: ['สมุนไพร'],
    afterHoursFrom: '16:00',
    rightMap: {},
    kindMap: defaultKindMap()
  };
}

/** "a, b,c" → ['a','b','c'] (legacy `splitList`). */
export const ttmSplitList = (text: string): string[] => text.split(',').map((part) => part.trim()).filter((part) => part !== '');
const list = (value: string | readonly string[] | boolean): string[] => (Array.isArray(value) ? value.map(String) : ttmSplitList(String(value)));
/** ["a:b", …] → { a: 'b' } (legacy `pairs`). */
const pairs = (items: string[]): Record<string, string> => {
  const map: Record<string, string> = {};
  for (const item of items) {
    const at = item.indexOf(':');
    if (at >= 0) map[item.slice(0, at).trim()] = item.slice(at + 1).trim();
  }
  return map;
};
/** PHP `filter_var(…, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE)`: null for anything that is not a boolean word. */
const phpBool = (value: string | readonly string[] | boolean): boolean | null => {
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'on', 'yes'].includes(text)) return true;
  if (['0', 'false', 'off', 'no', ''].includes(text)) return false;
  return null;
};

const LIST_KEYS = { massage_income: 'massageIncome', herb_income: 'herbIncome', massage_icodes: 'massageIcodes', herb_icodes: 'herbIcodes', opd_fee_icodes: 'opdFeeIcodes', opd_fee_keywords: 'opdFeeKeywords', massage_keywords: 'massageKeywords', herb_keywords: 'herbKeywords' } as const;
/** Lists that keep the default when set empty (legacy `KEEP_DEFAULT_WHEN_EMPTY` and every `*_keywords`). */
const KEEP_DEFAULT_WHEN_EMPTY = new Set(['herb_icodes', 'massage_icodes', 'opd_fee_icodes', 'opd_fee_keywords', 'massage_keywords', 'herb_keywords']);

/** The settings merged over the defaults (legacy `rules`): an unset key keeps its default; see `KEEP_DEFAULT_WHEN_EMPTY`. */
export function ttmRules(custom: TtmSettings = {}): TtmRules {
  const rules = ttmDefaultRules();
  for (const [key, field] of Object.entries(LIST_KEYS) as [keyof typeof LIST_KEYS, (typeof LIST_KEYS)[keyof typeof LIST_KEYS]][]) {
    const value = custom[key];
    if (value === undefined) continue;
    const items = list(value);
    if (items.length > 0 || !KEEP_DEFAULT_WHEN_EMPTY.has(key)) rules[field] = items;
  }
  if (custom.after_hours_from !== undefined && String(custom.after_hours_from).trim() !== '') rules.afterHoursFrom = String(custom.after_hours_from).trim();
  if (custom.auto_detect !== undefined) rules.autoDetect = phpBool(custom.auto_detect) ?? rules.autoDetect;
  const rightMap = custom.right_map === undefined ? {} : pairs(list(custom.right_map));
  rules.rightMap = Object.fromEntries(Object.entries(rightMap).filter(([, group]) => group in TTM_RIGHT_GROUPS)) as Record<string, TtmRightGroup>;
  const kindMap = { ...defaultKindMap(), ...(custom.kind_map === undefined ? {} : pairs(list(custom.kind_map))) };
  rules.kindMap = Object.fromEntries(Object.entries(kindMap).filter(([, kind]) => kind in TTM_KINDS)) as Record<string, TtmKind>;
  return rules;
}

/** Legacy `hasAny` (`mb_stripos`): case-insensitive substring. */
const hasAny = (text: string, keywords: readonly string[]) => { const lower = text.toLowerCase(); return keywords.some((word) => word !== '' && lower.includes(word.toLowerCase())); };

/** The หมวด of one charge line, or null when it is not counted: configured icode → configured income → guess from names (legacy `classify`). */
export function classifyTtmItem(item: Pick<TtmItem, 'icode' | 'income' | 'incomeName' | 'itemName' | 'isDrug'>, rules: TtmRules): TtmCategory | null {
  const icode = String(item.icode);
  const income = String(item.income);
  if (rules.opdFeeIcodes.includes(icode)) return 'opd_fee';
  if (rules.massageIcodes.includes(icode)) return 'massage';
  if (rules.herbIcodes.includes(icode)) return 'herb';
  if (rules.massageIncome.includes(income)) return 'massage';
  if (rules.herbIncome.includes(income)) return 'herb';
  if (!rules.autoDetect) return null;
  const name = item.itemName ?? '';
  const incomeName = item.incomeName ?? '';
  if (!item.isDrug && hasAny(name, rules.opdFeeKeywords)) return 'opd_fee';
  if (item.isDrug && (hasAny(name, rules.herbKeywords) || hasAny(incomeName, rules.herbKeywords) || hasAny(incomeName, ['แผนไทย']))) return 'herb';
  if (!item.isDrug && (hasAny(name, rules.massageKeywords) || hasAny(incomeName, ['แผนไทย']))) return 'massage';
  if (hasAny(incomeName, rules.herbKeywords)) return 'herb';
  return null;
}

/** The รายบริการ of a counted line: herb and OPD fee as their หมวด; massage by `kindMap`, then name, else หัตถการอื่น ๆ (legacy `kind`). */
export function ttmKind(item: Pick<TtmItem, 'icode' | 'itemName'>, category: TtmCategory | null, rules: TtmRules): TtmKind | null {
  if (category === null) return null;
  if (category !== 'massage') return category;
  const mapped = rules.kindMap[String(item.icode)];
  if (mapped && mapped !== 'herb' && mapped !== 'opd_fee') return mapped;
  for (const [kind, words] of KIND_KEYWORDS) if (hasAny(item.itemName ?? '', words)) return kind;
  return 'other_proc';
}

/** ปีงบประมาณ (พ.ศ.), October to September. */
export const ttmFiscalYear = (date: string): number => { const year = Number(date.slice(0, 4)); return (Number(date.slice(5, 7)) >= 10 ? year + 1 : year) + 543; };

const BY_HIPDATA: Record<string, TtmRightGroup> = { OFC: 'ofc', BKK: 'ofc', BMT: 'ofc', GOF: 'ofc', LGO: 'lgo', UCS: 'uc', WEL: 'uc', DIS: 'uc', SSS: 'sss', SSI: 'sss', A1: 'cash', NRH: 'cash' };
const BY_NAME: readonly (readonly [string, TtmRightGroup])[] = [['ข้าราชการ', 'ofc'], ['ท้องถิ่น', 'lgo'], ['อปท', 'lgo'], ['ประกันสังคม', 'sss'], ['บัตรทอง', 'uc'], ['หลักประกันสุขภาพ', 'uc'], ['UC', 'uc'], ['30 บาท', 'uc']];

/** กลุ่มสิทธิ of a pttype: configured map → name (ใบเสร็จ, ชำระเงิน) → hipdata_code → broader name → other (legacy `rightGroup`). */
export function ttmRightGroup(pttype: string, name: string, hipdata: string, rules: TtmRules): TtmRightGroup {
  const mapped = rules.rightMap[pttype];
  if (mapped) return mapped;
  if (pttype === '' && name === '' && hipdata === '') return 'other';
  if (hasAny(name, ['ใบเสร็จ'])) return 'receipt';
  if (hasAny(name, ['ชำระเงิน', 'เงินสด', 'จ่ายเอง', 'ชำระเอง'])) return 'cash';
  const byHip = BY_HIPDATA[hipdata.trim().toUpperCase()];
  if (byHip) return byHip;
  for (const [word, group] of BY_NAME) if (hasAny(name, [word])) return group;
  return 'other';
}

/** บริการผู้ป่วยใน: the service row has an AN or its visit does (`ovst.an`). */
export const isTtmIpd = (service: { an?: string }, visitAn = ''): boolean => (service.an ?? '').trim() !== '' || visitAn.trim() !== '';

/** "9:5" / "16.00" / "16:00:00" → "HH:MM:SS"; '' when there is no time (legacy `normTime`). */
const normTime = (time: string): string => {
  const match = /(\d{1,2})[:.](\d{1,2})(?:[:.](\d{1,2}))?/.exec(time);
  if (!match) return '';
  const two = (part: string | undefined) => String(Number(part ?? 0)).padStart(2, '0');
  return `${two(match[1])}:${two(match[2])}:${two(match[3])}`;
};

/** บริการนอกเวลา: the service time is later than `afterHoursFrom` (16:00 by default). */
export const isTtmAfterHours = (service: { serviceTime?: string }, rules: Pick<TtmRules, 'afterHoursFrom'>): boolean => {
  const time = normTime(service.serviceTime ?? '');
  return time !== '' && time > normTime(rules.afterHoursFrom);
};
