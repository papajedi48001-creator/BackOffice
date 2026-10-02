import { randomUUID } from 'node:crypto';
import { createPersonInputSchema, type CreatePersonInput, type Person } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { NationalIdProtector } from '../crypto/national-id';

export class PersonService {
  constructor(private readonly db: Pick<Database, 'execute'>, private readonly protector: NationalIdProtector, private readonly createId = randomUUID) {}

  async createPerson(input: CreatePersonInput): Promise<Person> {
    const validInput = createPersonInputSchema.parse(input);
    const person: Person = { id: this.createId(), nationalIdMasked: this.protector.mask(validInput.nationalId), createdAt: new Date().toISOString() };
    await this.db.execute(
      'INSERT INTO person (id, national_id_ciphertext, national_id_lookup, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())',
      [person.id, this.protector.encrypt(validInput.nationalId), this.protector.lookup(validInput.nationalId)]
    );
    return person;
  }
}
