export interface Bar { label: string; sublabel?: string; value: number; secondary?: number; note?: string }

/**
 * กราฟแท่ง for dashboards, drawn with CSS (no chart library). Every bar shows its value as text, never colour alone.
 * `auto` lays the bars on their side when there are more than 8, as the legacy Smart Money charts did.
 */
export function BarChart({ bars, orientation = 'auto', valueFormat, ariaLabel, legend }: { bars: readonly Bar[]; orientation?: 'auto' | 'vertical' | 'horizontal'; valueFormat: (value: number) => string; ariaLabel: string; legend?: readonly [string, string] }) {
  if (bars.length === 0) return <figure className="bar-chart is-empty" aria-label={ariaLabel}><p>ไม่มีข้อมูล</p></figure>;
  const direction = orientation === 'auto' ? (bars.length > 8 ? 'horizontal' : 'vertical') : orientation;
  const largest = Math.max(...bars.flatMap((bar) => [bar.value, bar.secondary ?? 0]), 0);
  const size = (value: number) => `${largest > 0 ? Math.round((Math.max(value, 0) / largest) * 1000) / 10 : 0}%`;
  const fill = (value: number, series: 'primary' | 'secondary', name?: string) => <span className={`bar-chart-bar is-${series}`}>
    <span className="bar-chart-fill" style={{ '--bar-size': size(value) } as React.CSSProperties} />
    <span className="bar-chart-value">{name && <span className="visually-hidden">{name} </span>}{valueFormat(value)}</span>
  </span>;
  return <figure className="bar-chart" data-orientation={direction} aria-label={ariaLabel}>
    {legend && <figcaption className="bar-chart-legend"><span className="is-primary">{legend[0]}</span><span className="is-secondary">{legend[1]}</span></figcaption>}
    <ul>{bars.map((bar, index) => <li key={`${bar.label}-${index}`} title={bar.note}>
      <span className="bar-chart-bars">{fill(bar.value, 'primary', legend?.[0])}{bar.secondary !== undefined && fill(bar.secondary, 'secondary', legend?.[1])}</span>
      <span className="bar-chart-label">{bar.label}{bar.sublabel && <small>{bar.sublabel}</small>}</span>
    </li>)}</ul>
  </figure>;
}
