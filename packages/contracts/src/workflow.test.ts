import { describe, expect, it } from 'vitest';
import { cancelRequestInputSchema, decideRequestInputSchema, resubmitRequestInputSchema } from './workflow';

describe('lifecycle reasons', () => {
  const cancel = (reason: string) => cancelRequestInputSchema.safeParse({ requestId: 'r', actorPersonId: 'p', reason });

  it('rejects a blank or over-long cancellation reason', () => {
    expect(cancel('   ').success).toBe(false);
    expect(cancel('x'.repeat(2001)).success).toBe(false);
  });

  it('accepts a cancellation reason of 2000 characters and trims it', () => {
    expect(cancel('x'.repeat(2000)).success).toBe(true);
    expect(cancelRequestInputSchema.parse({ requestId: 'r', actorPersonId: 'p', reason: '  ยกเลิก  ' }).reason).toBe('ยกเลิก');
  });

  it('rejects a decision reason over 2000 characters', () => {
    expect(decideRequestInputSchema.safeParse({ requestId: 'r', actorPersonId: 'p', decision: 'REJECT', reason: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('needs only the request and the actor to resubmit', () => {
    expect(resubmitRequestInputSchema.parse({ requestId: 'r', actorPersonId: 'p' })).toEqual({ requestId: 'r', actorPersonId: 'p' });
  });
});
