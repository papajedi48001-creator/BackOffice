import { describe, expect, it } from 'vitest';
import { fleetFiscalYear, formatFleetReference } from './fleet-store';

describe('fleet reference', () => {
  it('counts the Thai fiscal year from 1 October, Bangkok date, in พ.ศ.', () => {
    expect(fleetFiscalYear(new Date('2026-10-27T03:00:00Z'))).toBe(2570);
    expect(fleetFiscalYear(new Date('2026-09-30T16:59:00Z'))).toBe(2569);
    expect(fleetFiscalYear(new Date('2026-09-30T17:00:00Z'))).toBe(2570);
    expect(fleetFiscalYear(new Date('2027-01-05T00:00:00Z'))).toBe(2570);
  });

  it('formats VR-<year>-<four digits>', () => {
    expect(formatFleetReference(2570, 1)).toBe('VR-2570-0001');
    expect(formatFleetReference(2570, 12345)).toBe('VR-2570-12345');
  });
});
