import { NationalIdProtector } from '@backoffice/core';
import { readRuntimeValue } from './runtime-env';

let protector: NationalIdProtector | null | undefined;

/** Built once from NATIONAL_ID_ENCRYPTION_KEY and NATIONAL_ID_LOOKUP_KEY (or their *_FILE secrets); null when either is missing. */
export function getNationalIdProtector(): NationalIdProtector | null {
  if (protector !== undefined) return protector;
  const encryptionKey = readRuntimeValue('NATIONAL_ID_ENCRYPTION_KEY');
  const lookupKey = readRuntimeValue('NATIONAL_ID_LOOKUP_KEY');
  protector = encryptionKey && lookupKey ? new NationalIdProtector(encryptionKey, lookupKey) : null;
  return protector;
}
