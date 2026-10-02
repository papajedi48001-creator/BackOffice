import { createDatabase, linkIdentity, runMigrations, seedPerson } from '../index';

const databaseUrl = process.env.DATABASE_URL ?? 'mysql://backoffice:local-development-only@127.0.0.1:3307/backoffice';

describe('R0 foundation schema', () => {
  const db = createDatabase(databaseUrl);

  beforeAll(async () => {
    await runMigrations(db);
  });

  afterAll(async () => {
    await db.close();
  });

  it('rejects a duplicate identity link for one OIDC issuer and subject', async () => {
    const suffix = crypto.randomUUID();
    const personId = crypto.randomUUID();

    await seedPerson(db, {
      personId,
      nationalIdCiphertext: `ciphertext-${suffix}`,
      nationalIdLookup: `hmac-${suffix}`
    });
    await linkIdentity(db, { personId, issuer: 'https://sso.example', subject: suffix });

    await expect(linkIdentity(db, { personId, issuer: 'https://sso.example', subject: suffix }))
      .rejects.toThrow();
  });
});
