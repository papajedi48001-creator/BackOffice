import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { localCredentialsSchema, type AuditInput, type ExternalIdentity, type LocalCredentials } from '@backoffice/contracts';

const scrypt = promisify(scryptCallback);

export interface OidcIdentityProvider {
  getAuthorizationUrl(): URL;
  resolveIdentity(callback: URL): Promise<ExternalIdentity>;
}

export interface LocalAccount {
  id: string;
  personId: string;
  username: string;
  passwordHash: string;
}

export interface LocalAccountRepository {
  findByUsername(username: string): Promise<LocalAccount | null>;
}

export interface LoginThrottle {
  isLocked(key: string): Promise<boolean>;
  recordFailure(key: string): Promise<void>;
  reset(key: string): Promise<void>;
}

export interface LoginAuditRecorder { recordAudit(input: AuditInput): Promise<void>; }
export interface LocalAuthentication { personId: string; accountId: string; }

const unlimitedThrottle: LoginThrottle = { isLocked: async () => false, recordFailure: async () => undefined, reset: async () => undefined };
const noAudit: LoginAuditRecorder = { recordAudit: async () => undefined };
// Verified when the username does not exist so an unknown account costs the same scrypt work as a wrong password.
const unknownAccountHash = `scrypt$${randomBytes(16).toString('base64url')}$${randomBytes(64).toString('base64url')}`;

export class LocalAuthService {
  private readonly throttle: LoginThrottle;
  private readonly audit: LoginAuditRecorder;

  constructor(private readonly accounts: LocalAccountRepository, options: { throttle?: LoginThrottle; audit?: LoginAuditRecorder } = {}) {
    this.throttle = options.throttle ?? unlimitedThrottle;
    this.audit = options.audit ?? noAudit;
  }

  async authenticateLocal(credentials: LocalCredentials): Promise<LocalAuthentication> {
    const validCredentials = localCredentialsSchema.parse(credentials);
    const throttleKey = loginThrottleKey(validCredentials.username);
    if (await this.throttle.isLocked(throttleKey)) throw new Error('LOGIN_LOCKED');
    const account = await this.accounts.findByUsername(validCredentials.username);
    const passwordMatches = await verifyPassword(validCredentials.password, account?.passwordHash ?? unknownAccountHash);
    if (!account || !passwordMatches) {
      await this.throttle.recordFailure(throttleKey);
      if (account) await this.audit.recordAudit({ actorPersonId: null, action: 'identity.local_login', targetType: 'local_account', targetId: account.id, result: 'FAILURE', metadata: {} });
      throw new Error('INVALID_CREDENTIALS');
    }
    await this.throttle.reset(throttleKey);
    await this.audit.recordAudit({ actorPersonId: account.personId, action: 'identity.local_login', targetType: 'local_account', targetId: account.id, result: 'SUCCESS', metadata: {} });
    return { personId: account.personId, accountId: account.id };
  }
}

export function loginThrottleKey(username: string): string {
  return createHash('sha256').update(username.trim().toLowerCase(), 'utf8').digest('hex');
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
