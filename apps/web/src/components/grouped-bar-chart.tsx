import type { CSSProperties } from 'react';

/** One series (e.g. a ปีงบ or a กองทุน). `tone` picks `--chart-<tone>`; `faded` draws an earlier year lighter, as the legacy charts did. */
export interface ChartSeries { name: string; tone: number; faded?: boolean }
/** One group of bars (e.g. a hospital), with a value per series in the same order as `series`. */
export interface ChartGroup { label: string; title?: string; values: readonly number[] }

const percent = (part: number, whole: number) => `${whole > 0 ? Math.round((Math.max(part, 0) / whole) * 1000) / 10 : 0}%`;
const tone = (item: ChartSeries) => `tone-${item.tone % 8}${item.faded ? ' is-faded' : ''}`;
const fillClass = (item: ChartSeries) => `grouped-chart-fill ${tone(item)}`;

/**
 * `compact` draws thin bars for the small charts on fund cards.
 * กราฟแท่งหลายชุด drawn with CSS: each group is a row, with one bar per series (or one stacked bar), and every bar carries
 * its series name and value as text. Used where the legacy page drew Chart.js bars by hospital, fund and ปีงบ.
 */
export function GroupedBarChart({ groups, series, stacked = false, compact = false, valueFormat, ariaLabel, emptyText = 'ไม่มีข้อมูล' }: { groups: readonly ChartGroup[]; series: readonly ChartSeries[]; stacked?: boolean; compact?: boolean; valueFormat: (value: number) => string; ariaLabel: string; emptyText?: string }) {
  if (groups.length === 0 || series.length === 0) return <figure className="grouped-chart is-empty" aria-label={ariaLabel}><p>{emptyText}</p></figure>;
  const total = (group: ChartGroup) => group.values.reduce((sum, value) => sum + Math.max(value, 0), 0);
  const largest = Math.max(...groups.map((group) => (stacked ? total(group) : Math.max(...group.values, 0))), 0);
  return <figure className={`grouped-chart${compact ? ' is-compact' : ''}`} aria-label={ariaLabel}>
    <figcaption className="grouped-chart-legend">{series.map((item) => <span key={item.name}><i className={`grouped-chart-swatch ${tone(item)}`} aria-hidden="true" />{item.name}</span>)}</figcaption>
    <ul>{groups.map((group, index) => <li key={`${group.label}-${index}`} title={group.title}>
      <span className="grouped-chart-label">{group.label}</span>
      <span className="grouped-chart-bars">
        {stacked
          ? <span className="grouped-chart-bar">
            <span className="grouped-chart-track" style={{ '--bar-size': percent(total(group), largest) } as CSSProperties}>
              {series.map((item, at) => <span key={item.name} className={fillClass(item)} title={`${item.name}: ${valueFormat(group.values[at] ?? 0)}`} style={{ '--bar-size': percent(group.values[at] ?? 0, total(group)) } as CSSProperties} />)}
            </span>
            <span className="grouped-chart-value">{valueFormat(total(group))}</span>
          </span>
          : series.map((item, at) => <span key={item.name} className="grouped-chart-bar">
            <span className={fillClass(item)} style={{ '--bar-size': percent(group.values[at] ?? 0, largest) } as CSSProperties} />
            <span className="grouped-chart-value"><span className="visually-hidden">{item.name} </span>{valueFormat(group.values[at] ?? 0)}</span>
          </span>)}
      </span>
    </li>)}</ul>
  </figure>;
}
