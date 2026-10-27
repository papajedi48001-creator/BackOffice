import { describe, expect, it } from 'vitest';
import { MAX_PROFILE_PHOTO_BYTES, profilePhotoContentTypeSchema, supportedAttachmentContentTypeSchema, uploadAttachmentInputSchema } from './files';

describe('attachment content types', () => {
  it('keeps general attachments to PDF, JPEG and PNG', () => {
    expect(supportedAttachmentContentTypeSchema.safeParse('image/webp').success).toBe(false);
  });

  it('takes only JPEG, PNG and WebP profile photos up to 2 MB', () => {
    expect(profilePhotoContentTypeSchema.options).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(profilePhotoContentTypeSchema.safeParse('application/pdf').success).toBe(false);
    expect(MAX_PROFILE_PHOTO_BYTES).toBe(2 * 1024 * 1024);
  });

  it('can store a WebP file', () => {
    expect(uploadAttachmentInputSchema.safeParse({ actorPersonId: 'p', filename: 'a.webp', contentType: 'image/webp', bytes: new Uint8Array([1]) }).success).toBe(true);
  });
});
