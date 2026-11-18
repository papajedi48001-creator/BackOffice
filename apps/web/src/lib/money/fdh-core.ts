/**
 * ติดตามกองทุนย่อย FDH: REP × STM by SEQ (VN), status per visit, and the summaries the dashboard shows. A line-for-line port
 * of the legacy `modules/fdh_monitor/fdh-core.js` (same names, same formulas); its tests are ported unchanged in
 * `fdh-core.test.ts`. No DOM here.
 */
import type { FdhDeny, FdhRepCase, FdhStmRow } from '@backoffice/core';

export const UNSPECIFIED = 'ไม่ระบุ';

/** STM money columns shown in the reconciliation tables (IP/DMIS use the amount actually paid). */
export const MONEY_COLUMNS = [
  { key: 'op', label: 'OP' }, { key: 'ip_paid', label: 'IP' }, { key: 'hc', label: 'HC' }, { key: 'hc_drug', label: 'HC-DRUG' },
  { key: 'ae', label: 'AE' }, { key: 'ae_drug', label: 'AE-DRUG' }, { key: 'inst', label: 'INST' }, { key: 'dmis_paid', label: 'DMIS' },
  { key: 'dmis_drug', label: 'DMIS_DRUG' }, { key: 'palliative', label: 'Palliative' }, { key: 'dmishd', label: 'DMISHD' },
  { key: 'pp', label: 'PP' }, { key: 'fs', label: 'FS' }, { key: 'opbkk', label: 'OPBKK' }
] as const;
export type MoneyColumn = (typeof MONEY_COLUMNS)[number];
export type MoneyKey = MoneyColumn['key'];

/** Statuses in the order they are decided (legacy spec 3.3). */
export const STATUS = {
  paid: { label: 'ได้รับเงินแล้ว', icon: '✅' },
  pending: { label: 'รอ STM', icon: '⏳' },
  error: { label: 'ติด C / DENY', icon: '❌' },
  mismatch: { label: 'ยอดไม่ตรง', icon: '⚠️' },
  norep: { label: 'ไม่พบ REP', icon: '❓' }
} as const;
export type FdhStatus = keyof typeof STATUS;

const TOLERANCE = 0.01;
const MIN_RATE_N = 3; // how many single-fund visits make a fixed payment rate
const r2 = (n: unknown) => Math.round((+(n as number) || 0) * 100) / 100;
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v)).trim();

/** Inputs as `data.php` / the documents API gave them (only the fields used are required). */
export type RepCaseIn = Partial<FdhRepCase> & Record<string, unknown>;
export type StmRowIn = Partial<FdhStmRow> & Record<string, unknown>;
export type FdhPayload = {
  reps?: readonly { doc_no?: string; report_date?: string; cases?: readonly RepCaseIn[]; denies?: readonly (Partial<FdhDeny> & Record<string, unknown>)[] }[];
  stms?: readonly { doc_no?: string; period?: string; rows?: readonly StmRowIn[] }[];
};
export type CaseRep = RepCaseIn & { doc_no: string; report_date: string };
export type CaseStm = StmRowIn & { doc_no: string; period: string };
export type FundSplitPart = { funds: string[]; cols: string[]; amount: number; exact: boolean; notes: string[] };
export type FundSplit = { parts: FundSplitPart[]; byFund: Record<string, number>; shared: Record<string, number> };
export type FdhCase = {
  seq: string; current: CaseRep | null; history: CaseRep[]; stm: CaseStm[]; subFunds: string[]; status: FdhStatus; visitDate: string;
  hn: string; name: string; pid: string; tranId: string; right: string; errorCode: string; fixedC: boolean; charge: number; repNet: number;
  stmTotal: number; diff: number; periods: string[]; denies: (Partial<FdhDeny> & Record<string, unknown>)[]; fundSplit: FundSplit | null;
};

export function splitSubFunds(text: unknown): string[] {
  const out: string[] = [];
  for (const p of str(text).split(',')) {
    const s = p.trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

export function hasError(code: unknown): boolean {
  const c = str(code);
  return c !== '' && c !== '-';
}

const caseKey = (seq: unknown, tran: unknown) => (str(seq) !== '' ? str(seq) : 'TRAN:' + str(tran));
/** A newer REP has a higher REP No. (same length compares as text). */
const repOrder = (r: { rep_no?: unknown; report_date?: unknown }) => str(r.rep_no).padStart(12, '0') + '|' + str(r.report_date);
const newer = (a: CaseRep, b: CaseRep) => repOrder(a) > repOrder(b);

type Learned = Record<string, Partial<Record<MoneyKey, { n: number; rate: number | null }>>>;

/** Every REP submission and STM row as visits (1 SEQ = 1 visit). */
export function buildCases(payload: FdhPayload): FdhCase[] {
  type Acc = { seq: string; reps: CaseRep[]; stm: CaseStm[]; periods: string[] };
  const map = new Map<string, Acc>();
  const get = (key: string) => {
    if (!map.has(key)) map.set(key, { seq: key, reps: [], stm: [], periods: [] });
    return map.get(key)!;
  };
  const denyByTran = new Map<string, (Partial<FdhDeny> & Record<string, unknown>)[]>();
  const tranKey = new Map<string, string>(); // TRAN_ID → visit key, for STM rows without SEQ
  for (const doc of payload.reps || []) {
    for (const d of doc.denies || []) {
      const t = str(d.tran_id);
      if (!denyByTran.has(t)) denyByTran.set(t, []);
      denyByTran.get(t)!.push(d);
    }
    for (const c of doc.cases || []) {
      const key = caseKey(c.seq, c.tran_id);
      get(key).reps.push(Object.assign({ doc_no: doc.doc_no as string, report_date: doc.report_date || '' }, c) as CaseRep);
      if (str(c.tran_id)) tranKey.set(str(c.tran_id), key);
    }
  }
  for (const doc of payload.stms || []) {
    for (const r of doc.rows || []) {
      const k = get(str(r.seq) === '' && tranKey.has(str(r.tran_id)) ? tranKey.get(str(r.tran_id))! : caseKey(r.seq, r.tran_id));
      k.stm.push(Object.assign({ doc_no: doc.doc_no as string, period: doc.period || '' }, r) as CaseStm);
      if (doc.period && !k.periods.includes(doc.period)) k.periods.push(doc.period);
    }
  }

  const out: FdhCase[] = [];
  for (const k of map.values()) {
    k.reps.sort((a, b) => (newer(a, b) ? -1 : newer(b, a) ? 1 : 0));
    const current = k.reps[0] || null;
    const history = k.reps.slice(1);
    const s0 = k.stm[0] || null;
    let subFunds: string[] = [];
    for (const r of k.reps) {
      subFunds = splitSubFunds(r.sub_fund);
      if (subFunds.length) break;
    }
    if (!subFunds.length) subFunds = [UNSPECIFIED];

    const repNet = current ? r2(current.net) : 0;
    const stmTotal = r2(k.stm.reduce((s, r) => s + (+(r.total as number) || 0), 0));
    const inStm = k.stm.length > 0;
    const diff = inStm && current ? r2(stmTotal - repNet) : 0;
    let status: FdhStatus;
    if (!current) status = 'norep';
    else if (inStm) status = Math.abs(stmTotal - repNet) > TOLERANCE + 1e-9 ? 'mismatch' : 'paid';
    else status = hasError(current.error_code) ? 'error' : 'pending';

    const base = (current || s0)!;
    const denies: (Partial<FdhDeny> & Record<string, unknown>)[] = [];
    for (const r of k.reps) for (const d of denyByTran.get(str(r.tran_id)) || []) if (!denies.includes(d)) denies.push(d);
    out.push({
      seq: k.seq,
      current,
      history,
      stm: k.stm,
      subFunds,
      status,
      visitDate: (base.visit_date as string) || '',
      hn: str(base.hn),
      name: str(base.name),
      pid: str(base.pid),
      tranId: str(base.tran_id),
      right: (current ? str(current.right) : str(s0!.maininscl)) || '-',
      errorCode: current && hasError(current.error_code) ? str(current.error_code) : '',
      // A visit that had C and whose newer REP passed is not counted as ติด C (the old REP file stays as history).
      fixedC: !!current && !hasError(current.error_code) && history.some((h) => hasError(h.error_code)),
      charge: current ? r2(current.charge) : r2(s0!.charge),
      repNet,
      stmTotal,
      diff,
      periods: k.periods,
      denies,
      fundSplit: null
    });
  }
  out.sort((a, b) => (a.visitDate < b.visitDate ? 1 : a.visitDate > b.visitDate ? -1 : a.seq < b.seq ? -1 : 1));
  const learn = learnFundColumns(out);
  for (const c of out) c.fundSplit = splitVisit(c, learn);
  return out;
}

/**
 * Learns which STM column each sub-fund name (REP) is paid into, from visits that claimed one sub-fund only (e.g. OPAE → AE,
 * OPAE-DRUG → AE-DRUG, TELEMED → OP); follows the uploaded data, nothing hard-coded.
 */
export function learnFundColumns(cases: readonly FdhCase[]): Learned {
  const learn: Learned = {};
  for (const c of cases) {
    if (c.subFunds.length !== 1) continue;
    const f = c.subFunds[0]!;
    for (const m of MONEY_COLUMNS) {
      const amt = r2(c.stm.reduce((s, r) => s + (+(r[m.key] as number) || 0), 0));
      if (!amt) continue;
      const l = (learn[f] = learn[f] || {});
      if (!l[m.key]) l[m.key] = { n: 0, rate: amt };
      l[m.key]!.n++;
      if (l[m.key]!.rate !== amt) l[m.key]!.rate = null; // not a fixed payment rate
    }
  }
  return learn;
}

/**
 * Splits one visit's STM amount by the REP sub-funds. A column only one of the visit's sub-funds is paid into belongs to that
 * fund (exact); several funds in one column, or a fund whose column is not known yet, make a shared amount.
 */
export function splitVisit(c: FdhCase, learn: Learned): FundSplit | null {
  if (!c.stm.length) return null;
  const funds = c.subFunds;
  const groups = new Map<string, FundSplitPart>();
  const add = (fs: readonly string[], col: string, amt: number, note?: string) => {
    const key = fs.join('+');
    if (!groups.has(key)) groups.set(key, { funds: fs.slice(), cols: [], amount: 0, exact: fs.length === 1, notes: [] });
    const g = groups.get(key)!;
    if (col && !g.cols.includes(col)) g.cols.push(col);
    if (note && !g.notes.includes(note)) g.notes.push(note);
    g.amount += amt;
  };
  const rateOf = (f: string, col: MoneyKey) => (learn[f] && learn[f][col] && learn[f][col]!.n >= MIN_RATE_N ? learn[f][col]!.rate : null);
  // Shared column: funds with a fixed rate (same amount every time they were claimed alone) take their rate; the rest goes to the one fund left.
  const byRate = (group: string[], m: MoneyColumn, amt: number) => {
    const known = group.filter((f) => rateOf(f, m.key) !== null);
    const others = group.filter((f) => rateOf(f, m.key) === null);
    if (!known.length || others.length > 1) return false;
    const sum = known.reduce((s, f) => s + rateOf(f, m.key)!, 0);
    const rest = r2(amt - sum);
    if (rest < -TOLERANCE || (!others.length && Math.abs(rest) > TOLERANCE)) return false;
    for (const f of known) add([f], m.label, rateOf(f, m.key)!, `${f} ได้ ${m.label} ${rateOf(f, m.key)} บาทเมื่อเบิกเดี่ยว`);
    if (others.length && Math.abs(rest) > TOLERANCE) add(others, m.label, rest, 'ส่วนที่เหลือหลังหักอัตราของกองทุนอื่น');
    return true;
  };
  let colSum = 0;
  for (const m of MONEY_COLUMNS) {
    const amt = c.stm.reduce((s, r) => s + (+(r[m.key] as number) || 0), 0);
    if (!amt) continue;
    colSum += amt;
    if (funds.length === 1) { add(funds, m.label, amt); continue; }
    const cand = funds.filter((f) => learn[f] && learn[f][m.key]);
    const unknown = funds.filter((f) => !learn[f]);
    if (cand.length === 1 && !unknown.length) { add(cand, m.label, amt); continue; }
    const group = cand.length || unknown.length ? funds.filter((f) => cand.includes(f) || unknown.includes(f)) : funds;
    if (!byRate(group, m, amt)) add(group, m.label, amt);
  }
  const rest = r2(c.stmTotal - colSum);
  if (Math.abs(rest) > TOLERANCE) add(funds, 'อื่น ๆ', rest);
  const parts = [...groups.values()].map((g) => Object.assign(g, { amount: r2(g.amount) }))
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.amount - a.amount);
  const byFund: Record<string, number> = {};
  const shared: Record<string, number> = {};
  for (const f of funds) { byFund[f] = 0; shared[f] = 0; }
  for (const g of parts) for (const f of g.funds) {
    if (g.exact) byFund[f] = r2(byFund[f]! + g.amount); else shared[f] = r2(shared[f]! + g.amount);
  }
  return { parts, byFund, shared };
}

export type CaseFilter = { from?: string; to?: string; periods?: string[]; rights?: string[]; subFund?: string; status?: string; errorCode?: string; fixedC?: boolean; q?: string };

export function filterCases(cases: readonly FdhCase[], filter?: CaseFilter): FdhCase[] {
  const f = filter || {};
  const q = str(f.q).toLowerCase();
  const periods = f.periods && f.periods.length ? f.periods : null;
  const rights = f.rights && f.rights.length ? f.rights : null;
  return cases.filter((c) => {
    if (f.from && c.visitDate < f.from) return false;
    if (f.to && c.visitDate > f.to) return false;
    if (periods && !c.periods.some((p) => periods.includes(p))) return false;
    if (rights && !rights.includes(c.right)) return false;
    if (f.subFund && !c.subFunds.includes(f.subFund)) return false;
    if (f.status && c.status !== f.status) return false;
    if (f.fixedC && !c.fixedC) return false;
    if (f.errorCode && !(c.status === 'error' && c.errorCode.split(',').map((s) => s.trim()).includes(f.errorCode))) return false;
    if (q && ![c.hn, c.name, c.pid, c.seq, c.tranId].some((v) => String(v).toLowerCase().includes(q))) return false;
    return true;
  });
}

export type Totals = { cases: number; charge: number; repNet: number; stmTotal: number; pendingNet: number; errorCases: number; noSeq: number; fixedC: number; paidPct: number };

function totals(cases: readonly FdhCase[]): Totals {
  const t = { cases: 0, charge: 0, repNet: 0, stmTotal: 0, pendingNet: 0, errorCases: 0, noSeq: 0, fixedC: 0, paidPct: 0 };
  let stmWithRep = 0;
  for (const c of cases) {
    t.cases++;
    t.charge += c.charge;
    t.repNet += c.repNet;
    t.stmTotal += c.stmTotal;
    if (c.current) stmWithRep += c.stmTotal;
    if (c.seq.indexOf('TRAN:') === 0) t.noSeq++;
    if (c.status === 'pending') t.pendingNet += c.repNet;
    if (c.status === 'error') t.errorCases++;
    if (c.fixedC) t.fixedC++;
  }
  for (const k of ['charge', 'repNet', 'stmTotal', 'pendingNet'] as const) t[k] = r2(t[k]);
  // % received compares only visits that have a REP (STM money of a ❓ visit has no REP to compare with).
  t.paidPct = t.repNet > 0 ? (stmWithRep / t.repNet) * 100 : 0;
  return t;
}

/** Summary cards: each visit once. */
export function summarize(cases: readonly FdhCase[]): Totals & { byStatus: Record<FdhStatus, number> } {
  const t = totals(cases) as Totals & { byStatus: Record<FdhStatus, number> };
  t.byStatus = {} as Record<FdhStatus, number>;
  for (const k of Object.keys(STATUS) as FdhStatus[]) t.byStatus[k] = 0;
  for (const c of cases) t.byStatus[c.status]++;
  return t;
}

/** By sub-fund: a visit with several sub-funds counts in each. */
export function bySubFund(cases: readonly FdhCase[]): (Totals & { subFund: string })[] {
  const groups = new Map<string, FdhCase[]>();
  for (const c of cases) {
    for (const s of c.subFunds) {
      if (!groups.has(s)) groups.set(s, []);
      groups.get(s)!.push(c);
    }
  }
  return [...groups].map(([subFund, cs]) => Object.assign({ subFund }, totals(cs)))
    .sort((a, b) => b.repNet - a.repNet || b.cases - a.cases);
}

export type MoneyRow = { period: string; rows: number; total: number } & Record<MoneyKey, number>;

/** STM money columns by งวด, then a "รวม" row. */
export function byMoneyColumn(cases: readonly FdhCase[]): MoneyRow[] {
  const blank = (period: string) => {
    const o = { period, rows: 0, total: 0 } as MoneyRow;
    for (const m of MONEY_COLUMNS) o[m.key] = 0;
    return o;
  };
  const per = new Map<string, MoneyRow>();
  const all = blank('รวม');
  for (const c of cases) {
    for (const r of c.stm) {
      if (!per.has(r.period)) per.set(r.period, blank(r.period));
      for (const o of [per.get(r.period)!, all]) {
        o.rows++;
        o.total += +(r.total as number) || 0;
        for (const m of MONEY_COLUMNS) o[m.key] += +(r[m.key] as number) || 0;
      }
    }
  }
  const out = [...per.values()].sort((a, b) => (a.period < b.period ? -1 : 1));
  out.push(all);
  for (const o of out) {
    o.total = r2(o.total);
    for (const m of MONEY_COLUMNS) o[m.key] = r2(o[m.key]);
  }
  return out;
}

export type ErrorGroup = { code: string; cases: number; charge: number; subFunds: string[]; vns: string[] };

/** ติด C visits by Error Code (a code list with "," counts each code). */
export function byErrorCode(cases: readonly FdhCase[]): ErrorGroup[] {
  const groups = new Map<string, ErrorGroup>();
  for (const c of cases) {
    if (c.status !== 'error') continue;
    for (const code of c.errorCode.split(',').map((s) => s.trim()).filter(Boolean)) {
      if (!groups.has(code)) groups.set(code, { code, cases: 0, charge: 0, subFunds: [], vns: [] });
      const g = groups.get(code)!;
      g.cases++;
      g.charge += c.charge;
      g.vns.push(c.seq);
      for (const s of c.subFunds) if (!g.subFunds.includes(s)) g.subFunds.push(s);
    }
  }
  return [...groups.values()].map((g) => (g.charge = r2(g.charge), g.subFunds.sort(), g))
    .sort((a, b) => b.cases - a.cases || (a.code < b.code ? -1 : 1));
}

export type PersonGroup = {
  key: string; hn: string; pid: string; name: string; right: string; lastDate: string; visits: number; charge: number; repNet: number;
  stmTotal: number; money: Record<MoneyKey, number>; cases: FdhCase[];
};

/** By person: every visit of one HN (no HN: PID) with the STM amounts per money column. */
export function byPerson(cases: readonly FdhCase[]): PersonGroup[] {
  const groups = new Map<string, PersonGroup>();
  for (const c of cases) {
    const key = c.hn ? c.hn : 'PID:' + (c.pid || c.seq);
    if (!groups.has(key)) {
      const money = {} as Record<MoneyKey, number>;
      for (const m of MONEY_COLUMNS) money[m.key] = 0;
      groups.set(key, { key, hn: c.hn, pid: c.pid, name: c.name, right: c.right, lastDate: '', visits: 0, charge: 0, repNet: 0, stmTotal: 0, money, cases: [] });
    }
    const g = groups.get(key)!;
    g.visits++;
    g.charge += c.charge;
    g.repNet += c.repNet;
    g.stmTotal += c.stmTotal;
    g.cases.push(c);
    if (c.visitDate >= g.lastDate) { g.lastDate = c.visitDate; g.right = c.right; if (c.name) g.name = c.name; }
    for (const r of c.stm) for (const m of MONEY_COLUMNS) g.money[m.key] += +(r[m.key] as number) || 0;
  }
  const out = [...groups.values()];
  for (const g of out) {
    for (const k of ['charge', 'repNet', 'stmTotal'] as const) g[k] = r2(g[k]);
    for (const m of MONEY_COLUMNS) g.money[m.key] = r2(g.money[m.key]);
  }
  return out.sort((a, b) => b.stmTotal - a.stmTotal || b.repNet - a.repNet || (a.key < b.key ? -1 : 1));
}

export type PersonFundGroup = {
  key: string; personKey: string; hn: string; pid: string; name: string; right: string; subFund: string; lastDate: string; visits: number;
  shared: number; pending: number; charge: number; repNet: number; stmTotal: number; stmFund: number; stmShared: number; cases: FdhCase[];
};

/**
 * By person and REP sub-fund: one row per (person, sub-fund). A visit with several sub-funds counts in full in each (shared),
 * because STM has no amount per REP sub-fund name.
 */
export function byPersonFund(cases: readonly FdhCase[], onlySub?: string): PersonFundGroup[] {
  const groups = new Map<string, PersonFundGroup>();
  const personTotal = new Map<string, number>();
  for (const c of cases) {
    const pk = c.hn ? c.hn : 'PID:' + (c.pid || c.seq);
    personTotal.set(pk, (personTotal.get(pk) || 0) + c.stmTotal);
    for (const sf of c.subFunds) {
      if (onlySub && sf !== onlySub) continue;
      const key = pk + '|' + sf;
      if (!groups.has(key)) groups.set(key, { key, personKey: pk, hn: c.hn, pid: c.pid, name: c.name, right: c.right, subFund: sf, lastDate: '', visits: 0, shared: 0, pending: 0, charge: 0, repNet: 0, stmTotal: 0, stmFund: 0, stmShared: 0, cases: [] });
      const g = groups.get(key)!;
      g.visits++;
      if (c.subFunds.length > 1) g.shared++;
      if (!c.stm.length) g.pending++;
      if (c.fundSplit) { g.stmFund += c.fundSplit.byFund[sf] || 0; g.stmShared += c.fundSplit.shared[sf] || 0; }
      g.charge += c.charge;
      g.repNet += c.repNet;
      g.stmTotal += c.stmTotal;
      g.cases.push(c);
      if (c.visitDate >= g.lastDate) { g.lastDate = c.visitDate; g.right = c.right; if (c.name) g.name = c.name; }
    }
  }
  const out = [...groups.values()];
  for (const g of out) for (const k of ['charge', 'repNet', 'stmTotal', 'stmFund', 'stmShared'] as const) g[k] = r2(g[k]);
  const tot = (g: PersonFundGroup) => personTotal.get(g.personKey)!;
  return out.sort((a, b) => tot(b) - tot(a) || (a.personKey < b.personKey ? -1 : a.personKey > b.personKey ? 1 : 0)
    || b.stmFund - a.stmFund || b.stmShared - a.stmShared || b.repNet - a.repNet || (a.subFund < b.subFund ? -1 : 1));
}

export type FundVisitRow = { key: string; case: FdhCase; own: number; shared: number };
export type FundVisitGroup = { subFund: string; persons: number; visits: number; repNet: number; stmFund: number; stmShared: number; pending: number; rows: FundVisitRow[] };

/**
 * By REP sub-fund → the visits that claimed it, ordered by HN. own = this fund's STM amount in that visit; shared = amount in a
 * column shared with another fund.
 */
export function byFundVisit(cases: readonly FdhCase[]): FundVisitGroup[] {
  const funds = new Map<string, FundVisitGroup & { _p: Set<string> }>();
  for (const c of cases) {
    for (const sf of c.subFunds) {
      if (!funds.has(sf)) funds.set(sf, { subFund: sf, persons: 0, visits: 0, repNet: 0, stmFund: 0, stmShared: 0, pending: 0, rows: [], _p: new Set() });
      const g = funds.get(sf)!;
      const own = c.fundSplit ? c.fundSplit.byFund[sf] || 0 : 0;
      const shared = c.fundSplit ? c.fundSplit.shared[sf] || 0 : 0;
      g._p.add(c.hn || 'PID:' + (c.pid || c.seq));
      g.visits++;
      g.repNet += c.repNet;
      g.stmFund += own;
      g.stmShared += shared;
      if (!c.stm.length) g.pending++;
      g.rows.push({ key: sf + '|' + c.seq, case: c, own, shared });
    }
  }
  const out = [...funds.values()].map(({ _p, ...g }) => {
    g.persons = _p.size;
    for (const k of ['repNet', 'stmFund', 'stmShared'] as const) g[k] = r2(g[k]);
    g.rows.sort((a, b) => (a.case.hn < b.case.hn ? -1 : a.case.hn > b.case.hn ? 1 : 0)
      || (a.case.visitDate < b.case.visitDate ? -1 : a.case.visitDate > b.case.visitDate ? 1 : 0) || (a.case.seq < b.case.seq ? -1 : 1));
    return g;
  });
  return out.sort((a, b) => b.stmFund - a.stmFund || b.repNet - a.repNet || (a.subFund < b.subFund ? -1 : 1));
}
