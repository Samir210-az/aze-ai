const ALLOWED_ORIGINS = new Set([
  "https://samir210-az.github.io",
  "https://repetitor-k.vercel.app",
  "https://aze-ai.az",
  "https://www.aze-ai.az",
]);

const MODELS = new Set(["openai/gpt-oss-120b"]);
const MAX_TOKENS = 8000;
const MAX_CHARS = 60000;
const WINDOW_MS = 10 * 60 * 1000;
const PER_IP = 60;
const GLOBAL_PER_HOUR = 1500;

const hits = new Map();
let globalHits = [];

function limited(ip) {
  const now = Date.now();
  globalHits = globalHits.filter((t) => now - t < 3600 * 1000);
  if (globalHits.length >= GLOBAL_PER_HOUR) return true;
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= PER_IP) {
    hits.set(ip, list);
    return true;
  }
  list.push(now);
  hits.set(ip, list);
  globalHits.push(now);
  if (hits.size > 5000) hits.clear();
  return false;
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || "";
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Vary", "Origin");
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "method" });
  }
  if (!ALLOWED_ORIGINS.has(origin)) return res.status(403).json({ error: "origin" });

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (limited(ip)) {
    res.setHeader("Retry-After", "600");
    return res.status(429).json({ error: { message: "rate limit" } });
  }

  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(503).json({ error: { message: "config" } });

  const b = req.body && typeof req.body === "object" ? req.body : {};
  if (!MODELS.has(b.model) || !Array.isArray(b.messages) || !b.messages.length) {
    return res.status(400).json({ error: { message: "params" } });
  }
  let size = 0;
  const messages = [];
  for (const m of b.messages) {
    if (!m || !["system", "user", "assistant"].includes(m.role) || typeof m.content !== "string") {
      return res.status(400).json({ error: { message: "params" } });
    }
    size += m.content.length;
    messages.push({ role: m.role, content: m.content });
  }
  if (size > MAX_CHARS) return res.status(413).json({ error: { message: "too large" } });

  const payload = {
    model: b.model,
    messages,
    max_tokens: Math.min(Number(b.max_tokens) || 1000, MAX_TOKENS),
    temperature: typeof b.temperature === "number" ? Math.min(Math.max(b.temperature, 0), 1.2) : 0.7,
    reasoning_effort: "low",
  };
  if (b.response_format && b.response_format.type === "json_object") payload.response_format = { type: "json_object" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 55000);
  try {
    const up = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
    });
    const text = await up.text();
    res.status(up.status).setHeader("Content-Type", "application/json");
    return res.send(text);
  } catch (err) {
    console.error("groq proxy failed:", err && err.name);
    return res.status(502).json({ error: { message: "upstream" } });
  } finally {
    clearTimeout(timer);
  }
};
