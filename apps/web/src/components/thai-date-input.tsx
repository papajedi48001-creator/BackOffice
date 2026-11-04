'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { addDays, bangkokToday, formatBangkokDate, weekdayHeaders } from '../lib/bangkok-time';
import type { HolidayView } from '../lib/holidays';
import { formatThaiDateInput, monthCells, parseThaiDateInput, shiftMonth, thaiMonthTitle } from '../lib/thai-date-input';

/**
 * วันที่ทุกช่องในระบบ: typed as วว/ดด/ปปปป (พ.ศ.) or picked from a Thai calendar (full weekday and month names, Monday first).
 * The value given back and posted under `name` is always ISO `YYYY-MM-DD`, so APIs do not change.
 * Holidays are grey and named; with `blockHolidays` they cannot be chosen. The server still checks.
 */
export interface ThaiDateInputProps {
  id?: string; name?: string; value?: string; defaultValue?: string; onChange?: (iso: string) => void;
  min?: string; max?: string; required?: boolean; disabled?: boolean; 'aria-label'?: string; className?: string;
  holidays?: readonly HolidayView[]; blockHolidays?: boolean;
  /** For ThaiDateTimeInput: a whole `YYYY-MM-DDTHH:mm` typed or pasted into the date field. */
  onDateTime?: (value: string) => void;
}

export function ThaiDateInput(props: ThaiDateInputProps) {
  const { id: givenId, name, min, max, required, disabled, holidays = [], blockHolidays = false, className } = props;
  const autoId = useId();
  const id = givenId ?? `thai-date-${autoId}`;
  const controlled = props.value !== undefined;
  const [own, setOwn] = useState(props.defaultValue ?? '');
  const value = controlled ? props.value! : own;
  const [text, setText] = useState(formatThaiDateInput(value));
  const [problem, setProblem] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const holidayNames = useMemo(() => new Map(holidays.map((holiday) => [holiday.date, holiday.name])), [holidays]);

  // Keep the field in step when the value changes from outside (another field, a reset).
  useEffect(() => { if (parseThaiDateInput(text) !== value) setText(formatThaiDateInput(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { input.current?.setCustomValidity(problem ?? ''); }, [problem]);

  const refusal = (iso: string): string | null => {
    if (min && iso < min) return `เลือกได้ตั้งแต่ ${formatBangkokDate(min)}`;
    if (max && iso > max) return `เลือกได้ถึง ${formatBangkokDate(max)}`;
    const holiday = holidayNames.get(iso);
    if (blockHolidays && holiday) return `${formatBangkokDate(iso)} เป็นวันหยุด (${holiday}) เลือกไม่ได้`;
    return null;
  };
  const commit = (iso: string) => { if (!controlled) setOwn(iso); props.onChange?.(iso); };

  function typed(next: string) {
    setText(next);
    if (props.onDateTime && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(next.trim())) { setProblem(null); props.onDateTime(next.trim()); return; }
    if (next.trim() === '') { setProblem(null); commit(''); return; }
    const iso = parseThaiDateInput(next);
    if (!iso) { setProblem('กรอกวันที่เป็น วว/ดด/ปปปป (พ.ศ.) เช่น 09/11/2569'); return; }
    const refused = refusal(iso);
    setProblem(refused);
    if (!refused) commit(iso);
  }

  function pick(iso: string) {
    setText(formatThaiDateInput(iso)); setProblem(null); commit(iso); setOpen(false);
    toggle.current?.focus();
  }

  const holidayName = value ? holidayNames.get(value) : undefined;
  const hintId = `${id}-hint`;
  return <span className={['thai-date', className].filter(Boolean).join(' ')}>
    <span className="thai-date-field">
      <input ref={input} id={id} type="text" inputMode="numeric" autoComplete="off" placeholder="วว/ดด/ปปปป" aria-label={props['aria-label']} aria-describedby={hintId} title={value ? `${formatBangkokDate(value)}${holidayName ? ` วันหยุด ${holidayName}` : ''}` : undefined}
        value={text} data-min={min} data-max={max} required={required} disabled={disabled} aria-invalid={problem ? true : undefined}
        onChange={(event) => typed(event.target.value)} onBlur={() => { const iso = parseThaiDateInput(text); if (iso && iso === value) setText(formatThaiDateInput(iso)); }} />
      <button ref={toggle} type="button" className="thai-date-toggle" aria-label="เลือกวันที่จากปฏิทิน" aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={() => setOpen((current) => !current)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
      </button>
    </span>
    {name && <input type="hidden" name={name} value={value} />}
    {/* The hint is drawn from data-hint by CSS so a <label> that wraps this field keeps its own text as its name. */}
    <span id={hintId} className="thai-date-hint" data-hint={`${value ? formatBangkokDate(value) : 'วว/ดด/ปปปป (พ.ศ.)'}${holidayName ? ` · วันหยุด ${holidayName}` : ''}`} />
    {problem && <small role="alert" className="form-error">{problem}</small>}
    {open && <ThaiCalendarPopup selected={value} holidays={holidayNames} isDisabled={(iso) => refusal(iso) !== null} onPick={pick} onClose={() => { setOpen(false); toggle.current?.focus(); }} />}
  </span>;
}

function ThaiCalendarPopup({ selected, holidays, isDisabled, onPick, onClose }: { selected: string; holidays: ReadonlyMap<string, string>; isDisabled: (iso: string) => boolean; onPick: (iso: string) => void; onClose: () => void }) {
  const [focused, setFocused] = useState(selected || bangkokToday());
  const month = focused.slice(0, 7);
  const grid = useRef<HTMLTableElement>(null);
  const titleId = useId();
  useEffect(() => { grid.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus(); }, [focused]);
  const cells = monthCells(month);
  const weeks = [0, 1, 2, 3, 4, 5].map((week) => cells.slice(week * 7, week * 7 + 7));
  const moves: Record<string, number | ((date: string) => string)> = {
    ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7,
    Home: (date) => addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7)),
    End: (date) => addDays(date, 6 - ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7)),
    PageUp: (date) => `${shiftMonth(date.slice(0, 7), -1)}-01`, PageDown: (date) => `${shiftMonth(date.slice(0, 7), 1)}-01`
  };
  function keyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!isDisabled(focused)) onPick(focused); return; }
    const move = moves[event.key];
    if (move === undefined) return;
    event.preventDefault();
    setFocused((current) => typeof move === 'number' ? addDays(current, move) : move(current));
  }
  return <div className="thai-date-popup" role="dialog" aria-modal="false" aria-label="เลือกวันที่">
    <div className="thai-date-popup-header">
      <button type="button" aria-label="เดือนก่อน" onClick={() => setFocused(`${shiftMonth(month, -1)}-01`)}>‹</button>
      <strong id={titleId} aria-live="polite">{thaiMonthTitle(month)}</strong>
      <button type="button" aria-label="เดือนถัดไป" onClick={() => setFocused(`${shiftMonth(month, 1)}-01`)}>›</button>
      <button type="button" className="thai-date-popup-close" aria-label="ปิดปฏิทิน" onClick={onClose}>×</button>
    </div>
    <table ref={grid} role="grid" aria-labelledby={titleId} onKeyDown={keyDown}>
      <thead><tr>{weekdayHeaders().map((day) => <th key={day} scope="col" role="columnheader">{day}</th>)}</tr></thead>
      <tbody>{weeks.map((week) => <tr key={week[0]!.date}>{week.map((cell) => {
        const holiday = holidays.get(cell.date);
        const disabled = isDisabled(cell.date);
        const classes = ['thai-date-day', cell.inMonth ? '' : 'is-outside', holiday ? 'is-holiday' : '', cell.date === selected ? 'is-selected' : '', cell.date === bangkokToday() ? 'is-today' : ''].filter(Boolean).join(' ');
        return <td key={cell.date} role="gridcell" aria-selected={cell.date === selected}>
          <button type="button" data-date={cell.date} className={classes} tabIndex={cell.date === focused ? 0 : -1} disabled={disabled}
            aria-label={`${formatBangkokDate(cell.date)}${holiday ? ` วันหยุด ${holiday}` : ''}`} title={holiday}
            onClick={() => onPick(cell.date)} onFocus={() => { if (cell.date !== focused) setFocused(cell.date); }}>
            <span className="thai-date-number">{Number(cell.date.slice(8))}</span>
            {holiday && <span className="thai-date-holiday">{holiday}</span>}
          </button>
        </td>;
      })}</tr>)}</tbody>
    </table>
  </div>;
}

const quarterHours = Array.from({ length: 96 }, (_, index) => `${String(Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`);

/** วันเวลา: a ThaiDateInput and a 24-hour quarter-hour time, joined as the `YYYY-MM-DDTHH:mm` a datetime-local field gave (Bangkok time). */
export function ThaiDateTimeInput({ id, label, value, onChange, min, required, disabled, holidays, blockHolidays }: { id: string; label?: string; value: string; onChange: (value: string) => void; min?: string; required?: boolean; disabled?: boolean; holidays?: readonly HolidayView[]; blockHolidays?: boolean }) {
  const date = value.slice(0, 10);
  const time = value.slice(11, 16) || '08:00';
  const times = quarterHours.includes(time) ? quarterHours : [...quarterHours, time].sort();
  return <span className="thai-date-time">
    <ThaiDateInput id={id} value={date} min={min?.slice(0, 10)} required={required} disabled={disabled} holidays={holidays} blockHolidays={blockHolidays}
      onChange={(next) => onChange(next ? `${next}T${time}` : '')} onDateTime={onChange} />
    <select aria-label={`เวลา ${label ?? ''}`.trim()} value={time} disabled={disabled} onChange={(event) => { if (date) onChange(`${date}T${event.target.value}`); }}>
      {times.map((option) => <option key={option} value={option}>{option} น.</option>)}
    </select>
  </span>;
}
