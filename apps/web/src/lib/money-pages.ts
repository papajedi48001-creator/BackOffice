import type { MoneyPage } from '@backoffice/contracts';

/** หน้า Smart Money: where each page lives and how the overview and the member form name it. */
export const MONEY_PAGES: Readonly<Record<MoneyPage, { href: string; title: string; description: string }>> = {
  dental: { href: '/money/dental', title: 'ลูกหนี้ทันตกรรม', description: 'ลูกหนี้ผู้รับบริการทันตกรรม (K00–K11) แยกตามสิทธิ/ผังบัญชี รายวัน/รายเดือน' },
  nhso: { href: '/money/nhso', title: 'เงินโอน สปสช.', description: 'เทียบรายงานการโอนเงิน สปสช. รายกองทุน ระหว่างโรงพยาบาลและปีงบ' },
  fdh: { href: '/money/fdh', title: 'ติดตามกองทุนย่อย FDH', description: 'ชน REP กับ STM ของ FDH ด้วย VN ติดตามสถานะ ยอดรายกองทุนย่อย รายบุคคล และ Error Code' },
  disability: { href: '/money/disability', title: 'กองทุนฟื้นฟูสมรรถภาพ', description: 'Monitor IMC (ทะเบียน IMC เหลืออีกกี่วัน เรียกเก็บเทียบ REP) Monitor Instrument OFC และจำนวนครั้งและราคาขอเบิก (AE) / พึงเบิก (AF) ของบริการฟื้นฟูสมรรถภาพ แยกตามบริการ ปีงบ วัน หรือช่วงเวลา' },
  ttm: { href: '/money/ttm', title: 'monitor แพทย์แผนไทย', description: 'สรุปผลการดำเนินงานแพทย์แผนไทยจาก HOSxP: คน ค่านวด/ประคบ/อบ/หัตถการ ยาสมุนไพร แยกตามสิทธิ รายวัน รายเดือน รายปีงบ' },
  herb: { href: '/money/herb', title: 'การจ่ายยาสมุนไพร', description: 'ยาสมุนไพรทุกรายการ ทุกแผนก: จำนวนครั้ง ต้นทุน มูลค่าจริง คาดการณ์ ontop และรับจริงจาก REP แยกรายยาและสิทธิ' },
  ofc: { href: '/money/disability?tab=ofc', title: 'Monitor Instrument OFC', description: 'ผู้ป่วยสิทธิข้าราชการ (OFC) ที่ได้รับอุปกรณ์บำบัดรักษา (ADP 8610) จาก HOSxP: คน ครั้ง ชิ้น เรียกเก็บ เทียบผล REP และ Statement' }
};
