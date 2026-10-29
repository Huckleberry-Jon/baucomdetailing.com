CREATE TABLE native_devices(
 id TEXT PRIMARY KEY,
 business_id TEXT NOT NULL,
 owner_id TEXT NOT NULL,
 device_id TEXT NOT NULL,
 token_hash TEXT NOT NULL,
 token_ciphertext TEXT NOT NULL,
 environment TEXT NOT NULL CHECK(environment IN ('sandbox','production')),
 session_hash TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1,
 registered_at INTEGER NOT NULL,
 last_seen INTEGER NOT NULL,
 UNIQUE(business_id,device_id),
 UNIQUE(business_id,token_hash),
 FOREIGN KEY(business_id,owner_id) REFERENCES owners(business_id,id)
);
CREATE INDEX native_device_owner ON native_devices(business_id,owner_id,active);
CREATE INDEX native_device_session ON native_devices(business_id,session_hash);

