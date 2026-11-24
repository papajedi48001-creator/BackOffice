import { describe, expect, it } from 'vitest';
import { findScrollContainer, headShift, stickyChromeBottom } from './sticky-table-head';

describe('headShift (หัวตารางในกล่องตามการเลื่อนหน้า)', () => {
  it('stays put while the table head is still below the sticky bars', () => {
    expect(headShift({ chrome: 120, headTop: 300, headHeight: 40, limitBottom: 900 })).toBe(0);
  });
  it('moves the head down to sit just under the sticky bars once the page scrolls past it', () => {
    expect(headShift({ chrome: 120, headTop: -200, headHeight: 40, limitBottom: 900 })).toBe(320);
  });
  it('never pushes the head past the bottom of its table or box', () => {
    expect(headShift({ chrome: 120, headTop: -500, headHeight: 40, limitBottom: 100 })).toBe(560);
    expect(headShift({ chrome: 120, headTop: -500, headHeight: 40, limitBottom: -600 })).toBe(0);
  });
});

describe('findScrollContainer', () => {
  const build = (html: string) => { document.body.innerHTML = html; return document.querySelector('table')!; };
  it('finds nothing for a table that scrolls with the page', () => {
    expect(findScrollContainer(build('<div><table><thead><tr><th>a</th></tr></thead></table></div>'))).toBeNull();
  });
  it('finds a horizontal scroll box around the table', () => {
    const table = build('<div id="box" style="overflow-x: auto"><div><table><thead><tr><th>a</th></tr></thead></table></div></div>');
    expect(findScrollContainer(table)?.id).toBe('box');
  });
  it('treats overflow: hidden as a box too, and the table itself when it scrolls', () => {
    expect(findScrollContainer(build('<section id="card" style="overflow: hidden"><table></table></section>'))?.id).toBe('card');
    expect(findScrollContainer(build('<table id="t" style="overflow-x: auto"></table>'))?.id).toBe('t');
  });
  it('ignores overflow: clip, which does not make a scroll box', () => {
    expect(findScrollContainer(build('<div style="overflow: clip"><table></table></div>'))).toBeNull();
  });
});

describe('stickyChromeBottom', () => {
  it('is the lowest edge of the bars that stick to the top of the page', () => {
    document.body.innerHTML = '<div id="top" style="position: sticky; top: 0px"></div><nav id="sub" style="position: sticky; top: 84px"></nav><div id="flow"></div>';
    const heights: Record<string, number> = { top: 84, sub: 48, flow: 500 };
    const height = (el: Element) => heights[el.id] ?? 0;
    expect(stickyChromeBottom([...document.body.children], height)).toBe(132);
  });
  it('is 0 with no sticky bars', () => {
    expect(stickyChromeBottom([], () => 10)).toBe(0);
  });
});
