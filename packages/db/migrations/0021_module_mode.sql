ALTER TABLE admin_module_setting ADD COLUMN IF NOT EXISTS mode VARCHAR(16) NOT NULL DEFAULT 'ON';
UPDATE admin_module_setting SET mode = 'OFF' WHERE enabled = 0 AND mode = 'ON'
