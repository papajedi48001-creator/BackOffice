import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** AES-256-GCM for connection passwords kept in the database, under CONNECTION_SECRET_KEY (64 hex characters). */
export class ConnectionSecretBox {
  private readonly key: Buffer;
  constructor(keyHex: string) {
    this.key = Buffer.from(keyHex, 'hex');
    if (this.key.length !== 32) throw new Error('CONNECTION_SECRET_KEY must be a 32-byte hexadecimal value');
  }
  seal(secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
  }
  open(sealed: string): string {
    const [iv, tag, encrypted] = sealed.split('.');
    if (!iv || !tag || !encrypted) throw new Error('Invalid connection secret');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
  }
}

/** The box when the key is set and valid; null otherwise, so callers can say a password cannot be stored. */
export function connectionSecretBoxFrom(keyHex: string | undefined): ConnectionSecretBox | null {
  if (!keyHex) return null;
  try { return new ConnectionSecretBox(keyHex); } catch { return null; }
}
