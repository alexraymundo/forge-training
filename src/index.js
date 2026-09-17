const PLANS = {
  essential: { name: "Essential", amount: 299 },
  forge_plus: { name: "FORGE+", amount: 499 },
  coaching: { name: "Coaching", amount: 799 }
};

const AI_LIMITS = {
  essential: 10,
  forge_plus: 30,
  coaching: 80
};

const ROUTINE_MODEL_DEFAULT = "@cf/zai-org/glm-4.7-flash";
const CHAT_MODEL_DEFAULT = "@cf/zai-org/glm-4.7-flash";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function cleanText(value, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
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

async function ensureAITables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS routines (
      order_id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      ai_model TEXT,
      generated_at TEXT,
      updated_at TEXT NOT NULL,
      delivered_at TEXT
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS ai_usage (
      order_id TEXT NOT NULL,
      usage_month TEXT NOT NULL,
      chat_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (order_id, usage_month)
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS ai_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_ai_messages_order
    ON ai_messages(order_id, id)
  `).run();
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

function isAdmin(request, env) {
  const header = request.headers.get("authorization") || "";
  return Boolean(env.ADMIN_KEY) && header === `Bearer ${env.ADMIN_KEY}`;
}

function extractWorkersAIText(payload) {
  const candidates = [
    payload?.response,
    payload?.result?.response,
    payload?.output_text,
    payload?.choices?.[0]?.message?.content,
    payload?.result?.choices?.[0]?.message?.content
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }

    if (Array.isArray(candidate)) {
      const text = candidate
        .map(part => {
          if (typeof part === "string") return part;
          if (part?.type === "text" && typeof part.text === "string") return part.text;
          if (part?.type === "output_text" && typeof part.text === "string") return part.text;
          if (typeof part?.content === "string") return part.content;
          return "";
        })
        .filter(Boolean)
        .join("
")
        .trim();

      if (text) return text;
    }
  }

  return "";
}

async function callForgeAI(env, { model, instructions, input, maxOutputTokens = 1800 }) {
  if (!env.AI) {
    const error = new Error("Workers AI binding AI no está disponible.");
    error.code = "AI_NOT_CONFIGURED";
    throw error;
  }

  const messages = [
    { role: "system", content: instructions },
    { role: "user", content: input }
  ];

  // GLM-4.7-Flash supports chat messages through the native Workers AI binding.
  // Disable thinking for FORGE to keep the response simple and cheaper.
  const data = await env.AI.run(model, {
    messages,
    max_completion_tokens: maxOutputTokens,
    reasoning_effort: null,
    chat_template_kwargs: { enable_thinking: false }
  });

  const text = extractWorkersAIText(data);

  if (!text) {
    console.error("Workers AI raw response:", JSON.stringify(data).slice(0, 3000));
    const error = new Error("Workers AI respondió, pero FORGE no encontró texto en la respuesta.");
    error.code = "AI_EMPTY";
    throw error;
  }

  return text;
}

function aiError(error) {
  console.error("FORGE AI error", error);

  if (error?.code === "AI_NOT_CONFIGURED") {
    return json({
      error: "Workers AI no está conectado. Revisa que exista el binding AI en Cloudflare."
    }, 503);
  }

  const message = String(error?.message || "");
  const lower = message.toLowerCase();

  if (
    lower.includes("limit") ||
    lower.includes("quota") ||
    lower.includes("capacity") ||
    lower.includes("3040") ||
    lower.includes("429")
  ) {
    return json({
      error: "Cloudflare Workers AI está temporalmente sin capacidad o alcanzó el límite gratuito. Intenta más tarde."
    }, 429);
  }

  if (lower.includes("403") || lower.includes("5035")) {
    return json({
      error: "El modelo no está habilitado para este plan de Cloudflare."
    }, 403);
  }

  return json({
    error: "FORGE AI falló: " + (message ? message.slice(0, 220) : "error desconocido")
  }, 502);
}

async function profileByCode(code, env) {
  await ensureProfilesTable(env);
  return env.DB.prepare(`
    SELECT *
    FROM profiles
    WHERE UPPER(access_code) = ?
    LIMIT 1
  `).bind(code.toUpperCase()).first();
}

async function currentUsage(orderId, env) {
  await ensureAITables(env);
  const row = await env.DB.prepare(`
    SELECT chat_count
    FROM ai_usage
    WHERE order_id = ?
      AND usage_month = strftime('%Y-%m','now')
  `).bind(orderId).first();

  return Number(row?.chat_count || 0);
}

async function incrementUsage(orderId, env) {
  await env.DB.prepare(`
    INSERT INTO ai_usage (order_id, usage_month, chat_count, updated_at)
    VALUES (?, strftime('%Y-%m','now'), 1, datetime('now'))
    ON CONFLICT(order_id, usage_month) DO UPDATE SET
      chat_count = chat_count + 1,
      updated_at = datetime('now')
  `).bind(orderId).run();
}


async function ensureNotificationsTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      order_id TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_notifications_read
    ON notifications(is_read, created_at)
  `).run();
}

async function sendForgeEmail(env, { subject, text }) {
  if (!env.RESEND_API_KEY || !env.NOTIFY_EMAIL) return;

  const from = env.NOTIFY_FROM_EMAIL || "FORGE <onboarding@resend.dev>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [env.NOTIFY_EMAIL],
      subject: `[FORGE] ${subject}`,
      text
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend ${response.status}: ${body.slice(0, 500)}`);
  }
}

async function createNotification(env, { type, title, message, orderId = null }) {
  await ensureNotificationsTable(env);
  await env.DB.prepare(`
    INSERT INTO notifications (type, title, message, order_id, is_read, created_at)
    VALUES (?, ?, ?, ?, 0, datetime('now'))
  `).bind(type, title, message, orderId).run();

  try {
    await sendForgeEmail(env, { subject: title, text: message });
  } catch (error) {
    console.error("Notification email failed", error);
  }
}

async function adminNotifications(request, env) {
  if (!isAdmin(request, env)) return json({ error: "No autorizado" }, 401);
  await ensureNotificationsTable(env);

  const result = await env.DB.prepare(`
    SELECT id, type, title, message, order_id, is_read, created_at
    FROM notifications
    ORDER BY id DESC
    LIMIT 100
  `).all();

  const notifications = result.results || [];
  const unread = notifications.filter(n => Number(n.is_read) === 0).length;
  return json({ unread, notifications });
}

async function adminMarkNotificationsRead(request, env) {
  if (!isAdmin(request, env)) return json({ error: "No autorizado" }, 401);
  await ensureNotificationsTable(env);

  await env.DB.prepare(`
    UPDATE notifications
    SET is_read = 1
    WHERE is_read = 0
  `).run();

  return json({ ok: true });
}

// -------------------- PAYMENTS --------------------

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
  const id = cleanText(body.order_id, 100);
  const payerName = cleanText(body.payer_name, 120);
  const payerLast4 = cleanText(body.payer_last4, 4);

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

  const order = await env.DB.prepare(`
    SELECT plan, amount, payment_id
    FROM orders
    WHERE order_id = ?
  `).bind(id).first();

  await createNotification(env, {
    type: "transfer_reported",
    title: "Nueva transferencia reportada",
    message:
      `${payerName} reportó una transferencia.\n` +
      `Plan: ${PLANS[order?.plan]?.name || order?.plan || "—"}\n` +
      `Monto: $${order?.amount || "—"} MXN\n` +
      `Referencia: ${order?.payment_id || "—"}\n\n` +
      `Entra al panel de FORGE para verificar el depósito antes de aprobarlo.`,
    orderId: id
  });

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
  const id = cleanText(body.order_id, 100);
  const status = cleanText(body.status, 30);

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

  if (status === "approved" && (!accessCode || accessCode.startsWith("USED:"))) {
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

// -------------------- PROFILE / ACCESS --------------------

async function redeemAccessCode(request, env) {
  const body = await request.json().catch(() => ({}));
  const code = cleanText(body.code, 30).toUpperCase();

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
  const code = cleanText(body.access_code, 30).toUpperCase();
  const profile = body.profile || {};

  if (!code) return json({ error: "Código de acceso requerido" }, 400);

  const order = await env.DB.prepare(`
    SELECT order_id, plan, status, preference_id
    FROM orders
    WHERE UPPER(preference_id) = ?
    LIMIT 1
  `).bind(code).first();

  if (!order || order.status !== "approved") {
    return json({ error: "Código inválido o pago no aprobado" }, 403);
  }

  const clientName = cleanText(profile.clientName, 120);
  if (!clientName) return json({ error: "Nombre requerido" }, 400);

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
      client_status = 'questionnaire_submitted',
      updated_at = datetime('now')
  `).bind(
    order.order_id,
    code,
    order.plan,
    clientName,
    cleanText(profile.whatsapp, 40) || null,
    cleanText(profile.email, 160) || null,
    profile.age || null,
    profile.height || null,
    profile.weight || null,
    cleanText(profile.mainGoal, 160) || null,
    cleanText(profile.priorityArea, 300) || null,
    cleanText(profile.trainingLevel, 80) || null,
    profile.trainingDays || null,
    cleanText(profile.sessionTime, 80) || null,
    cleanText(profile.trainingPlace, 160) || null,
    cleanText(profile.equipmentAvailable, 1200) || null,
    cleanText(profile.likes, 1200) || null,
    cleanText(profile.dislikes, 1200) || null,
    cleanText(profile.limitations, 1500) || null
  ).run();

  await env.DB.prepare(`
    UPDATE orders
    SET status = 'profile_submitted',
        preference_id = ?,
        updated_at = datetime('now')
    WHERE order_id = ?
  `).bind(`USED:${code}`, order.order_id).run();

  await createNotification(env, {
    type: "profile_submitted",
    title: "Nuevo cuestionario completado",
    message:
      `${clientName} terminó su cuestionario FORGE.\n` +
      `Plan: ${PLANS[order.plan]?.name || order.plan}\n` +
      `Objetivo: ${cleanText(profile.mainGoal, 160) || "No indicado"}\n` +
      `Nivel: ${cleanText(profile.trainingLevel, 80) || "No indicado"}\n` +
      `Días por semana: ${profile.trainingDays || "No indicado"}\n\n` +
      `Ya puedes abrir el perfil en Admin y generar su rutina con FORGE AI.`,
    orderId: order.order_id
  });

  return json({
    ok: true,
    order_id: order.order_id,
    plan: order.plan,
    portal_code: code
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
  const orderIdValue = cleanText(body.order_id, 100);
  const status = cleanText(body.status, 40);

  const allowed = [
    "questionnaire_submitted",
    "routine_in_progress",
    "delivered"
  ];

  if (!orderIdValue || !allowed.includes(status)) {
    return json({ error: "Estado inválido" }, 400);
  }

  await env.DB.prepare(`
    UPDATE profiles
    SET client_status = ?, updated_at = datetime('now')
    WHERE order_id = ?
  `).bind(status, orderIdValue).run();

  return json({ ok: true, status });
}

async function adminReopenAccess(request, env) {
  if (!isAdmin(request, env)) return json({ error: "No autorizado" }, 401);
  await ensureProfilesTable(env);

  const body = await request.json().catch(() => ({}));
  const orderIdValue = cleanText(body.order_id, 100);
  if (!orderIdValue) return json({ error: "Orden requerida" }, 400);

  const order = await env.DB.prepare(`
    SELECT order_id, plan
    FROM orders
    WHERE order_id = ?
  `).bind(orderIdValue).first();

  if (!order) return json({ error: "Orden no encontrada" }, 404);

  const code = generateAccessCode();

  await env.DB.prepare(`
    UPDATE orders
    SET status = 'approved',
        preference_id = ?,
        updated_at = datetime('now')
    WHERE order_id = ?
  `).bind(code, orderIdValue).run();

  await env.DB.prepare(`
    UPDATE profiles
    SET access_code = ?, updated_at = datetime('now')
    WHERE order_id = ?
  `).bind(code, orderIdValue).run();

  return json({ ok: true, access_code: code });
}


async function ensureBrainTables(env) {
  await ensureProfilesTable(env);
  await ensureAITables(env);

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS routine_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      version_type TEXT NOT NULL,
      content TEXT NOT NULL,
      source_model TEXT,
      created_at TEXT NOT NULL
    )
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_routine_versions_order
    ON routine_versions(order_id, id)
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS brain_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      rating TEXT NOT NULL,
      categories TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    )
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_brain_feedback_order
    ON brain_feedback(order_id, id)
  `).run();
}

async function saveRoutineVersion(env, {
  orderId,
  versionType,
  content,
  sourceModel = null
}) {
  await ensureBrainTables(env);

  const cleanContent = cleanText(content, 30000);
  if (!orderId || !cleanContent) return;

  await env.DB.prepare(`
    INSERT INTO routine_versions (
      order_id, version_type, content, source_model, created_at
    )
    VALUES (?, ?, ?, ?, datetime('now'))
  `).bind(orderId, versionType, cleanContent, sourceModel).run();
}

async function similarForgeExamples(profile, env, limit = 3) {
  await ensureBrainTables(env);

  const result = await env.DB.prepare(`
    SELECT
      p.main_goal,
      p.training_level,
      p.training_days,
      p.session_time,
      p.training_place,
      p.priority_area,
      r.content,
      r.updated_at,
      (
        CASE WHEN p.main_goal = ? THEN 5 ELSE 0 END +
        CASE WHEN p.training_level = ? THEN 3 ELSE 0 END +
        CASE WHEN p.training_days = ? THEN 3 ELSE 0 END +
        CASE WHEN p.training_place = ? THEN 2 ELSE 0 END +
        CASE WHEN p.session_time = ? THEN 1 ELSE 0 END
      ) AS similarity_score
    FROM profiles p
    INNER JOIN routines r ON r.order_id = p.order_id
    WHERE r.status = 'delivered'
      AND p.order_id <> ?
    ORDER BY similarity_score DESC, r.updated_at DESC
    LIMIT ?
  `).bind(
    profile.main_goal || "",
    profile.training_level || "",
    profile.training_days || 0,
    profile.training_place || "",
    profile.session_time || "",
    profile.order_id,
    limit
  ).all();

  return result.results || [];
}

function formatForgeExamples(examples) {
  if (!examples.length) {
    return "Todavía no hay suficientes rutinas FORGE entregadas para usar como referencia histórica.";
  }

  return examples.map((ex, index) => `
CASO FORGE ${index + 1}
Objetivo: ${ex.main_goal || "—"}
Nivel: ${ex.training_level || "—"}
Días: ${ex.training_days || "—"}
Duración: ${ex.session_time || "—"}
Lugar: ${ex.training_place || "—"}
Prioridad: ${ex.priority_area || "—"}

RUTINA FINAL APROBADA:
${cleanText(ex.content, 6500)}
`.trim()).join("\n\n---\n\n");
}

async function adminBrain(request, env) {
  if (!isAdmin(request, env)) return json({ error: "No autorizado" }, 401);

  await ensureBrainTables(env);

  const statsRow = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM routines WHERE status = 'delivered') AS delivered_routines,
      (SELECT COUNT(*) FROM routine_versions WHERE version_type = 'ai_draft') AS ai_drafts,
      (SELECT COUNT(*) FROM routine_versions WHERE version_type = 'trainer_edit') AS trainer_edits,
      (SELECT COUNT(*) FROM routine_versions WHERE version_type = 'delivered') AS delivered_versions,
      (SELECT COUNT(*) FROM brain_feedback) AS feedback_count
  `).first();

  const feedback = await env.DB.prepare(`
    SELECT
      bf.id,
      bf.order_id,
      bf.rating,
      bf.categories,
      bf.notes,
      bf.created_at,
      p.client_name,
      p.main_goal,
      p.training_level
    FROM brain_feedback bf
    LEFT JOIN profiles p ON p.order_id = bf.order_id
    ORDER BY bf.id DESC
    LIMIT 100
  `).all();

  const examples = await env.DB.prepare(`
    SELECT
      p.order_id,
      p.client_name,
      p.main_goal,
      p.training_level,
      p.training_days,
      p.session_time,
      p.training_place,
      r.updated_at
    FROM profiles p
    INNER JOIN routines r ON r.order_id = p.order_id
    WHERE r.status = 'delivered'
    ORDER BY r.updated_at DESC
    LIMIT 50
  `).all();

  return json({
    stats: {
      delivered_routines: Number(statsRow?.delivered_routines || 0),
      ai_drafts: Number(statsRow?.ai_drafts || 0),
      trainer_edits: Number(statsRow?.trainer_edits || 0),
      delivered_versions: Number(statsRow?.delivered_versions || 0),
      feedback_count: Number(statsRow?.feedback_count || 0)
    },
    feedback: feedback.results || [],
    examples: examples.results || []
  });
}

async function adminBrainFeedback(request, env) {
  if (!isAdmin(request, env)) return json({ error: "No autorizado" }, 401);

  await ensureBrainTables(env);

  const body = await request.json().catch(() => ({}));
  const orderIdValue = cleanText(body.order_id, 100);
  const rating = cleanText(body.rating, 40);
  const categories = Array.isArray(body.categories)
    ? body.categories.map(v => cleanText(v, 80)).filter(Boolean).slice(0, 10)
    : [];
  const notes = cleanText(body.notes, 2000);

  if (!orderIdValue || !["good", "adjustments", "bad"].includes(rating)) {
    return json({ error: "Feedback inválido" }, 400);
  }

  const profile = await env.DB.prepare(`
    SELECT order_id FROM profiles WHERE order_id = ?
  `).bind(orderIdValue).first();

  if (!profile) return json({ error: "Cliente no encontrado" }, 404);

  await env.DB.prepare(`
    INSERT INTO brain_feedback (
      order_id, rating, categories, notes, created_at
    )
    VALUES (?, ?, ?, ?, datetime('now'))
  `).bind(
    orderIdValue,
    rating,
    JSON.stringify(categories),
    notes || null
  ).run();

  return json({ ok: true });
}


// -------------------- ADMIN AI ROUTINES --------------------

async function adminRoutines(request, env) {
  if (!isAdmin(request, env)) return json({ error: "No autorizado" }, 401);
  await ensureAITables(env);

  const result = await env.DB.prepare(`
    SELECT order_id, content, status, ai_model, generated_at, updated_at, delivered_at
    FROM routines
    ORDER BY updated_at DESC
    LIMIT 200
  `).all();

  return json({ routines: result.results || [] });
}

function routinePrompt(profile) {
  return `
CLIENTE FORGE
Nombre: ${profile.client_name}
Plan: ${profile.plan}
Edad: ${profile.age ?? "No indicada"}
Estatura: ${profile.height ?? "No indicada"} cm
Peso: ${profile.weight ?? "No indicado"} kg
Objetivo principal: ${profile.main_goal || "No indicado"}
Zona prioritaria: ${profile.priority_area || "No indicada"}
Nivel: ${profile.training_level || "No indicado"}
Días por semana: ${profile.training_days || "No indicado"}
Tiempo por sesión: ${profile.session_time || "No indicado"}
Lugar de entrenamiento: ${profile.training_place || "No indicado"}
Equipo disponible: ${profile.equipment_available || "No indicado"}
Ejercicios que le gustan: ${profile.likes || "No indicado"}
Ejercicios que quiere evitar: ${profile.dislikes || "No indicado"}
Lesiones, molestias o limitaciones reportadas: ${profile.limitations || "Ninguna reportada"}

Genera un BORRADOR para revisión del entrenador Alex. Debe ser práctico y listo para editar.

Formato obligatorio:
FORGE — BORRADOR DE RUTINA
1. Objetivo y enfoque
2. Distribución semanal
3. Rutina por día
   Para cada ejercicio indica: ejercicio, series, repeticiones, RIR o RPE y descanso.
4. Progresión sugerida durante 4 semanas
5. Calentamiento y preparación
6. Sustituciones útiles según equipo
7. Puntos que Alex debe revisar antes de entregar

Adapta volumen y selección al nivel, días disponibles, duración de sesión, equipo y preferencias reales del cliente.
No inventes diagnósticos médicos. Si las limitaciones sugieren que una decisión requiere valoración clínica, indícalo como punto a revisar y evita prescribir alrededor de una lesión como si hubiera diagnóstico.
`.trim();
}

async function adminGenerateRoutine(request, env) {
  if (!isAdmin(request, env)) return json({ error: "No autorizado" }, 401);

  await ensureProfilesTable(env);
  await ensureAITables(env);
  await ensureBrainTables(env);

  const body = await request.json().catch(() => ({}));
  const orderIdValue = cleanText(body.order_id, 100);
  if (!orderIdValue) return json({ error: "Orden requerida" }, 400);

  const profile = await env.DB.prepare(`
    SELECT * FROM profiles WHERE order_id = ?
  `).bind(orderIdValue).first();

  if (!profile) return json({ error: "Perfil no encontrado" }, 404);

  const examples = await similarForgeExamples(profile, env, 3);
  const forgeKnowledge = formatForgeExamples(examples);

  const model = env.FORGE_ROUTINE_MODEL || ROUTINE_MODEL_DEFAULT;

  const brainContext = `
${routinePrompt(profile)}

CONOCIMIENTO HISTÓRICO DE FORGE
A continuación hay rutinas finales que Alex ya revisó y entregó en casos similares.
Úsalas únicamente como referencia de criterio FORGE. No copies nombres, datos personales ni una rutina completa.
Prioriza el perfil actual. Si una referencia histórica contradice las necesidades del cliente actual, ignórala.

${forgeKnowledge}
`.trim();

  try {
    const content = await callForgeAI(env, {
      model,
      instructions:
        "Eres FORGE AI, asistente de diseño de entrenamiento para Alex. " +
        "Tu trabajo es crear borradores técnicamente coherentes para revisión humana. " +
        "FORGE Brain puede proporcionarte ejemplos de rutinas que Alex ya aprobó. " +
        "Debes detectar patrones útiles de estructura, volumen, selección y progresión, " +
        "pero nunca copiar ciegamente un caso histórico. El perfil actual manda. " +
        "Responde en español. No diagnostiques ni sustituyas atención médica. " +
        "No afirmes que el borrador ya fue aprobado por Alex.",
      input: brainContext,
      maxOutputTokens: 3200
    });

    await env.DB.prepare(`
      INSERT INTO routines (
        order_id, content, status, ai_model, generated_at, updated_at, delivered_at
      )
      VALUES (?, ?, 'draft', ?, datetime('now'), datetime('now'), NULL)
      ON CONFLICT(order_id) DO UPDATE SET
        content = excluded.content,
        status = 'draft',
        ai_model = excluded.ai_model,
        generated_at = datetime('now'),
        updated_at = datetime('now'),
        delivered_at = NULL
    `).bind(orderIdValue, content, model).run();

    await saveRoutineVersion(env, {
      orderId: orderIdValue,
      versionType: "ai_draft",
      content,
      sourceModel: model
    });

    await env.DB.prepare(`
      UPDATE profiles
      SET client_status = 'routine_in_progress',
          updated_at = datetime('now')
      WHERE order_id = ?
    `).bind(orderIdValue).run();

    return json({
      ok: true,
      content,
      model,
      status: "draft",
      brain_examples_used: examples.length
    });
  } catch (error) {
    return aiError(error);
  }
}

async function adminSaveRoutine(request, env) {
  if (!isAdmin(request, env)) return json({ error: "No autorizado" }, 401);
  await ensureAITables(env);

  const body = await request.json().catch(() => ({}));
  const orderIdValue = cleanText(body.order_id, 100);
  const content = cleanText(body.content, 30000);

  if (!orderIdValue || !content) {
    return json({ error: "Rutina vacía" }, 400);
  }

  const existing = await env.DB.prepare(`
    SELECT status FROM routines WHERE order_id = ?
  `).bind(orderIdValue).first();

  if (existing) {
    await env.DB.prepare(`
      UPDATE routines
      SET content = ?, updated_at = datetime('now')
      WHERE order_id = ?
    `).bind(content, orderIdValue).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO routines (order_id, content, status, updated_at)
      VALUES (?, ?, 'draft', datetime('now'))
    `).bind(orderIdValue, content).run();
  }

  await saveRoutineVersion(env, {
    orderId: orderIdValue,
    versionType: "trainer_edit",
    content
  });

  return json({ ok: true });
}

async function adminDeliverRoutine(request, env) {
  if (!isAdmin(request, env)) return json({ error: "No autorizado" }, 401);
  await ensureProfilesTable(env);
  await ensureAITables(env);

  const body = await request.json().catch(() => ({}));
  const orderIdValue = cleanText(body.order_id, 100);

  const routine = await env.DB.prepare(`
    SELECT content FROM routines WHERE order_id = ?
  `).bind(orderIdValue).first();

  if (!routine?.content) {
    return json({ error: "Primero genera o guarda una rutina." }, 400);
  }

  await env.DB.prepare(`
    UPDATE routines
    SET status = 'delivered',
        delivered_at = datetime('now'),
        updated_at = datetime('now')
    WHERE order_id = ?
  `).bind(orderIdValue).run();

  await env.DB.prepare(`
    UPDATE profiles
    SET client_status = 'delivered',
        updated_at = datetime('now')
    WHERE order_id = ?
  `).bind(orderIdValue).run();

  await saveRoutineVersion(env, {
    orderId: orderIdValue,
    versionType: "delivered",
    content: routine.content
  });

  return json({ ok: true, status: "delivered" });
}

// -------------------- CLIENT PORTAL / AI CHAT --------------------

async function portalData(request, env) {
  await ensureProfilesTable(env);
  await ensureAITables(env);

  const body = await request.json().catch(() => ({}));
  const code = cleanText(body.code, 30).toUpperCase();

  if (!code) return json({ error: "Código requerido" }, 400);

  const profile = await profileByCode(code, env);
  if (!profile) return json({ error: "Código de cliente no válido." }, 404);

  const routine = await env.DB.prepare(`
    SELECT content, status, delivered_at, updated_at
    FROM routines
    WHERE order_id = ?
  `).bind(profile.order_id).first();

  const usage = await currentUsage(profile.order_id, env);
  const limit = AI_LIMITS[profile.plan] || 10;

  const messages = await env.DB.prepare(`
    SELECT role, content, created_at
    FROM ai_messages
    WHERE order_id = ?
    ORDER BY id DESC
    LIMIT 30
  `).bind(profile.order_id).all();

  return json({
    ok: true,
    profile: {
      order_id: profile.order_id,
      plan: profile.plan,
      client_name: profile.client_name,
      main_goal: profile.main_goal,
      priority_area: profile.priority_area,
      training_level: profile.training_level,
      training_days: profile.training_days,
      session_time: profile.session_time,
      training_place: profile.training_place,
      client_status: profile.client_status
    },
    routine: routine?.status === "delivered" ? {
      content: routine.content,
      delivered_at: routine.delivered_at,
      updated_at: routine.updated_at
    } : null,
    ai: {
      used: usage,
      limit,
      remaining: Math.max(0, limit - usage)
    },
    messages: (messages.results || []).reverse()
  });
}

async function aiChat(request, env) {
  await ensureProfilesTable(env);
  await ensureAITables(env);

  const body = await request.json().catch(() => ({}));
  const code = cleanText(body.code, 30).toUpperCase();
  const message = cleanText(body.message, 1500);

  if (!code || !message) {
    return json({ error: "Mensaje o código faltante." }, 400);
  }

  const profile = await profileByCode(code, env);
  if (!profile) return json({ error: "Código de cliente no válido." }, 404);

  const limit = AI_LIMITS[profile.plan] || 10;
  const used = await currentUsage(profile.order_id, env);

  if (used >= limit) {
    return json({
      error: "Llegaste al límite de mensajes de FORGE AI de este mes.",
      limit,
      used,
      remaining: 0
    }, 429);
  }

  const routine = await env.DB.prepare(`
    SELECT content, status
    FROM routines
    WHERE order_id = ?
  `).bind(profile.order_id).first();

  const historyResult = await env.DB.prepare(`
    SELECT role, content
    FROM ai_messages
    WHERE order_id = ?
    ORDER BY id DESC
    LIMIT 12
  `).bind(profile.order_id).all();

  const history = (historyResult.results || []).reverse()
    .map(m => `${m.role === "user" ? "CLIENTE" : "FORGE AI"}: ${m.content}`)
    .join("\n\n");

  const deliveredRoutine =
    routine?.status === "delivered"
      ? routine.content
      : "La rutina final todavía no ha sido entregada por Alex.";

  const context = `
PERFIL DEL CLIENTE
Nombre: ${profile.client_name}
Plan: ${profile.plan}
Edad: ${profile.age ?? "No indicada"}
Objetivo: ${profile.main_goal || "No indicado"}
Prioridad: ${profile.priority_area || "No indicada"}
Nivel: ${profile.training_level || "No indicado"}
Días: ${profile.training_days || "No indicado"}
Tiempo por sesión: ${profile.session_time || "No indicado"}
Lugar: ${profile.training_place || "No indicado"}
Equipo: ${profile.equipment_available || "No indicado"}
Preferencias: ${profile.likes || "No indicadas"}
Ejercicios a evitar: ${profile.dislikes || "No indicados"}
Limitaciones reportadas: ${profile.limitations || "Ninguna reportada"}

RUTINA ENTREGADA
${deliveredRoutine}

CONVERSACIÓN RECIENTE
${history || "Sin mensajes previos."}

NUEVA PREGUNTA DEL CLIENTE
${message}
`.trim();

  const model = env.FORGE_CHAT_MODEL || CHAT_MODEL_DEFAULT;

  try {
    const answer = await callForgeAI(env, {
      model,
      instructions:
        "Eres FORGE AI, asistente privado de entrenamiento para un cliente que ya pagó. " +
        "Responde en español claro, útil y breve. Usa su perfil y únicamente considera como rutina oficial " +
        "la rutina marcada como entregada por Alex. Puedes explicar ejercicios, descansos, progresión, " +
        "hacer sustituciones razonables por equipo disponible y adaptar una sesión a menos tiempo. " +
        "No cambies de forma importante la programación oficial sin indicar que requiere revisión de Alex. " +
        "No diagnostiques lesiones ni enfermedades. Si el usuario reporta dolor intenso, lesión aguda, " +
        "síntomas preocupantes o una condición que requiera valoración, evita prescribir alrededor del problema " +
        "y recomienda detener el ejercicio relevante y consultar a un profesional de salud. " +
        "No prometas resultados físicos garantizados.",
      input: context,
      maxOutputTokens: 900
    });

    await env.DB.prepare(`
      INSERT INTO ai_messages (order_id, role, content, created_at)
      VALUES (?, 'user', ?, datetime('now'))
    `).bind(profile.order_id, message).run();

    await env.DB.prepare(`
      INSERT INTO ai_messages (order_id, role, content, created_at)
      VALUES (?, 'assistant', ?, datetime('now'))
    `).bind(profile.order_id, answer).run();

    await incrementUsage(profile.order_id, env);

    return json({
      ok: true,
      answer,
      used: used + 1,
      limit,
      remaining: Math.max(0, limit - used - 1)
    });
  } catch (error) {
    return aiError(error);
  }
}


async function adminAITest(request, env) {
  if (!isAdmin(request, env)) return json({ error: "No autorizado" }, 401);

  const bindingPresent = Boolean(env.AI);
  if (!bindingPresent) {
    return json({
      ok: false,
      binding: false,
      model: ROUTINE_MODEL_DEFAULT,
      error: "No existe env.AI. El binding AI no quedó aplicado al Worker."
    }, 503);
  }

  try {
    const answer = await callForgeAI(env, {
      model: ROUTINE_MODEL_DEFAULT,
      instructions: "Responde únicamente con la frase: FORGE AI OK",
      input: "Prueba de conexión.",
      maxOutputTokens: 40
    });

    return json({
      ok: true,
      binding: true,
      model: ROUTINE_MODEL_DEFAULT,
      answer
    });
  } catch (error) {
    return json({
      ok: false,
      binding: true,
      model: ROUTINE_MODEL_DEFAULT,
      error: String(error?.message || error || "Error desconocido").slice(0, 500)
    }, 502);
  }
}

// -------------------- ROUTER --------------------

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
    if (url.pathname === "/api/admin/profiles" && request.method === "GET") {
      return adminProfiles(request, env);
    }
    if (url.pathname === "/api/admin/client-status" && request.method === "POST") {
      return adminUpdateClientStatus(request, env);
    }
    if (url.pathname === "/api/admin/reopen-access" && request.method === "POST") {
      return adminReopenAccess(request, env);
    }

    if (url.pathname === "/api/admin/notifications" && request.method === "GET") {
      return adminNotifications(request, env);
    }
    if (url.pathname === "/api/admin/notifications/read" && request.method === "POST") {
      return adminMarkNotificationsRead(request, env);
    }

    if (url.pathname === "/api/admin/ai-test" && request.method === "POST") {
      return adminAITest(request, env);
    }

    if (url.pathname === "/api/admin/brain" && request.method === "GET") {
      return adminBrain(request, env);
    }
    if (url.pathname === "/api/admin/brain/feedback" && request.method === "POST") {
      return adminBrainFeedback(request, env);
    }

    if (url.pathname === "/api/admin/routines" && request.method === "GET") {
      return adminRoutines(request, env);
    }
    if (url.pathname === "/api/admin/generate-routine" && request.method === "POST") {
      return adminGenerateRoutine(request, env);
    }
    if (url.pathname === "/api/admin/save-routine" && request.method === "POST") {
      return adminSaveRoutine(request, env);
    }
    if (url.pathname === "/api/admin/deliver-routine" && request.method === "POST") {
      return adminDeliverRoutine(request, env);
    }

    if (url.pathname === "/api/redeem-access-code" && request.method === "POST") {
      return redeemAccessCode(request, env);
    }
    if (url.pathname === "/api/submit-profile" && request.method === "POST") {
      return submitProfile(request, env);
    }

    if (url.pathname === "/api/portal" && request.method === "POST") {
      return portalData(request, env);
    }
    if (url.pathname === "/api/ai/chat" && request.method === "POST") {
      return aiChat(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};
