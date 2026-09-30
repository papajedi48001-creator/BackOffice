export interface OutboxEvent { id: string; type: string; idempotencyKey: string; payload: Record<string, unknown>; occurredAt: string; processedAt: string | null; }
