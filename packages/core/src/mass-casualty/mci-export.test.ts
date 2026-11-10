import { describe, expect, it } from 'vitest';
import { csvOf } from './mci-export';

describe('csvOf', () => {
  it('starts with a BOM for Excel, quotes every cell and neutralises formulas', () => {
    expect(csvOf([['ชื่อ', 'HN'], ['สมชาย "เล็ก"', '=1+1'], ['a,b', null]])).toBe('﻿"ชื่อ","HN"\r\n"สมชาย ""เล็ก""","\'=1+1"\r\n"a,b",""\r\n');
  });
});
