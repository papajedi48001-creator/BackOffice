import { describe, expect, it } from 'vitest';
import type { Attachment } from '@backoffice/contracts';
import { AttachmentService, type AttachmentRepository, type PrivateObjectStorage } from './attachment-service';
import type { ScanStatus } from './scan-service';

const pdfBytes = new TextEncoder().encode('%PDF-1.7 ใบรับรองแพทย์');
const upload = { actorPersonId: 'person-a', filename: 'ใบรับรองแพทย์.pdf', contentType: 'application/pdf' as const, bytes: pdfBytes };

function setup(scan: ScanStatus = 'CLEAN') {
  const objects = new Map<string, Uint8Array>();
  const saved: Array<{ attachment: Attachment; scan: ScanStatus }> = [];
  const downloads: string[] = [];
  const storage: PrivateObjectStorage = { putPrivate: async (key, _type, bytes) => { objects.set(key, bytes); }, getPrivate: async (key) => objects.get(key)! };
  const repository: AttachmentRepository = {
    save: async (attachment, status) => { saved.push({ attachment, scan: status }); },
    findById: async (id) => saved.find((row) => row.attachment.id === id)?.attachment ?? null,
    recordDownload: async (attachmentId) => { downloads.push(attachmentId); }
  };
  let next = 0;
  const service = new AttachmentService(storage, repository, { scan: async () => scan }, () => `id-${++next}`);
  return { service, objects, saved, downloads };
}

describe('AttachmentService', () => {
  it('rejects an executable renamed to a PDF', async () => {
    const { service } = setup();
    await expect(service.uploadAttachment({ ...upload, bytes: new Uint8Array([0x4d, 0x5a, 0x90, 0x00]) })).rejects.toThrow('INVALID_FILE_CONTENT');
  });

  it('rejects a file over 10 MB before scanning it', async () => {
    let scanned = false;
    const { saved } = setup();
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const service = new AttachmentService({ putPrivate: async () => undefined, getPrivate: async () => new Uint8Array() }, { save: async () => undefined, findById: async () => null, recordDownload: async () => undefined }, { scan: async () => { scanned = true; return 'CLEAN'; } });
    await expect(service.uploadAttachment({ ...upload, bytes: big })).rejects.toThrow('FILE_TOO_LARGE');
    expect(scanned).toBe(false);
    expect(saved).toHaveLength(0);
  });

  it('stores a clean file under a random key and keeps its name only in the record', async () => {
    const { service, objects, saved } = setup();
    const attachment = await service.uploadAttachment(upload);
    expect(attachment).toEqual({ id: 'id-1', objectKey: 'attachments/id-2', contentType: 'application/pdf', sizeBytes: pdfBytes.byteLength, createdByPersonId: 'person-a', filename: 'ใบรับรองแพทย์.pdf' });
    expect([...objects.keys()]).toEqual(['attachments/id-2']);
    expect(saved).toEqual([{ attachment, scan: 'CLEAN' }]);
  });

  it('stores nothing when the file is infected or the scanner is down', async () => {
    const infected = setup('INFECTED');
    await expect(infected.service.uploadAttachment(upload)).rejects.toThrow('FILE_INFECTED');
    expect(infected.objects.size).toBe(0);
    const down = setup('UNAVAILABLE');
    await expect(down.service.uploadAttachment(upload)).rejects.toThrow('SCAN_UNAVAILABLE');
    expect(down.saved).toHaveLength(0);
  });

  it('opens a file only for someone the authorizer lets in, and records the download', async () => {
    const { service, downloads } = setup();
    const attachment = await service.uploadAttachment(upload);
    const opened = await service.openAttachment({ attachmentId: attachment.id, actorPersonId: 'person-b' }, { canDownload: async (input) => input.actorPersonId === 'person-b' });
    expect(new TextDecoder().decode(opened.bytes)).toBe('%PDF-1.7 ใบรับรองแพทย์');
    expect(opened.attachment.filename).toBe('ใบรับรองแพทย์.pdf');
    expect(downloads).toEqual([attachment.id]);
    await expect(service.openAttachment({ attachmentId: attachment.id, actorPersonId: 'person-c' }, { canDownload: async () => false })).rejects.toThrow('NOT_FOUND');
    await expect(service.openAttachment({ attachmentId: 'missing', actorPersonId: 'person-b' }, { canDownload: async () => true })).rejects.toThrow('NOT_FOUND');
  });
});
