import { describe, expect, it } from 'vitest';
import { AttachmentService } from './attachment-service';

describe('AttachmentService', () => {
  it('rejects an executable renamed to a PDF', async () => {
    const service = new AttachmentService({ putPrivate: async () => undefined, createTemporaryUrl: async () => 'https://private.example/download' }, { save: async () => undefined, findById: async () => null }, { scan: async () => 'CLEAN' }, () => 'attachment-1');

    await expect(service.uploadAttachment({ actorPersonId: 'person-a', filename: 'report.pdf', contentType: 'application/pdf', bytes: new Uint8Array([0x4d, 0x5a, 0x90, 0x00]) })).rejects.toThrow('INVALID_FILE_CONTENT');
  });
});
