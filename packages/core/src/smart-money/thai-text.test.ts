import { describe, expect, it } from 'vitest';
import { fixThaiText } from './thai-text';

describe('fixThaiText', () => {
  it('re-reads TIS-620 bytes that arrived as latin1', () => {
    expect(fixThaiText('¡ÒÃ')).toBe('การ');
    expect(fixThaiText('¿Ñ¹¼Ø')).toBe('ฟันผุ');
  });
  it('leaves real Thai, codes and empty text alone', () => {
    expect(fixThaiText('การ')).toBe('การ');
    expect(fixThaiText('K02.1')).toBe('K02.1');
    expect(fixThaiText('')).toBe('');
  });
});
