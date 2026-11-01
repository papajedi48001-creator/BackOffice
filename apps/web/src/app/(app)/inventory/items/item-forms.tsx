'use client';

import { useState, type FormEvent } from 'react';
import type { InventoryBarcodeRecord, InventoryCategoryRecord, ItemListRow } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { ActionDialog } from '../../../../components/action-dialog';
import { FormDialog } from '../../../../components/form-dialog';
import { useInventorySave } from '../use-inventory-save';

type ItemDraft = { code: string; name: string; categoryId: string; issueUnit: string; purchaseUnit: string; purchaseUnitFactor: string; reorderPoint: string; tracksExpiry: boolean };

const toDraft = (item: ItemListRow): ItemDraft => ({ code: item.code, name: item.name, categoryId: item.categoryId, issueUnit: item.issueUnit, purchaseUnit: item.purchaseUnit, purchaseUnitFactor: String(item.purchaseUnitFactor), reorderPoint: String(item.reorderPoint), tracksExpiry: item.tracksExpiry });
const toBody = (draft: ItemDraft, isActive: boolean) => ({ ...draft, purchaseUnitFactor: Number(draft.purchaseUnitFactor), reorderPoint: Number(draft.reorderPoint), isActive });

export function ItemForms({ items, categories }: { items: ItemListRow[]; categories: InventoryCategoryRecord[] }) {
  const { save, error, pending, setError } = useInventorySave();
  const activeCategories = categories.filter((category) => category.isActive);
  const empty: ItemDraft = { code: '', name: '', categoryId: activeCategories[0]?.id ?? '', issueUnit: '', purchaseUnit: '', purchaseUnitFactor: '1', reorderPoint: '0', tracksExpiry: false };
  const [draft, setDraft] = useState<ItemDraft>(empty);
  const [editing, setEditing] = useState<ItemListRow | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [dialog, setDialog] = useState<'item' | 'category' | { barcodeFor: ItemListRow } | { remove: InventoryBarcodeRecord; item: ItemListRow } | null>(null);
  const openDialog = (next: typeof dialog) => { setError(null); setDialog(next); };
  const closeDialog = (open: boolean) => { if (!open) setDialog(null); };
  const set = (field: keyof ItemDraft) => (event: { target: { value: string; checked?: boolean; type?: string } }) => setDraft({ ...draft, [field]: event.target.type === 'checkbox' ? Boolean(event.target.checked) : event.target.value });

  async function submitItem(event: FormEvent) {
    event.preventDefault();
    const saved = editing ? await save(`/api/inventory/items/${editing.id}`, 'PUT', toBody(draft, editing.isActive)) : await save('/api/inventory/items', 'POST', toBody(draft, true));
    if (saved) { setEditing(null); setDraft(empty); }
    return saved !== null;
  }

  async function submitCategory(event: FormEvent) {
    event.preventDefault();
    if (!(await save('/api/inventory/categories', 'POST', { name: categoryName, isActive: true }))) return false;
    setCategoryName('');
    return true;
  }

  async function submitBarcode(event: FormEvent<HTMLFormElement>, item: ItemListRow) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (!(await save(`/api/inventory/items/${item.id}/barcodes`, 'POST', { barcode: String(data.get('barcode') ?? ''), unitKind: String(data.get('unitKind') ?? 'ISSUE') }))) return false;
    form.reset();
    return true;
  }

  const formLabel = editing ? `${t('inventoryEdit')} ${editing.name}` : t('inventoryNewItem');
  return (
    <div className="inventory-manage">
      <div className="row-actions"><button type="button" onClick={() => { setEditing(null); setDraft(empty); openDialog('item'); }}>{t('inventoryNewItem')}</button></div>
      {error && !dialog ? <p role="alert" className="form-error">{error}</p> : null}
      <table className="inventory-table">
        <thead><tr><th>{t('inventoryCode')}</th><th>{t('inventoryName')}</th><th>{t('inventoryCategory')}</th><th>{t('inventoryIssueUnit')}</th><th>{t('inventoryPurchaseUnit')}</th><th className="numeric">{t('inventoryReorderPoint')}</th><th>{t('inventoryBarcodes')}</th><th>{t('inventoryStatus')}</th><th /></tr></thead>
        <tbody>{items.map((item) => (
          <tr key={item.id}>
            <td className="code">{item.code}</td><td>{item.name}{item.tracksExpiry ? <span className="inventory-flag">{t('inventoryTracksExpiry')}</span> : null}</td><td>{item.categoryName}</td>
            <td>{item.issueUnit}</td><td>{item.purchaseUnit} = {item.purchaseUnitFactor} {item.issueUnit}</td><td className="numeric">{item.reorderPoint}</td>
            <td>
              <ul className="inventory-barcodes">{item.barcodes.map((barcode) => (
                <li key={barcode.id}><span className="code">{barcode.barcode}</span> ({barcode.unitKind === 'PURCHASE' ? item.purchaseUnit : item.issueUnit})
                  <button type="button" className="button-secondary" aria-label={`${t('inventoryRemoveBarcode')} ${barcode.barcode}`} disabled={pending} onClick={() => openDialog({ remove: barcode, item })}>{t('inventoryRemoveBarcode')}</button></li>
              ))}</ul>
              <button type="button" className="button-secondary" aria-label={`${t('inventoryAddBarcode')} ${item.name}`} onClick={() => openDialog({ barcodeFor: item })}>{t('inventoryAddBarcode')}</button>
            </td>
            <td>{item.isActive ? t('inventoryActive') : t('inventoryInactive')}</td>
            <td className="row-actions">
              <button type="button" className="button-secondary" aria-label={`${t('inventoryEdit')} ${item.name}`} onClick={() => { setEditing(item); setDraft(toDraft(item)); openDialog('item'); }}>{t('inventoryEdit')}</button>
              <button type="button" aria-label={`${item.isActive ? t('inventoryInactive') : t('inventoryActive')} ${item.name}`} disabled={pending} onClick={() => void save(`/api/inventory/items/${item.id}`, 'PUT', toBody(toDraft(item), !item.isActive))}>{item.isActive ? t('inventoryInactive') : t('inventoryActive')}</button>
            </td>
          </tr>
        ))}</tbody>
      </table>

      <FormDialog open={dialog === 'item'} onOpenChange={closeDialog} title={formLabel} submitLabel={t('inventorySave')} wide isSubmitting={pending} error={error} onSubmit={submitItem}>
        <label>{t('inventoryCode')}<input name="code" value={draft.code} onChange={set('code')} required maxLength={30} pattern="[A-Za-z0-9-]+" /></label>
        <label>{t('inventoryName')}<input name="name" value={draft.name} onChange={set('name')} required maxLength={200} /></label>
        <label>{t('inventoryCategory')}<select name="categoryId" value={draft.categoryId} onChange={set('categoryId')} required>{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label>{t('inventoryIssueUnit')}<input name="issueUnit" value={draft.issueUnit} onChange={set('issueUnit')} required maxLength={30} /></label>
        <label>{t('inventoryPurchaseUnit')}<input name="purchaseUnit" value={draft.purchaseUnit} onChange={set('purchaseUnit')} required maxLength={30} /></label>
        <label>{t('inventoryFactor')}<input name="purchaseUnitFactor" type="number" min={1} max={100000} step={1} value={draft.purchaseUnitFactor} onChange={set('purchaseUnitFactor')} required /></label>
        <label>{t('inventoryReorderPoint')}<input name="reorderPoint" type="number" min={0} step={1} value={draft.reorderPoint} onChange={set('reorderPoint')} required /></label>
        <label className="inventory-check"><input name="tracksExpiry" type="checkbox" checked={draft.tracksExpiry} onChange={set('tracksExpiry')} />{t('inventoryTracksExpiry')}</label>
      </FormDialog>
      {dialog && typeof dialog === 'object' && 'barcodeFor' in dialog ? (
        <FormDialog open onOpenChange={closeDialog} title={`${t('inventoryAddBarcode')} ${dialog.barcodeFor.name}`} submitLabel={t('inventoryAddBarcode')} isSubmitting={pending} error={error} onSubmit={(event) => submitBarcode(event, dialog.barcodeFor)}>
          <label>{t('inventoryBarcode')}<input name="barcode" autoComplete="off" required /></label>
          <label>{t('inventoryBarcodeUnit')}<select name="unitKind" defaultValue="PURCHASE"><option value="PURCHASE">{dialog.barcodeFor.purchaseUnit}</option><option value="ISSUE">{dialog.barcodeFor.issueUnit}</option></select></label>
        </FormDialog>
      ) : null}
      {dialog && typeof dialog === 'object' && 'remove' in dialog ? (
        <ActionDialog title={`${t('inventoryRemoveBarcode')} ${dialog.remove.barcode}`} message={`${t('dialogConfirmQuestion')} ${dialog.item.name}`} confirmLabel={t('inventoryConfirm')} tone="danger" isSubmitting={pending} error={error}
          onConfirm={() => void save(`/api/inventory/items/${dialog.item.id}/barcodes/${dialog.remove.id}`, 'DELETE').then((done) => { if (done) setDialog(null); })} onClose={() => setDialog(null)} />
      ) : null}

      <section aria-label={t('inventoryCategories')}>
        <h3>{t('inventoryCategories')}</h3>
        <ul>{categories.map((category) => (
          <li key={category.id}>{category.name} {category.isActive ? null : <span className="inventory-flag">{t('inventoryInactive')}</span>}
            <button type="button" className="button-secondary" aria-label={`${category.isActive ? t('inventoryInactive') : t('inventoryActive')} ${category.name}`} disabled={pending} onClick={() => void save(`/api/inventory/categories/${category.id}`, 'PUT', { name: category.name, isActive: !category.isActive })}>{category.isActive ? t('inventoryInactive') : t('inventoryActive')}</button></li>
        ))}</ul>
        <FormDialog triggerLabel={t('inventoryNewCategory')} triggerClassName="button-secondary" open={dialog === 'category'} onOpenChange={(open) => (open ? openDialog('category') : setDialog(null))} title={t('inventoryNewCategory')} submitLabel={t('inventorySave')} isSubmitting={pending} error={error} onSubmit={submitCategory}>
          <label>{t('inventoryCategory')}<input name="categoryName" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} required maxLength={120} /></label>
        </FormDialog>
      </section>
    </div>
  );
}
