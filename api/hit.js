const DB = "https://aze-ai-edc41-default-rtdb.europe-west1.firebasedatabase.app";

const ALLOWED_ORIGINS = new Set([
  "https://aze-ai.az",
  "https://www.aze-ai.az",
  "https://aze-ai.vercel.app",
]);

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|node-fetch|axios/i;
const PATH_OK = /^\/[a-z0-9\-/]{0,80}$/;
const WINDOW_MS = 10 * 60 * 1000;
const PER_IP = 120;

const seen = new Map();

function limited(ip) {
  const now = Date.now();
  const list = (seen.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= PER_IP) {
    seen.set(ip, list);
    return true;
  }
  list.push(now);
  seen.set(ip, list);
  if (seen.size > 5000) seen.clear();
  return false;
}

function bakuDay() {
  return new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
}

function parse(body) {
  if (body && typeof body === "object") return body;
  try {
    return JSON.parse(String(body || ""));
  } catch (e) {
    return {};
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  if (!ALLOWED_ORIGINS.has(req.headers.origin || "")) return res.status(403).end();
  if (BOT.test(req.headers["user-agent"] || "")) return res.status(204).end();

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (limited(ip)) return res.status(429).end();

  const body = parse(req.body);
  const page = typeof body.p === "string" ? body.p.toLowerCase() : "";
  if (!PATH_OK.test(page)) return res.status(400).end();

  const country = String(req.headers["x-vercel-ip-country"] || "").toUpperCase();
  const inc = { ".sv": { increment: 1 } };
  const update = { v: inc, ["p/" + (page.replace(/\/+$/, "").replace(/\//g, "~") || "~")]: inc };
  if (body.n === 1) update.s = inc;
  if (/^[A-Z]{2}$/.test(country)) update["c/" + country] = inc;

  try {
    const r = await fetch(`${DB}/stats/d/${bakuDay()}.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    return res.status(r.ok ? 204 : 502).end();
  } catch (e) {
    return res.status(502).end();
  }
};
