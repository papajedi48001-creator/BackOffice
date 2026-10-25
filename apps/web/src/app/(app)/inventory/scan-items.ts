import type { ItemListRow, ScanItem } from '@backoffice/core';

export const toScanItem = (item: ItemListRow): ScanItem => ({ id: item.id, code: item.code, name: item.name, issueUnit: item.issueUnit, purchaseUnit: item.purchaseUnit, purchaseUnitFactor: item.purchaseUnitFactor, tracksExpiry: item.tracksExpiry, isActive: item.isActive });
