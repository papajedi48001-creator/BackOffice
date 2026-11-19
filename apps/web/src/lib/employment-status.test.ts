import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('employmentStatusLabel', () => {
  it('lives in a server-safe module so server components (HrProfileView) can call it', async () => {
    const { employmentStatusLabel } = await import('./employment-status');
    expect(employmentStatusLabel('ACTIVE')).toBe('ปฏิบัติงาน');
    expect(employmentStatusLabel('TRANSFERRED')).toBe('ย้าย');
    expect(readFileSync('src/lib/employment-status.ts', 'utf8').trimStart().startsWith("'use client'")).toBe(false);
  });

  it('is not imported by the server-rendered profile view from a client module', () => {
    const source = readFileSync('src/components/hr-profile-view.tsx', 'utf8');
    expect(source).not.toMatch(/from '\.\/people-table'/);
  });
});
