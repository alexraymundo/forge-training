CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  preference_id TEXT,
  plan TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MXN',
  status TEXT NOT NULL DEFAULT 'created',
  payment_id TEXT,
  payer_email TEXT,
  payment_method TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_id ON orders(payment_id);
