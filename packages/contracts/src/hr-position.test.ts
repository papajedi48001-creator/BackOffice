import { describe, expect, it } from 'vitest';
import { levelAllowed, positionCategoryLevels, positionInputSchema } from './hr-position';

const position = { name: 'พยาบาลวิชาชีพ', category: 'ACADEMIC', allowedLevels: ['ปฏิบัติการ', 'ชำนาญการ', 'ชำนาญการพิเศษ', 'เชี่ยวชาญ'], isActive: true, sortOrder: 1 } as const;

describe('position catalogue contracts', () => {
  it('fixes the ก.พ. levels of each category in ascending order', () => {
    expect(positionCategoryLevels.GENERAL).toEqual(['ปฏิบัติงาน', 'ชำนาญงาน', 'อาวุโส', 'ทักษะพิเศษ']);
    expect(positionCategoryLevels.ACADEMIC).toEqual(['ปฏิบัติการ', 'ชำนาญการ', 'ชำนาญการพิเศษ', 'เชี่ยวชาญ', 'ทรงคุณวุฒิ']);
    expect(positionCategoryLevels.DIRECTOR).toEqual(['อำนวยการต้น', 'อำนวยการสูง']);
    expect(positionCategoryLevels.EXECUTIVE).toEqual(['บริหารต้น', 'บริหารสูง']);
    expect(positionCategoryLevels.NONE).toEqual([]);
  });

  it('accepts a contiguous run of the category levels', () => {
    expect(positionInputSchema.parse(position).allowedLevels).toEqual(position.allowedLevels);
    expect(positionInputSchema.parse({ ...position, name: '  เภสัชกร ' }).name).toBe('เภสัชกร');
    expect(positionInputSchema.parse({ ...position, category: 'NONE', allowedLevels: [] }).allowedLevels).toEqual([]);
  });

  it('refuses levels of another category, a gap, the wrong order, or none for a category that has levels', () => {
    expect(positionInputSchema.safeParse({ ...position, category: 'GENERAL' }).success).toBe(false);
    expect(positionInputSchema.safeParse({ ...position, allowedLevels: ['ปฏิบัติการ', 'ชำนาญการพิเศษ'] }).success).toBe(false);
    expect(positionInputSchema.safeParse({ ...position, allowedLevels: ['ชำนาญการ', 'ปฏิบัติการ'] }).success).toBe(false);
    expect(positionInputSchema.safeParse({ ...position, allowedLevels: [] }).success).toBe(false);
    expect(positionInputSchema.safeParse({ ...position, category: 'NONE' }).success).toBe(false);
    expect(positionInputSchema.safeParse({ ...position, name: ' ' }).success).toBe(false);
  });

  it('allows no level, or a level the position lists', () => {
    expect(levelAllowed(position.allowedLevels, null)).toBe(true);
    expect(levelAllowed(position.allowedLevels, 'ชำนาญการ')).toBe(true);
    expect(levelAllowed(['ปฏิบัติงาน', 'ชำนาญงาน', 'อาวุโส'], 'ปฏิบัติการ')).toBe(false);
    expect(levelAllowed([], 'ปฏิบัติงาน')).toBe(false);
  });
});
