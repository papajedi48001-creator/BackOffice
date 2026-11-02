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

  it('keeps the logged code and logs nothing more when wrong codes are tried', () => {
    issueSetupCode(log);
    const first = lastCode();
    for (let attempt = 0; attempt < 50; attempt += 1) expect(verifySetupCode('WRONG-CODE-0000', log)).toBe(false);
    expect(lines).toHaveLength(1);
    expect(verifySetupCode(first, log)).toBe(true);
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
