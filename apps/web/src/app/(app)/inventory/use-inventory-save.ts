'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@backoffice/i18n';
import { inventoryErrorText } from './inventory-errors';

/** Sends one JSON write to /api/inventory, refreshes the server page on success and keeps the Thai error text otherwise. */
export function useInventorySave() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save(url: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown): Promise<Record<string, unknown> | null> {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      const json = response.status === 204 ? {} : await response.json().catch(() => ({})) as Record<string, unknown>;
      if (response.ok) { router.refresh(); return json; }
      setError(json.error === 'DUPLICATE_BARCODE' && typeof json.itemCode === 'string' ? `${inventoryErrorText(json.error)} (${json.itemCode})` : inventoryErrorText(json.error));
    } catch {
      setError(t('inventoryActionFailed'));
    } finally {
      setPending(false);
    }
    return null;
  }

  return { save, error, pending, setError };
}
