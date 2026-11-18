'use client';

import { useState } from 'react';
import type { ChartSeries } from '../../../../components/grouped-bar-chart';
import { defaultYears } from '../../../../lib/money/nhso-views';

/**
 * ปีงบ chips: the latest two at first; the person's ticks stay when the data reloads, and a new latest ปีงบ is ticked for them.
 */
export function useYearChips(years: readonly number[]): [number[], (year: number, on: boolean) => void] {
  const key = years.join(',');
  const [state, setState] = useState<{ key: string; known: number[] | null; selected: number[] }>(() => ({ key, known: [...years], selected: defaultYears(years, null, null) }));
  let current = state;
  if (state.key !== key) {
    // The ปีงบ list changed (new data): work out the ticks now, during render, so no frame shows none ticked.
    current = { key, known: [...years], selected: defaultYears(years, state.known ? state.selected : null, state.known) };
    setState(current);
  }
  const toggle = (year: number, on: boolean) => setState((now) => ({ ...now, selected: (on ? [...new Set([...now.selected, year])] : now.selected.filter((value) => value !== year)).sort((a, b) => a - b) }));
  return [current.selected, toggle];
}

export function Chips<T extends string | number>({ label, options, selected, onToggle, render = String }: { label: string; options: readonly T[]; selected: readonly T[]; onToggle: (value: T, on: boolean) => void; render?: (value: T) => string }) {
  return <fieldset className="nhso-chips"><legend>{label}</legend>
    {options.map((option) => <label key={String(option)} className={`nhso-chip${selected.includes(option) ? ' is-on' : ''}`}>
      <input type="checkbox" checked={selected.includes(option)} onChange={(event) => onToggle(option, event.target.checked)} />{render(option)}
    </label>)}
  </fieldset>;
}

/** Year series: the latest year in the main colour, earlier years in lighter other colours, as the legacy charts did. */
export const yearSeries = (years: readonly (number | null)[], name: (year: number | null) => string): ChartSeries[] =>
  years.map((year, index) => (index === years.length - 1 ? { name: name(year), tone: 0 } : { name: name(year), tone: ((years.length - 2 - index) % 7) + 1, faded: true }));

export const yearLabel = (year: number | null) => (year ? `ปีงบ ${year}` : '');
export const percentText = (value: number | null) => (value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`);
