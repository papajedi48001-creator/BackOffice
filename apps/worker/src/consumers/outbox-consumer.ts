import type { OutboxEvent } from '@backoffice/contracts';

export interface WorkerOutboxRepository { pending(): Promise<OutboxEvent[]>; markProcessed(eventId: string): Promise<void>; }
export interface WorkerNotificationConsumer { consume(event: OutboxEvent): Promise<void>; }

export class OutboxConsumer {
  constructor(private readonly repository: WorkerOutboxRepository, private readonly notifications: WorkerNotificationConsumer) {}
  async publishOutboxBatch(): Promise<{ published: number }> {
    const events = await this.repository.pending();
    for (const event of events) { await this.notifications.consume(event); await this.repository.markProcessed(event.id); }
    return { published: events.length };
  }
}
