import { TTM_PROCEDURES, type TtmRules, type TtmSettingKey, type TtmSettings } from '@backoffice/core';

/** The legacy `.env` names of the monitor แพทย์แผนไทย settings (see the mapping page); unset = the default list or rule. */
export const TTM_ENV_KEYS = ['TTM_AUTO_DETECT', 'TTM_MASSAGE_INCOME', 'TTM_HERB_INCOME', 'TTM_MASSAGE_ICODES', 'TTM_HERB_ICODES', 'TTM_OPD_FEE_ICODES', 'TTM_AFTER_HOURS_FROM', 'TTM_KIND_MAP', 'TTM_RIGHT_MAP'] as const;

/** `TTM_RIGHT_MAP` → `right_map` …, for `ttmRules`. */
export function ttmSettingsFromEnv(read: (name: string) => string | undefined): TtmSettings {
  const settings: TtmSettings = {};
  for (const name of TTM_ENV_KEYS) {
    const value = read(name);
    if (value !== undefined) settings[name.slice(4).toLowerCase() as TtmSettingKey] = value;
  }
  return settings;
}

const listText = (list: readonly string[]) => (list.length > 0 ? list.join(',') : '(ว่าง)');
const mapText = (map: Readonly<Record<string, string>>, keys: readonly string[] = Object.keys(map)) => { const pairs = keys.map((key) => [key, map[key]!] as const); return pairs.length > 0 ? pairs.map(([key, value]) => `${key}:${value}`).join(',') : '(ว่าง)'; };
/** Kind-map codes in the hospital list's order, then any others (a JS object would sort the numeric codes). */
const kindOrder = (map: Readonly<Record<string, string>>) => { const listed = TTM_PROCEDURES.map(([code]) => code).filter((code) => code in map); return [...listed, ...Object.keys(map).filter((code) => !listed.includes(code))]; };
/** The current TTM_* settings as the legacy page printed them. */
export function ttmConfigText(rules: TtmRules): string {
  return [
    `TTM_AUTO_DETECT=${rules.autoDetect ? 'true' : 'false'}   (true = รายการที่ไม่ได้ตั้งรหัส ให้เดาจากชื่อรายการ/หมวดรายได้)`,
    `TTM_MASSAGE_INCOME=${listText(rules.massageIncome)}`,
    `TTM_HERB_INCOME=${listText(rules.herbIncome)}`,
    `TTM_MASSAGE_ICODES=${listText(rules.massageIcodes)}`,
    `TTM_HERB_ICODES=${listText(rules.herbIcodes)}`,
    `TTM_OPD_FEE_ICODES=${listText(rules.opdFeeIcodes)}`,
    `TTM_AFTER_HOURS_FROM=${rules.afterHoursFrom}   (บริการนอกเวลา = เวลาให้บริการเกินเวลานี้)`,
    `TTM_KIND_MAP=${mapText(rules.kindMap, kindOrder(rules.kindMap))}`,
    `TTM_RIGHT_MAP=${mapText(rules.rightMap)}`
  ].join('\n');
}
