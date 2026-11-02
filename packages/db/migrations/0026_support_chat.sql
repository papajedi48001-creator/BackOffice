CREATE TABLE IF NOT EXISTS support_conversation (
  id CHAR(36) NOT NULL PRIMARY KEY,
  person_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  last_message_at DATETIME(3) NOT NULL,
  person_read_at DATETIME(3) NULL,
  admin_read_at DATETIME(3) NULL,
  CONSTRAINT support_conversation_person_fk FOREIGN KEY (person_id) REFERENCES person(id),
  UNIQUE KEY support_conversation_person_unique (person_id),
  KEY support_conversation_last_message_index (last_message_at)
);
CREATE TABLE IF NOT EXISTS support_message (
  id CHAR(36) NOT NULL PRIMARY KEY,
  conversation_id CHAR(36) NOT NULL,
  sender_person_id CHAR(36) NOT NULL,
  from_admin TINYINT(1) NOT NULL,
  body TEXT NULL,
  attachment_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL,
  CONSTRAINT support_message_conversation_fk FOREIGN KEY (conversation_id) REFERENCES support_conversation(id),
  CONSTRAINT support_message_sender_fk FOREIGN KEY (sender_person_id) REFERENCES person(id),
  CONSTRAINT support_message_attachment_fk FOREIGN KEY (attachment_id) REFERENCES attachment(id),
  KEY support_message_conversation_index (conversation_id, created_at),
  KEY support_message_attachment_index (attachment_id)
);
