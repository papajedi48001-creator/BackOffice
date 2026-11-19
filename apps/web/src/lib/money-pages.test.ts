import { describe, expect, it } from 'vitest';
import { t } from '@backoffice/i18n';
import { MONEY_PAGES } from './money-pages';

describe('Smart Money page names', () => {
  it('calls /money/disability กองทุนฟื้นฟูสมรรถภาพ in the menu and on the overview, with Monitor IMC in its description', () => {
    expect(t('moneyDisability')).toBe('กองทุนฟื้นฟูสมรรถภาพ');
    expect(MONEY_PAGES.disability.title).toBe('กองทุนฟื้นฟูสมรรถภาพ');
    expect(MONEY_PAGES.disability.description).toMatch(/^Monitor IMC/);
  });
});
