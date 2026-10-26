import type { InventoryReceiptStatus } from '@backoffice/contracts';

export type OpeningView = 'start' | 'missing' | 'edit' | 'draft' | 'waiting' | 'decide' | 'certified';

/** Which part of the opening balance page a person sees; the services check the same rules again. */
export function openingView(status: InventoryReceiptStatus | null, access: { canEdit: boolean; canDecide: boolean }): OpeningView {
  if (status === null) return access.canEdit ? 'start' : 'missing';
  if (status === 'DRAFT') return access.canEdit ? 'edit' : 'draft';
  if (status === 'SUBMITTED') return access.canDecide ? 'decide' : 'waiting';
  return 'certified';
}
