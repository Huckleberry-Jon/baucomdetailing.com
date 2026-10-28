ALTER TABLE notifications ADD COLUMN enqueued_at INTEGER;
CREATE INDEX pending_notification_enqueue ON notifications(business_id,enqueued_at,created_at);
CREATE INDEX rate_expiry ON rate_limits(expires);
