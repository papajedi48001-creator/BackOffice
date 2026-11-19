import type { CSSProperties } from 'react';
import { ChartFrame } from './chart-frame';
import { niceScale } from './chart-scale';

/**
 * One bar. `stack` is the part of `value` drawn in the stack colour at the bar's end (`stackNote` says what it is in text);
 * `alert` draws the bar red and shows its text after the label.
 */
export interface Bar { label: string; sublabel?: string; value: number; secondary?: number; note?: string; stack?: number; stackNote?: string; alert?: string }

const share = (part: number, whole: number) => `${whole > 0 ? Math.round((Math.max(part, 0) / whole) * 1000) / 10 : 0}%`;

/**
 * กราฟแท่ง for dashboards, drawn upright with CSS (no chart library) in `ChartFrame`. Values are on the axis and, per bar,
 * in screen-reader text and the tooltip, never colour alone.
 */
export function BarChart({ bars, valueFormat, ariaLabel, legend, stackLegend, axisTitle }: { bars: readonly Bar[]; valueFormat: (value: number) => string; ariaLabel: string; legend?: readonly [string, string]; stackLegend?: readonly [string, string]; axisTitle?: string }) {
  if (bars.length === 0) return <figure className="bar-chart is-empty" aria-label={ariaLabel}><p>ไม่มีข้อมูล</p></figure>;
  const { top, ticks } = niceScale(Math.max(...bars.flatMap((bar) => [bar.value, bar.secondary ?? 0])));
  const fill = (value: number, series: 'primary' | 'secondary', name?: string, stack?: number) => <span className={`bar-chart-bar is-${series}`}>
    <span className={`bar-chart-fill${stack ? ' is-stacked' : ''}`} style={{ '--bar-size': share(value, top) } as CSSProperties}>
      {stack !== undefined && stack > 0 && <span className="bar-chart-stack" style={{ '--stack-size': share(Math.min(stack, value), value) } as CSSProperties} />}
    </span>
    <span className="bar-chart-value">{name && <span className="visually-hidden">{name} </span>}{valueFormat(value)}</span>
  </span>;
  const tooltip = (bar: Bar) => {
    const name = `${bar.label}${bar.sublabel ? ` ${bar.sublabel}` : ''}`;
    const values = bar.secondary === undefined ? valueFormat(bar.value) : `${legend?.[0] ?? ''} ${valueFormat(bar.value)} · ${legend?.[1] ?? ''} ${valueFormat(bar.secondary)}`.trim();
    return [`${name}: ${values}`, bar.stackNote, bar.alert, bar.note].filter(Boolean).join(' · ');
  };
  const captions = legend ? { className: '', items: legend } : stackLegend ? { className: ' is-stack', items: stackLegend } : null;
  return <ChartFrame className="bar-chart" ariaLabel={ariaLabel} ticks={ticks} axisTitle={axisTitle}
    legend={captions && <figcaption className={`bar-chart-legend${captions.className}`}><span className="is-primary">{captions.items[0]}</span><span className="is-secondary">{captions.items[1]}</span></figcaption>}>
    <ul className="chart-columns">{bars.map((bar, index) => <li key={`${bar.label}-${index}`} title={tooltip(bar)} className={bar.alert ? 'is-alert' : undefined}>
      <span className="chart-plot bar-chart-bars">{fill(bar.value, 'primary', legend?.[0], bar.stack)}{bar.secondary !== undefined && fill(bar.secondary, 'secondary', legend?.[1])}</span>
      <span className="chart-label bar-chart-label"><span className="chart-label-text">{bar.label}</span>{bar.sublabel && <small className="visually-hidden"> {bar.sublabel}</small>}{bar.stackNote && <small className="visually-hidden"> {bar.stackNote}</small>}{bar.alert && <small className="bar-chart-alert"> {bar.alert}</small>}</span>
    </li>)}</ul>
  </ChartFrame>;
}
