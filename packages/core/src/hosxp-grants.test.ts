import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourceRoot = fileURLToPath(new URL('.', import.meta.url));
const grantFile = new URL('../../../infra/hosxp/grant-backoffice-api.sql', import.meta.url);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'fixtures' ? [] : sourceFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [path] : [];
  });
}

/** Every file that opens a HOSxP connection, with the tables its SQL names after FROM or JOIN (comments stripped). */
function hosxpTables(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const path of sourceFiles(sourceRoot)) {
    const source = readFileSync(path, 'utf8');
    if (!/import[^;]*\bhosxpConnectionUrl\b/.test(source)) continue;
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const tables = [...code.matchAll(/\b(?:FROM|JOIN)\s+`?([a-z_][a-z0-9_]*)`?/g)]
      .map((match) => match[1]!)
      .filter((table) => table !== 'information_schema');
    found.set(path.slice(sourceRoot.length), [...new Set(tables)]);
  }
  return found;
}

function grantedTables(privilege: string): Set<string> {
  const sql = readFileSync(grantFile, 'utf8');
  const granted = new Set<string>();
  for (const match of sql.matchAll(/^GRANT\s+([A-Z, ]+)\s+ON\s+`?([a-z_][a-z0-9_]*)`?\s+TO\s+'backoffice_api'@'%';$/gm)) {
    if (match[1]!.split(',').map((part) => part.trim()).includes(privilege)) granted.add(match[2]!);
  }
  return granted;
}

describe('HOSxP grants for backoffice_api', () => {
  it('finds the HOSxP readers it guards', () => {
    expect([...hosxpTables().keys()]).toEqual(expect.arrayContaining(['smart-money/dental-reader.ts', 'smart-money/herb-reader.ts', 'smart-money/ttm-reader.ts', 'holidays/hosxp-holiday-reader.ts', 'pttype-mapping/pttype-mapping-hosxp.ts']));
  });

  it('grants SELECT on every HOSxP table the code reads', () => {
    const granted = grantedTables('SELECT');
    const missing = [...hosxpTables()].flatMap(([file, tables]) => tables.filter((table) => !granted.has(table)).map((table) => `${file}: ${table}`));
    expect(missing).toEqual([]);
  });

  it('grants the ผูกผังบัญชี writes only on the two mapping tables', () => {
    expect([...grantedTables('INSERT')].sort()).toEqual(['paccountipd', 'paccountopd']);
    expect([...grantedTables('DELETE')].sort()).toEqual(['paccountipd', 'paccountopd']);
    expect([...grantedTables('UPDATE')]).toEqual([]);
  });
});
