ALTER TABLE notification
  ADD COLUMN subject VARCHAR(255) NOT NULL DEFAULT 'มีงานในระบบ Back Office',
  ADD COLUMN request_id CHAR(36) NULL,
  ADD COLUMN read_at DATETIME NULL,
  ADD CONSTRAINT notification_request_fk FOREIGN KEY (request_id) REFERENCES request(id),
  ADD UNIQUE KEY notification_event_channel_unique (outbox_event_id, channel),
  ADD KEY notification_recipient_unread_index (recipient_person_id, read_at, created_at);
