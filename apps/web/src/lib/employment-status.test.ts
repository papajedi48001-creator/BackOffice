import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('employmentStatusLabel', () => {
  it('lives in a server-safe module so server components (HrProfileView) can call it', async () => {
    const { employmentStatusLabel } = await import('./employment-status');
    expect(employmentStatusLabel('ACTIVE')).toBe('ปฏิบัติงาน');
    expect(employmentStatusLabel('TRANSFERRED')).toBe('ย้าย');
    expect(readFileSync(new URL('./employment-status.ts', import.meta.url), 'utf8')).not.toContain("'use client'");
  });

  it('is not imported by the server-rendered profile view from a client module', () => {
    const source = readFileSync(new URL('../components/hr-profile-view.tsx', import.meta.url), 'utf8');
    expect(source).not.toMatch(/from '\.\/people-table'/);
  });
});
