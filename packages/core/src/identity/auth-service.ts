import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { localCredentialsSchema, type ExternalIdentity, type LocalCredentials, type Session } from '@backoffice/contracts';

const scrypt = promisify(scryptCallback);

export interface OidcIdentityProvider {
  getAuthorizationUrl(): URL;
  resolveIdentity(callback: URL): Promise<ExternalIdentity>;
}

export interface LocalAccount {
  personId: string;
  username: string;
  passwordHash: string;
}

export interface LocalAccountRepository {
  findByUsername(username: string): Promise<LocalAccount | null>;
}

export class LocalAuthService {
  constructor(private readonly accounts: LocalAccountRepository) {}

  async authenticateLocal(credentials: LocalCredentials): Promise<Session> {
    const validCredentials = localCredentialsSchema.parse(credentials);
    const account = await this.accounts.findByUsername(validCredentials.username);
    if (!account || !(await verifyPassword(validCredentials.password, account.passwordHash))) throw new Error('Invalid local credentials');
    return { authenticated: true, personId: account.personId, roles: [], dataOwnerModules: [] };
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url');
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${derived.toString('base64url')}`;
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, salt, encodedHash] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !salt || !encodedHash) return false;
  const expected = Buffer.from(encodedHash, 'base64url');
  const actual = await scrypt(password, salt, expected.length) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
