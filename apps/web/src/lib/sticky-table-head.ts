/**
 * กฎตาราง (DESIGN.md): every table head stays pinned at the top while its rows scroll,
 * whether the page scrolls or the box around the table does. `position: sticky` on `thead`
 * covers the page and the box; these helpers cover a table inside a box (overflow-x for wide
 * tables) when the *page* scrolls, which sticky alone cannot do.
 */

/** Bars that already stick to the top of the page; table heads sit just under the lowest one. */
export const STICKY_CHROME_SELECTOR = '.app-topbar, .module-subnav, .imc-range';

const SCROLL_BOX = /^(auto|scroll|hidden|overlay)$/;

/** The nearest element (the table itself included) that clips or scrolls its content, or null when the table scrolls with the page. */
export function findScrollContainer(table: Element): Element | null {
  for (let el: Element | null = table; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    const style = getComputedStyle(el);
    if (SCROLL_BOX.test(style.overflowX) || SCROLL_BOX.test(style.overflowY) || SCROLL_BOX.test(style.overflow)) return el;
  }
  return null;
}

/** Lowest edge of the sticky bars once they are stuck: their `top` plus their height. */
export function stickyChromeBottom(elements: Element[], height: (el: Element) => number = (el) => el.getBoundingClientRect().height): number {
  let bottom = 0;
  for (const el of elements) {
    const style = getComputedStyle(el);
    if (style.position !== 'sticky' && style.position !== 'fixed') continue;
    if (style.display === 'none') continue;
    bottom = Math.max(bottom, (Number.parseFloat(style.top) || 0) + height(el));
  }
  return bottom;
}

/**
 * How far (px) to move a boxed table's head down so it sits under the sticky bars.
 * `headTop`: the head's viewport top without any shift; `limitBottom`: the lower of the table's and the box's bottom.
 */
export function headShift({ chrome, headTop, headHeight, limitBottom }: { chrome: number; headTop: number; headHeight: number; limitBottom: number }): number {
  const wanted = chrome - headTop;
  const most = limitBottom - headHeight - headTop;
  return Math.max(0, Math.min(wanted, most));
}
