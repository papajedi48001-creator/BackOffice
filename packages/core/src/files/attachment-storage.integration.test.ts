import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AccessSubject, Attachment } from '@backoffice/contracts';
import { createDatabase, runMigrations } from '@backoffice/db';
import { commandChainResolver, createLeaveOrganization, createLeavePerson, LEAVE_TYPE_IDS } from '../leave/leave-fixtures';
import { LeaveService } from '../leave/leave-service';
import { OfficialTravelService } from '../official-travel/travel-service';
import { AttachmentAccess } from './attachment-access';
import { DatabaseAttachmentRepository } from './database-attachment-repository';
import { S3ObjectStorage } from './s3-object-storage';

const databaseUrl = process.env.DATABASE_URL;
const s3Endpoint = process.env.S3_ENDPOINT;
const staff = (personId: string): AccessSubject => ({ authenticated: true, personId, roles: [{ name: 'staff', organizationId: null }], dataOwnerModules: [] });

(s3Endpoint ? describe : describe.skip)('S3ObjectStorage against an S3 server', () => {
  it('creates the bucket on first use and reads back what it stored', async () => {
    const storage = new S3ObjectStorage({ endpoint: s3Endpoint!, bucket: `test-${randomUUID().slice(0, 8)}`, region: 'us-east-1', accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '', secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '' });
    const bytes = new TextEncoder().encode('%PDF-1.7 ใบรับรองแพทย์');
    await storage.putPrivate('attachments/one', 'application/pdf', bytes);
    expect(new TextDecoder().decode(await storage.getPrivate('attachments/one'))).toBe('%PDF-1.7 ใบรับรองแพทย์');
    await expect(storage.getPrivate('attachments/missing')).rejects.toThrow();
  });
});

(databaseUrl ? describe : describe.skip)('attachments in MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const repository = new DatabaseAttachmentRepository(database);
  let org: Awaited<ReturnType<typeof createLeaveOrganization>>;
  const attachmentOf = (createdByPersonId: string): Attachment => ({ id: randomUUID(), objectKey: `attachments/${randomUUID()}`, contentType: 'application/pdf', sizeBytes: 1234, createdByPersonId, filename: 'ใบรับรองแพทย์ นายสมชาย.pdf' });

  beforeAll(async () => {
    await runMigrations(database);
    org = await createLeaveOrganization(database);
  });
  afterAll(async () => { await database.close(); });

  it('keeps the file, its scan and an audit event without the name, and reads it back', async () => {
    const person = await createLeavePerson(database, org.section);
    const attachment = attachmentOf(person);
    await repository.save(attachment, 'CLEAN');
    expect(await repository.findById(attachment.id)).toEqual(attachment);
    expect(await repository.findById(randomUUID())).toBeNull();
    const [scan] = await database.query<{ status: string }>('SELECT status FROM attachment_scan WHERE attachment_id = ?', [attachment.id]);
    expect(scan?.status).toBe('CLEAN');
    await repository.recordDownload(attachment.id, org.sectionHead);
    const audits = await database.query<{ action: string; actor: string; metadata: string }>('SELECT action, actor_person_id AS actor, metadata FROM audit_event WHERE target_id = ? ORDER BY action DESC', [attachment.id]);
    expect(audits.map((audit) => [audit.action, audit.actor, JSON.parse(audit.metadata)])).toEqual([
      ['attachment.uploaded', person, { attachmentId: attachment.id, contentType: 'application/pdf', sizeBytes: 1234 }],
      ['attachment.downloaded', org.sectionHead, { attachmentId: attachment.id }]
    ]);
    expect(audits.map((audit) => audit.metadata).join()).not.toMatch(/สมชาย|\.pdf/);
  });

  it('lets in the uploader and whoever may see the ใบลา or trip that holds the file, and nobody else', async () => {
    const person = await createLeavePerson(database, org.section);
    const outsider = await createLeavePerson(database, org.section);
    const onLeave = attachmentOf(person);
    const onTrip = attachmentOf(person);
    const loose = attachmentOf(person);
    for (const attachment of [onLeave, onTrip, loose]) await repository.save(attachment, 'CLEAN');
    const leave = await new LeaveService(database, commandChainResolver(database), { findActiveFor: async () => null }).submit(person, { leaveTypeId: LEAVE_TYPE_IDS.SICK, startDate: '2027-01-04', endDate: '2027-01-04', reason: 'ป่วย' });
    if (!leave.ok) throw new Error(leave.code);
    await database.execute('UPDATE leave_request SET attachment_id = ? WHERE request_id = ?', [onLeave.id, leave.requestId]);
    const trip = await new OfficialTravelService(database, commandChainResolver(database)).submit(person, { subject: 'ประชุม', organiser: 'สสจ.', place: 'ศาลากลาง', province: 'มหาสารคาม', travelType: 'IN_PROVINCE', vehicle: 'PRIVATE_CAR', fundingSource: 'NONE', startDate: '2027-01-11', endDate: '2027-01-11' });
    if (!trip.ok) throw new Error(trip.code);
    await database.execute('UPDATE official_travel SET attachment_id = ? WHERE id = ?', [onTrip.id, trip.travelId]);
    const can = (viewer: string, attachment: Attachment) => new AttachmentAccess(database, staff(viewer)).canDownload({ attachmentId: attachment.id, actorPersonId: viewer }, attachment);
    expect(await can(person, loose)).toBe(true);
    expect(await can(org.sectionHead, loose)).toBe(false);
    expect(await can(org.sectionHead, onLeave)).toBe(true);
    expect(await can(org.sectionHead, onTrip)).toBe(true);
    expect(await can(outsider, onLeave)).toBe(false);
    expect(await can(outsider, onTrip)).toBe(false);
  });
});
