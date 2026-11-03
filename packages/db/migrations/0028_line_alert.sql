CREATE TABLE IF NOT EXISTS line_account_link (
  person_id CHAR(36) NOT NULL PRIMARY KEY,
  line_user_id VARCHAR(33) NOT NULL,
  linked_at DATETIME NOT NULL,
  CONSTRAINT line_account_link_person_fk FOREIGN KEY (person_id) REFERENCES person(id),
  UNIQUE KEY line_account_link_user_unique (line_user_id)
);
CREATE TABLE IF NOT EXISTS line_link_code (
  code_hash CHAR(64) NOT NULL PRIMARY KEY,
  person_id CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT line_link_code_person_fk FOREIGN KEY (person_id) REFERENCES person(id),
  UNIQUE KEY line_link_code_person_unique (person_id)
);
CREATE TABLE IF NOT EXISTS line_group (
  group_id VARCHAR(33) NOT NULL PRIMARY KEY,
  display_name VARCHAR(120) NULL,
  source VARCHAR(16) NOT NULL,
  joined_at DATETIME NOT NULL,
  left_at DATETIME NULL
);
CREATE TABLE IF NOT EXISTS line_module_route (
  module_code VARCHAR(64) NOT NULL PRIMARY KEY,
  group_id VARCHAR(33) NOT NULL,
  updated_by_person_id CHAR(36) NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT line_module_route_group_fk FOREIGN KEY (group_id) REFERENCES line_group(group_id),
  CONSTRAINT line_module_route_actor_fk FOREIGN KEY (updated_by_person_id) REFERENCES person(id)
);
