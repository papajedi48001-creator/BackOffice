import { createDatabase, linkIdentity, runMigrations, seedPerson } from '../index';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('R0 foundation schema', () => {
  const db = databaseUrl ? createDatabase(databaseUrl) : undefined as never;

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

  it('stores navigation and read state once per notification event channel', async () => {
    const suffix = crypto.randomUUID();
    const requestorId = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    const eventId = crypto.randomUUID();

    await seedPerson(db, {
      personId: requestorId,
      nationalIdCiphertext: `ciphertext-${suffix}`,
      nationalIdLookup: `hmac-${suffix}`
    });
    await db.execute('INSERT INTO request (id, reference, module_code, requestor_person_id, organization_snapshot, status, created_at) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())', [requestId, `REQ-${suffix}`, 'maintenance', requestorId, '{}', 'IN_REVIEW']);
    await db.execute('INSERT INTO outbox_event (id, type, idempotency_key, payload, occurred_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [eventId, 'notification.in_app', `notification:${suffix}`, '{}']);
    await db.execute('INSERT INTO notification (id, outbox_event_id, channel, recipient_person_id, request_id, subject, delivered_at, read_at, created_at) VALUES (UUID(), ?, ?, ?, ?, ?, UTC_TIMESTAMP(), NULL, UTC_TIMESTAMP())', [eventId, 'in_app', requestorId, requestId, 'มีคำขอรอพิจารณา']);

    await expect(db.execute('INSERT INTO notification (id, outbox_event_id, channel, recipient_person_id, request_id, subject, delivered_at, read_at, created_at) VALUES (UUID(), ?, ?, ?, ?, ?, UTC_TIMESTAMP(), NULL, UTC_TIMESTAMP())', [eventId, 'in_app', requestorId, requestId, 'มีคำขอรอพิจารณา']))
      .rejects.toThrow();
  });
});
