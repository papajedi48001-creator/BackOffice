import { describe, expect, it } from 'vitest';
import { setupAdminSchema, setupCompleteSchema, setupDatabaseSchema, setupErrorCodes, setupTestConnectionSchema } from './setup.ts';

const database = { host: '192.168.1.254', username: 'backoffice', password: 'p@ss/w:rd#%1' };
const admin = { firstName: 'จีระศักดิ์', lastName: 'หอกคำ', employeeCode: 'IT001', nationalId: '1101700230708', username: 'it001', password: 'long-enough-pw' };

describe('setupDatabaseSchema', () => {
  it('defaults the port to 3306 and the database to backoffice', () => {
    expect(setupDatabaseSchema.parse(database)).toMatchObject({ port: 3306, database: 'backoffice' });
  });
  it.each([0, 70000])('rejects port %s', (port) => expect(setupDatabaseSchema.safeParse({ ...database, port }).success).toBe(false));
  it('rejects a database name outside letters, digits and underscore', () => {
    expect(setupDatabaseSchema.safeParse({ ...database, database: 'back-office' }).success).toBe(false);
  });
  it('rejects an empty host', () => expect(setupDatabaseSchema.safeParse({ ...database, host: '  ' }).success).toBe(false));
});

describe('setupAdminSchema', () => {
  it('accepts a valid national ID and rejects a wrong check digit', () => {
    expect(setupAdminSchema.safeParse(admin).success).toBe(true);
    expect(setupAdminSchema.safeParse({ ...admin, nationalId: '1101700230704' }).success).toBe(false);
  });
  it('needs a password of at least 12 characters', () => {
    expect(setupAdminSchema.safeParse({ ...admin, password: '12345678901' }).success).toBe(false);
  });
  it('rejects a username with spaces', () => expect(setupAdminSchema.safeParse({ ...admin, username: 'it 001' }).success).toBe(false));
});

describe('setup request bodies', () => {
  it('carries the setup code with the database and admin', () => {
    expect(setupTestConnectionSchema.safeParse({ code: 'ABCD-EFGH-JKLM', database }).success).toBe(true);
    expect(setupCompleteSchema.safeParse({ code: 'ABCD-EFGH-JKLM', database, admin }).success).toBe(true);
    expect(setupCompleteSchema.safeParse({ database, admin }).success).toBe(false);
  });
  it('names every error the setup page can show', () => {
    expect(setupErrorCodes).toEqual(['invalid_code', 'connection_failed', 'access_denied', 'migration_privilege_missing', 'unsupported_server', 'accounts_exist', 'keys_missing', 'invalid_input', 'already_configured', 'config_write_failed']);
  });
});
