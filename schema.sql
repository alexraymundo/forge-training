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


CREATE TABLE IF NOT EXISTS routines (
  order_id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  ai_model TEXT,
  generated_at TEXT,
  updated_at TEXT NOT NULL,
  delivered_at TEXT
);

CREATE TABLE IF NOT EXISTS ai_usage (
  order_id TEXT NOT NULL,
  usage_month TEXT NOT NULL,
  chat_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (order_id, usage_month)
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_order
ON ai_messages(order_id, id);


CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  order_id TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_read
ON notifications(is_read, created_at);


CREATE TABLE IF NOT EXISTS routine_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  version_type TEXT NOT NULL,
  content TEXT NOT NULL,
  source_model TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_routine_versions_order
ON routine_versions(order_id, id);

CREATE TABLE IF NOT EXISTS brain_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  rating TEXT NOT NULL,
  categories TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_brain_feedback_order
ON brain_feedback(order_id, id);
