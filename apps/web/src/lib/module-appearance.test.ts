import type { Database } from '@backoffice/db';
import { describe, expect, it, vi } from 'vitest';
import { appearanceCss, readModuleAppearance, withAppearance } from './module-appearance';
import { moduleRegistry } from './modules';

describe('สีและไอคอนของโมดูล', () => {
  it('writes one --accent rule per chosen colour and nothing for a default', () => {
    expect(appearanceCss({ hr: { color: '#be185d', icon: null }, leave: { color: null, icon: 'heart' } })).toBe('[data-module="hr"]:not([data-default-accent]){--accent:#be185d}');
    expect(appearanceCss({})).toBe('');
  });

  it('never lets a value outside the palette or a strange module code into the CSS', () => {
    expect(appearanceCss({ hr: { color: 'red}body{display:none' as never, icon: null } })).toBe('');
    expect(appearanceCss({ 'hr"]{x:y}[a': { color: '#be185d', icon: null } })).toBe('');
  });

  it('swaps in a chosen icon and keeps the registry icon otherwise', () => {
    const hr = moduleRegistry.find((entry) => entry.code === 'hr')!;
    const leave = moduleRegistry.find((entry) => entry.code === 'leave')!;
    const [changed, kept] = withAppearance([hr, leave], { hr: { color: null, icon: 'heart' } });
    expect(changed).toMatchObject({ code: 'hr', icon: 'heart' });
    expect(kept).toBe(leave);
  });

  it('counts an unreadable setting (no migration yet, database down) as no choices', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const query = vi.fn(async () => { throw Object.assign(new Error('no column'), { code: 'ER_BAD_FIELD_ERROR' }); });
    await expect(readModuleAppearance({ query } as unknown as Database)).resolves.toEqual({});
    expect(error).toHaveBeenCalledWith('module_appearance_failed', 'ER_BAD_FIELD_ERROR');
  });
});
