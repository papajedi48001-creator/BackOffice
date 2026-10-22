import type { InventoryUnitKind } from '@backoffice/contracts';

// The Bangkok calendar helpers already live with room booking; inventory uses the same ones.
export { bangkokDate, buddhistYear } from '../rooms/booking-days';

export interface ComputedLine { unitFactor: number; issueQuantity: number; lineTotal: string; unitCost: string; }

/** Money is worked in whole satang and unit cost in 1/10000 baht, so no float error reaches the ledger. */
export function computeLine(input: { unitKind: InventoryUnitKind; quantity: number; unitPrice: number; purchaseUnitFactor: number }): ComputedLine {
  const priceSatang = Math.round(input.unitPrice * 100);
  if (Math.abs(input.unitPrice * 100 - priceSatang) > 1e-6) throw new Error('INVALID_LINE');
  const unitFactor = input.unitKind === 'PURCHASE' ? input.purchaseUnitFactor : 1;
  const issueQuantity = input.quantity * unitFactor;
  if (!Number.isSafeInteger(issueQuantity)) throw new Error('INVALID_LINE');
  const lineTotalSatang = BigInt(input.quantity) * BigInt(priceSatang);
  const quantity = BigInt(issueQuantity);
  // Half-up rounding of lineTotalSatang * 100 / issueQuantity.
  const unitCostTenThousandths = (lineTotalSatang * 200n + quantity) / (2n * quantity);
  return { unitFactor, issueQuantity, lineTotal: fixed(lineTotalSatang, 2), unitCost: fixed(unitCostTenThousandths, 4) };
}

function fixed(value: bigint, decimals: number): string {
  const digits = value.toString().padStart(decimals + 1, '0');
  return `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`;
}

export function formatReference(prefix: 'RC' | 'OB' | 'LT', year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(prefix === 'LT' ? 6 : 4, '0')}`;
}

/** Lots in the order they should be handed out: earliest expiry first, then oldest receipt; empty and expired lots are left out. */
export function issueOrder<T extends { expiryDate: string | null; receivedAt: Date; onHandQuantity: number }>(lots: T[], today: string): T[] {
  return lots
    .filter((lot) => lot.onHandQuantity > 0 && (lot.expiryDate === null || lot.expiryDate >= today))
    .sort((left, right) => {
      if (left.expiryDate !== right.expiryDate) {
        if (left.expiryDate === null) return 1;
        if (right.expiryDate === null) return -1;
        return left.expiryDate < right.expiryDate ? -1 : 1;
      }
      return left.receivedAt.getTime() - right.receivedAt.getTime();
    });
}
