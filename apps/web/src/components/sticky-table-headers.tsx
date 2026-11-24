'use client';

import { useEffect } from 'react';
import { findScrollContainer, headShift, STICKY_CHROME_SELECTOR, stickyChromeBottom } from '../lib/sticky-table-head';

/**
 * กฎตาราง (DESIGN.md): keeps every table head pinned under the sticky bars. `thead` is sticky in
 * styles.css; this marks tables that scroll with the page (`data-sticky-head="page"`, pinned at
 * --table-sticky-top) and, for a table inside a scroll box (wide tables scroll sideways), moves its
 * head down with --thead-shift when the page scrolls. Mounted once in the root layout, so new tables
 * need nothing extra.
 */
export function StickyTableHeaders() {
  useEffect(() => {
    const boxes = new WeakMap<HTMLTableElement, Element | null>();
    let frame = 0;
    const sync = () => {
      frame = 0;
      const chrome = stickyChromeBottom([...document.querySelectorAll(STICKY_CHROME_SELECTOR)]);
      // Read everything first, then write, so the browser lays out once per frame.
      const writes: Array<() => void> = [];
      for (const table of document.querySelectorAll('table')) {
        const thead = table.tHead;
        if (!thead) continue;
        if (!boxes.has(table)) boxes.set(table, findScrollContainer(table));
        const box = boxes.get(table)!;
        // A popup is its own scroll area: the head pins to its top, never to the page bars.
        const inPopup = table.closest('dialog') !== null;
        const mode = box || inPopup ? 'box' : 'page';
        let shift = 0;
        if (box && !inPopup) {
          const current = Number.parseFloat(table.style.getPropertyValue('--thead-shift')) || 0;
          const headRect = thead.getBoundingClientRect();
          const limitBottom = Math.min(table.getBoundingClientRect().bottom, box.getBoundingClientRect().bottom);
          shift = Math.round(headShift({ chrome, headTop: headRect.top - current, headHeight: headRect.height, limitBottom }));
        }
        writes.push(() => {
          if (table.dataset.stickyHead !== mode) table.dataset.stickyHead = mode;
          if (shift > 0) table.style.setProperty('--thead-shift', `${shift}px`);
          else table.style.removeProperty('--thead-shift');
        });
      }
      document.documentElement.style.setProperty('--table-sticky-top', `${chrome}px`);
      for (const write of writes) write();
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(sync); };
    const relayout = () => { for (const table of document.querySelectorAll('table')) boxes.delete(table); schedule(); };
    sync();
    const observer = new MutationObserver(relayout);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', relayout);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', relayout);
    };
  }, []);
  return null;
}
