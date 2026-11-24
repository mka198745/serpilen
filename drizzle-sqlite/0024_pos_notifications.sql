CREATE TABLE IF NOT EXISTS order_notification_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  event TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT (unixepoch()),
  lease_token TEXT,
  lease_until INTEGER,
  last_error TEXT,
  sent_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(order_id,event)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS order_notification_due_idx ON order_notification_outbox(status,next_attempt_at,lease_until);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS pos_sale_requests (
  request_key TEXT PRIMARY KEY NOT NULL,
  request_hash TEXT NOT NULL,
  actor_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS pos_sale_payments (
  order_id INTEGER PRIMARY KEY NOT NULL,
  cash_amount INTEGER NOT NULL,
  card_amount INTEGER NOT NULL
);
