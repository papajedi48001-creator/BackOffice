'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormDialog } from '../../../../components/form-dialog';
import { sendLab } from '../../../../lib/lab-client';

/** Posts a new row (`id` absent) or puts an edit; closes the popup and refreshes on success. */
function useSave(kind: string, id: string | undefined) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function save(body: unknown): Promise<boolean> {
    setError(null);
    const { error: failure } = id ? await sendLab(`/api/lab/settings/${kind}/${encodeURIComponent(id)}`, 'PUT', body) : await sendLab(`/api/lab/settings/${kind}`, 'POST', body);
    if (failure) { setError(failure); return false; }
    router.refresh();
    return true;
  }
  return { error, setError, save };
}

const Active = ({ id, checked, onChange }: { id: string; checked: boolean; onChange: (value: boolean) => void }) => <>
  <label htmlFor={id}>เปิดใช้</label><input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
</>;

export interface ItemValues { id: string; code: string; name: string; receiveUnit: string; useUnit: string; unitsPerReceive: number; expiryWarnDays: number; isActive: boolean; reorderPoints: { storeId: string; reorderPoint: number }[] }

/** เพิ่ม/แก้ไขวัสดุ with its จุดสั่งซื้อ per store (0 or blank = none). */
export function ItemForm({ item, stores }: { item?: ItemValues; stores: ReadonlyArray<{ id: string; name: string }> }) {
  const ids = useId();
  const start = () => ({ code: item?.code ?? '', name: item?.name ?? '', receiveUnit: item?.receiveUnit ?? '', useUnit: item?.useUnit ?? '', unitsPerReceive: String(item?.unitsPerReceive ?? 1), expiryWarnDays: String(item?.expiryWarnDays ?? 90), isActive: item?.isActive ?? true,
    reorder: Object.fromEntries(stores.map((store) => [store.id, String(item?.reorderPoints.find((point) => point.storeId === store.id)?.reorderPoint ?? '')])) as Record<string, string> });
  const [values, setValues] = useState(start);
  const { error, setError, save } = useSave('items', item?.id);
  const set = <K extends keyof ReturnType<typeof start>>(key: K, value: ReturnType<typeof start>[K]) => setValues((current) => ({ ...current, [key]: value }));
  const ready = /^[A-Za-z0-9-]{1,30}$/.test(values.code.trim()) && values.name.trim() !== '' && values.receiveUnit.trim() !== '' && values.useUnit.trim() !== '' && Number(values.unitsPerReceive) >= 1;
  return <FormDialog title={item ? `แก้ไขวัสดุ ${item.code}` : 'เพิ่มวัสดุ'} triggerLabel={item ? 'แก้ไข' : 'เพิ่มวัสดุ'} triggerClassName={item ? 'button-secondary' : undefined} submitLabel="บันทึก" wide ready={ready} error={error}
    onOpenChange={(open) => { if (open) { setError(null); setValues(start()); } }}
    onSubmit={() => save({ code: values.code.trim(), name: values.name.trim(), receiveUnit: values.receiveUnit.trim(), useUnit: values.useUnit.trim(), unitsPerReceive: Number(values.unitsPerReceive), expiryWarnDays: Number(values.expiryWarnDays) || 0, isActive: values.isActive,
      reorderPoints: Object.entries(values.reorder).filter(([, text]) => Number(text) > 0).map(([storeId, text]) => ({ storeId, reorderPoint: Number(text) })) })}>
    <div className="lab-form-grid">
      <label htmlFor={`${ids}-code`}>รหัส</label><input id={`${ids}-code`} value={values.code} maxLength={30} required onChange={(event) => set('code', event.target.value)} />
      <label htmlFor={`${ids}-name`}>ชื่อ</label><input id={`${ids}-name`} value={values.name} maxLength={200} required onChange={(event) => set('name', event.target.value)} />
      <label htmlFor={`${ids}-receive`}>หน่วยรับ</label><input id={`${ids}-receive`} value={values.receiveUnit} maxLength={30} required placeholder="เช่น กล่อง" onChange={(event) => set('receiveUnit', event.target.value)} />
      <label htmlFor={`${ids}-use`}>หน่วยใช้</label><input id={`${ids}-use`} value={values.useUnit} maxLength={30} required placeholder="เช่น test, ขวด" onChange={(event) => set('useUnit', event.target.value)} />
      <label htmlFor={`${ids}-rate`}>1 หน่วยรับ = หน่วยใช้</label><input id={`${ids}-rate`} type="number" inputMode="numeric" min={1} step={1} value={values.unitsPerReceive} required onChange={(event) => set('unitsPerReceive', event.target.value)} />
      <label htmlFor={`${ids}-warn`}>เตือนก่อนหมดอายุ (วัน)</label><input id={`${ids}-warn`} type="number" inputMode="numeric" min={0} max={3650} step={1} value={values.expiryWarnDays} onChange={(event) => set('expiryWarnDays', event.target.value)} />
      <Active id={`${ids}-active`} checked={values.isActive} onChange={(value) => set('isActive', value)} />
    </div>
    <fieldset className="lab-lot-editor"><legend>จุดสั่งซื้อ (หน่วยใช้)</legend>
      {stores.map((store) => <div key={store.id} className="lab-lot-row">
        <label htmlFor={`${ids}-reorder-${store.id}`}>{store.name}</label>
        <input id={`${ids}-reorder-${store.id}`} type="number" inputMode="numeric" min={0} step={1} value={values.reorder[store.id] ?? ''} onChange={(event) => set('reorder', { ...values.reorder, [store.id]: event.target.value })} />
      </div>)}
    </fieldset>
  </FormDialog>;
}

/** เพิ่ม/แก้ไขงาน (คลังย่อย). A new งาน gets its own คลังย่อย. */
export function SectionForm({ section, nextSortOrder = 10 }: { section?: { id: string; code: string; name: string; sortOrder: number; isActive: boolean }; nextSortOrder?: number }) {
  const ids = useId();
  const start = () => ({ code: section?.code ?? '', name: section?.name ?? '', sortOrder: String(section?.sortOrder ?? nextSortOrder), isActive: section?.isActive ?? true });
  const [values, setValues] = useState(start);
  const { error, setError, save } = useSave('sections', section?.id);
  const ready = /^[A-Z0-9-]{1,20}$/.test(values.code.trim()) && values.name.trim() !== '';
  return <FormDialog title={section ? `แก้ไขงาน ${section.name}` : 'เพิ่มงาน'} triggerLabel={section ? 'แก้ไข' : 'เพิ่มงาน'} triggerClassName={section ? 'button-secondary' : undefined} submitLabel="บันทึก" ready={ready} error={error}
    onOpenChange={(open) => { if (open) { setError(null); setValues(start()); } }}
    onSubmit={() => save({ code: values.code.trim(), name: values.name.trim(), sortOrder: Number(values.sortOrder) || 0, isActive: values.isActive })}>
    <div className="lab-form-grid">
      <label htmlFor={`${ids}-code`}>รหัส (A-Z)</label><input id={`${ids}-code`} value={values.code} maxLength={20} required onChange={(event) => setValues({ ...values, code: event.target.value.toUpperCase() })} />
      <label htmlFor={`${ids}-name`}>ชื่องาน</label><input id={`${ids}-name`} value={values.name} maxLength={80} required onChange={(event) => setValues({ ...values, name: event.target.value })} />
      <label htmlFor={`${ids}-order`}>ลำดับ</label><input id={`${ids}-order`} type="number" min={0} max={9999} step={1} value={values.sortOrder} onChange={(event) => setValues({ ...values, sortOrder: event.target.value })} />
      <Active id={`${ids}-active`} checked={values.isActive} onChange={(value) => setValues({ ...values, isActive: value })} />
    </div>
  </FormDialog>;
}

/** เพิ่ม/แก้ไขผู้ขาย. */
export function VendorForm({ vendor }: { vendor?: { id: string; name: string; phone: string; isActive: boolean } }) {
  const ids = useId();
  const start = () => ({ name: vendor?.name ?? '', phone: vendor?.phone ?? '', isActive: vendor?.isActive ?? true });
  const [values, setValues] = useState(start);
  const { error, setError, save } = useSave('vendors', vendor?.id);
  return <FormDialog title={vendor ? `แก้ไขผู้ขาย ${vendor.name}` : 'เพิ่มผู้ขาย'} triggerLabel={vendor ? 'แก้ไข' : 'เพิ่มผู้ขาย'} triggerClassName={vendor ? 'button-secondary' : undefined} submitLabel="บันทึก" ready={values.name.trim() !== ''} error={error}
    onOpenChange={(open) => { if (open) { setError(null); setValues(start()); } }}
    onSubmit={() => save({ name: values.name.trim(), phone: values.phone.trim(), isActive: values.isActive })}>
    <div className="lab-form-grid">
      <label htmlFor={`${ids}-name`}>ชื่อผู้ขาย</label><input id={`${ids}-name`} value={values.name} maxLength={200} required onChange={(event) => setValues({ ...values, name: event.target.value })} />
      <label htmlFor={`${ids}-phone`}>โทรศัพท์</label><input id={`${ids}-phone`} value={values.phone} maxLength={40} onChange={(event) => setValues({ ...values, phone: event.target.value })} />
      <Active id={`${ids}-active`} checked={values.isActive} onChange={(value) => setValues({ ...values, isActive: value })} />
    </div>
  </FormDialog>;
}

/** เพิ่ม/แก้ไขประเภทการใช้. */
export function UsageTypeForm({ usageType, nextSortOrder = 10 }: { usageType?: { id: string; name: string; sortOrder: number; isActive: boolean }; nextSortOrder?: number }) {
  const ids = useId();
  const start = () => ({ name: usageType?.name ?? '', sortOrder: String(usageType?.sortOrder ?? nextSortOrder), isActive: usageType?.isActive ?? true });
  const [values, setValues] = useState(start);
  const { error, setError, save } = useSave('usage-types', usageType?.id);
  return <FormDialog title={usageType ? `แก้ไขประเภท ${usageType.name}` : 'เพิ่มประเภทการใช้'} triggerLabel={usageType ? 'แก้ไข' : 'เพิ่มประเภทการใช้'} triggerClassName={usageType ? 'button-secondary' : undefined} submitLabel="บันทึก" ready={values.name.trim() !== ''} error={error}
    onOpenChange={(open) => { if (open) { setError(null); setValues(start()); } }}
    onSubmit={() => save({ name: values.name.trim(), sortOrder: Number(values.sortOrder) || 0, isActive: values.isActive })}>
    <div className="lab-form-grid">
      <label htmlFor={`${ids}-name`}>ชื่อประเภท</label><input id={`${ids}-name`} value={values.name} maxLength={60} required onChange={(event) => setValues({ ...values, name: event.target.value })} />
      <label htmlFor={`${ids}-order`}>ลำดับ</label><input id={`${ids}-order`} type="number" min={0} max={9999} step={1} value={values.sortOrder} onChange={(event) => setValues({ ...values, sortOrder: event.target.value })} />
      <Active id={`${ids}-active`} checked={values.isActive} onChange={(value) => setValues({ ...values, isActive: value })} />
    </div>
  </FormDialog>;
}
