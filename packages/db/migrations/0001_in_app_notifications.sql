ALTER TABLE notification
  ADD COLUMN IF NOT EXISTS subject VARCHAR(255) NOT NULL DEFAULT 'มีงานในระบบ Back Office',
  ADD COLUMN IF NOT EXISTS request_id CHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS read_at DATETIME NULL,
  ADD CONSTRAINT notification_request_fk FOREIGN KEY IF NOT EXISTS (request_id) REFERENCES request(id),
  ADD UNIQUE KEY IF NOT EXISTS notification_event_channel_unique (outbox_event_id, channel),
  ADD KEY IF NOT EXISTS notification_recipient_unread_index (recipient_person_id, read_at, created_at);
