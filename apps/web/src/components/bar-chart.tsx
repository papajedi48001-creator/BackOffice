/**
 * One bar. `stack` is the part of `value` drawn in the stack colour at the bar's end (`stackNote` says what it is in text);
 * `alert` draws the bar red and shows its text under the label.
 */
export interface Bar { label: string; sublabel?: string; value: number; secondary?: number; note?: string; stack?: number; stackNote?: string; alert?: string }

/**
 * กราฟแท่ง for dashboards, drawn with CSS (no chart library). Every bar shows its value as text, never colour alone.
 * `auto` lays the bars on their side when there are more than 8, as the legacy Smart Money charts did.
 */
export function BarChart({ bars, orientation = 'auto', valueFormat, ariaLabel, legend, stackLegend }: { bars: readonly Bar[]; orientation?: 'auto' | 'vertical' | 'horizontal'; valueFormat: (value: number) => string; ariaLabel: string; legend?: readonly [string, string]; stackLegend?: readonly [string, string] }) {
  if (bars.length === 0) return <figure className="bar-chart is-empty" aria-label={ariaLabel}><p>ไม่มีข้อมูล</p></figure>;
  const direction = orientation === 'auto' ? (bars.length > 8 ? 'horizontal' : 'vertical') : orientation;
  const largest = Math.max(...bars.flatMap((bar) => [bar.value, bar.secondary ?? 0]), 0);
  const share = (part: number, whole: number) => `${whole > 0 ? Math.round((Math.max(part, 0) / whole) * 1000) / 10 : 0}%`;
  const fill = (value: number, series: 'primary' | 'secondary', name?: string, stack?: number) => <span className={`bar-chart-bar is-${series}`}>
    <span className="bar-chart-fill" style={{ '--bar-size': share(value, largest) } as React.CSSProperties}>
      {stack !== undefined && stack > 0 && <span className="bar-chart-stack" style={{ '--stack-size': share(Math.min(stack, value), value) } as React.CSSProperties} />}
    </span>
    <span className="bar-chart-value">{name && <span className="visually-hidden">{name} </span>}{valueFormat(value)}</span>
  </span>;
  const captions = legend ? { className: '', items: legend } : stackLegend ? { className: ' is-stack', items: stackLegend } : null;
  return <figure className="bar-chart" data-orientation={direction} aria-label={ariaLabel}>
    {captions && <figcaption className={`bar-chart-legend${captions.className}`}><span className="is-primary">{captions.items[0]}</span><span className="is-secondary">{captions.items[1]}</span></figcaption>}
    <ul>{bars.map((bar, index) => <li key={`${bar.label}-${index}`} title={bar.note} className={bar.alert ? 'is-alert' : undefined}>
      <span className="bar-chart-bars">{fill(bar.value, 'primary', legend?.[0], bar.stack)}{bar.secondary !== undefined && fill(bar.secondary, 'secondary', legend?.[1])}</span>
      <span className="bar-chart-label">{bar.label}{bar.sublabel && <small>{bar.sublabel}</small>}{bar.stackNote && <small className="bar-chart-stack-note">{bar.stackNote}</small>}{bar.alert && <small className="bar-chart-alert">{bar.alert}</small>}</span>
    </li>)}</ul>
  </figure>;
}
