/** Test helper: builds a valid Thai national ID from a 12-digit prefix. */
export function nationalId(prefix: string): string {
  const sum = [...prefix].reduce((total, digit, index) => total + Number(digit) * (13 - index), 0);
  return `${prefix}${(11 - (sum % 11)) % 10}`;
}
