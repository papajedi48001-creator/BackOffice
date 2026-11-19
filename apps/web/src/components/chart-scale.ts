/** About this many steps on a value axis (the chosen Smart Money chart style, 2026-11-19). */
const TARGET_STEPS = 6;
const NICE = [1, 2, 2.5, 5, 10];

/** The value axis of a กราฟแท่ง: round steps (1, 2, 2.5 or 5 × 10ⁿ) from 0 up to the first step at or above `largest`. */
export function niceScale(largest: number): { top: number; ticks: number[] } {
  if (!(largest > 0)) return { top: 1, ticks: [0, 1] };
  const rough = largest / TARGET_STEPS;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = NICE.find((nice) => nice * magnitude >= rough)! * magnitude;
  const count = Math.max(1, Math.ceil(largest / step - 1e-9));
  const ticks = Array.from({ length: count + 1 }, (_, index) => Number((index * step).toPrecision(12)));
  return { top: ticks[count]!, ticks };
}

const plain = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/** Tick text: millions as `2.5 ล.`, anything smaller with thousands separators. */
export function axisLabel(value: number): string {
  return Math.abs(value) >= 1_000_000 ? `${plain.format(value / 1_000_000)} ล.` : plain.format(value);
}
