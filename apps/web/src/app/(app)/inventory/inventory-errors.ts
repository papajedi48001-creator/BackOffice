import { t, type MessageKey } from '@backoffice/i18n';

/** Thai text for an error code from /api/inventory; unknown codes get the generic failure text. */
export function inventoryErrorText(code: unknown): string {
  return (t(`inventoryError${String(code)}` as MessageKey) as string | undefined) ?? t('inventoryActionFailed');
}
