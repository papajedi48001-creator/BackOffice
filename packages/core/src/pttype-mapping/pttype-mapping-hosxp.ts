import type { PttypeMappingInput } from '@backoffice/contracts';
import { createDatabase, type Database } from '@backoffice/db';
import { hosxpConnectionUrl, type HosxpConnection } from '../holidays/hosxp-settings-service';
import { fixThaiText } from '../smart-money/thai-text';

export type MappingSide = 'opd' | 'ipd';
/** ผังบัญชีปัจจุบัน of one side. `name` is null when the code is no longer in `paccount`; `modifiedAt` is HOSxP local time. */
export type MappedAccount = { code: string; name: string | null; modifiedAt: string | null };
export type PttypeRight = { code: string; name: string; opd: MappedAccount | null; ipd: MappedAccount | null };
export type AccountOption = { code: string; name: string };
export type MappingSnapshot = { rights: PttypeRight[]; opdAccounts: AccountOption[]; ipdAccounts: AccountOption[] };
export type MappingWrite = { ok: true; from: { opd: string | null; ipd: string | null } } | { ok: false; code: 'NOT_FOUND' | 'STALE' | 'INVALID_ACCOUNT' | 'NO_CHANGE' | 'NOT_TRANSACTIONAL' };

const SIDES: readonly MappingSide[] = ['opd', 'ipd'];
const table = (side: MappingSide) => (side === 'opd' ? 'paccountopd' : 'paccountipd');
const text = (value: string | null) => fixThaiText(value ?? '').trim();

/** The ผังบัญชีปัจจุบัน rule: the row with the latest `last_modify` (no stamp counts as oldest), then the lowest code. */
const LATEST_ORDER = 'ORDER BY last_modify IS NULL, last_modify DESC, paccount ASC';
/** Each code's name from its latest `paccount_year`. */
const NAME_OF = (code: string) => `(SELECT n.name FROM paccount n WHERE n.paccount = ${code} ORDER BY n.paccount_year DESC LIMIT 1)`;

async function withHosxp<T>(connection: HosxpConnection, work: (hosxp: Database) => Promise<T>): Promise<T> {
  const hosxp = createDatabase(hosxpConnectionUrl(connection));
  try { return await work(hosxp); } finally { await hosxp.close(); }
}

type RightRow = { pttype: string; name: string | null } & Record<`${MappingSide}_${'code' | 'name' | 'at'}`, string | null>;

const sideColumns = (side: MappingSide) => {
  const latest = `(SELECT m.paccount FROM ${table(side)} m WHERE m.pttype = p.pttype ${LATEST_ORDER.replace(/last_modify|paccount ASC/g, (part) => `m.${part}`)} LIMIT 1)`;
  return `${latest} AS ${side}_code, ${NAME_OF(latest)} AS ${side}_name,
    (SELECT DATE_FORMAT(m.last_modify, '%Y-%m-%d %H:%i:%s') FROM ${table(side)} m WHERE m.pttype = p.pttype ${LATEST_ORDER.replace(/last_modify|paccount ASC/g, (part) => `m.${part}`)} LIMIT 1) AS ${side}_at`;
};

const mapped = (row: RightRow, side: MappingSide): MappedAccount | null => {
  const code = row[`${side}_code`];
  if (!code) return null;
  const name = row[`${side}_name`];
  return { code, name: name === null ? null : text(name), modifiedAt: row[`${side}_at`] };
};

const accountOptions = (hosxp: Database, side: MappingSide) => hosxp.query<{ code: string; name: string | null }>(
  `SELECT a.paccount AS code, ${NAME_OF('a.paccount')} AS name FROM paccount a WHERE LOWER(a.type) IN (?, 'all') GROUP BY a.paccount ORDER BY a.paccount`, [side]);

/** สิทธิที่ใช้งาน (`isuse = 'Y'`) with each side's ผังบัญชีปัจจุบัน, and the ผังบัญชี each side may be given. Read-only SELECTs. */
export async function readPttypeMappings(connection: HosxpConnection): Promise<MappingSnapshot> {
  return withHosxp(connection, async (hosxp) => {
    const rights = await hosxp.query<RightRow>(`SELECT p.pttype, p.name, ${SIDES.map(sideColumns).join(', ')} FROM pttype p WHERE p.isuse = 'Y' ORDER BY p.pttype`);
    const [opd, ipd] = await Promise.all(SIDES.map((side) => accountOptions(hosxp, side)));
    const options = (rows: { code: string; name: string | null }[]) => rows.map((row) => ({ code: row.code, name: text(row.name) }));
    return { rights: rights.map((row) => ({ code: row.pttype, name: text(row.name), opd: mapped(row, 'opd'), ipd: mapped(row, 'ipd') })), opdAccounts: options(opd!), ipdAccounts: options(ipd!) };
  });
}

/**
 * ผูกผังบัญชี of one สิทธิ in one HOSxP transaction: refuse when a mapping table is not InnoDB (a failed insert could not
 * roll back), take a named lock for the สิทธิ (needs no table privilege, unlike `FOR UPDATE` on `pttype` under MySQL 8),
 * lock its rows, refuse when they no longer match what the person saw, then for each changed side delete every row and
 * insert one row stamped `last_modify = NOW()`.
 * `paccount_year` stays 2017 like the legacy tool; nothing reads it any more. Driver errors are thrown for the caller to map.
 */
export async function writePttypeMapping(connection: HosxpConnection, pttype: string, input: PttypeMappingInput): Promise<MappingWrite> {
  return withHosxp(connection, async (hosxp) => {
    const engines = await hosxp.query<{ engine: string | null }>("SELECT ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('paccountopd', 'paccountipd')");
    if (engines.length !== 2 || engines.some((row) => row.engine?.toLowerCase() !== 'innodb')) return { ok: false, code: 'NOT_TRANSACTIONAL' } as const;
    return hosxp.transaction(async (tx) => {
      const lock = `backoffice:pttype-mapping:${pttype}`;
      const [locked] = await tx.query<{ got: number | null }>('SELECT GET_LOCK(?, 10) AS got', [lock]);
      if (Number(locked?.got) !== 1) return { ok: false, code: 'STALE' } as const;
      try { return await writeLocked(tx, pttype, input); } finally { await tx.query('SELECT RELEASE_LOCK(?)', [lock]); }
    });
  });
}

async function writeLocked(tx: Database, pttype: string, input: PttypeMappingInput): Promise<MappingWrite> {
  const [right] = await tx.query<{ pttype: string }>("SELECT pttype FROM pttype WHERE pttype = ? AND isuse = 'Y'", [pttype]);
  if (!right) return { ok: false, code: 'NOT_FOUND' } as const;
  const from = { opd: null as string | null, ipd: null as string | null };
  for (const side of SIDES) {
    const rows = await tx.query<{ paccount: string }>(`SELECT paccount FROM ${table(side)} WHERE pttype = ? ${LATEST_ORDER} FOR UPDATE`, [pttype]);
    from[side] = rows[0]?.paccount ?? null;
  }
  if (from.opd !== input.expected.opd || from.ipd !== input.expected.ipd) return { ok: false, code: 'STALE' } as const;
  const changed = SIDES.filter((side) => input[side] !== from[side]);
  if (changed.length === 0) return { ok: false, code: 'NO_CHANGE' } as const;
  for (const side of changed) {
    const code = input[side];
    if (code === null) continue;
    const [account] = await tx.query<{ paccount: string }>('SELECT paccount FROM paccount WHERE paccount = ? AND LOWER(type) IN (?, \'all\') LIMIT 1', [code, side]);
    if (!account) return { ok: false, code: 'INVALID_ACCOUNT' } as const;
  }
  for (const side of changed) {
    await tx.execute(`DELETE FROM ${table(side)} WHERE pttype = ?`, [pttype]);
    if (input[side] !== null) await tx.execute(`INSERT INTO ${table(side)} (pttype, paccount, iclaim_status, paccount_year, last_modify) VALUES (?, ?, 1, 2017, NOW())`, [pttype, input[side]]);
  }
  return { ok: true, from } as const;
}
