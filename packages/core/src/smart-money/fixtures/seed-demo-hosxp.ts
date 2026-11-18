import { createDatabase } from '@backoffice/db';
import { seedFakeHerb, seedFakeHosxp, seedFakeTtm, tis, type FakeHerbDispense, type FakeTtmCharge, type FakeTtmService, type FakeVisit } from './fake-hosxp';
import { TTM_HERB_ICODES, TTM_PROCEDURES } from '../ttm-rules';

// Fills an empty local database with a made-up HOSxP for screenshots: `HOSXP_DEMO_URL=mysql://…/hosxp_demo tsx …/seed-demo-hosxp.ts`.
// Synthetic names and numbers only. Never point it at a real HOSxP.
const url = process.env.HOSXP_DEMO_URL;
if (!url) throw new Error('HOSXP_DEMO_URL is required');
const database = createDatabase(url);
const first = ['สมชาย', 'สมศรี', 'วิชัย', 'มาลี', 'ประยุทธ', 'บุญมี', 'จันทร์เพ็ญ', 'อรุณี', 'สุพจน์', 'ทองใบ', 'กมลา', 'ศักดิ์ชัย'];
const last = ['ใจดี', 'มีสุข', 'ศรีวงศ์', 'บุญเรือง', 'แก้วมณี', 'ทองดี', 'พรหมมา', 'สายบุญ'];
const icd: [string, string][] = [['K021', 'ฟันผุที่เนื้อฟัน'], ['K020', 'ฟันผุที่เคลือบฟัน'], ['K029', 'ฟันผุ ไม่ระบุรายละเอียด'], ['K040', 'เนื้อเยื่อในฟันอักเสบ'], ['K051', 'เหงือกอักเสบเรื้อรัง'], ['K053', 'ปริทันต์อักเสบเรื้อรัง'], ['K011', 'ฟันคุด'], ['K080', 'ฟันหลุดจากสาเหตุทั่วร่างกาย'], ['K003', 'ฟันตกกระ'], ['K050', 'เหงือกอักเสบเฉียบพลัน'], ['K102', 'ภาวะอักเสบของขากรรไกร'], ['K081', 'ฟันหลุดจากอุบัติเหตุ']];
const pttypes: [string, string, string][] = [['89', 'บัตรทอง ในเขต CUP', 'UCS'], ['10', 'ชำระเงินเอง', 'A1'], ['34', 'ข้าราชการ เบิกจ่ายตรง', 'OFC'], ['A7', 'ประกันสังคม', 'SSS'], ['71', 'บัตรทอง นอกเขต', 'UCS'], ['31', 'อปท.', 'LGO'], ['12', 'เบิกได้ ออกใบเสร็จ', '']];
const patients = Array.from({ length: 30 }, (_, i) => [String(1000 + i).padStart(6, '0'), i % 2 ? 'นาง' : 'นาย', first[i % first.length]!, last[i % last.length]!] as [string, string, string, string]);
let seed = 11;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };
const visits: FakeVisit[] = Array.from({ length: 60 }, (_, i) => {
  const day = 1 + Math.floor(rand() * 13);
  const total = [350, 500, 600, 800, 1200, 1500, 2800][Math.floor(rand() * 7)]!;
  const paid = rand() < 0.4 ? Math.round(total * rand() / 50) * 50 : 0;
  const pt = pttypes[Math.floor(rand() * rand() * pttypes.length)]![0];
  return { vn: `6911${String(day).padStart(2, '0')}${String(i).padStart(6, '0')}`, hn: patients[Math.floor(rand() * patients.length)]![0], vstdate: `2026-11-${String(day).padStart(2, '0')}`, pttype: pt, diags: rand() < 0.25 ? [icd[i % 12]![0], icd[(i + 4) % 12]![0]] : [icd[Math.floor(rand() * rand() * 12)]![0]], inc: [total * 0.6, total * 0.4], paid, rcpt: pt === '10' ? 0 : total - paid, dental: [[i % 3 ? 'D01' : 'D02', i % 2 ? 'H01' : null]], icodes: total >= 2800 ? ['3013076'] : [] };
});
// แพทย์แผนไทย: 1 Oct – 18 Nov 2026, 3–9 visits a day, procedures, herbs and the 50-baht fee from the hospital lists.
const ttmVisits: FakeVisit[] = [];
const ttmServices: FakeTtmService[] = [];
const ttmCharges: FakeTtmCharge[] = [];
const procedures = TTM_PROCEDURES.slice(0, 30);
for (let day = 0; day < 49; day += 1) {
  const date = new Date(Date.UTC(2026, 9, 1 + day)).toISOString().slice(0, 10);
  const count = 3 + Math.floor(rand() * 7);
  for (let n = 0; n < count; n += 1) {
    const vn = `69${date.slice(5, 7)}${date.slice(8, 10)}7${String(n).padStart(5, '0')}`;
    const hn = patients[Math.floor(rand() * patients.length)]![0];
    const pt = pttypes[Math.floor(rand() * pttypes.length)]![0];
    ttmVisits.push({ vn, hn, vstdate: date, pttype: pt, an: rand() < 0.06 ? `69${String(day).padStart(4, '0')}${n}` : undefined, diags: [], inc: [], paid: 0, rcpt: 0 });
    const time = `${String(rand() < 0.15 ? 16 + Math.floor(rand() * 3) : 8 + Math.floor(rand() * 8)).padStart(2, '0')}:${String(Math.floor(rand() * 60)).padStart(2, '0')}:00`;
    ttmServices.push({ vn, hn, date, time, type: 1 + Math.floor(rand() * 3), doctor: 1 + Math.floor(rand() * 3), treatment: 1 + Math.floor(rand() * 4) });
    const [code] = procedures[Math.floor(rand() * procedures.length)]!;
    ttmCharges.push({ vn, icode: code, income: '13', qty: 1, price: [150, 200, 250, 300][Math.floor(rand() * 4)]! });
    if (rand() < 0.4) ttmCharges.push({ vn, icode: TTM_HERB_ICODES[Math.floor(rand() * 20)]![0], income: '04', qty: 1 + Math.floor(rand() * 3), price: [35, 60, 90.5][Math.floor(rand() * 3)]! });
    if (rand() < 0.5) ttmCharges.push({ vn, icode: '3015968', income: '14', qty: 1, price: 50 });
  }
}
// การจ่ายยาสมุนไพร: herbal lines with rxdate on the same visits (OPD and the few IPD), cost and standard price per drug.
const herbDispenses: FakeHerbDispense[] = [];
const herbDrugs = TTM_HERB_ICODES.slice(0, 40);
for (const visit of ttmVisits) {
  const lines = rand() < 0.55 ? 1 + Math.floor(rand() * 3) : 0;
  for (let k = 0; k < lines; k += 1) {
    const [icode] = herbDrugs[Math.floor(rand() * rand() * herbDrugs.length)]!;
    const qty = [1, 2, 10, 20, 42][Math.floor(rand() * 5)]!;
    herbDispenses.push({ rxdate: visit.vstdate, vn: visit.vn, an: visit.an, hn: visit.hn, icode, qty, price: qty * 2 });
  }
}
try {
  await seedFakeHosxp(database, { patients, icd, pttypes, paccountopd: [['89', 'UC01', 2026], ['10', 'CASH', 2026], ['34', 'CSMBS', 2026], ['A7', 'SSS', 2025], ['71', 'UC02', 2026]], paccounts: [['UC01', 2026, 'ลูกหนี้ค่ารักษา UC-OP ใน CUP'], ['CASH', 2026, 'ลูกหนี้ค่ารักษา-ชำระเงิน'], ['CSMBS', 2026, 'ลูกหนี้ค่ารักษา เบิกจ่ายตรง กรมบัญชีกลาง OP'], ['SSS', 2025, 'ลูกหนี้ค่ารักษา ประกันสังคม OP'], ['UC02', 2026, 'ลูกหนี้ค่ารักษา UC-OP นอก CUP']], visits, doctors: [['D01', 'ทพ.สมหมาย ใจงาม'], ['D02', 'ทพญ.วิไล รักษ์ฟัน'], ['H01', 'นางสาวกมลา ช่วยดี']] });
  await database.execute('INSERT INTO ovst (vn, hn, vstdate, pttype, an) VALUES ' + ttmVisits.map(() => '(?, ?, ?, ?, ?)').join(', '), ttmVisits.flatMap((v) => [v.vn, v.hn, v.vstdate, v.pttype, v.an ?? null]));
  await seedFakeTtm(database, {
    types: [[1, 'ในหน่วยบริการ'], [2, 'ผู้ป่วยใน'], [3, 'นอกเวลาราชการ']], doctors: [[1, 'แพทย์แผนไทย สมใจ'], [2, 'แพทย์แผนไทย วิภา'], [3, 'ผู้ช่วยแพทย์แผนไทย บุญมา']],
    treatments: [[1, 'นวดรักษา'], [2, 'ประคบสมุนไพร'], [3, 'อบไอน้ำสมุนไพร'], [4, 'พอกเข่า']],
    incomes: [['13', 'ค่าบริการฝังเข็ม และค่าบริการการให้การบำบัดของผู้ประกอบโรคศิลปะอื่น'], ['04', 'ค่ายาแผนไทย'], ['14', 'ค่าบริการทางการแพทย์']],
    drugs: TTM_HERB_ICODES.slice(0, 20).map(([code, name]) => [code, name]), nondrugs: [...procedures.map(([code, , name]) => [code, name] as [string, string]), ['3015968', 'IMC Intermidiate Care']],
    services: ttmServices, charges: ttmCharges
  });
  await seedFakeHerb(database, {
    drugs: herbDrugs.slice(20).map(([code, name], i) => [code, name, null, i % 2 ? 'แคปซูล' : 'ขวด', 0.5 + (i % 5), i % 7 === 0 ? null : 1 + (i % 6)]),
    admissions: ttmVisits.filter((visit) => visit.an).map((visit) => [visit.an!, visit.vn, '34']), dispenses: herbDispenses
  });
  for (const [i, [code]] of herbDrugs.slice(0, 20).entries()) await database.execute('UPDATE drugitems SET units = ?, unitcost = ?, stdprice = ? WHERE icode = ?', [tis(i % 3 ? 'แคปซูล' : 'ซอง'), 0.4 + (i % 4) * 0.3, i % 6 === 0 ? 0 : 1 + (i % 5) * 0.5, code]);
  console.log(`seeded ${visits.length} visits, ${ttmVisits.length} แพทย์แผนไทย visits and ${herbDispenses.length} herbal lines`);
} finally { await database.close(); }
