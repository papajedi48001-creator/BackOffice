import { describe, expect, it } from 'vitest';
import { SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_RAIL, clampSidebarWidth, isSidebarRail, nextToggleWidth, parseSidebarCookie, serializeSidebarCookie } from './sidebar-width';

describe('ความกว้างเมนูซ้าย', () => {
  it('snaps anything 170px or narrower to the 92px rail and caps the width at 360px', () => {
    expect(clampSidebarWidth(170)).toBe(SIDEBAR_RAIL);
    expect(clampSidebarWidth(40)).toBe(SIDEBAR_RAIL);
    expect(clampSidebarWidth(171)).toBe(171);
    expect(clampSidebarWidth(250.6)).toBe(251);
    expect(clampSidebarWidth(900)).toBe(SIDEBAR_MAX);
    expect(SIDEBAR_RAIL).toBe(92);
    expect(SIDEBAR_MAX).toBe(360);
    expect(isSidebarRail(SIDEBAR_RAIL)).toBe(true);
    expect(isSidebarRail(SIDEBAR_DEFAULT)).toBe(false);
  });

  it('reads the saved width and the last wide width from the cookie, falling back to 272px', () => {
    expect(parseSidebarCookie(undefined)).toEqual({ width: 272, lastWide: 272 });
    expect(parseSidebarCookie('garbage')).toEqual({ width: 272, lastWide: 272 });
    expect(parseSidebarCookie('92:300')).toEqual({ width: 92, lastWide: 300 });
    expect(parseSidebarCookie('9999:10')).toEqual({ width: 360, lastWide: 272 });
    expect(serializeSidebarCookie({ width: 92, lastWide: 300 })).toBe('92:300');
  });

  it('folds a wide menu to the rail and opens a rail back to the last wide width', () => {
    expect(nextToggleWidth({ width: 300, lastWide: 300 })).toEqual({ width: 92, lastWide: 300 });
    expect(nextToggleWidth({ width: 92, lastWide: 240 })).toEqual({ width: 240, lastWide: 240 });
  });
});
