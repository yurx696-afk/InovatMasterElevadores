const MAX_BODY_BYTES = 20_000;
const ALLOWED_SERVICOS = new Set(["Manutenção", "Instalação", "Modernização", "Inspeção / Laudo", "Outro"]);

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  res.end(JSON.stringify(body));
}

function getClientIp(req) {
  const xff = (req.headers["x-forwarded-for"] || "").toString();
  const ip = xff.split(",")[0].trim();
  return ip || (req.socket && req.socket.remoteAddress) || "0.0.0.0";
}

// Only accept real strings from the parsed JSON body — objects/arrays/numbers
// are treated as absent rather than coerced (avoids "[object Object]" leaking
// into sanitized output and rejects unexpected payload shapes).
function asString(v) {
  return typeof v === "string" ? v : "";
}

function stripControlChars(str) {
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

function sanitizePlainText(str, max) {
  const cleaned = stripControlChars(asString(str))
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > max ? cleaned.slice(0, max) : cleaned;
}

function normalizePhoneDigits(v) {
  return asString(v).replace(/\D+/g, "");
}

const rateState = new Map();
let lastSweep = Date.now();
function sweepExpired(windowMs) {
  const now = Date.now();
  if (now - lastSweep < windowMs) return;
  lastSweep = now;
  for (const [ip, entry] of rateState) {
    if (now - entry.start > windowMs) rateState.delete(ip);
  }
}
function rateLimit(ip, { windowMs = 60_000, max = 10 } = {}) {
  sweepExpired(windowMs);
  const now = Date.now();
  const cur = rateState.get(ip);
  if (!cur || now - cur.start > windowMs) {
    rateState.set(ip, { start: now, count: 1 });
    return { ok: true, remaining: max - 1 };
  }
  cur.count += 1;
  rateState.set(ip, cur);
  return { ok: cur.count <= max, remaining: Math.max(0, max - cur.count) };
}

async function verifyRecaptcha(token, ip) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return { ok: true, skipped: true };
  if (!token) return { ok: false, code: "missing_token" };

  const params = new URLSearchParams();
  params.set("secret", secret);
  params.set("response", token);
  if (ip) params.set("remoteip", ip);

  const r = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const data = await r.json().catch(() => ({}));
  const score = typeof data.score === "number" ? data.score : null;
  const action = data.action || "";
  const ok = Boolean(data.success) && (score === null || score >= 0.5) && (!action || action === "lead_submit");
  return { ok, score, action, raw: data };
}

async function sendEmailResend({ from, to, subject, text }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, skipped: true, provider: "resend" };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text }),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, provider: "resend", status: r.status, data };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "method_not_allowed" });
  }

  const contentType = (req.headers["content-type"] || "").toString();
  if (!contentType.includes("application/json")) {
    return json(res, 415, { ok: false, error: "unsupported_media_type" });
  }

  const contentLength = Number(req.headers["content-length"] || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json(res, 413, { ok: false, error: "payload_too_large" });
  }

  const ip = getClientIp(req);
  const rl = rateLimit(ip, { windowMs: 60_000, max: 8 });
  res.setHeader("X-RateLimit-Remaining", String(rl.remaining));
  if (!rl.ok) return json(res, 429, { ok: false, error: "rate_limited" });

  let body = req.body;
  if (typeof body === "string") {
    if (body.length > MAX_BODY_BYTES) return json(res, 413, { ok: false, error: "payload_too_large" });
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json(res, 400, { ok: false, error: "bad_json" });
  }

  // Honeypot
  if (sanitizePlainText(body.address, 200)) return json(res, 200, { ok: true, blocked: true });

  const nome = sanitizePlainText(body.nome, 60);
  const servicoRaw = sanitizePlainText(body.servico, 40);
  const servico = ALLOWED_SERVICOS.has(servicoRaw) ? servicoRaw : "";
  const cidade = sanitizePlainText(body.cidade, 60);
  const mensagem = sanitizePlainText(body.mensagem, 500);
  const telefone = normalizePhoneDigits(body.telefone).slice(0, 13);
  const recaptchaToken = stripControlChars(asString(body.recaptchaToken)).slice(0, 2000);

  if (!nome || nome.length < 2) return json(res, 400, { ok: false, error: "invalid_nome" });
  if (!/^\d{10,13}$/.test(telefone)) return json(res, 400, { ok: false, error: "invalid_telefone" });
  if (!servico) return json(res, 400, { ok: false, error: "invalid_servico" });
  if (!cidade) return json(res, 400, { ok: false, error: "invalid_cidade" });

  const rec = await verifyRecaptcha(recaptchaToken, ip);
  if (!rec.ok) return json(res, 403, { ok: false, error: "recaptcha_failed" });

  const now = new Date().toISOString();
  const subject = `Novo lead - ${servico} (${cidade})`;
  const text =
    `Novo lead (${now})\n\n` +
    `Nome: ${nome}\n` +
    `Telefone: ${telefone}\n` +
    `Serviço: ${servico}\n` +
    `Cidade: ${cidade}\n` +
    `Mensagem: ${mensagem || "(sem mensagem)"}\n` +
    `IP: ${ip}\n`;

  const to = process.env.LEADS_TO_EMAIL || "";
  const from = process.env.LEADS_FROM_EMAIL || "";
  let email = null;
  if (to && from) {
    email = await sendEmailResend({ from, to, subject, text });
  }

  // Minimal security logging (no raw message beyond sanitized)
  console.log(
    JSON.stringify({
      event: "lead",
      at: now,
      ip,
      servico,
      cidade,
      recaptcha: { ok: rec.ok, score: rec.score ?? null, action: rec.action ?? "" },
      email: email ? { ok: email.ok, provider: email.provider, status: email.status } : { skipped: true },
    })
  );

  return json(res, 200, { ok: true, email: email ? { ok: email.ok } : { ok: false, skipped: true } });
}

