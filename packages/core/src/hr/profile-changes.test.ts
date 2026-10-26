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
  const none = { namePrefix: null, gender: null };

  it('takes the gender from a known prefix when none is given', () => {
    expect(resolveGender('นาย', undefined, none)).toBe('MALE');
    expect(resolveGender('นางสาว', undefined, { namePrefix: 'นาย', gender: 'MALE' })).toBe('FEMALE');
  });

  it('lets a given gender override the prefix', () => {
    expect(resolveGender('นาง', 'MALE', none)).toBe('MALE');
  });

  it('keeps an override when the prefix is saved again unchanged', () => {
    expect(resolveGender('นาง', undefined, { namePrefix: 'นาง', gender: 'MALE' })).toBe('MALE');
  });

  it('needs a gender for a prefix that does not tell, unless one is stored', () => {
    expect(resolveGender('ดร.', undefined, none)).toBe('GENDER_REQUIRED');
    expect(resolveGender('ดร.', undefined, { namePrefix: 'นาง', gender: 'FEMALE' })).toBe('FEMALE');
    expect(resolveGender('ดร.', 'MALE', none)).toBe('MALE');
  });

  it('treats a blank gender from the form as not chosen', () => {
    expect(resolveGender('ดร.', null, none)).toBe('GENDER_REQUIRED');
    expect(resolveGender('ดร.', null, { namePrefix: 'ดร.', gender: 'FEMALE' })).toBe('GENDER_REQUIRED');
    expect(resolveGender('นาง', null, none)).toBe('FEMALE');
  });

  it('keeps the stored gender when neither prefix nor gender is given, and clears it only when no prefix needs it', () => {
    expect(resolveGender(undefined, undefined, { namePrefix: null, gender: 'FEMALE' })).toBe('FEMALE');
    expect(resolveGender(undefined, null, { namePrefix: null, gender: 'FEMALE' })).toBeNull();
    expect(resolveGender(null, undefined, { namePrefix: 'นาย', gender: 'MALE' })).toBe('MALE');
  });
});
