import { describe, expect, it } from 'vitest';
import type { NhsoCell } from '@backoffice/contracts';
import { imcFileKind, parseImcRegister, parseImcRep } from './imc-report';

// The real ทะเบียนคนไข้ IMC header (two "สถานะ" and two "รหัสหน่วยบริการ" columns), with made-up people.
const REGISTER = ['รหัสสปสช.เขต', 'ชื่อสปสช.เขต', 'รหัสจังหวัด', 'ชื่อจังหวัด', 'รหัสหน่วยบริการ', 'ชื่อหน่วยบริการ', 'วันที่ลงทะเบียน', 'รหัสบัตรประชาชน', 'ชื่อ', 'นามสกุล', 'HN', 'AN',
  'สิทธิหลัก', 'สิทธิย่อย', 'วันที่เริ่มป่วย', 'โรค', 'ICD10', 'วันที่จำหน่ายจากผู้ป่วยใน', 'แผนการดูแล', 'วันที่ครบกำหนดการให้บริการ', 'สถานะ', 'รหัสหน่วยบริการส่งต่อ', 'ชื่อหน่วยบริการส่งต่อ',
  'วันที่ส่งต่อ', 'ADL', 'Impairment', 'วันที่ให้บริการ', 'ครั้งที่', 'ประเภทการรับบริการ', 'รหัสบริการ', 'ชื่อบริการ', 'ราคากลาง (ต่อหน่วย)', 'ราคาที่จ่ายจริง (ต่อหน่วย)',
  'ส่วนต่าง (ต่อหน่วย)', 'จำนวน', 'รวมราคาที่ขอเบิก', 'รวมราคาที่พึงเบิกได้', 'รหัสหน่วยบริการ', 'ชื่อหน่วยริการ', 'รหัสหน่วยบริการส่งต่อ', 'ชื่อหน่วยบริการส่งต่อ', 'เจ้าหน้าที่', 'สถานะ', 'วันที่บันทึก'];
const reg = (hn: string, date: string, visit: number, code: string, claim: number, extra: { due?: string; status?: string; claimStatus?: string } = {}): NhsoCell[] => {
  const row: NhsoCell[] = Array(REGISTER.length).fill('');
  const put = (title: string, value: NhsoCell, last = false) => { row[last ? REGISTER.lastIndexOf(title) : REGISTER.indexOf(title)] = value; };
  put('รหัสบัตรประชาชน', '3.4706E+12'); put('ชื่อ', 'ทดสอบ'); put('นามสกุล', `สมมติ${hn}`); put('HN', hn); put('สิทธิหลัก', 'UCS'); put('วันที่เริ่มป่วย', '27/9/2568');
  put('โรค', 'Stroke'); put('วันที่จำหน่ายจากผู้ป่วยใน', '6/10/2568'); put('วันที่ครบกำหนดการให้บริการ', extra.due ?? '4/4/2569'); put('สถานะ', extra.status ?? 'ปกติ');
  put('วันที่ให้บริการ', date); put('ครั้งที่', visit); put('รหัสบริการ', code); put('ชื่อบริการ', code === 'H9340' ? 'ให้บริการIMCที่บ้าน' : 'กายภาพบำบัด');
  put('รวมราคาที่ขอเบิก', claim); put('รวมราคาที่พึงเบิกได้', claim); put('สถานะ', extra.claimStatus ?? 'ผ่าน', true);
  return row;
};

// The REP individual sheet: report lines, a two-row header (main and sub), a blank line, then data.
const REP_TOP: NhsoCell[][] = [[null, 'รายงาน : ', 'REP แบบ INDIVIDUAL'], [null, 'รอบ : ', '2569/กุมภาพันธ์28'], []];
const REP_MAIN = ['ลำดับที่', 'REP No.', 'Trans ID', 'HN', 'AN', 'VCTID,NAPNumber,PID', 'ชื่อ-สกุล', 'สิทธิการรักษาพยาบาล', 'HMAIN_OP', 'วันที่ส่งข้อมูล', 'วันที่รับบริการ', 'ลำดับที่',
  'รายการประเภทที่ขอเบิก', 'เรียกเก็บ', null, null, null, 'ล่าช้า (PS)', null, 'ชดเชย', null, null, null, 'สถานะ', 'หมายเหตุ'];
const REP_SUB = [null, null, null, null, null, null, null, null, null, null, null, null, null, 'จำนวน', 'ราคาต่อหน่วย', 'ราคาเพดาน', 'รวมเงินที่ขอเบิก', 'PS CODE', '%', 'ชดเชย', 'ไม่ชดเชย', 'จ่ายเพิ่ม', 'เรียกคืน'];
const rep = (seq: string, hn: string, date: string, item: string, claim: number, paid: number, more = 0, back = 0): NhsoCell[] =>
  [seq, 'DDSA69022800075', `6903062691${seq.padStart(2, '0')}`, hn, '', '1111111111119', 'นายทดสอบ สมมติ', 'UCS', '11093', '12/02/2569', date, item, 'กายภาพบำบัด_IMC', 1, 450, 0, claim, '0', '', paid, claim - paid, more, back, 'ชดเชย', ''];

describe('Monitor IMC file kinds', () => {
  it('tells the register, the REP sheet, the IMC service file and anything else apart', () => {
    expect(imcFileKind([REGISTER])).toBe('register');
    expect(imcFileKind([...REP_TOP, REP_MAIN, REP_SUB])).toBe('rep');
    expect(imcFileKind([['รหัสบัตรประชาชน', 'ชื่อ', 'นามสกุล', 'วันที่รับบริการ', 'รหัสบริการ', 'ชื่อบริการ', 'จำนวนเงิน']])).toBe('service');
    expect(imcFileKind([['a', 'b']])).toBeNull();
  });
});

describe('parseImcRegister', () => {
  it('reads one line per service row with ISO dates, both สถานะ columns and a line key that hides the HN', () => {
    const result = parseImcRegister([REGISTER, reg('000123', '27/10/2568', 1, 'H9339.1', 450), reg('000123', '3/11/2568', 2, 'H9340', 200, { claimStatus: 'รอประมวลผล' })]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toBe(0);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toMatchObject({ hn: '000123', name: 'ทดสอบ สมมติ000123', disease: 'Stroke', right: 'UCS', onset: '2025-09-27', discharge: '2025-10-06', due: '2026-04-04',
      status: 'ปกติ', date: '2025-10-27', visitNo: 1, code: 'H9339.1', service: 'กายภาพบำบัด', claim: 450, claimStatus: 'ผ่าน' });
    expect(result.lines[1]).toMatchObject({ code: 'H9340', claim: 200, claimStatus: 'รอประมวลผล' });
    expect(result.lines[0]!.key).toMatch(/^[0-9a-f]{64}$/);
    expect(result.lines[0]!.key).not.toContain('000123');
    expect(result.lines[0]!.key).not.toBe(result.lines[1]!.key);
  });

  it('gives the same key to the same line in a later file and skips rows without HN or a real service date', () => {
    const first = parseImcRegister([REGISTER, reg('9', '1/12/2568', 3, 'H9340', 200)]);
    const again = parseImcRegister([REGISTER, reg('9', '1/12/2568', 3, 'H9340', 250), reg('', '1/12/2568', 1, 'H9340', 200), reg('9', '31/2/2569', 1, 'H9340', 200), []]);
    expect(first.ok && again.ok && first.lines[0]!.key === again.lines[0]!.key).toBe(true);
    expect(again.ok && again.lines).toHaveLength(1);
    expect(again.ok && again.skipped).toBe(2);
  });

  it('refuses a file that is not the register', () => {
    expect(parseImcRegister([['ชื่อ', 'HN']])).toEqual({ ok: false, message: 'ไม่ใช่ไฟล์ทะเบียนคนไข้ IMC (ไม่พบคอลัมน์ "วันที่ครบกำหนดการให้บริการ" และ "วันที่ให้บริการ")' });
  });
});

describe('parseImcRep', () => {
  it('reads each REP line under the two-row header with paid = ชดเชย + จ่ายเพิ่ม − เรียกคืน', () => {
    const result = parseImcRep([...REP_TOP, REP_MAIN, REP_SUB, [null, null, null, null, null, 'x'], rep('1', '550058947', '12/02/2569', '1', 450, 450), rep('2', '550058947', '13/02/2569', '2', 450, 400, 20, 10)]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toBe(0);
    expect(result.lines).toEqual([
      { repNo: 'DDSA69022800075', transId: '690306269101', itemNo: 1, hn: '550058947', name: 'นายทดสอบ สมมติ', date: '2026-02-12', item: 'กายภาพบำบัด_IMC', claim: 450, paid: 450, status: 'ชดเชย' },
      { repNo: 'DDSA69022800075', transId: '690306269102', itemNo: 2, hn: '550058947', name: 'นายทดสอบ สมมติ', date: '2026-02-13', item: 'กายภาพบำบัด_IMC', claim: 450, paid: 410, status: 'ชดเชย' }
    ]);
  });

  it('skips a REP line with no date and refuses a sheet with no REP header', () => {
    const result = parseImcRep([REP_MAIN, REP_SUB, rep('1', '5', '', '1', 450, 450)]);
    expect(result.ok && result.skipped).toBe(1);
    expect(parseImcRep([REGISTER])).toEqual({ ok: false, message: 'ไม่ใช่ไฟล์ REP (ไม่พบคอลัมน์ "REP No." และ "Trans ID")' });
  });
});
