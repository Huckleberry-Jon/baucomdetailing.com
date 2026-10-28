CREATE INDEX customer_directory ON customers(business_id,id);
CREATE INDEX vehicle_directory ON vehicles(business_id,id);
CREATE INDEX vehicle_customer ON vehicles(business_id,customer_id);
CREATE INDEX notification_inbox ON notifications(business_id,created_at DESC);
CREATE INDEX history_booking ON history(business_id,booking_id,created_at);
CREATE INDEX delivery_due ON deliveries(status,next_attempt,claimed_until);
CREATE INDEX schedule_block_range ON schedule_blocks(business_id,start_ms,end_ms);
