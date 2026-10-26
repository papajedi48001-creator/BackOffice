import { describe, expect, it } from 'vitest';
import { diffProfile, resolveGender } from './profile-changes';

describe('diffProfile', () => {
  const before = { phone: '0811111111', positionLevel: null, organization: 'งานการพยาบาล' };

  it('reports nothing when every given value matches', () => {
    expect(diffProfile(before, { phone: '0811111111', positionLevel: null }, ['positionLevel', 'organization'])).toEqual({ changedFields: [], workChanges: {} });
  });

  it('keeps old and new values for work fields only', () => {
    expect(diffProfile(before, { phone: '0822222222', positionLevel: 'ชำนาญการ', organization: 'งานเภสัชกรรม' }, ['positionLevel', 'organization'])).toEqual({
      changedFields: ['phone', 'positionLevel', 'organization'],
      workChanges: { positionLevel: { from: null, to: 'ชำนาญการ' }, organization: { from: 'งานการพยาบาล', to: 'งานเภสัชกรรม' } }
    });
  });

  it('leaves absent fields untouched', () => {
    expect(diffProfile(before, { phone: undefined }, [])).toEqual({ changedFields: [], workChanges: {} });
  });
});

describe('resolveGender', () => {
  it('takes the gender from a known prefix when none is given', () => {
    expect(resolveGender('นาย', undefined, null)).toBe('MALE');
    expect(resolveGender('นางสาว', undefined, 'MALE')).toBe('FEMALE');
  });

  it('lets a given gender override the prefix', () => {
    expect(resolveGender('นาง', 'MALE', null)).toBe('MALE');
  });

  it('needs a gender for a prefix that does not tell, unless one is stored', () => {
    expect(resolveGender('ดร.', undefined, null)).toBe('GENDER_REQUIRED');
    expect(resolveGender('ดร.', undefined, 'FEMALE')).toBe('FEMALE');
    expect(resolveGender('ดร.', 'MALE', null)).toBe('MALE');
  });

  it('keeps the stored gender when neither prefix nor gender is given, and clears it on request', () => {
    expect(resolveGender(undefined, undefined, 'FEMALE')).toBe('FEMALE');
    expect(resolveGender(undefined, null, 'FEMALE')).toBeNull();
    expect(resolveGender(null, undefined, 'MALE')).toBe('MALE');
  });
});
