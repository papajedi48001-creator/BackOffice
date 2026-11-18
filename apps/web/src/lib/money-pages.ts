import type { MoneyPage } from '@backoffice/contracts';

/** หน้า Smart Money: where each page lives and how the overview and the member form name it. */
export const MONEY_PAGES: Readonly<Record<MoneyPage, { href: string; title: string; description: string }>> = {
  dental: { href: '/money/dental', title: 'ลูกหนี้ทันตกรรม', description: 'ลูกหนี้ผู้รับบริการทันตกรรม (K00–K11) แยกตามสิทธิ/ผังบัญชี รายวัน/รายเดือน' },
  nhso: { href: '/money/nhso', title: 'เงินโอน สปสช.', description: 'เทียบรายงานการโอนเงิน สปสช. รายกองทุน ระหว่างโรงพยาบาลและปีงบ' },
  fdh: { href: '/money/fdh', title: 'ติดตามกองทุนย่อย FDH', description: 'ชน REP กับ STM ของ FDH ด้วย VN ติดตามสถานะ ยอดรายกองทุนย่อย รายบุคคล และ Error Code' }
};
