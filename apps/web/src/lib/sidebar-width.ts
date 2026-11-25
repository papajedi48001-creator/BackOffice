/** เมนูซ้ายลากปรับขนาด (DESIGN.md): widths in px. 170px or narrower snaps to the rail (icon with its name under it). */
export const SIDEBAR_RAIL = 92;
export const SIDEBAR_SNAP = 170;
export const SIDEBAR_DEFAULT = 272;
export const SIDEBAR_MAX = 360;
export const SIDEBAR_COOKIE = 'bo_sidebar';

export interface SidebarWidth { width: number; lastWide: number }

export function clampSidebarWidth(raw: number): number {
  if (!Number.isFinite(raw) || raw <= SIDEBAR_SNAP) return SIDEBAR_RAIL;
  return Math.min(SIDEBAR_MAX, Math.round(raw));
}

export function isSidebarRail(width: number): boolean { return width <= SIDEBAR_SNAP; }

/** Cookie value `width:lastWide`; anything unreadable falls back to the default width. */
export function parseSidebarCookie(value: string | undefined): SidebarWidth {
  const [w, l] = (value ?? '').split(':').map(Number);
  const width = w === undefined || !Number.isFinite(w) || w <= 0 ? SIDEBAR_DEFAULT : clampSidebarWidth(w);
  const lastWide = l === undefined || !Number.isFinite(l) || isSidebarRail(clampSidebarWidth(l)) ? SIDEBAR_DEFAULT : clampSidebarWidth(l);
  return { width, lastWide };
}

export function serializeSidebarCookie({ width, lastWide }: SidebarWidth): string { return `${width}:${lastWide}`; }

export function nextToggleWidth({ width, lastWide }: SidebarWidth): SidebarWidth {
  return isSidebarRail(width) ? { width: lastWide, lastWide } : { width: SIDEBAR_RAIL, lastWide: width };
}
