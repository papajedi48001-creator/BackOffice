import { z } from 'zod';
import { accessSubjectSchema } from './access.ts';

export const localCredentialsSchema = z.object({
  username: z.string().trim().min(1).max(255),
  password: z.string().min(1).max(1024)
});

export type LocalCredentials = z.infer<typeof localCredentialsSchema>;

export const externalIdentitySchema = z.object({
  issuer: z.string().url(),
  subject: z.string().min(1),
  displayName: z.string().max(255).nullable()
});

export type ExternalIdentity = z.infer<typeof externalIdentitySchema>;

export type Session = z.infer<typeof accessSubjectSchema>;
