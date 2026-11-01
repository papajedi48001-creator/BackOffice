import { describe, expect, it } from 'vitest';
import { createPersonWithAccountInputSchema, localAccountInputSchema, setPasswordInputSchema, thaiNationalIdSchema, updatePersonIdentityInputSchema, usernameSchema } from './hr-account';

const person = { nationalId: '1101700230708', firstName: 'สมใจ', lastName: 'ใจดี', username: 'somjai.j', password: 'a-long-secret' };

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

  it('needs a name, a username and a password of 8 to 128 characters to create a person', () => {
    expect(createPersonWithAccountInputSchema.parse(person)).toMatchObject({ nationalId: '1101700230708', username: 'somjai.j' });
    expect(createPersonWithAccountInputSchema.safeParse({ ...person, password: 'short' }).success).toBe(false);
    expect(createPersonWithAccountInputSchema.safeParse({ ...person, password: 'x'.repeat(129) }).success).toBe(false);
    expect(createPersonWithAccountInputSchema.safeParse({ ...person, firstName: undefined }).success).toBe(false);
    expect(localAccountInputSchema.safeParse({ username: 'somjai.j', password: 'a-long-secret' }).success).toBe(true);
    expect(setPasswordInputSchema.safeParse({ password: '1234567' }).success).toBe(false);
  });

  it('has no username among the identity fields HR can change', () => {
    expect(updatePersonIdentityInputSchema.parse({ employeeCode: ' E001 ', employmentStatus: 'INACTIVE' })).toEqual({ employeeCode: 'E001', employmentStatus: 'INACTIVE' });
    expect(updatePersonIdentityInputSchema.safeParse({ username: 'new.name' }).success).toBe(false);
  });
});
