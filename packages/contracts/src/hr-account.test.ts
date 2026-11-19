import { describe, expect, it } from 'vitest';
import { createPersonWithAccountInputSchema, localAccountInputSchema, setPasswordInputSchema, thaiNationalIdSchema, updatePersonIdentityInputSchema, usernameSchema } from './hr-account';

const person = { nationalId: '1101700230708', firstName: 'สมใจ', lastName: 'ใจดี', username: 'somjai.j' };

describe('person account contracts', () => {
  it('accepts a 13-digit national ID with a valid check digit, with or without dashes', () => {
    expect(thaiNationalIdSchema.parse('1-1017-00230-70-8')).toBe('1101700230708');
    expect(thaiNationalIdSchema.safeParse('1101700230704').success).toBe(false);
    expect(thaiNationalIdSchema.safeParse('110170023070').success).toBe(false);
  });

  it('keeps usernames to letters, digits, dot, dash and underscore', () => {
    expect(usernameSchema.parse(' somjai.j ')).toBe('somjai.j');
    expect(usernameSchema.safeParse('สมใจ').success).toBe(false);
    expect(usernameSchema.safeParse('ab').success).toBe(false);
  });

  it('needs a name and a username, but no password, to create a person or an account', () => {
    expect(createPersonWithAccountInputSchema.parse(person)).toMatchObject({ nationalId: '1101700230708', username: 'somjai.j' });
    expect(createPersonWithAccountInputSchema.safeParse({ ...person, password: 'a-long-secret' }).success).toBe(false);
    expect(createPersonWithAccountInputSchema.safeParse({ ...person, firstName: undefined }).success).toBe(false);
    expect(localAccountInputSchema.safeParse({ username: 'somjai.j' }).success).toBe(true);
    expect(localAccountInputSchema.safeParse({ username: 'somjai.j', password: 'a-long-secret' }).success).toBe(false);
    expect(setPasswordInputSchema.safeParse({ password: '1234567' }).success).toBe(false);
  });

  it('has no username or รหัสบุคลากร among the identity fields HR can change, and knows ย้าย', () => {
    expect(updatePersonIdentityInputSchema.parse({ employmentStatus: 'TRANSFERRED' })).toEqual({ employmentStatus: 'TRANSFERRED' });
    expect(updatePersonIdentityInputSchema.safeParse({ employeeCode: 'E001' }).success).toBe(false);
    expect(updatePersonIdentityInputSchema.safeParse({ username: 'new.name' }).success).toBe(false);
  });
});
