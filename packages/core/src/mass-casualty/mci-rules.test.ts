import { describe, expect, it } from 'vitest';
import { defaultZoneFor, formatTag, publicName, reconcileDeceased } from './mci-rules';

describe('formatTag', () => {
  it('pads to three digits and grows past 999', () => {
    expect(formatTag(7)).toBe('MCI-007');
    expect(formatTag(1000)).toBe('MCI-1000');
  });
});

describe('publicName', () => {
  it('shows the full first name and surname', () => {
    expect(publicName('สมชาย', 'ใจดี')).toBe('สมชาย ใจดี');
    expect(publicName(' Somchai ', ' jaidee')).toBe('Somchai jaidee');
  });
  it('shows a first name alone, and nothing for a casualty without one', () => {
    expect(publicName('สมชาย', '')).toBe('สมชาย');
    expect(publicName('  ', 'ใจดี')).toBeNull();
  });
});

describe('reconcileDeceased', () => {
  const ids = { deceasedTriageId: 'black', deceasedStatusId: 'dead' };
  it('turns the black colour into the deceased status and the deceased status into black', () => {
    expect(reconcileDeceased({ triageLevelId: 'black', statusId: 'treating' }, null, ids)).toEqual({ ok: true, triageLevelId: 'black', statusId: 'dead' });
    expect(reconcileDeceased({ triageLevelId: 'red', statusId: 'dead' }, { triageLevelId: 'red', statusId: 'treating' }, ids)).toEqual({ ok: true, triageLevelId: 'black', statusId: 'dead' });
  });
  it('needs a new colour when a casualty leaves the deceased status', () => {
    expect(reconcileDeceased({ triageLevelId: 'black', statusId: 'treating' }, { triageLevelId: 'black', statusId: 'dead' }, ids)).toEqual({ ok: false, code: 'TRIAGE_REQUIRED' });
    expect(reconcileDeceased({ triageLevelId: 'red', statusId: 'treating' }, { triageLevelId: 'black', statusId: 'dead' }, ids)).toEqual({ ok: true, triageLevelId: 'red', statusId: 'treating' });
  });
  it('leaves other choices alone', () => {
    expect(reconcileDeceased({ triageLevelId: 'red', statusId: 'treating' }, null, ids)).toEqual({ ok: true, triageLevelId: 'red', statusId: 'treating' });
  });
});

describe('defaultZoneFor', () => {
  const rules = [{ professionId: 'nurse', zoneId: 'er' }, { professionId: 'porter', zoneId: 'closed-zone' }, { professionId: 'admin', zoneId: null }];
  it('follows the rule for the profession when its zone is in use', () => {
    expect(defaultZoneFor('nurse', rules, new Set(['er']))).toBe('er');
  });
  it('waits for a zone without a rule, with a switched-off zone or with no zone', () => {
    expect(defaultZoneFor('doctor', rules, new Set(['er']))).toBeNull();
    expect(defaultZoneFor('porter', rules, new Set(['er']))).toBeNull();
    expect(defaultZoneFor('admin', rules, new Set(['er']))).toBeNull();
  });
});
