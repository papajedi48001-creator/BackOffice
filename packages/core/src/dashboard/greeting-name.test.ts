import { describe, expect, it } from 'vitest';
import { greetingName } from './greeting-name';

describe('greetingName', () => {
  it('uses the first name on the HR record when there is one', () => {
    expect(greetingName('นางพรทิพย์ ตัวอย่างงาม', 'พรทิพย์')).toBe('พรทิพย์');
  });

  it.each([
    ['นางพรทิพย์ ตัวอย่างงาม', 'พรทิพย์'],
    ['นางสาวสุดารัตน์ ใจสมมติ', 'สุดารัตน์'],
    ['นายแพทย์ธนพล สมมติชื่อ', 'ธนพล'],
    ['เภสัชกรหญิงศิริพร สมมุติ', 'ศิริพร'],
    ['นพ. ธนพล สมมติชื่อ', 'ธนพล'],
    ['นายวีรยุทธ ทดลองศรี', 'วีรยุทธ']
  ])('drops the title and surname from %s', (displayName, expected) => {
    expect(greetingName(displayName, null)).toBe(expected);
  });

  it('gives null when there is no name at all', () => {
    expect(greetingName(null, null)).toBeNull();
    expect(greetingName('  ', null)).toBeNull();
  });
});
