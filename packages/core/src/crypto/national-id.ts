import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

export class NationalIdProtector {
  private readonly encryptionKey: Buffer;
  private readonly lookupKey: Buffer;

  constructor(encryptionKeyHex: string, lookupKeyHex: string) {
    this.encryptionKey = Buffer.from(encryptionKeyHex, 'hex');
    this.lookupKey = Buffer.from(lookupKeyHex, 'hex');
    if (this.encryptionKey.length !== 32 || this.lookupKey.length !== 32) {
      throw new Error('National ID protection keys must be 32-byte hexadecimal values');
    }
  }

  encrypt(nationalId: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(nationalId, 'utf8'), cipher.final()]);
    return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
  }

  decrypt(ciphertext: string): string {
    const [iv, tag, encrypted] = ciphertext.split('.');
    if (!iv || !tag || !encrypted) throw new Error('Invalid national ID ciphertext');
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
  }

  lookup(nationalId: string): string {
    return createHmac('sha256', this.lookupKey).update(nationalId, 'utf8').digest('hex');
  }

  mask(nationalId: string): string {
    return `${nationalId[0]}-${nationalId.slice(1, 5)}-${nationalId.slice(5, 10)}-${nationalId.slice(10, 12)}-${nationalId[12]}`;
  }
}
