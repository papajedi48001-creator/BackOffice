import { formatBangkokDate } from '../bangkok-time';
import { imcRemain, type ImcTone } from './imc-views';

/** แท็บของหน้ากองทุนฟื้นฟูสมรรถภาพ: Monitor IMC, Monitor Instrument OFC and บริการฟื้นฟู (Point). */
export type DisabilityTab = 'imc' | 'ofc' | 'dp';
export const DISABILITY_TABS: readonly DisabilityTab[] = ['imc', 'ofc', 'dp'];
export type DisabilityCard = { key: DisabilityTab; code: string; title: string; href: string; current: boolean; main: string; alert: { text: string; tone: ImcTone } };
export type DisabilityFigures = {
  imc: { people: number; claim: number; soon: number } | null;
  ofc: { people: number; visits: number; claim: number; noRep: number; denied: number; waitStm: number } | null;
  dp: { fy: number; count: number; claim: number; flagged: number; updatedAt: string } | null;
};

const money = (n: number) => (+n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = (n: number) => (+n || 0).toLocaleString('th-TH');
/** The Bangkok calendar day of a UTC instant. */
const bangkokDay = (instant: string) => new Date(new Date(instant).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
const NONE = { main: 'ยังไม่มีข้อมูล', alert: { text: 'ดูรายละเอียดในแท็บ', tone: 'mute' as const } };

/** The tab asked for in the link when this person may open it, otherwise the first one they may. */
export function disabilityTab(asked: string | undefined, allowed: readonly DisabilityTab[]): DisabilityTab {
  return allowed.find((tab) => tab === asked) ?? allowed[0]!;
}

/** One card per allowed tab with its main figures and what needs following; the OFC link keeps the chosen range. */
export function disabilityCards({ tabs, current, range, imc, ofc, dp }: { tabs: readonly DisabilityTab[]; current: DisabilityTab; range: { start: string; end: string } } & DisabilityFigures): DisabilityCard[] {
  return tabs.map((key): DisabilityCard => {
    const base = { key, current: key === current };
    if (key === 'imc') {
      const body = !imc ? NONE : {
        main: `ทะเบียน ${int(imc.people)} คน · เรียกเก็บ ${money(imc.claim)} บาท`,
        alert: imc.soon > 0 ? { text: `ใกล้ครบกำหนด ≤ 30 วัน ${int(imc.soon)} คน`, tone: 'warn' as const } : { text: 'ไม่มีคนใกล้ครบกำหนด', tone: 'ok' as const }
      };
      return { ...base, code: 'IMC', title: 'Monitor IMC', href: '/money/disability?tab=imc', ...body };
    }
    if (key === 'ofc') {
      const body = !ofc ? NONE : {
        main: `${int(ofc.people)} คน · ${int(ofc.visits)} ครั้ง · ${money(ofc.claim)} บาท`,
        alert: ofc.visits === 0 ? { text: `ไม่มีผู้ป่วย ${formatBangkokDate(range.start)} – ${formatBangkokDate(range.end)}`, tone: 'mute' as const }
          : ofc.noRep > 0 || ofc.denied > 0 ? { text: `ยังไม่มี REP ${int(ofc.noRep)} ครั้ง · ปฏิเสธ ${int(ofc.denied)}`, tone: 'bad' as const }
            : ofc.waitStm > 0 ? { text: `รอ Statement ${int(ofc.waitStm)} ครั้ง`, tone: 'warn' as const }
              : { text: 'ได้รับครบแล้ว', tone: 'ok' as const }
      };
      return { ...base, code: 'OFC', title: 'Instrument OFC', href: `/money/disability?${new URLSearchParams({ tab: 'ofc', start: range.start, end: range.end }).toString()}`, ...body };
    }
    const body = !dp ? NONE : {
      main: `ปีงบ ${dp.fy} · ${int(dp.count)} ครั้ง · ขอเบิก ${money(dp.claim)} บาท`,
      alert: dp.flagged > 0 ? { text: `ติดสถานะ ${int(dp.flagged)} รายการ`, tone: 'warn' as const } : { text: `ข้อมูลล่าสุด ${formatBangkokDate(bangkokDay(dp.updatedAt))}`, tone: 'ok' as const }
    };
    return { ...base, code: 'AE', title: 'บริการฟื้นฟู (Point)', href: '/money/disability?tab=dp', ...body };
  });
}

/** IMC card figures from Monitor IMC's overview; null before the first upload. */
export function imcFigures(overview: { persons: readonly { due: string; status: string }[]; totals: { people: number; claim: number } }, today: string): DisabilityFigures['imc'] {
  if (overview.persons.length === 0) return null;
  return { people: overview.totals.people, claim: overview.totals.claim, soon: overview.persons.filter((person) => imcRemain(person, today).group === 'soon').length };
}

/** OFC card figures from Monitor Instrument OFC's summary of the range. */
export function ofcFigures(summary: { totals: { people: number; visits: number; claim: number; denied: number; waitStm: number }; visits: readonly { status: string }[] }): DisabilityFigures['ofc'] {
  const { people, visits, claim, denied, waitStm } = summary.totals;
  return { people, visits, claim, noRep: summary.visits.filter((visit) => visit.status === 'none').length, denied, waitStm };
}

/** บริการฟื้นฟู card figures: the newest ปีงบ imported (summaries come newest first). */
export function dpFigures(years: readonly { fy: number; count: number; claim: number; flagged: number; updatedAt: string }[]): DisabilityFigures['dp'] {
  const year = years[0];
  return year ? { fy: year.fy, count: year.count, claim: year.claim, flagged: year.flagged, updatedAt: year.updatedAt } : null;
}
