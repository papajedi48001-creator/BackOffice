ALTER TABLE leave_holiday ADD COLUMN IF NOT EXISTS source VARCHAR(16) NOT NULL DEFAULT 'MANUAL';
ALTER TABLE leave_holiday ADD COLUMN IF NOT EXISTS synced_at DATETIME NULL;
CREATE TABLE IF NOT EXISTS hosxp_connection (
  id TINYINT NOT NULL PRIMARY KEY,
  host VARCHAR(255) NOT NULL,
  port INT NOT NULL DEFAULT 3306,
  database_name VARCHAR(64) NOT NULL,
  username VARCHAR(64) NOT NULL,
  password_ciphertext VARCHAR(512) NULL,
  date_column VARCHAR(64) NOT NULL DEFAULT 'holiday_date',
  name_column VARCHAR(64) NOT NULL DEFAULT 'day_name',
  updated_by_person_id CHAR(36) NOT NULL,
  updated_at DATETIME NOT NULL,
  last_sync_at DATETIME NULL,
  last_sync_status VARCHAR(32) NULL,
  last_sync_count INT NULL,
  CONSTRAINT hosxp_connection_actor_fk FOREIGN KEY (updated_by_person_id) REFERENCES person(id)
) DEFAULT CHARSET=utf8mb4
