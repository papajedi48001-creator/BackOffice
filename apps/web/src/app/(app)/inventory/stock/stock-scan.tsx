'use client';

import { useRouter } from 'next/navigation';
import { ScanField } from '../scan-field';

/** Scanning on the stock page opens the scanned item's stock card. */
export function StockScan() {
  const router = useRouter();
  return <ScanField onResult={(result) => router.push(`/inventory/stock/${result.item.id}`)} />;
}
