// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { clearSetupCode, issueSetupCode, verifySetupCode } from './setup-code';

const pattern = /^backoffice\.setup\.code ([A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4})$/;

describe('setup code', () => {
  let lines: string[];
  const log = (line: string) => { lines.push(line); };
  const lastCode = () => pattern.exec(lines.at(-1)!)![1]!;
  beforeEach(() => { clearSetupCode(); lines = []; });

  it('logs one code in XXXX-XXXX-XXXX form and keeps it when issued again', () => {
    issueSetupCode(log); issueSetupCode(log);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(pattern);
  });

  it('accepts the code in lower case without dashes', () => {
    issueSetupCode(log);
    expect(verifySetupCode(lastCode().toLowerCase().replace(/-/g, ''), log)).toBe(true);
  });

  it('replaces the code after five wrong tries', () => {
    issueSetupCode(log);
    const first = lastCode();
    for (let attempt = 0; attempt < 5; attempt += 1) expect(verifySetupCode('WRONG-CODE-0000', log)).toBe(false);
    expect(lines).toHaveLength(2);
    expect(verifySetupCode(first, log)).toBe(false);
    expect(verifySetupCode(lastCode(), log)).toBe(true);
  });

  it('issues a code on first use when none was issued at start', () => {
    expect(verifySetupCode('ABCD-EFGH-JKLM', log)).toBe(false);
    expect(lines[0]).toMatch(pattern);
  });

  it('refuses every code once cleared', () => {
    issueSetupCode(log);
    const code = lastCode();
    clearSetupCode();
    expect(verifySetupCode(code, log)).toBe(false);
  });
});
