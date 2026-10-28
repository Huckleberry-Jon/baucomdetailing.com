CREATE TABLE audit_events(id TEXT PRIMARY KEY,business_id TEXT NOT NULL REFERENCES businesses(id),actor_id TEXT NOT NULL,event TEXT NOT NULL,record_id TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX audit_business_date ON audit_events(business_id,created_at);
