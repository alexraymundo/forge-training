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


CREATE TABLE IF NOT EXISTS profiles (
  order_id TEXT PRIMARY KEY,
  access_code TEXT NOT NULL,
  plan TEXT NOT NULL,
  client_name TEXT NOT NULL,
  whatsapp TEXT,
  email TEXT,
  age INTEGER,
  height REAL,
  weight REAL,
  main_goal TEXT,
  priority_area TEXT,
  training_level TEXT,
  training_days INTEGER,
  session_time TEXT,
  training_place TEXT,
  equipment_available TEXT,
  likes TEXT,
  dislikes TEXT,
  limitations TEXT,
  client_status TEXT NOT NULL DEFAULT 'questionnaire_submitted',
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profiles_plan ON profiles(plan);
CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON profiles(updated_at);
