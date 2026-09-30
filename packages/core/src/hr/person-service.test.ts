import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { NationalIdProtector } from '../crypto/national-id';
import { PersonService } from './person-service';

describe('PersonService', () => {
  it('returns a masked national ID and never the plaintext or ciphertext', async () => {
    const inserted: unknown[] = [];
    const service = new PersonService(
      { execute: async (_sql, parameters) => { inserted.push(parameters); } },
      new NationalIdProtector('a'.repeat(64), 'b'.repeat(64)),
      () => randomUUID()
    );

    const person = await service.createPerson({ nationalId: '1234567890123' });

    expect(person.nationalIdMasked).toBe('1-2345-67890-12-3');
    expect(JSON.stringify(person)).not.toContain('1234567890123');
    expect(JSON.stringify(person)).not.toContain('ciphertext');
    expect(inserted).toHaveLength(1);
  });
});
