'use client';

import { useState, type FormEvent } from 'react';
import type { InventoryCategoryRecord, ItemListRow } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { useInventorySave } from '../use-inventory-save';

type ItemDraft = { code: string; name: string; categoryId: string; issueUnit: string; purchaseUnit: string; purchaseUnitFactor: string; reorderPoint: string; tracksExpiry: boolean };

const toDraft = (item: ItemListRow): ItemDraft => ({ code: item.code, name: item.name, categoryId: item.categoryId, issueUnit: item.issueUnit, purchaseUnit: item.purchaseUnit, purchaseUnitFactor: String(item.purchaseUnitFactor), reorderPoint: String(item.reorderPoint), tracksExpiry: item.tracksExpiry });
const toBody = (draft: ItemDraft, isActive: boolean) => ({ ...draft, purchaseUnitFactor: Number(draft.purchaseUnitFactor), reorderPoint: Number(draft.reorderPoint), isActive });

export function ItemForms({ items, categories }: { items: ItemListRow[]; categories: InventoryCategoryRecord[] }) {
  const { save, error, pending } = useInventorySave();
  const activeCategories = categories.filter((category) => category.isActive);
  const empty: ItemDraft = { code: '', name: '', categoryId: activeCategories[0]?.id ?? '', issueUnit: '', purchaseUnit: '', purchaseUnitFactor: '1', reorderPoint: '0', tracksExpiry: false };
  const [draft, setDraft] = useState<ItemDraft>(empty);
  const [editing, setEditing] = useState<ItemListRow | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const set = (field: keyof ItemDraft) => (event: { target: { value: string; checked?: boolean; type?: string } }) => setDraft({ ...draft, [field]: event.target.type === 'checkbox' ? Boolean(event.target.checked) : event.target.value });

  async function submitItem(event: FormEvent) {
    event.preventDefault();
    const saved = editing ? await save(`/api/inventory/items/${editing.id}`, 'PUT', toBody(draft, editing.isActive)) : await save('/api/inventory/items', 'POST', toBody(draft, true));
    if (saved) { setEditing(null); setDraft(empty); }
  }

  async function submitCategory(event: FormEvent) {
    event.preventDefault();
    if (await save('/api/inventory/categories', 'POST', { name: categoryName, isActive: true })) setCategoryName('');
  }

  async function submitBarcode(event: FormEvent<HTMLFormElement>, item: ItemListRow) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (await save(`/api/inventory/items/${item.id}/barcodes`, 'POST', { barcode: String(data.get('barcode') ?? ''), unitKind: String(data.get('unitKind') ?? 'ISSUE') })) form.reset();
  }

  const formLabel = editing ? `${t('inventoryEdit')} ${editing.name}` : t('inventoryNewItem');
  return (
    <div className="inventory-manage">
      {error ? <p role="alert" className="form-error">{error}</p> : null}
      <table className="inventory-table">
        <thead><tr><th>{t('inventoryCode')}</th><th>{t('inventoryName')}</th><th>{t('inventoryCategory')}</th><th>{t('inventoryIssueUnit')}</th><th>{t('inventoryPurchaseUnit')}</th><th className="numeric">{t('inventoryReorderPoint')}</th><th>{t('inventoryBarcodes')}</th><th>{t('inventoryStatus')}</th><th /></tr></thead>
        <tbody>{items.map((item) => (
          <tr key={item.id}>
            <td className="code">{item.code}</td><td>{item.name}{item.tracksExpiry ? <span className="inventory-flag">{t('inventoryTracksExpiry')}</span> : null}</td><td>{item.categoryName}</td>
            <td>{item.issueUnit}</td><td>{item.purchaseUnit} = {item.purchaseUnitFactor} {item.issueUnit}</td><td className="numeric">{item.reorderPoint}</td>
            <td>
              <ul className="inventory-barcodes">{item.barcodes.map((barcode) => (
                <li key={barcode.id}><span className="code">{barcode.barcode}</span> ({barcode.unitKind === 'PURCHASE' ? item.purchaseUnit : item.issueUnit})
                  <button type="button" className="button-secondary" aria-label={`${t('inventoryRemoveBarcode')} ${barcode.barcode}`} disabled={pending} onClick={() => void save(`/api/inventory/items/${item.id}/barcodes/${barcode.id}`, 'DELETE')}>{t('inventoryRemoveBarcode')}</button></li>
              ))}</ul>
              <form aria-label={`${t('inventoryAddBarcode')} ${item.name}`} className="inventory-inline-form" onSubmit={(event) => void submitBarcode(event, item)}>
                <input name="barcode" aria-label={t('inventoryBarcode')} autoComplete="off" required />
                <select name="unitKind" aria-label={t('inventoryBarcodeUnit')} defaultValue="PURCHASE"><option value="PURCHASE">{item.purchaseUnit}</option><option value="ISSUE">{item.issueUnit}</option></select>
                <button type="submit" disabled={pending}>{t('inventoryAddBarcode')}</button>
              </form>
            </td>
            <td>{item.isActive ? t('inventoryActive') : t('inventoryInactive')}</td>
            <td className="row-actions">
              <button type="button" className="button-secondary" aria-label={`${t('inventoryEdit')} ${item.name}`} onClick={() => { setEditing(item); setDraft(toDraft(item)); }}>{t('inventoryEdit')}</button>
              <button type="button" aria-label={`${item.isActive ? t('inventoryInactive') : t('inventoryActive')} ${item.name}`} disabled={pending} onClick={() => void save(`/api/inventory/items/${item.id}`, 'PUT', toBody(toDraft(item), !item.isActive))}>{item.isActive ? t('inventoryInactive') : t('inventoryActive')}</button>
            </td>
          </tr>
        ))}</tbody>
      </table>

      <form aria-label={formLabel} className="inventory-form" onSubmit={(event) => void submitItem(event)}>
        <h3>{formLabel}</h3>
        <label>{t('inventoryCode')}<input name="code" value={draft.code} onChange={set('code')} required maxLength={30} pattern="[A-Za-z0-9-]+" /></label>
        <label>{t('inventoryName')}<input name="name" value={draft.name} onChange={set('name')} required maxLength={200} /></label>
        <label>{t('inventoryCategory')}<select name="categoryId" value={draft.categoryId} onChange={set('categoryId')} required>{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label>{t('inventoryIssueUnit')}<input name="issueUnit" value={draft.issueUnit} onChange={set('issueUnit')} required maxLength={30} /></label>
        <label>{t('inventoryPurchaseUnit')}<input name="purchaseUnit" value={draft.purchaseUnit} onChange={set('purchaseUnit')} required maxLength={30} /></label>
        <label>{t('inventoryFactor')}<input name="purchaseUnitFactor" type="number" min={1} max={100000} step={1} value={draft.purchaseUnitFactor} onChange={set('purchaseUnitFactor')} required /></label>
        <label>{t('inventoryReorderPoint')}<input name="reorderPoint" type="number" min={0} step={1} value={draft.reorderPoint} onChange={set('reorderPoint')} required /></label>
        <label className="inventory-check"><input name="tracksExpiry" type="checkbox" checked={draft.tracksExpiry} onChange={set('tracksExpiry')} />{t('inventoryTracksExpiry')}</label>
        <div className="row-actions">
          <button type="submit" disabled={pending}>{t('inventorySave')}</button>
          {editing ? <button type="button" className="button-secondary" onClick={() => { setEditing(null); setDraft(empty); }}>{t('inventoryCancel')}</button> : null}
        </div>
      </form>

      <section aria-label={t('inventoryCategories')}>
        <h3>{t('inventoryCategories')}</h3>
        <ul>{categories.map((category) => (
          <li key={category.id}>{category.name} {category.isActive ? null : <span className="inventory-flag">{t('inventoryInactive')}</span>}
            <button type="button" className="button-secondary" aria-label={`${category.isActive ? t('inventoryInactive') : t('inventoryActive')} ${category.name}`} disabled={pending} onClick={() => void save(`/api/inventory/categories/${category.id}`, 'PUT', { name: category.name, isActive: !category.isActive })}>{category.isActive ? t('inventoryInactive') : t('inventoryActive')}</button></li>
        ))}</ul>
        <form aria-label={t('inventoryNewCategory')} className="inventory-inline-form" onSubmit={(event) => void submitCategory(event)}>
          <input name="categoryName" aria-label={t('inventoryCategory')} value={categoryName} onChange={(event) => setCategoryName(event.target.value)} required maxLength={120} />
          <button type="submit" disabled={pending}>{t('inventoryNewCategory')}</button>
        </form>
      </section>
    </div>
  );
}
