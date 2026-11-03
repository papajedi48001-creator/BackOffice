ALTER TABLE room_booking ADD COLUMN IF NOT EXISTS request_id CHAR(36) NULL;
CREATE INDEX IF NOT EXISTS room_booking_request_index ON room_booking (request_id);
