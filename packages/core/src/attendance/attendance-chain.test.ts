import { describe, expect, it } from 'vitest';
import { canonicalJson, chainHash, checkChain, GENESIS_HASH, type ChainRow } from './attendance-chain';

describe('canonicalJson', () => {
  it('sorts keys at every depth and writes dates as ISO', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3] } })).toBe('{"a":{"c":[3],"d":2},"b":1}');
    expect(canonicalJson({ at: new Date('2026-11-10T01:02:03.000Z') })).toBe('{"at":"2026-11-10T01:02:03.000Z"}');
  });
});

describe('chainHash', () => {
  it('is SHA-256 of the previous hash, record type, id and canonical record', () => {
    expect(chainHash(GENESIS_HASH, 'audit_event', 'id-1', '{"a":1}')).toBe('f1284c37373d75fc11cf6de20367ef8bcf4a718cb6387ec0af92a0ec8e7e4fac');
  });
});

describe('checkChain', () => {
  const records: Record<string, string> = { r1: '{"n":1}', r2: '{"n":2}', r3: '{"n":3}' };
  const build = (): ChainRow[] => {
    let prevHash = GENESIS_HASH;
    return ['r1', 'r2', 'r3'].map((recordId, index) => {
      const hash = chainHash(prevHash, 'audit_event', recordId, records[recordId]!);
      const row = { seq: index + 1, recordType: 'audit_event', recordId, prevHash, hash };
      prevHash = hash;
      return row;
    });
  };
  const canonicalOf = (row: ChainRow) => records[row.recordId] ?? null;
  const headOf = (rows: ChainRow[]) => ({ lastSeq: rows.at(-1)!.seq, lastHash: rows.at(-1)!.hash });

  it('accepts an intact chain', () => {
    const rows = build();
    expect(checkChain(rows, canonicalOf, headOf(rows))).toEqual({ ok: true, length: 3 });
  });
  it('finds a changed record', () => {
    const rows = build();
    expect(checkChain(rows, (row) => row.recordId === 'r2' ? '{"n":20}' : canonicalOf(row), headOf(rows))).toEqual({ ok: false, brokenAtSeq: 2, reason: 'HASH_MISMATCH' });
  });
  it('finds a removed row, a rewritten link, a missing record and a head that does not match', () => {
    const rows = build();
    expect(checkChain([rows[0]!, rows[2]!], canonicalOf, headOf(rows))).toEqual({ ok: false, brokenAtSeq: 3, reason: 'SEQ_GAP' });
    expect(checkChain([rows[0]!, { ...rows[1]!, prevHash: 'f'.repeat(64) }, rows[2]!], canonicalOf, headOf(rows))).toEqual({ ok: false, brokenAtSeq: 2, reason: 'PREV_MISMATCH' });
    expect(checkChain(rows, (row) => row.recordId === 'r3' ? null : canonicalOf(row), headOf(rows))).toEqual({ ok: false, brokenAtSeq: 3, reason: 'RECORD_MISSING' });
    expect(checkChain(rows.slice(0, 2), canonicalOf, headOf(rows))).toEqual({ ok: false, brokenAtSeq: 3, reason: 'HEAD_MISMATCH' });
  });
});
