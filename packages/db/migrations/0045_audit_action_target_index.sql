CREATE INDEX IF NOT EXISTS audit_event_action_target_index ON audit_event (action, target_id);
