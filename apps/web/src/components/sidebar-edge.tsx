'use client';

import { useEffect, useRef } from 'react';
import { SIDEBAR_MAX, SIDEBAR_RAIL, SIDEBAR_SNAP, clampSidebarWidth, isSidebarRail, nextToggleWidth, type SidebarWidth } from '../lib/sidebar-width';

const STEP = 24;
const DRAG_START = 4;

function widthState(width: number, lastWide: number): SidebarWidth {
  return isSidebarRail(width) ? { width, lastWide } : { width, lastWide: width };
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

/**
 * เมนูซ้ายลากปรับขนาด (DESIGN.md, "แท็บขอบ"): the right edge of the menu can be dragged or moved with the arrow keys,
 * and the tab on it folds the menu to the rail and back. Ctrl B does the same outside text fields.
 */
export function SidebarEdge({ state, onChange }: { state: SidebarWidth; onChange: (next: SidebarWidth) => void }) {
  const edge = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);
  const latest = useRef({ state, onChange });
  latest.current = { state, onChange };
  const rail = isSidebarRail(state.width);
  const toggle = () => onChange(nextToggleWidth(state));

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'b' || isTyping(event.target)) return;
      event.preventDefault();
      latest.current.onChange(nextToggleWidth(latest.current.state));
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const element = event.currentTarget;
    const shell = element.closest<HTMLElement>('.app-shell');
    const startX = event.clientX;
    const startWidth = state.width;
    let raw = startWidth;
    let moving = false;
    dragged.current = false;
    element.setPointerCapture?.(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      if (!moving && Math.abs(moveEvent.clientX - startX) < DRAG_START) return;
      if (!moving) { moving = true; dragged.current = true; shell?.classList.add('is-resizing'); }
      raw = Math.max(72, Math.min(SIDEBAR_MAX, startWidth + moveEvent.clientX - startX));
      // Preview straight on the shell while dragging; React state is set once on release.
      shell?.style.setProperty('--sidebar-w', `${isSidebarRail(raw) ? SIDEBAR_RAIL : raw}px`);
      shell?.toggleAttribute('data-sidebar-rail', raw <= SIDEBAR_SNAP);
    };
    const up = () => {
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', up);
      shell?.classList.remove('is-resizing');
      if (moving) onChange(widthState(clampSidebarWidth(raw), state.lastWide));
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.target !== edge.current) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const from = rail ? (event.key === 'ArrowRight' ? SIDEBAR_SNAP : SIDEBAR_RAIL) : state.width;
    onChange(widthState(clampSidebarWidth(from + (event.key === 'ArrowRight' ? STEP : -STEP)), state.lastWide));
  }

  return <div ref={edge} className="sidebar-edge" role="separator" aria-orientation="vertical" aria-label="ความกว้างเมนู ลากหรือกดลูกศรซ้ายขวาเพื่อปรับ"
    aria-valuemin={SIDEBAR_RAIL} aria-valuemax={SIDEBAR_MAX} aria-valuenow={state.width} tabIndex={0} onPointerDown={onPointerDown} onKeyDown={onKeyDown}>
    <button type="button" className="sidebar-tab" aria-label={rail ? 'ขยายเมนู' : 'ย่อเมนู'} aria-expanded={!rail} title={`${rail ? 'ขยายเมนู' : 'ย่อเมนู'} (Ctrl B)`}
      onClick={() => { if (dragged.current) { dragged.current = false; return; } toggle(); }}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
    </button>
  </div>;
}
