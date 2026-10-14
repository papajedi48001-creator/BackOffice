ALTER TABLE outbox_event
  ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS next_attempt_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS dead_lettered_at DATETIME NULL,
  ADD KEY IF NOT EXISTS outbox_event_retry_index (processed_at, dead_lettered_at, next_attempt_at, occurred_at);
