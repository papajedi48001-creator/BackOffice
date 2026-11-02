import { describe, expect, it } from 'vitest';
import { SUPPORT_MESSAGE_MAX_LENGTH, supportChatImageContentTypeSchema, supportMessageInputSchema } from './support-chat';

const attachmentId = '0b6f3c1e-5d1a-4c8e-9a51-2f7c1d9e8b10';

describe('support chat contracts', () => {
  it('needs text or an image', () => {
    expect(supportMessageInputSchema.safeParse({}).success).toBe(false);
    expect(supportMessageInputSchema.safeParse({ body: '   \n ' }).success).toBe(false);
    expect(supportMessageInputSchema.safeParse({ attachmentId }).success).toBe(true);
    expect(supportMessageInputSchema.safeParse({ body: '  ', attachmentId }).data).toEqual({ attachmentId });
  });

  it('trims the text and refuses more than 2,000 characters', () => {
    expect(SUPPORT_MESSAGE_MAX_LENGTH).toBe(2000);
    expect(supportMessageInputSchema.parse({ body: '  ขอเพิ่มเมนู  ' })).toEqual({ body: 'ขอเพิ่มเมนู' });
    expect(supportMessageInputSchema.safeParse({ body: 'ก'.repeat(2000) }).success).toBe(true);
    expect(supportMessageInputSchema.safeParse({ body: 'ก'.repeat(2001) }).success).toBe(false);
  });

  it('refuses unknown fields and a path-like attachment id', () => {
    expect(supportMessageInputSchema.safeParse({ body: 'hi', recipientPersonId: attachmentId }).success).toBe(false);
    expect(supportMessageInputSchema.safeParse({ attachmentId: '../x' }).success).toBe(false);
  });

  it('accepts images only', () => {
    expect(supportChatImageContentTypeSchema.safeParse('image/webp').success).toBe(true);
    expect(supportChatImageContentTypeSchema.safeParse('application/pdf').success).toBe(false);
  });
});
