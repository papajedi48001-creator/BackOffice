import { z } from 'zod';

export const createPersonInputSchema = z.object({
  nationalId: z.string().regex(/^\d{13}$/)
});

export type CreatePersonInput = z.infer<typeof createPersonInputSchema>;

export interface Person {
  id: string;
  nationalIdMasked: string;
  createdAt: string;
}

export const assignEmploymentInputSchema = z.object({
  personId: z.string().uuid(),
  organizationId: z.string().uuid(),
  managerPersonId: z.string().uuid().nullable().optional(),
  effectiveFrom: z.coerce.date(),
  effectiveUntil: z.coerce.date().nullable().optional()
});

export type AssignEmploymentInput = z.infer<typeof assignEmploymentInputSchema>;

export interface EmploymentAssignment {
  id: string;
  personId: string;
  organizationId: string;
  managerPersonId: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
}
