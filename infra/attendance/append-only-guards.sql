-- ระบบลงเวลา: append-only guards. Run as the database admin after `pnpm --filter @backoffice/db migrate`;
-- the application account has no TRIGGER privilege. Safe to run again. Later delivery steps append their tables here.
CREATE TRIGGER IF NOT EXISTS attendance_hash_chain_no_update BEFORE UPDATE ON attendance_hash_chain FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'attendance_append_only';
CREATE TRIGGER IF NOT EXISTS attendance_hash_chain_no_delete BEFORE DELETE ON attendance_hash_chain FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'attendance_append_only';
