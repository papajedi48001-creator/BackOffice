CREATE TABLE IF NOT EXISTS site_image (
  slot VARCHAR(32) NOT NULL PRIMARY KEY,
  content_type VARCHAR(32) NOT NULL,
  data MEDIUMBLOB NOT NULL,
  version CHAR(16) NOT NULL,
  updated_by_person_id CHAR(36) NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT site_image_actor_fk FOREIGN KEY (updated_by_person_id) REFERENCES person(id)
) DEFAULT CHARSET=utf8mb4
