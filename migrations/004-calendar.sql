CREATE TABLE schedule_blocks(id TEXT PRIMARY KEY,business_id TEXT NOT NULL REFERENCES businesses(id),start_ms INTEGER NOT NULL,end_ms INTEGER NOT NULL,label TEXT NOT NULL,created_at INTEGER NOT NULL,CHECK(end_ms>start_ms));
CREATE INDEX schedule_blocks_range ON schedule_blocks(business_id,start_ms,end_ms);
