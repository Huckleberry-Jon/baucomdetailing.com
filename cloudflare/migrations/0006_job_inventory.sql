CREATE TABLE job_details(job_id TEXT PRIMARY KEY REFERENCES jobs(id),business_id TEXT NOT NULL REFERENCES businesses(id),version INTEGER NOT NULL DEFAULT 1,data TEXT NOT NULL);
CREATE INDEX job_details_tenant ON job_details(business_id,job_id);
CREATE TABLE inventory_balances(material_id TEXT PRIMARY KEY REFERENCES materials(id),business_id TEXT NOT NULL REFERENCES businesses(id),quantity_millis INTEGER NOT NULL CHECK(quantity_millis>=0),version INTEGER NOT NULL DEFAULT 1);
CREATE TABLE inventory_movements(id TEXT PRIMARY KEY,business_id TEXT NOT NULL REFERENCES businesses(id),material_id TEXT NOT NULL REFERENCES materials(id),job_id TEXT REFERENCES jobs(id),quantity_millis INTEGER NOT NULL,cost_cents INTEGER NOT NULL,data TEXT NOT NULL,idempotency_key TEXT NOT NULL,request_hash TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(business_id,idempotency_key));
CREATE INDEX inventory_job ON inventory_movements(business_id,job_id);

