import type { PositionCategory } from '@backoffice/contracts';
import { t, type MessageKey } from '@backoffice/i18n';

export const categoryLabelKeys: Record<PositionCategory, MessageKey> = { GENERAL: 'hrCategoryGeneral', ACADEMIC: 'hrCategoryAcademic', DIRECTOR: 'hrCategoryDirector', EXECUTIVE: 'hrCategoryExecutive', NONE: 'hrCategoryNone' };

/** "ปฏิบัติงาน – อาวุโส", one level alone, or ไม่มีระดับ. */
export function levelRange(levels: readonly string[]): string {
  if (levels.length === 0) return t('hrCategoryNone');
  return levels.length === 1 ? levels[0]! : `${levels[0]} – ${levels.at(-1)}`;
}
