const blockedKeys = new Set(['nationalid', 'national_id', 'citizenid', 'password', 'passwordhash', 'token', 'authorization']);
const allowedKeys = new Set(['moduleCode', 'requestReference', 'reason', 'changedFields', 'status', 'organizationId']);

export function redactAuditMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(metadata)
    .filter(([key]) => allowedKeys.has(key) && !blockedKeys.has(key.toLowerCase()))
    .map(([key, value]) => [key, redactValue(value)]));
}

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/\b\d{13}\b/g, '[REDACTED]');
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [key, blockedKeys.has(key.toLowerCase()) ? '[REDACTED]' : redactValue(nestedValue)]));
  return value;
}
