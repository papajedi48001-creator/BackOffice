import type { OutboxEvent } from '@backoffice/contracts';

export interface WorkerOutboxRepository { pending(): Promise<OutboxEvent[]>; markProcessed(eventId: string): Promise<void>; markFailed(eventId: string, code: string): Promise<void>; }
export interface WorkerNotificationConsumer { consume(event: OutboxEvent): Promise<void>; }
export interface WorkerLogger { warn(message: string, details: Record<string, string>): void; }

const failureCodePattern = /^[A-Z][A-Z0-9_]{0,63}$/;

export function toFailureCode(error: unknown): string {
  return error instanceof Error && failureCodePattern.test(error.message) ? error.message : 'UNEXPECTED_ERROR';
}

export class OutboxConsumer {
  constructor(private readonly repository: WorkerOutboxRepository, private readonly notifications: WorkerNotificationConsumer, private readonly logger: WorkerLogger = console) {}
  async publishOutboxBatch(): Promise<{ published: number; failed: number }> {
    const events = await this.repository.pending();
    let published = 0;
    let failed = 0;
    for (const event of events) {
      try {
        await this.notifications.consume(event);
        await this.repository.markProcessed(event.id);
        published += 1;
      } catch (error) {
        const code = toFailureCode(error);
        this.logger.warn('backoffice.worker.outbox_event_failed', { eventId: event.id, type: event.type, code });
        await this.repository.markFailed(event.id, code);
        failed += 1;
      }
    }
    return { published, failed };
  }
}
