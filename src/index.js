
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

    return env.ASSETS.fetch(request);
  }
};
