import { AttachmentService, ClamdScanner, DatabaseAttachmentRepository, S3ObjectStorage } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { readRuntimeValue } from './runtime-env';

const required = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'CLAMD_HOST'] as const;

/** ไฟล์แนบส่วนตัว work only when the object store, its keys and the virus scanner are all configured. */
export function attachmentsEnabled(): boolean {
  return required.every((name) => Boolean(readRuntimeValue(name)));
}

export function attachmentService(database: Database): AttachmentService {
  const value = (name: (typeof required)[number]) => readRuntimeValue(name) ?? '';
  const storage = new S3ObjectStorage({ endpoint: value('S3_ENDPOINT'), bucket: value('S3_BUCKET'), region: readRuntimeValue('S3_REGION') ?? 'us-east-1', accessKeyId: value('S3_ACCESS_KEY_ID'), secretAccessKey: value('S3_SECRET_ACCESS_KEY') });
  const scanner = new ClamdScanner({ host: value('CLAMD_HOST'), port: Number(readRuntimeValue('CLAMD_PORT') ?? 3310) });
  return new AttachmentService(storage, new DatabaseAttachmentRepository(database), scanner);
}

const extensionsByType: Record<string, readonly string[]> = { 'application/pdf': ['pdf'], 'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'] };
// C0 and C1 controls, and the bidi marks that can disguise an extension (U+202E shows "exe.pdf" as "fdp.exe").
// eslint-disable-next-line no-control-regex -- matching control characters is the point: they are stripped.
const hiddenCharacters = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

/** The name a file is kept and saved under: no path, no hidden characters, at most 255 characters, and
 * always the extension of the type the server checked, so an approver never saves an `.hta` or `.html`. */
export function safeFilename(filename: string, contentType: string): string {
  const extensions = extensionsByType[contentType] ?? ['bin'];
  const base = (filename.split(/[\\/]/).pop() ?? '').replace(hiddenCharacters, '').trim();
  const dot = base.lastIndexOf('.');
  const kept = dot > 0 && extensions.includes(base.slice(dot + 1).toLowerCase());
  const stem = Array.from(dot > 0 ? base.slice(0, dot) : base);
  const extension = kept ? base.slice(dot + 1) : extensions[0]!;
  return `${stem.slice(0, 254 - extension.length).join('') || 'file'}.${extension}`;
}

/** A download header that keeps a Thai file name (RFC 6266 filename*) with a plain ASCII fallback. */
export function contentDisposition(filename: string | null, contentType = 'application/pdf'): string {
  const name = safeFilename(filename ?? 'file', contentType).replace(/["\\]/g, '_');
  const ascii = /^[\x20-\x7e]+$/.test(name) ? name : `file.${name.slice(name.lastIndexOf('.') + 1)}`;
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
