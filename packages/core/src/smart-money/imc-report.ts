/**
 * Monitor IMC (กองทุนฟื้นฟูสมรรถภาพ): reads the two files from the สปสช. rehabilitation program as rows of cells.
 * - ทะเบียนคนไข้ IMC (CSV): one row per service line, the person's register data repeated on every line.
 * - REP individual (xlsx): report lines on top, then a two-row header (main titles, and sub-titles under เรียกเก็บ / ชดเชย).
 * Columns are found by title, so their order does not matter. The national ID column is not read: Excel turns it into 3.47E+12.
 */
import { createHash } from 'node:crypto';
import type { NhsoCell } from '@backoffice/contracts';
import { isoDate } from './dp-report';
import { phpString, phpTrim } from './fdh-report';

type Rows = readonly (readonly NhsoCell[] | null | undefined)[];
/** One service line of the register. `key` is the sha-256 of HN, date, ครั้งที่ and รหัสบริการ, so a later file replaces the line. */
export type ImcLine = {
  key: string; hn: string; name: string; right: string; onset: string; disease: string; icd10: string; discharge: string; due: string; status: string; adl: string;
  date: string; visitNo: number; svcType: string; code: string; service: string; claim: number; eligible: number; claimStatus: string;
};
/** One REP individual line; `paid` = ชดเชย + จ่ายเพิ่ม − เรียกคืน. */
export type ImcRepLine = { repNo: string; transId: string; itemNo: number; hn: string; name: string; date: string; item: string; claim: number; paid: number; status: string };
export type ImcParsed<T> = { ok: true; lines: T[]; skipped: number } | { ok: false; message: string };
export type ImcFileKind = 'register' | 'rep' | 'service';

const SCAN = 15;
const NOT_REGISTER = 'ไม่ใช่ไฟล์ทะเบียนคนไข้ IMC (ไม่พบคอลัมน์ "วันที่ครบกำหนดการให้บริการ" และ "วันที่ให้บริการ")';
const NOT_REP = 'ไม่ใช่ไฟล์ REP (ไม่พบคอลัมน์ "REP No." และ "Trans ID")';
const text = (value: NhsoCell | undefined) => (value === null || value === undefined || typeof value === 'boolean' ? '' : phpTrim(phpString(value)));
const title = (value: NhsoCell | undefined) => text(value).replaceAll('﻿', '').replace(/\s+/g, ' ').trim();
const number = (s: string) => { const t = s.replace(/[, ]/g, ''); return /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(t) ? Number(t) : 0; };
const row = (rows: Rows, at: number) => (Array.isArray(rows[at]) ? rows[at]! : []);
const titles = (cells: readonly NhsoCell[]) => cells.map(title);
const isRegister = (names: string[]) => names.includes('วันที่ครบกำหนดการให้บริการ') && names.includes('วันที่ให้บริการ');
const isRep = (names: string[]) => names.includes('REP No.') && names.includes('Trans ID');
const isService = (names: string[]) => names.includes('วันที่รับบริการ') && names.includes('รหัสบริการ') && names.includes('จำนวนเงิน');
const find = (rows: Rows, test: (names: string[]) => boolean) => { for (let at = 0; at < Math.min(rows.length, SCAN); at++) if (test(titles(row(rows, at)))) return at; return -1; };

/** Which IMC file these rows are; `service` is the การให้บริการ IMC file, whose lines the register already holds. */
export function imcFileKind(rows: Rows): ImcFileKind | null {
  if (find(rows, isRegister) >= 0) return 'register';
  if (find(rows, isRep) >= 0) return 'rep';
  if (find(rows, isService) >= 0) return 'service';
  return null;
}

export function parseImcRegister(rows: Rows): ImcParsed<ImcLine> {
  const at = find(rows, isRegister);
  if (at < 0) return { ok: false, message: NOT_REGISTER };
  const names = titles(row(rows, at));
  const first = (name: string) => names.indexOf(name);
  const last = (name: string) => names.lastIndexOf(name);
  const missing = ['HN', 'ชื่อ', 'นามสกุล', 'รหัสบริการ', 'รวมราคาที่ขอเบิก'].filter((name) => first(name) < 0);
  if (missing.length) return { ok: false, message: `ไฟล์ขาดคอลัมน์: ${missing.join(', ')}` };
  const lines: ImcLine[] = [];
  let skipped = 0;
  for (let i = at + 1; i < rows.length; i++) {
    const cells = row(rows, i);
    const get = (index: number) => (index < 0 ? '' : text(cells[index]));
    if (cells.every((cell) => text(cell) === '')) continue;
    const hn = get(first('HN'));
    const date = isoDate(get(first('วันที่ให้บริการ')));
    if (hn === '' || date === '') { skipped++; continue; }
    const visitNo = Math.trunc(number(get(first('ครั้งที่'))));
    const code = get(first('รหัสบริการ'));
    lines.push({
      key: createHash('sha256').update(`imc|${hn}|${date}|${visitNo}|${code}`).digest('hex'),
      hn, name: phpTrim(`${get(first('ชื่อ'))} ${get(first('นามสกุล'))}`), right: get(first('สิทธิหลัก')), onset: isoDate(get(first('วันที่เริ่มป่วย'))), disease: get(first('โรค')),
      icd10: get(first('ICD10')), discharge: isoDate(get(first('วันที่จำหน่ายจากผู้ป่วยใน'))), due: isoDate(get(first('วันที่ครบกำหนดการให้บริการ'))), status: get(first('สถานะ')),
      adl: get(first('ADL')), date, visitNo, svcType: get(first('ประเภทการรับบริการ')), code, service: get(first('ชื่อบริการ')),
      claim: number(get(first('รวมราคาที่ขอเบิก'))), eligible: number(get(first('รวมราคาที่พึงเบิกได้'))), claimStatus: last('สถานะ') > first('สถานะ') ? get(last('สถานะ')) : ''
    });
  }
  return { ok: true, lines, skipped };
}

export function parseImcRep(rows: Rows): ImcParsed<ImcRepLine> {
  const at = find(rows, isRep);
  if (at < 0) return { ok: false, message: NOT_REP };
  const main = titles(row(rows, at));
  const sub = titles(row(rows, at + 1));
  // A sub-title (รวมเงินที่ขอเบิก, ชดเชย, จ่ายเพิ่ม, เรียกคืน) names its column; otherwise the main title does.
  const names = Array.from({ length: Math.max(main.length, sub.length) }, (_, index) => sub[index] || main[index] || '');
  const first = (name: string) => names.indexOf(name);
  const last = (name: string) => names.lastIndexOf(name);
  const lines: ImcRepLine[] = [];
  let skipped = 0;
  for (let i = at + 2; i < rows.length; i++) {
    const cells = row(rows, i);
    const get = (index: number) => (index < 0 ? '' : text(cells[index]));
    const repNo = get(first('REP No.'));
    if (repNo === '') continue;
    const date = isoDate(get(first('วันที่รับบริการ')));
    if (date === '') { skipped++; continue; }
    lines.push({
      repNo, transId: get(first('Trans ID')), itemNo: Math.trunc(number(get(last('ลำดับที่')))), hn: get(first('HN')), name: get(first('ชื่อ-สกุล')), date,
      item: get(first('รายการประเภทที่ขอเบิก')), claim: number(get(first('รวมเงินที่ขอเบิก'))),
      paid: number(get(first('ชดเชย'))) + number(get(first('จ่ายเพิ่ม'))) - number(get(first('เรียกคืน'))), status: get(first('สถานะ'))
    });
  }
  return { ok: true, lines, skipped };
}
