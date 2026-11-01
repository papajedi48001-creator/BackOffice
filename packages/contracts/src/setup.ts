import { z } from 'zod';
import { thaiNationalIdSchema, usernameSchema } from './hr-account.ts';

/** The MariaDB connection the first-run setup page saves. Built into a URL on the server, never taken as one. */
export const setupDatabaseSchema = z.object({
  // Hostname, IPv4 or IPv6 characters only: the host goes into a URL, so '/', '?', '@' or '#' could add driver options.
  host: z.string().trim().min(1).max(255).regex(/^(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.:-]+)$/),
  port: z.coerce.number().int().min(1).max(65535).default(3306),
  database: z.string().regex(/^[A-Za-z0-9_]{1,64}$/).default('backoffice'),
  username: z.string().trim().min(1).max(80),
  password: z.string().max(1024)
}).strict();
export type SetupDatabaseInput = z.infer<typeof setupDatabaseSchema>;

/** The first ผู้ดูแลระบบ the setup page creates. */
export const setupAdminSchema = z.object({
  firstName: z.string().trim().min(1).max(120), lastName: z.string().trim().min(1).max(120),
  employeeCode: z.string().trim().min(1).max(32), nationalId: thaiNationalIdSchema,
  username: usernameSchema, password: z.string().min(12).max(128)
}).strict();
export type SetupAdminInput = z.infer<typeof setupAdminSchema>;

const setupCodeSchema = z.string().trim().min(1).max(64);
export const setupTestConnectionSchema = z.object({ code: setupCodeSchema, database: setupDatabaseSchema }).strict();
export const setupCompleteSchema = z.object({ code: setupCodeSchema, database: setupDatabaseSchema, admin: setupAdminSchema }).strict();

export const setupErrorCodes = ['invalid_code', 'connection_failed', 'access_denied', 'migration_privilege_missing', 'unsupported_server', 'accounts_exist', 'keys_missing', 'invalid_input', 'already_configured', 'config_write_failed'] as const;
export type SetupErrorCode = typeof setupErrorCodes[number];
