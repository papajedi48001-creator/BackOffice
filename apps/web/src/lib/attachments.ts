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

const extensionByType: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

/** A download header that keeps a Thai file name (RFC 6266 filename*) with a plain ASCII fallback. */
export function contentDisposition(filename: string | null, contentType = 'application/pdf'): string {
  const extension = filename?.match(/\.([A-Za-z0-9]{1,8})$/)?.[1] ?? extensionByType[contentType] ?? 'bin';
  const name = (filename ?? `file.${extension}`).replace(/["\\\r\n]/g, '_');
  const ascii = /^[\x20-\x7e]+$/.test(name) ? name : `file.${extension}`;
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
