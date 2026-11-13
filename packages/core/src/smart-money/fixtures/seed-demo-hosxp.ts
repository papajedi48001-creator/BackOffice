import { createDatabase } from '@backoffice/db';
import { seedFakeHosxp, type FakeVisit } from './fake-hosxp';

// Fills an empty local database with a made-up HOSxP for screenshots: `HOSXP_DEMO_URL=mysql://…/hosxp_demo tsx …/seed-demo-hosxp.ts`.
// Synthetic names and numbers only. Never point it at a real HOSxP.
const url = process.env.HOSXP_DEMO_URL;
if (!url) throw new Error('HOSXP_DEMO_URL is required');
const database = createDatabase(url);
const first = ['สมชาย', 'สมศรี', 'วิชัย', 'มาลี', 'ประยุทธ', 'บุญมี', 'จันทร์เพ็ญ', 'อรุณี', 'สุพจน์', 'ทองใบ', 'กมลา', 'ศักดิ์ชัย'];
const last = ['ใจดี', 'มีสุข', 'ศรีวงศ์', 'บุญเรือง', 'แก้วมณี', 'ทองดี', 'พรหมมา', 'สายบุญ'];
const icd: [string, string][] = [['K021', 'ฟันผุที่เนื้อฟัน'], ['K020', 'ฟันผุที่เคลือบฟัน'], ['K029', 'ฟันผุ ไม่ระบุรายละเอียด'], ['K040', 'เนื้อเยื่อในฟันอักเสบ'], ['K051', 'เหงือกอักเสบเรื้อรัง'], ['K053', 'ปริทันต์อักเสบเรื้อรัง'], ['K011', 'ฟันคุด'], ['K080', 'ฟันหลุดจากสาเหตุทั่วร่างกาย'], ['K003', 'ฟันตกกระ'], ['K050', 'เหงือกอักเสบเฉียบพลัน'], ['K102', 'ภาวะอักเสบของขากรรไกร'], ['K081', 'ฟันหลุดจากอุบัติเหตุ']];
const pttypes: [string, string][] = [['89', 'บัตรทอง ในเขต CUP'], ['10', 'ชำระเงินเอง'], ['34', 'ข้าราชการ เบิกจ่ายตรง'], ['A7', 'ประกันสังคม'], ['71', 'บัตรทอง นอกเขต'], ['31', 'อปท.']];
const patients = Array.from({ length: 30 }, (_, i) => [String(1000 + i).padStart(6, '0'), i % 2 ? 'นาง' : 'นาย', first[i % first.length]!, last[i % last.length]!] as [string, string, string, string]);
let seed = 11;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };
const visits: FakeVisit[] = Array.from({ length: 60 }, (_, i) => {
  const day = 1 + Math.floor(rand() * 13);
  const total = [350, 500, 600, 800, 1200, 1500, 2800][Math.floor(rand() * 7)]!;
  const paid = rand() < 0.4 ? Math.round(total * rand() / 50) * 50 : 0;
  const pt = pttypes[Math.floor(rand() * rand() * pttypes.length)]![0];
  return { vn: `6911${String(day).padStart(2, '0')}${String(i).padStart(6, '0')}`, hn: patients[Math.floor(rand() * patients.length)]![0], vstdate: `2026-11-${String(day).padStart(2, '0')}`, pttype: pt, diags: rand() < 0.25 ? [icd[i % 12]![0], icd[(i + 4) % 12]![0]] : [icd[Math.floor(rand() * rand() * 12)]![0]], inc: [total * 0.6, total * 0.4], paid, rcpt: pt === '10' ? 0 : total - paid };
});
try {
  await seedFakeHosxp(database, { patients, icd, pttypes, paccountopd: [['89', 'UC01', 2026], ['10', 'CASH', 2026], ['34', 'CSMBS', 2026], ['A7', 'SSS', 2025], ['71', 'UC02', 2026]], paccounts: [['UC01', 2026, 'ลูกหนี้ค่ารักษา UC-OP ใน CUP'], ['CASH', 2026, 'ลูกหนี้ค่ารักษา-ชำระเงิน'], ['CSMBS', 2026, 'ลูกหนี้ค่ารักษา เบิกจ่ายตรง กรมบัญชีกลาง OP'], ['SSS', 2025, 'ลูกหนี้ค่ารักษา ประกันสังคม OP'], ['UC02', 2026, 'ลูกหนี้ค่ารักษา UC-OP นอก CUP']], visits });
  console.log(`seeded ${visits.length} visits`);
} finally { await database.close(); }
