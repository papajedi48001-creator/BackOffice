import { z } from 'zod';

export const requestStatusSchema = z.enum(['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'RETURNED', 'REJECTED', 'CANCELLED', 'APPROVED', 'FULFILLED']);
export type RequestStatus = z.infer<typeof requestStatusSchema>;

export const approverSnapshotSchema = z.object({ personId: z.string().min(1), organizationId: z.string().min(1) });
export type ApproverSnapshot = z.infer<typeof approverSnapshotSchema>;

export const submitRequestInputSchema = z.object({
  moduleCode: z.string().min(1),
  requestorPersonId: z.string().min(1),
  organizationSnapshot: z.object({ organizationId: z.string().min(1) })
});
export type SubmitRequestInput = z.infer<typeof submitRequestInputSchema>;

export interface ApprovalStep { id: string; requestId: string; sequence: number; assigneeSnapshot: ApproverSnapshot; status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED'; }
export interface SubmittedRequest { id: string; reference: string; moduleCode: string; requestorPersonId: string; organizationSnapshot: { organizationId: string }; status: RequestStatus; approvalSteps: ApprovalStep[]; }

export const approvalActionSchema = z.enum(['APPROVE', 'REJECT', 'RETURN']);
export type ApprovalAction = z.infer<typeof approvalActionSchema>;
export const decideRequestInputSchema = z.object({ requestId: z.string().min(1), actorPersonId: z.string().min(1), decision: approvalActionSchema, reason: z.string().trim().min(1).optional() });
export type DecideRequestInput = z.infer<typeof decideRequestInputSchema>;
export interface ApprovalDecision { id: string; requestId: string; approvalStepId: string; actorPersonId: string; decision: ApprovalAction; reason: string | null; }

export const grantDelegationInputSchema = z.object({
  delegatorPersonId: z.string().min(1), delegatePersonId: z.string().min(1), moduleCode: z.string().min(1), reason: z.string().trim().min(1),
  effectiveFrom: z.coerce.date(), effectiveUntil: z.coerce.date()
});
export type GrantDelegationInput = z.infer<typeof grantDelegationInputSchema>;
export interface Delegation extends GrantDelegationInput { id: string; }
