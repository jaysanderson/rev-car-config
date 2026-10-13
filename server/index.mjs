// index.mjs — Harbourline Toyota Configurator server (Node 20, Express).
//
// Serves public/ statically and the JSON API the front-end calls. The ARAG token
// stays here (env), never reaches the browser. No personal data is cached or
// logged: request bodies are never logged and assistant responses are no-store.
//
//   node server/index.mjs            (.env in the repo root is loaded automatically)
//   PORT=8787 node server/index.mjs
import './env.mjs';
import express from 'express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './env.mjs';
import * as arag from './arag.mjs';
import { catalog, catalogPath, stock, stockPublic, stockSummary, offers, domoMode, modelsMentioned, modelById } from './data.mjs';
import { askAssistant, finderNext } from './assistant.mjs';
import { forYou } from './foryou.mjs';
import imagesRouter from './images.mjs';

const PORT = Number(process.env.PORT || 8080);
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const VERSION = `${pkg.version}${process.env.FLY_IMAGE_REF ? `+${process.env.FLY_IMAGE_REF.split(':').pop().replace(/^deployment-/, '').slice(-8).toLowerCase()}` : ''}`;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Fly's proxy is the single hop; `true` lets clients spoof req.ip via X-Forwarded-For

// Security headers + same-origin only (no CORS headers are ever emitted, so
// browsers block cross-origin reads; cross-origin writes are refused here).
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN' });
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.path.startsWith('/api/')) {
    const origin = req.get('origin');
    if (origin) {
      let host; try { host = new URL(origin).host; } catch { host = ''; }
      if (host !== req.get('host')) return res.status(403).json({ error: 'cross-origin requests are not allowed' });
    }
  }
  next();
});
app.use('/api', express.json({ limit: '64kb' }));
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  // Hard per-request ceiling so a slow upstream never hangs a client.
  res.setTimeout(45000, () => { if (!res.headersSent) res.status(504).json({ error: 'timeout' }); });
  next();
});

// Small in-memory token bucket per client IP for the endpoints that spend ARAG
// tokens (one Fly machine, so in-memory is enough for the prototype).
const buckets = new Map();
const RATE = { capacity: Number(process.env.RATE_BURST || 30), perMin: Number(process.env.RATE_PER_MIN || 20) };
function rateLimit(req, res, next) {
  const key = req.get('fly-client-ip') || req.ip || 'unknown';
  const now = Date.now();
  const b = buckets.get(key) || { tokens: RATE.capacity, at: now };
  b.tokens = Math.min(RATE.capacity, b.tokens + ((now - b.at) / 60000) * RATE.perMin); b.at = now;
  if (b.tokens < 1) { buckets.set(key, b); res.set('Retry-After', '10'); return res.status(429).json({ error: 'too many requests, try again shortly' }); }
  b.tokens -= 1; buckets.set(key, b);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (now - v.at > 600000) buckets.delete(k);
  next();
}
app.use(['/api/ask', '/api/finder/next', '/api/foryou', '/api/find'], rateLimit);

const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  console.error(`[${req.method} ${req.path}] ${e.message}`);
  if (!res.headersSent) res.status(500).json({ error: 'internal error' });
});

// ── health: never 5xx (the front-end treats non-200 as "no server") ──────────
let healthCache = { at: 0, kb: null, inflight: null };
function refreshHealth() {
  if (healthCache.inflight) return healthCache.inflight;
  healthCache.inflight = arag.kbStatus()
    .then((st) => { healthCache.kb = { id: arag.KB_ID, resources: st.resources, processing: st.processing }; })
    .catch((e) => { console.warn(`[health] kb: ${e.message}`); if (!healthCache.kb) healthCache.kb = { id: arag.KB_ID, resources: null, processing: null }; })
    .finally(() => { healthCache.at = Date.now(); healthCache.inflight = null; });
  return healthCache.inflight;
}
// Answers from cache; the KB counters are refreshed in the background (at most every
// 30 s, failures cached too) so a slow ARAG can never fail the Fly health check.
app.get('/api/health', async (req, res) => {
  let kb = { id: arag.KB_ID || null, resources: null, processing: null };
  try {
    if (arag.configured()) {
      if (!healthCache.kb) await Promise.race([refreshHealth(), new Promise((r) => setTimeout(r, 2000))]);
      else if (Date.now() - healthCache.at > 30000) refreshHealth();
      if (healthCache.kb) kb = healthCache.kb;
    }
  } catch (e) { console.warn(`[health] ${e.message}`); }
  res.status(200).json({ ok: true, kb, domo: domoMode(), version: VERSION });
});

app.get('/api/catalog', (req, res) => res.sendFile(catalogPath(), { headers: { 'Cache-Control': 'no-cache' } }));

// /api/stock — JSON datasets. With ?q=<question> (used by the ARAG retrieval
// agent's HTTP context agent) it returns a compact text/plain summary of the
// models mentioned in the question (all models when none are).
app.get('/api/stock', wrap(async (req, res) => {
  const s = await stock();
  if (typeof req.query.q === 'string') {
    return res.type('text/plain').send(stockSummary(s, modelsMentioned(req.query.q.slice(0, 500))));
  }
  res.json(stockPublic(s));
}));

app.get('/api/offers', wrap(async (req, res) => {
  const model = String(req.query.model || '');
  if (model && !modelById(model)) return res.status(400).json({ error: 'unknown model' });
  const body = String(req.query.body || '');
  const bodies = new Set(catalog().models.map((m) => m.body));
  const s = await stock();
  res.json(offers(s, { model, body: bodies.has(body) ? body : '' }));
}));

app.post('/api/ask', wrap(async (req, res) => {
  const b = req.body || {};
  if (typeof b.question !== 'string' || !b.question.trim()) return res.status(400).json({ error: 'question is required' });
  const s = await stock();
  res.json(await askAssistant(b, s));
}));

app.post('/api/finder/next', wrap(async (req, res) => {
  const s = await stock();
  res.json(await finderNext(req.body || {}, s));
}));

app.get('/api/foryou', wrap(async (req, res) => {
  const s = await stock();
  const q = req.query;
  res.json(await forYou({ model: String(q.model || ''), grade: String(q.grade || ''), colour: String(q.colour || ''), answers: String(q.answers || ''), packs: String(q.packs || '') }, s));
}));

app.get('/api/find', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 300);
  if (!q) return res.json([]);
  if (!arag.configured()) return res.json([]);
  let hits = [];
  try { hits = await arag.find({ query: q, topK: 12 }); } catch (e) { console.warn(`[find] ${e.message}`); return res.status(502).json({ error: 'knowledge search unavailable' }); }
  const seen = new Set();
  res.json(hits.filter((h) => h.text && !seen.has(h.text) && seen.add(h.text)).slice(0, 12).map((h) => ({
    title: h.title,
    modelId: (h.model || []).find((m) => m !== 'all' && modelById(m)) || modelsMentioned(h.text)[0] || null,
    topic: (h.topic || [])[0] || null,
    text: h.text.length > 600 ? `${h.text.slice(0, 597)}…` : h.text,
    score: Math.round(h.score * 1e4) / 1e4,
    resourceId: h.resourceId,
  })));
}));

app.use('/api/images', imagesRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));
// Body-parser errors (malformed JSON, body > 64 kb) as JSON, not Express's HTML page.
// eslint-disable-next-line no-unused-vars
app.use('/api', (err, req, res, next) => {
  if (res.headersSent) return;
  const status = err.status && err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) console.error(`[${req.method} ${req.path}] ${err.message}`);
  res.status(status).json({ error: err.type === 'entity.parse.failed' ? 'invalid JSON' : status === 413 ? 'body too large' : status === 500 ? 'internal error' : 'bad request' });
});
// HTML must revalidate on every load (stale index.html after deploys); other assets keep a cache.
app.use(express.static(join(ROOT, 'public'), {
  extensions: ['html'], maxAge: '5m',
  setHeaders: (res, path) => { if (path.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); },
}));
app.get('*', (req, res) => res.sendFile(join(ROOT, 'public', 'index.html'), { headers: { 'Cache-Control': 'no-cache' } }));

const server = app.listen(PORT, () => {
  console.log(`Harbourline configurator on :${PORT} — ARAG ${arag.configured() ? 'configured' : 'NOT configured'}, Domo ${domoMode()}`);
});
server.requestTimeout = 60000;
server.headersTimeout = 65000;
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)));
