import { describe, expect, it } from 'vitest';
import type { Database } from '@backoffice/db';
import { detectImageType, maxSiteImageBytes, SiteImageService } from './site-image-service.ts';

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9]);
const webp = Uint8Array.from([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP'), 1]);

function store() {
  const rows = new Map<string, { contentType: string; data: Buffer; version: string }>();
  const audits: unknown[][] = [];
  const database: Database = {
    execute: async (sql, parameters = []) => {
      const p = parameters as unknown[];
      if (sql.startsWith('INSERT INTO site_image')) rows.set(p[0] as string, { contentType: p[1] as string, data: p[2] as Buffer, version: p[3] as string });
      if (sql.startsWith('DELETE FROM site_image')) rows.delete(p[0] as string);
      if (sql.startsWith('INSERT INTO audit_event')) audits.push(p);
    },
    query: async <T extends object>(sql: string, parameters: unknown[] = []) => {
      const row = rows.get(parameters[0] as string);
      if (!row || !sql.includes('FROM site_image')) return [] as T[];
      return [sql.includes('data') ? row : { version: row.version }] as T[];
    },
    transaction: async (work) => work(database),
    close: async () => undefined
  };
  return { database, rows, audits };
}

describe('detectImageType', () => {
  it('knows JPEG, PNG and WebP by their first bytes, not by a name or a claimed type', () => {
    expect(detectImageType(jpeg)).toBe('image/jpeg');
    expect(detectImageType(png)).toBe('image/png');
    expect(detectImageType(webp)).toBe('image/webp');
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(detectImageType(Buffer.from('GIF89a'))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
});

describe('SiteImageService', () => {
  it('stores the login photo with its type and a version that changes with the content, and audits the change', async () => {
    const { database, audits } = store();
    const service = new SiteImageService(database);
    const first = await service.save('login-hero', jpeg, 'admin-1');
    expect(first).toEqual({ ok: true, version: expect.stringMatching(/^[0-9a-f]{16}$/) });
    expect(await service.read('login-hero')).toMatchObject({ contentType: 'image/jpeg', version: first.ok ? first.version : '' });
    expect(await service.version('login-hero')).toBe(first.ok ? first.version : null);
    const second = await service.save('login-hero', png, 'admin-1');
    expect(second.ok && first.ok && second.version !== first.version).toBe(true);
    expect(audits).toHaveLength(2);
    expect(JSON.stringify(audits)).toContain('admin.site_image.update');
  });

  it('refuses anything that is not a JPEG, PNG or WebP, and anything over the size limit', async () => {
    const { database, rows } = store();
    const service = new SiteImageService(database);
    expect(await service.save('login-hero', Buffer.from('<svg/>'), 'admin-1')).toEqual({ ok: false, code: 'INVALID_IMAGE' });
    const big = new Uint8Array(maxSiteImageBytes + 1); big.set(jpeg);
    expect(await service.save('login-hero', big, 'admin-1')).toEqual({ ok: false, code: 'TOO_LARGE' });
    expect(rows.size).toBe(0);
  });

  it('removes the photo so the sign-in page falls back to its plain background', async () => {
    const { database, audits } = store();
    const service = new SiteImageService(database);
    await service.save('login-hero', jpeg, 'admin-1');
    expect(await service.remove('login-hero', 'admin-1')).toEqual({ ok: true });
    expect(await service.read('login-hero')).toBeNull();
    expect(await service.version('login-hero')).toBeNull();
    expect(JSON.stringify(audits)).toContain('admin.site_image.remove');
  });
});
