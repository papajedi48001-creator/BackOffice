'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormDialog } from '../../../../../components/form-dialog';
import { formatBangkokDateOnly } from '../../../../../lib/bangkok-time';
import { formatCount, sendLab } from '../../../../../lib/lab-client';

type FefoLine = { lineId: string; quantityRequested: number; suggestion: { ok: true; picks: { lotId: string; quantity: number }[] } | { ok: false }; lots: { lotId: string; lotNo: string; expiryDate: string | null; available: number }[] };
export interface IssueLine { id: string; code: string; name: string; useUnit: string; quantityRequested: number }

/** Takes the FEFO picks while there is stock, even when the line cannot be filled in full. */
function startingPicks(line: FefoLine): Record<string, string> {
  if (line.suggestion.ok) return Object.fromEntries(line.suggestion.picks.map((pick) => [pick.lotId, String(pick.quantity)]));
  let left = line.quantityRequested;
  return Object.fromEntries(line.lots.map((lot) => { const take = Math.min(left, lot.available); left -= take; return [lot.lotId, String(take)]; }));
}

/**
 * จ่าย for an approved ใบขอเบิก (ผู้ดูแลคลัง Lab). Starts from หมดอายุก่อนจ่ายก่อน over คลังหลัก; the keeper may change or split lots,
 * issue less (a note is then required) but never more than asked. The server checks stock again under lock.
 */
export function IssueForm({ requisitionId, lines }: { requisitionId: string; lines: readonly IssueLine[] }) {
  const router = useRouter();
  const ids = useId();
  const [fefo, setFefo] = useState<FefoLine[] | null>(null);
  const [picks, setPicks] = useState<Record<string, Record<string, string>>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setFefo(null); setError(null); setNote('');
    try {
      const response = await fetch(`/api/lab/requisitions/${encodeURIComponent(requisitionId)}/fefo`);
      if (!response.ok) { setError('โหลดล็อตไม่สำเร็จ'); return; }
      const loaded = ((await response.json()) as { lines: FefoLine[] }).lines;
      setFefo(loaded);
      setPicks(Object.fromEntries(loaded.map((line) => [line.lineId, startingPicks(line)])));
    } catch { setError('โหลดล็อตไม่สำเร็จ'); }
  }

  const chosen = (lineId: string) => Object.entries(picks[lineId] ?? {}).map(([lotId, text]) => ({ lotId, quantity: Number(text) })).filter((pick) => Number.isInteger(pick.quantity) && pick.quantity > 0);
  const totals = lines.map((line) => ({ line, total: chosen(line.id).reduce((sum, pick) => sum + pick.quantity, 0) }));
  const over = totals.some(({ line, total }) => total > line.quantityRequested);
  const short = totals.some(({ line, total }) => total < line.quantityRequested);
  const ready = fefo !== null && !over && (!short || note.trim().length > 0);

  async function submit(): Promise<boolean> {
    setError(null);
    const { error: failure } = await sendLab(`/api/lab/requisitions/${encodeURIComponent(requisitionId)}/issue`, 'POST', { note: note.trim(), lines: lines.map((line) => ({ lineId: line.id, picks: chosen(line.id) })) });
    if (failure) { setError(failure); return false; }
    router.refresh();
    return true;
  }

  return <FormDialog title="จ่ายวัสดุตามใบขอเบิก" triggerLabel="จ่ายวัสดุ" submitLabel="บันทึกการจ่าย" wide ready={ready} error={error}
    onOpenChange={(open) => { if (open) void load(); }} onSubmit={submit}>
    {!fefo && !error && <p>กำลังโหลดล็อต…</p>}
    {fefo && lines.map((line) => {
      const lots = fefo.find((entry) => entry.lineId === line.id)?.lots ?? [];
      const total = totals.find((entry) => entry.line.id === line.id)!.total;
      return <fieldset key={line.id} className="lab-lot-editor">
        <legend>{line.code} {line.name}: ขอ {formatCount(line.quantityRequested)} {line.useUnit} · จ่าย {formatCount(total)}</legend>
        {lots.length === 0 && <p>คลังหลักไม่มีวัสดุนี้</p>}
        {lots.map((lot) => <div key={lot.lotId} className="lab-lot-row">
          <label htmlFor={`${ids}-${line.id}-${lot.lotId}`}>{lot.lotNo} {lot.expiryDate ? `หมดอายุ ${formatBangkokDateOnly(lot.expiryDate)}` : 'ไม่มีวันหมดอายุ'} (คงเหลือ {formatCount(lot.available)})</label>
          <input id={`${ids}-${line.id}-${lot.lotId}`} aria-label={`จ่ายจาก ${lot.lotNo} (${line.code})`} type="number" inputMode="numeric" min={0} max={lot.available} step={1} value={picks[line.id]?.[lot.lotId] ?? ''}
            onChange={(event) => setPicks((current) => ({ ...current, [line.id]: { ...current[line.id], [lot.lotId]: event.target.value } }))} />
        </div>)}
        {total > line.quantityRequested && <p role="alert" className="form-error">จ่ายเกินจำนวนที่ขอไม่ได้</p>}
      </fieldset>;
    })}
    {fefo && <div className="action-dialog-field">
      <label htmlFor={`${ids}-note`}>หมายเหตุการจ่าย</label>
      <textarea id={`${ids}-note`} rows={2} maxLength={500} value={note} required={short} onChange={(event) => setNote(event.target.value)} />
      {short && <p className="lab-hint">ต้องระบุหมายเหตุ</p>}
    </div>}
  </FormDialog>;
}
