import type { CSSProperties } from 'react';
import { ChartFrame } from './chart-frame';
import { niceScale } from './chart-scale';

/** One series (e.g. a ปีงบ or a กองทุน). `tone` picks `--chart-<tone>`; `faded` draws an earlier year lighter, as the legacy charts did. */
export interface ChartSeries { name: string; tone: number; faded?: boolean }
/** One group of bars (e.g. a hospital), with a value per series in the same order as `series`. */
export interface ChartGroup { label: string; title?: string; values: readonly number[] }

const percent = (part: number, whole: number) => `${whole > 0 ? Math.round((Math.max(part, 0) / whole) * 1000) / 10 : 0}%`;
const tone = (item: ChartSeries) => `tone-${item.tone % 8}${item.faded ? ' is-faded' : ''}`;
const fillClass = (item: ChartSeries) => `grouped-chart-fill ${tone(item)}`;

/**
 * กราฟแท่งหลายชุด, upright in `ChartFrame`: each group (e.g. a hospital) is a column with one bar per series side by side, or one
 * stacked bar. Every bar carries its series name and value as screen-reader text and in the tooltip. `compact` is the small size
 * for the fund cards.
 */
export function GroupedBarChart({ groups, series, stacked = false, compact = false, valueFormat, ariaLabel, emptyText = 'ไม่มีข้อมูล', axisTitle }: { groups: readonly ChartGroup[]; series: readonly ChartSeries[]; stacked?: boolean; compact?: boolean; valueFormat: (value: number) => string; ariaLabel: string; emptyText?: string; axisTitle?: string }) {
  if (groups.length === 0 || series.length === 0) return <figure className="grouped-chart is-empty" aria-label={ariaLabel}><p>{emptyText}</p></figure>;
  const total = (group: ChartGroup) => group.values.reduce((sum, value) => sum + Math.max(value, 0), 0);
  const { top, ticks } = niceScale(Math.max(...groups.map((group) => (stacked ? total(group) : Math.max(...group.values)))));
  const tooltip = (group: ChartGroup) => [group.title ?? group.label, ...series.map((item, at) => `${item.name}: ${valueFormat(group.values[at] ?? 0)}`), ...(stacked ? [`รวม: ${valueFormat(total(group))}`] : [])].join(' · ');
  return <ChartFrame className="grouped-chart" ariaLabel={ariaLabel} ticks={ticks} compact={compact} axisTitle={axisTitle}
    legend={<figcaption className="grouped-chart-legend">{series.map((item) => <span key={item.name}><i className={`grouped-chart-swatch ${tone(item)}`} aria-hidden="true" />{item.name}</span>)}</figcaption>}>
    <ul className="chart-columns">{groups.map((group, index) => <li key={`${group.label}-${index}`} title={tooltip(group)}>
      <span className="chart-plot grouped-chart-bars">
        {stacked
          ? <span className="grouped-chart-bar">
            <span className="grouped-chart-track" style={{ '--bar-size': percent(total(group), top) } as CSSProperties}>
              {series.map((item, at) => <span key={item.name} className={fillClass(item)} style={{ '--bar-size': percent(group.values[at] ?? 0, total(group)) } as CSSProperties} />)}
            </span>
            <span className="grouped-chart-value">{valueFormat(total(group))}</span>
          </span>
          : series.map((item, at) => <span key={item.name} className="grouped-chart-bar">
            <span className={fillClass(item)} style={{ '--bar-size': percent(group.values[at] ?? 0, top) } as CSSProperties} />
            <span className="grouped-chart-value"><span className="visually-hidden">{item.name} </span>{valueFormat(group.values[at] ?? 0)}</span>
          </span>)}
      </span>
      <span className="chart-label grouped-chart-label">{group.label}</span>
    </li>)}</ul>
  </ChartFrame>;
}
