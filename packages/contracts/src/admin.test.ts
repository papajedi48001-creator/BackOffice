import { describe, expect, it } from 'vitest';
import { adminGrantInputSchema, adminModuleAppearanceInputSchema, adminPersonRolesInputSchema, moduleAccentPalette, moduleCodeSchema, moduleIconNames } from './admin';

describe('admin contracts', () => {
  it('accepts only grantable roles and a person id', () => {
    expect(adminGrantInputSchema.safeParse({ personId: '0b6f3c1e-5d1a-4c8e-9a51-2f7c1d9e8b10', roleName: 'fleet-manager' }).success).toBe(true);
    expect(adminGrantInputSchema.safeParse({ personId: '0b6f3c1e-5d1a-4c8e-9a51-2f7c1d9e8b10', roleName: 'data-exporter' }).success).toBe(false);
    expect(adminPersonRolesInputSchema.safeParse({ roleNames: ['admin', 'hr-manager'] }).success).toBe(true);
  });

  it('accepts module codes and nothing path-like', () => {
    expect(moduleCodeSchema.safeParse('official-travel').success).toBe(true);
    expect(moduleCodeSchema.safeParse('../x').success).toBe(false);
  });
});

describe('สีและไอคอนของโมดูล', () => {
  it('accepts a palette colour and a known icon, or null for the default', () => {
    expect(adminModuleAppearanceInputSchema.parse({ color: '#0f766e', icon: 'people' })).toEqual({ color: '#0f766e', icon: 'people' });
    expect(adminModuleAppearanceInputSchema.parse({ color: null, icon: null })).toEqual({ color: null, icon: null });
  });
  it('refuses a colour outside the palette, anything that could reach CSS, and an unknown icon', () => {
    expect(adminModuleAppearanceInputSchema.safeParse({ color: '#123456', icon: null }).success).toBe(false);
    expect(adminModuleAppearanceInputSchema.safeParse({ color: 'red;}body{display:none', icon: null }).success).toBe(false);
    expect(adminModuleAppearanceInputSchema.safeParse({ color: null, icon: 'rocket' }).success).toBe(false);
    expect(adminModuleAppearanceInputSchema.safeParse({ color: null, icon: null, extra: 1 }).success).toBe(false);
  });
  it('keeps white text readable on every palette colour (at least 4.5:1)', () => {
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    for (const color of moduleAccentPalette) expect(1.05 / (luminance(color) + 0.05)).toBeGreaterThanOrEqual(4.5);
    expect(moduleIconNames).toContain('home');
  });
});
