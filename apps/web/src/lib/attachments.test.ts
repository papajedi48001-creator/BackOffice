// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachmentsEnabled, contentDisposition } from './attachments';

afterEach(() => vi.unstubAllEnvs());

describe('attachments settings', () => {
  it('is on only when storage, its keys and the scanner are all set', () => {
    for (const [name, value] of Object.entries({ S3_ENDPOINT: 'http://seaweedfs:8333', S3_BUCKET: 'backoffice-attachments', S3_ACCESS_KEY_ID: 'key', S3_SECRET_ACCESS_KEY: 'secret' })) vi.stubEnv(name, value);
    vi.stubEnv('CLAMD_HOST', '');
    expect(attachmentsEnabled()).toBe(false);
    vi.stubEnv('CLAMD_HOST', 'clamav');
    expect(attachmentsEnabled()).toBe(true);
    vi.stubEnv('S3_SECRET_ACCESS_KEY', '');
    expect(attachmentsEnabled()).toBe(false);
  });

  it('names a Thai file safely in the download header', () => {
    expect(contentDisposition('ใบรับรองแพทย์ "นาย ก".pdf')).toBe(`attachment; filename="file.pdf"; filename*=UTF-8''${encodeURIComponent('ใบรับรองแพทย์ _นาย ก_.pdf')}`);
    expect(contentDisposition('report.pdf')).toBe(`attachment; filename="report.pdf"; filename*=UTF-8''report.pdf`);
    expect(contentDisposition(null, 'image/png')).toBe(`attachment; filename="file.png"; filename*=UTF-8''file.png`);
  });
});
