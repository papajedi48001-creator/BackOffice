import { z } from 'zod';

export const auditInputSchema = z.object({
  actorPersonId: z.string().min(1).nullable().optional(), action: z.string().min(1), targetType: z.string().min(1), targetId: z.string().min(1),
  result: z.enum(['ALLOWED', 'DENIED', 'SUCCESS', 'FAILURE']), metadata: z.record(z.string(), z.unknown())
});
export type AuditInput = z.infer<typeof auditInputSchema>;
export interface AuditEvent extends Omit<AuditInput, 'metadata'> { id: string; metadata: string; createdAt: string; }
