# Smart Money: กราฟแท่งแนวตั้งทุกกราฟ

## Intent
wasan picked one style for every chart in the Smart Money module (screenshot of the NHSO fund cards, 2026-11-19): upright bars,
a value axis on the left with gridlines, hospital/category names slanted under each bar, an optional axis title below. Same look
on every page (dental, nhso, fdh, disability, ttm, herb), so the module reads as one system.

## Decisions
- `BarChart` and `GroupedBarChart` always draw upright bars. `orientation` is removed; nothing lays bars on their side.
- Value axis: ~5 "nice" steps (1, 2, 2.5, 5 × 10ⁿ) from 0 to the first step at or above the largest value. Tick text: ≥ 1,000,000
  as `8 ล.`/`2.5 ล.`, below that with thousands separators (`500,000`). Bars are sized against the axis top, not the largest bar.
- Gridline at every tick. Category labels are slanted 45° and cut with … past their width; the full text is in the tooltip.
- Values are no longer printed on the bars (the chosen style has none). Every bar keeps its value, series name, sublabel, note and
  stack note as screen-reader text and in the hover tooltip; the tables beside each chart still show the numbers. Alert text
  (e.g. `PP Workload`) stays visible after the label, so red is never the only signal.
- Many bars: the bars area scrolls sideways (bars keep a minimum width) while the value axis stays put.
- `axisTitle` (optional) prints a caption under the chart; the NHSO fund cards use `เทียบรายโรงพยาบาล`.
- Still CSS only, no chart library. Series colours, faded earlier year, stacked segments, red alert and amber stack unchanged.

## Approaches considered
1. Chart library (Chart.js/Recharts): matches the screenshot pixel for pixel but adds a dependency and canvas text for screen readers. Rejected.
2. Inline SVG: precise, but labels and tooltips get re-implemented. Rejected.
3. **CSS columns with a shared axis helper (chosen)**: keeps the existing components and tests' semantics; one helper for the scale.

## Non-goals
No change to what any chart counts or sums.
