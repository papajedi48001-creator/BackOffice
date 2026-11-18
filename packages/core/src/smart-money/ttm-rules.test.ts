import { describe, expect, it } from 'vitest';
import { classifyTtmItem, isTtmAfterHours, isTtmIpd, ttmDefaultRules, ttmFiscalYear, ttmKind, ttmRightGroup, ttmRules, TTM_HERB_ICODES, TTM_PROCEDURES, type TtmItem } from './ttm-rules';

// Ported from the legacy tests/ttm_monitor/TtmSummaryTest.php; made-up data only.
const rules = ttmRules();
const it_ = (o: Partial<TtmItem>): TtmItem => ({ vn: 'v1', icode: 'X', income: '99', incomeName: '', itemName: '', isDrug: false, qty: 1, amount: 0, ...o });

describe('classifyTtmItem', () => {
  it('guesses from names like the legacy page', () => {
    expect(classifyTtmItem(it_({ itemName: 'นวดไทยเพื่อการรักษา' }), rules)).toBe('massage');
    expect(classifyTtmItem(it_({ itemName: 'ประคบสมุนไพร' }), rules)).toBe('massage');
    expect(classifyTtmItem(it_({ itemName: 'ฟ้าทะลายโจร แคปซูล', isDrug: true, incomeName: 'ค่ายาแผนไทย' }), rules)).toBe('herb');
    expect(classifyTtmItem(it_({ itemName: 'ยาสมุนไพรขมิ้นชัน', isDrug: true }), rules)).toBe('herb');
    expect(classifyTtmItem(it_({ itemName: 'Paracetamol 500', isDrug: true, incomeName: 'ค่ายา' }), rules)).toBeNull();
    expect(classifyTtmItem(it_({ itemName: 'ค่าบริการผู้ป่วยนอก ในเวลา' }), rules)).toBe('opd_fee');
    expect(classifyTtmItem(it_({ itemName: 'CBC', incomeName: 'ค่าตรวจทางห้องปฏิบัติการ' }), rules)).toBeNull();
  });

  it('uses the configured codes first: icode, then income', () => {
    const custom = ttmRules({ herb_income: '17', opd_fee_icodes: '3000001', massage_icodes: ['3000002'] });
    expect(classifyTtmItem(it_({ income: '17', itemName: 'Paracetamol', isDrug: true }), custom)).toBe('herb');
    expect(classifyTtmItem(it_({ icode: '3000001' }), custom)).toBe('opd_fee');
    expect(classifyTtmItem(it_({ icode: '3000002', income: '17' }), custom)).toBe('massage');
    expect(classifyTtmItem(it_({ itemName: 'นวดไทย' }), ttmRules({ auto_detect: 'false' }))).toBeNull();
  });

  it('keeps default keywords when set empty and replaces them otherwise', () => {
    expect(ttmRules({ massage_keywords: 'นวด' }).massageKeywords).toEqual(['นวด']);
    expect(ttmRules({ herb_keywords: '' }).herbKeywords).toEqual(ttmDefaultRules().herbKeywords);
  });

  it('reads auto_detect like PHP FILTER_VALIDATE_BOOLEAN', () => {
    expect(ttmRules({ auto_detect: ' Off ' }).autoDetect).toBe(false);
    expect(ttmRules({ auto_detect: 'yes' }).autoDetect).toBe(true);
    expect(ttmRules({ auto_detect: '' }).autoDetect).toBe(false);
    expect(ttmRules({ auto_detect: 'maybe' }).autoDetect).toBe(true);
    expect(ttmRules({ auto_detect: false }).autoDetect).toBe(false);
  });

  it('uses the hospital lists by default', () => {
    expect(TTM_HERB_ICODES).toHaveLength(62);
    expect(TTM_PROCEDURES).toHaveLength(47);
    expect(rules.herbIcodes).toHaveLength(62);
    expect(classifyTtmItem(it_({ icode: '1560028', isDrug: true }), rules)).toBe('herb');
    expect(classifyTtmItem(it_({ icode: '1530001', itemName: 'วัคซีนไข้หวัดใหญ่', isDrug: true }), rules)).toBeNull();
    expect(classifyTtmItem(it_({ icode: '1000304', itemName: 'เซรุ่มแก้พิษงูกะปะ', isDrug: true }), rules)).toBeNull();
    expect(ttmRules({ herb_icodes: '111' }).herbIcodes).toEqual(['111']);
    expect(classifyTtmItem(it_({ icode: '1550009', itemName: 'ยาเม็ด', isDrug: true }), rules)).toBe('herb');
    expect(classifyTtmItem(it_({ icode: '3015059', itemName: 'อมยาใต้ลิ้น' }), rules)).toBeNull();
  });
});

describe('ttmRightGroup', () => {
  it('groups by name, hipdata code and the configured map', () => {
    expect(ttmRightGroup('10', 'ข้าราชการ จ่ายตรง', 'OFC', rules)).toBe('ofc');
    expect(ttmRightGroup('L1', 'อปท.', 'LGO', rules)).toBe('lgo');
    expect(ttmRightGroup('89', 'UC ในเขต', 'UCS', rules)).toBe('uc');
    expect(ttmRightGroup('S1', 'ประกันสังคม', 'SSS', rules)).toBe('sss');
    expect(ttmRightGroup('A1', 'ชำระเงินเอง', '', rules)).toBe('cash');
    expect(ttmRightGroup('12', 'เบิกได้ ออกใบเสร็จ', 'OFC', rules)).toBe('receipt');
    expect(ttmRightGroup('99', 'ต่างด้าว', 'NRD', rules)).toBe('other');
    expect(ttmRightGroup('', '', '', rules)).toBe('other');
    expect(ttmRightGroup('77', 'สิทธิ uc พิเศษ', '', rules)).toBe('uc');
    const mapped = ttmRules({ right_map: '99:cash, 98:bad' });
    expect(ttmRightGroup('99', 'ต่างด้าว', 'NRD', mapped)).toBe('cash');
    expect(mapped.rightMap).toEqual({ 99: 'cash' });
  });
});

describe('IPD and after-hours', () => {
  it('marks IPD by the service AN or the visit AN', () => {
    expect(isTtmIpd({ an: '690001234' })).toBe(true);
    expect(isTtmIpd({ an: '' }, '690001234')).toBe(true);
    expect(isTtmIpd({ an: ' ' }, '')).toBe(false);
  });

  it('marks after-hours strictly after the cutoff', () => {
    expect(isTtmAfterHours({ serviceTime: '16:30:00' }, rules)).toBe(true);
    expect(isTtmAfterHours({ serviceTime: '16:00:00' }, rules)).toBe(false);
    expect(isTtmAfterHours({ serviceTime: '09:15' }, rules)).toBe(false);
    expect(isTtmAfterHours({ serviceTime: '' }, rules)).toBe(false);
    expect(isTtmAfterHours({ serviceTime: '16:0:1' }, rules)).toBe(true);
    expect(isTtmAfterHours({ serviceTime: '15:30' }, ttmRules({ after_hours_from: '15.00' }))).toBe(true);
    expect(ttmRules({ after_hours_from: '' }).afterHoursFrom).toBe('16:00');
  });
});

describe('ttmKind', () => {
  const kind = (name: string, r = rules) => { const item = it_({ itemName: name, icode: 'K1' }); return ttmKind(item, classifyTtmItem(item, r), r); };
  it('splits massage by name and passes herb and OPD fee through', () => {
    expect(kind('นวดไทยเพื่อการรักษา')).toBe('thai_massage');
    expect(kind('ประคบสมุนไพร')).toBe('compress');
    expect(kind('อบไอน้ำสมุนไพร')).toBe('steam');
    expect(kind('พอกเข่าด้วยสมุนไพร')).toBe('knee');
    expect(kind('ทับหม้อเกลือ')).toBe('postpartum');
    expect(kind('หัตถการแพทย์แผนไทย')).toBe('other_proc');
    expect(kind('ค่าบริการผู้ป่วยนอก')).toBe('opd_fee');
    expect(ttmKind(it_({ isDrug: true, itemName: 'ยาสมุนไพร' }), 'herb', rules)).toBe('herb');
    expect(ttmKind(it_({}), null, rules)).toBeNull();
    expect(kind('หัตถการแพทย์แผนไทย', ttmRules({ kind_map: 'K1:knee,K2:bad' }))).toBe('knee');
  });

  it('uses the hospital procedure list', () => {
    const pk = (icode: string, r = rules) => { const item = it_({ icode, itemName: 'xx' }); const c = classifyTtmItem(item, r); return [c, ttmKind(item, c, r)]; };
    expect(pk('3015968')).toEqual(['opd_fee', 'opd_fee']);
    expect(pk('3015001')).toEqual(['massage', 'thai_massage']);
    expect(pk('3015004')).toEqual(['massage', 'compress']);
    expect(pk('3015005')).toEqual(['massage', 'steam']);
    expect(pk('3015935')).toEqual(['massage', 'knee']);
    expect(pk('3015656')).toEqual(['massage', 'postpartum']);
    expect(pk('3015985')).toEqual(['massage', 'other_proc']);
    const custom = ttmRules({ kind_map: '3015001:compress' });
    expect(pk('3015001', custom)).toEqual(['massage', 'compress']);
    expect(pk('3015005', custom)).toEqual(['massage', 'steam']);
  });

  it('counts ปีงบ from October', () => {
    expect(ttmFiscalYear('2026-10-01')).toBe(2570);
    expect(ttmFiscalYear('2026-09-30')).toBe(2569);
  });
});
