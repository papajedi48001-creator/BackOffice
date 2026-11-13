const thai = /[฀-๿]/;
const tisAsLatin1 = /[¡-û]/;
const tis620 = new TextDecoder('windows-874');

/**
 * HOSxP often stores Thai as TIS-620 bytes; read through a latin1 column they arrive as `¡ÒÃ`. Such text (no Thai letter,
 * some byte in the TIS-620 Thai range) is decoded again as windows-874, the way the legacy PHP `Database::toUtf8` did.
 */
export function fixThaiText(value: string): string {
  if (!value || thai.test(value) || !tisAsLatin1.test(value)) return value;
  return tis620.decode(Buffer.from(value, 'latin1'));
}
