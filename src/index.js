
const PLANS = {
  essential: { name: "Essential", amount: 299 },
  forge_plus: { name: "FORGE+", amount: 499 },
  coaching: { name: "Coaching", amount: 799 }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}


async function ensureProfilesTable(env) {
  await env.DB.prepare(`
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
    )
  `).run();

  const migrations = [
    "ALTER TABLE profiles ADD COLUMN whatsapp TEXT",
    "ALTER TABLE profiles ADD COLUMN email TEXT",
    "ALTER TABLE profiles ADD COLUMN client_status TEXT NOT NULL DEFAULT 'questionnaire_submitted'"
  ];

  for (const sql of migrations) {
    try { await env.DB.prepare(sql).run(); } catch (_) {}
  }
}

function generateAccessCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (const byte of bytes) suffix += chars[byte % chars.length];
  return `FORGE-${suffix}`;
}

function orderId() {
  return `forge_${Date.now()}_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
}

function shortReference() {
  return `F-${crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`;
}

async function createBankOrder(request, env) {
  const body = await request.json().catch(() => ({}));
  const planKey = body.plan;
  const plan = PLANS[planKey];
  if (!plan) return json({ error: "Plan inválido" }, 400);

  const id = orderId();
  const ref = shortReference();

  await env.DB.prepare(`
    INSERT INTO orders
      (order_id, plan, amount, currency, status, payment_id, payment_method, created_at, updated_at)
    VALUES (?, ?, ?, 'MXN', 'pending_transfer', ?, 'bank_transfer', datetime('now'), datetime('now'))
  `).bind(id, planKey, plan.amount, ref).run();

  return json({
    order_id: id,
    plan: planKey,
    amount: plan.amount,
    reference: ref
  });
}

async function reportTransfer(request, env) {
  const body = await request.json().catch(() => ({}));
  const id = String(body.order_id || "");
  const payerName = String(body.payer_name || "").trim();
  const payerLast4 = String(body.payer_last4 || "").trim();

  if (!id || !payerName || !/^\d{4}$/.test(payerLast4)) {
    return json({ error: "Datos incompletos" }, 400);
  }

  const existing = await env.DB.prepare(
    "SELECT order_id FROM orders WHERE order_id = ?"
  ).bind(id).first();

  if (!existing) return json({ error: "Orden no encontrada" }, 404);

  await env.DB.prepare(`
    UPDATE orders
    SET status = 'transfer_reported',
        payer_email = ?,
        updated_at = datetime('now')
    WHERE order_id = ?
  `).bind(`${payerName} | ****${payerLast4}`, id).run();

  return json({ ok: true, status: "pending" });
}

async function paymentStatus(request, env) {
  const url = new URL(request.url);
  const id = url.searchParams.get("order_id");
  if (!id) return json({ error: "order_id requerido" }, 400);

  const row = await env.DB.prepare(`
    SELECT order_id, plan, amount, currency, status, payment_id, updated_at
    FROM orders
    WHERE order_id = ?
  `).bind(id).first();

  if (!row) return json({ error: "Orden no encontrada" }, 404);

  if (row.status === "pending_transfer" || row.status === "transfer_reported") {
    row.status = "pending";
  }

  return json(row);
}

function isAdmin(request, env) {
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${env.ADMIN_KEY}`;
}

async function adminOrders(request, env) {
  if (!isAdmin(request, env)) return json({ error: "No autorizado" }, 401);

  const result = await env.DB.prepare(`
    SELECT order_id, plan, amount, status,
           payment_id AS reference,
           payer_email AS reported_by,
           preference_id AS access_code,
           created_at, updated_at
    FROM orders
    WHERE status IN ('pending_transfer','transfer_reported','approved','rejected')
    ORDER BY created_at DESC
    LIMIT 100
  `).all();

  return json({ orders: result.results || [] });
}

async function adminStatus(request, env) {
  if (!isAdmin(request, env)) return json({ error: "No autorizado" }, 401);

  const body = await request.json().catch(() => ({}));
  const id = String(body.order_id || "");
  const status = String(body.status || "");

  if (!id || !["approved","rejected"].includes(status)) {
    return json({ error: "Datos inválidos" }, 400);
  }

  const order = await env.DB.prepare(`
    SELECT order_id, preference_id
    FROM orders
    WHERE order_id = ?
  `).bind(id).first();

  if (!order) return json({ error: "Orden no encontrada" }, 404);

  let accessCode = order.preference_id || null;

  if (status === "approved" && !accessCode) {
    accessCode = generateAccessCode();
  }

  await env.DB.prepare(`
    UPDATE orders
    SET status = ?,
        preference_id = ?,
        updated_at = datetime('now')
    WHERE order_id = ?
  `).bind(
    status,
    status === "approved" ? accessCode : order.preference_id,
    id
  ).run();

  return json({
    ok: true,
    status,
    access_code: status === "approved" ? accessCode : null
  });
}

async function redeemAccessCode(request, env) {
  const body = await request.json().catch(() => ({}));
  const code = String(body.code || "").trim().toUpperCase();

  if (!code) return json({ error: "Código requerido" }, 400);

  const order = await env.DB.prepare(`
    SELECT order_id, plan, status, preference_id
    FROM orders
    WHERE UPPER(preference_id) = ?
    LIMIT 1
  `).bind(code).first();

  if (!order || order.status !== "approved") {
    return json({
      approved: false,
      error: "Código inválido o pago no aprobado"
    }, 404);
  }

  return json({
    approved: true,
    plan: order.plan,
    order_id: order.order_id
  });
}


async function submitProfile(request, env) {
  await ensureProfilesTable(env);

  const body = await request.json().catch(() => ({}));
  const code = String(body.access_code || "").trim().toUpperCase();
  const profile = body.profile || {};

  if (!code) {
    return json({ error: "Código de acceso requerido" }, 400);
  }

  const order = await env.DB.prepare(`
    SELECT order_id, plan, status, preference_id
    FROM orders
    WHERE UPPER(preference_id) = ?
    LIMIT 1
  `).bind(code).first();

  if (!order || order.status !== "approved") {
    return json({ error: "Código inválido o pago no aprobado" }, 403);
  }

  const clientName = String(profile.clientName || "").trim();
  if (!clientName) {
    return json({ error: "Nombre requerido" }, 400);
  }

  await env.DB.prepare(`
    INSERT INTO profiles (
      order_id, access_code, plan, client_name, whatsapp, email, age, height, weight,
      main_goal, priority_area, training_level, training_days,
      session_time, training_place, equipment_available,
      likes, dislikes, limitations, client_status, submitted_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'questionnaire_submitted', datetime('now'), datetime('now'))
    ON CONFLICT(order_id) DO UPDATE SET
      access_code = excluded.access_code,
      plan = excluded.plan,
      client_name = excluded.client_name,
      whatsapp = excluded.whatsapp,
      email = excluded.email,
      age = excluded.age,
      height = excluded.height,
      weight = excluded.weight,
      main_goal = excluded.main_goal,
      priority_area = excluded.priority_area,
      training_level = excluded.training_level,
      training_days = excluded.training_days,
      session_time = excluded.session_time,
      training_place = excluded.training_place,
      equipment_available = excluded.equipment_available,
      likes = excluded.likes,
      dislikes = excluded.dislikes,
      limitations = excluded.limitations,
      updated_at = datetime('now')
  `).bind(
    order.order_id,
    code,
    order.plan,
    clientName,
    profile.whatsapp || null,
    profile.email || null,
    profile.age || null,
    profile.height || null,
    profile.weight || null,
    profile.mainGoal || null,
    profile.priorityArea || null,
    profile.trainingLevel || null,
    profile.trainingDays || null,
    profile.sessionTime || null,
    profile.trainingPlace || null,
    profile.equipmentAvailable || null,
    profile.likes || null,
    profile.dislikes || null,
    profile.limitations || null
  ).run();

  await env.DB.prepare(`
    UPDATE orders
    SET status = 'profile_submitted',
        preference_id = ?,
        updated_at = datetime('now')
    WHERE order_id = ?
  `).bind(`USED:${code}`, order.order_id).run();

  return json({
    ok: true,
    order_id: order.order_id,
    plan: order.plan
  });
}

async function adminProfiles(request, env) {
  if (!isAdmin(request, env)) return json({ error: "No autorizado" }, 401);

  await ensureProfilesTable(env);

  const result = await env.DB.prepare(`
    SELECT
      p.order_id,
      p.access_code,
      p.plan,
      p.client_name,
      p.whatsapp,
      p.email,
      p.client_status,
      p.age,
      p.height,
      p.weight,
      p.main_goal,
      p.priority_area,
      p.training_level,
      p.training_days,
      p.session_time,
      p.training_place,
      p.equipment_available,
      p.likes,
      p.dislikes,
      p.limitations,
      p.submitted_at,
      p.updated_at
    FROM profiles p
    ORDER BY p.updated_at DESC
    LIMIT 200
  `).all();

  return json({ profiles: result.results || [] });
}


async function adminUpdateClientStatus(request, env) {
  if (!isAdmin(request, env)) return json({ error: "No autorizado" }, 401);
  await ensureProfilesTable(env);

  const body = await request.json().catch(() => ({}));
  const orderId = String(body.order_id || "");
  const status = String(body.status || "");

  const allowed = [
    "questionnaire_submitted",
    "routine_in_progress",
    "delivered"
  ];

  if (!orderId || !allowed.includes(status)) {
    return json({ error: "Estado inválido" }, 400);
  }

  await env.DB.prepare(`
    UPDATE profiles
    SET client_status = ?, updated_at = datetime('now')
    WHERE order_id = ?
  `).bind(status, orderId).run();

  return json({ ok: true, status });
}

async function adminReopenAccess(request, env) {
  if (!isAdmin(request, env)) return json({ error: "No autorizado" }, 401);

  const body = await request.json().catch(() => ({}));
  const orderId = String(body.order_id || "");
  if (!orderId) return json({ error: "Orden requerida" }, 400);

  const order = await env.DB.prepare(`
    SELECT order_id, plan
    FROM orders
    WHERE order_id = ?
  `).bind(orderId).first();

  if (!order) return json({ error: "Orden no encontrada" }, 404);

  const code = generateAccessCode();

  await env.DB.prepare(`
    UPDATE orders
    SET status = 'approved',
        preference_id = ?,
        updated_at = datetime('now')
    WHERE order_id = ?
  `).bind(code, orderId).run();

  return json({ ok: true, access_code: code });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/create-bank-order" && request.method === "POST") {
      return createBankOrder(request, env);
    }

    if (url.pathname === "/api/report-transfer" && request.method === "POST") {
      return reportTransfer(request, env);
    }

    if (url.pathname === "/api/payment-status" && request.method === "GET") {
      return paymentStatus(request, env);
    }

    if (url.pathname === "/api/admin/orders" && request.method === "GET") {
      return adminOrders(request, env);
    }

    if (url.pathname === "/api/admin/order-status" && request.method === "POST") {
      return adminStatus(request, env);
    }

    if (url.pathname === "/api/redeem-access-code" && request.method === "POST") {
      return redeemAccessCode(request, env);
    }

    if (url.pathname === "/api/submit-profile" && request.method === "POST") {
      return submitProfile(request, env);
    }

    if (url.pathname === "/api/admin/profiles" && request.method === "GET") {
      return adminProfiles(request, env);
    }

    if (url.pathname === "/api/admin/client-status" && request.method === "POST") {
      return adminUpdateClientStatus(request, env);
    }

    if (url.pathname === "/api/admin/reopen-access" && request.method === "POST") {
      return adminReopenAccess(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};
