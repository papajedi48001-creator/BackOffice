'use client';

import { useState, type FormEvent } from 'react';
import type { InventoryVendorRecord } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { useInventorySave } from '../use-inventory-save';

type VendorDraft = { name: string; phone: string; address: string };
const emptyVendor: VendorDraft = { name: '', phone: '', address: '' };

export function VendorForms({ vendors }: { vendors: InventoryVendorRecord[] }) {
  const { save, error, pending } = useInventorySave();
  const [draft, setDraft] = useState<VendorDraft>(emptyVendor);
  const [editing, setEditing] = useState<InventoryVendorRecord | null>(null);
  const body = (vendor: VendorDraft, isActive: boolean) => ({ name: vendor.name, phone: vendor.phone, address: vendor.address, isActive });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const saved = editing ? await save(`/api/inventory/vendors/${editing.id}`, 'PUT', body(draft, editing.isActive)) : await save('/api/inventory/vendors', 'POST', body(draft, true));
    if (saved) { setEditing(null); setDraft(emptyVendor); }
  }

  const formLabel = editing ? `${t('inventoryEdit')} ${editing.name}` : t('inventoryNewVendor');
  return (
    <div className="inventory-manage">
      {error ? <p role="alert" className="form-error">{error}</p> : null}
      <table className="inventory-table">
        <thead><tr><th>{t('inventoryVendorName')}</th><th>{t('inventoryPhone')}</th><th>{t('inventoryAddress')}</th><th>{t('inventoryStatus')}</th><th /></tr></thead>
        <tbody>{vendors.map((vendor) => (
          <tr key={vendor.id}>
            <td>{vendor.name}</td><td>{vendor.phone}</td><td>{vendor.address}</td><td>{vendor.isActive ? t('inventoryActive') : t('inventoryInactive')}</td>
            <td className="row-actions">
              <button type="button" className="button-secondary" aria-label={`${t('inventoryEdit')} ${vendor.name}`} onClick={() => { setEditing(vendor); setDraft({ name: vendor.name, phone: vendor.phone, address: vendor.address }); }}>{t('inventoryEdit')}</button>
              <button type="button" aria-label={`${vendor.isActive ? t('inventoryInactive') : t('inventoryActive')} ${vendor.name}`} disabled={pending} onClick={() => void save(`/api/inventory/vendors/${vendor.id}`, 'PUT', body(vendor, !vendor.isActive))}>{vendor.isActive ? t('inventoryInactive') : t('inventoryActive')}</button>
            </td>
          </tr>
        ))}</tbody>
      </table>
      <form aria-label={formLabel} className="inventory-form" onSubmit={(event) => void submit(event)}>
        <h3>{formLabel}</h3>
        <label>{t('inventoryVendorName')}<input name="name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required maxLength={200} /></label>
        <label>{t('inventoryPhone')}<input name="phone" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} maxLength={30} /></label>
        <label>{t('inventoryAddress')}<textarea name="address" value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} maxLength={500} /></label>
        <div className="row-actions">
          <button type="submit" disabled={pending}>{t('inventorySave')}</button>
          {editing ? <button type="button" className="button-secondary" onClick={() => { setEditing(null); setDraft(emptyVendor); }}>{t('inventoryCancel')}</button> : null}
        </div>
      </form>
    </div>
  );
}
