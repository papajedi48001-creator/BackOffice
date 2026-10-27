import { z } from 'zod';

/** ก.พ. position categories. NONE is for employee positions that carry no level. */
export const positionCategorySchema = z.enum(['GENERAL', 'ACADEMIC', 'DIRECTOR', 'EXECUTIVE', 'NONE']);
export type PositionCategory = z.infer<typeof positionCategorySchema>;

/** The levels of each category, lowest first. */
export const positionCategoryLevels: Record<PositionCategory, readonly string[]> = {
  GENERAL: ['ปฏิบัติงาน', 'ชำนาญงาน', 'อาวุโส', 'ทักษะพิเศษ'],
  ACADEMIC: ['ปฏิบัติการ', 'ชำนาญการ', 'ชำนาญการพิเศษ', 'เชี่ยวชาญ', 'ทรงคุณวุฒิ'],
  DIRECTOR: ['อำนวยการต้น', 'อำนวยการสูง'],
  EXECUTIVE: ['บริหารต้น', 'บริหารสูง'],
  NONE: []
};

/** True when the levels are a contiguous run of the category's levels, in order; a category with levels needs at least one. */
export function levelsFitCategory(category: PositionCategory, levels: readonly string[]): boolean {
  const all = positionCategoryLevels[category];
  if (all.length === 0 || levels.length === 0) return all.length === 0 && levels.length === 0;
  const start = all.indexOf(levels[0]!);
  return start >= 0 && levels.every((level, index) => all[start + index] === level);
}

export const positionInputSchema = z.object({
  name: z.string().trim().min(1).max(255), category: positionCategorySchema, allowedLevels: z.array(z.string()).max(5),
  isActive: z.boolean(), sortOrder: z.number().int().min(0).max(9999)
}).strict().refine((position) => levelsFitCategory(position.category, position.allowedLevels), { path: ['allowedLevels'], message: 'LEVELS_NOT_IN_CATEGORY' });
export type PositionInput = z.infer<typeof positionInputSchema>;
export interface Position extends PositionInput { id: string; holders: number; }

/** A level may be left empty; a given level must be one the position allows. */
export function levelAllowed(allowedLevels: readonly string[], level: string | null): boolean {
  return level === null || allowedLevels.includes(level);
}

/** A position CSV sent as text. A ministry list of a few thousand positions fits well within the limit. */
export const importPositionsInputSchema = z.object({ csv: z.string().min(1).max(512 * 1024) }).strict();
