import { describe, expect, it } from 'vitest';
import { ConnectionSecretBox } from './connection-secret-box.ts';

const key = 'ab'.repeat(32);
describe('ConnectionSecretBox', () => {
  it('round-trips a password without keeping it readable', () => {
    const box = new ConnectionSecretBox(key);
    const sealed = box.seal('s3cr3t-pw');
    expect(sealed).not.toContain('s3cr3t');
    expect(box.open(sealed)).toBe('s3cr3t-pw');
  });
  it('refuses a key that is not 32 bytes and ciphertext from another key', () => {
    expect(() => new ConnectionSecretBox('abcd')).toThrow();
    expect(() => new ConnectionSecretBox('cd'.repeat(32)).open(new ConnectionSecretBox(key).seal('x'))).toThrow();
  });
});
