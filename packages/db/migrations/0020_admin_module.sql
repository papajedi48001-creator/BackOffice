CREATE TABLE IF NOT EXISTS admin_module_setting (
  module_code VARCHAR(64) NOT NULL PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  updated_by_person_id VARCHAR(36) NULL,
  updated_at DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS role_assignment_role_index ON role_assignment (role_id, person_id)
