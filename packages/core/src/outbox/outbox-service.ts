import type { OutboxEvent } from '@backoffice/contracts';

export interface OutboxRepository { pending(limit: number): Promise<OutboxEvent[]>; markProcessed(eventId: string): Promise<void>; }
export interface OutboxPublisher { publish(event: OutboxEvent): Promise<void>; }
export interface PublishResult { published: number; }

export class OutboxService {
  constructor(private readonly repository: OutboxRepository, private readonly publisher: OutboxPublisher) {}
  async publishOutboxBatch(limit = 50): Promise<PublishResult> {
    const events = await this.repository.pending(limit);
    for (const event of events) { await this.publisher.publish(event); await this.repository.markProcessed(event.id); }
    return { published: events.length };
  }
}
