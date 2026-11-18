import { describe, expect, it } from 'vitest';
import { ttmRules } from '@backoffice/core';
import { ttmConfigText, ttmSettingsFromEnv, TTM_ENV_KEYS } from './ttm-config';

describe('ttmSettingsFromEnv', () => {
  it('reads the legacy TTM_* names and leaves unset ones out', () => {
    const env: Record<string, string> = { TTM_AUTO_DETECT: 'false', TTM_RIGHT_MAP: '99:cash', TTM_AFTER_HOURS_FROM: '15:30', TTM_HERB_ICODES: '' };
    expect(ttmSettingsFromEnv((name) => env[name])).toEqual({ auto_detect: 'false', right_map: '99:cash', after_hours_from: '15:30', herb_icodes: '' });
  });

  it('knows the nine legacy settings', () => {
    expect(TTM_ENV_KEYS).toEqual(['TTM_AUTO_DETECT', 'TTM_MASSAGE_INCOME', 'TTM_HERB_INCOME', 'TTM_MASSAGE_ICODES', 'TTM_HERB_ICODES', 'TTM_OPD_FEE_ICODES', 'TTM_AFTER_HOURS_FROM', 'TTM_KIND_MAP', 'TTM_RIGHT_MAP']);
  });
});

describe('ttmConfigText', () => {
  it('prints the settings the way the legacy mapping page did', () => {
    const text = ttmConfigText(ttmRules({ right_map: '99:cash', kind_map: '' }));
    expect(text.split('\n')[0]).toBe('TTM_AUTO_DETECT=true   (true = รายการที่ไม่ได้ตั้งรหัส ให้เดาจากชื่อรายการ/หมวดรายได้)');
    expect(text).toContain('\nTTM_MASSAGE_INCOME=(ว่าง)\n');
    expect(text).toContain('\nTTM_OPD_FEE_ICODES=3015968\n');
    expect(text).toContain('TTM_KIND_MAP=3015174:thai_massage,3015003:thai_massage');
    expect(text.split('\n').at(-1)).toBe('TTM_RIGHT_MAP=99:cash');
  });
});
