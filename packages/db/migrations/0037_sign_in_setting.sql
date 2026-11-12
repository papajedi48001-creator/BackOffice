CREATE TABLE IF NOT EXISTS sign_in_setting (
  method VARCHAR(16) NOT NULL PRIMARY KEY,
  enabled TINYINT NOT NULL,
  settings_json TEXT NOT NULL,
  secret_ciphertext TEXT NULL,
  updated_by_person_id CHAR(36) NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT sign_in_setting_actor_fk FOREIGN KEY (updated_by_person_id) REFERENCES person(id)
) DEFAULT CHARSET=utf8mb4
