import type { CSSProperties, ReactNode } from 'react';
import { axisLabel } from './chart-scale';

/**
 * The frame every Smart Money กราฟแท่ง shares (style chosen 2026-11-19): a value axis on the left with a gridline at every tick,
 * the bars upright in a row that scrolls sideways when there are many, names slanted under the bars, and an optional axis title.
 * `children` is the list of bar groups; the axis is decoration (`aria-hidden`) because every bar carries its value as text.
 */
export function ChartFrame({ className, ariaLabel, legend, ticks, compact = false, axisTitle, children }: { className: string; ariaLabel: string; legend?: ReactNode; ticks: readonly number[]; compact?: boolean; axisTitle?: string; children: ReactNode }) {
  const steps = ticks.length - 1;
  return <figure className={`chart-frame ${className}${compact ? ' is-compact' : ''}`} aria-label={ariaLabel}>
    {legend}
    <div className="chart-body" style={{ '--chart-steps': steps } as CSSProperties}>
      <div className="chart-scroll">{children}</div>
      <ol className="chart-axis" aria-hidden="true">
        {ticks.map((tick, index) => <li key={tick} style={{ '--tick-at': `${(index / steps) * 100}%` } as CSSProperties}>{axisLabel(tick)}</li>)}
      </ol>
    </div>
    {axisTitle && <p className="chart-axis-title">{axisTitle}</p>}
  </figure>;
}
