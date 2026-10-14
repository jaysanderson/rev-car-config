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
import { askAssistant, finderNext, cleanAnswers } from './assistant.mjs';
import { canon } from './finder-fallback.mjs';
import { forYou } from './foryou.mjs';
import imagesRouter from './images.mjs';
import { priorities, promotionsFor, rankOffers } from './dealer.mjs';
import { explainPromotions, refreshPromotions } from './promotions.mjs';
import * as testdrive from './testdrive.mjs';
import * as events from './events.mjs';
import dmsRouter, { mcpPost as dmsMcpPost, mcpGet as dmsMcpGet } from './dms/index.mjs';

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
// /api/events bodies are capped at 2 KB; everything else at 64 KB.
const jsonSmall = express.json({ limit: '2kb' });
const jsonLarge = express.json({ limit: '64kb' });
app.use('/api', (req, res, next) => (req.path === '/events' ? jsonSmall : jsonLarge)(req, res, next));
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  // Hard per-request ceiling so a slow upstream never hangs a client.
  res.setTimeout(45000, () => { if (!res.headersSent) res.status(504).json({ error: 'timeout' }); });
  next();
});

// Small in-memory token bucket per client IP for the endpoints that spend ARAG
// tokens (one Fly machine, so in-memory is enough for the prototype).
function limiter({ capacity, perMin }) {
  const buckets = new Map();
  return function rateLimit(req, res, next) {
    const key = req.get('fly-client-ip') || req.ip || 'unknown';
    const now = Date.now();
    const b = buckets.get(key) || { tokens: capacity, at: now };
    b.tokens = Math.min(capacity, b.tokens + ((now - b.at) / 60000) * perMin); b.at = now;
    if (b.tokens < 1) { buckets.set(key, b); res.set('Retry-After', '10'); return res.status(429).json({ error: 'too many requests, try again shortly' }); }
    b.tokens -= 1; buckets.set(key, b);
    if (buckets.size > 5000) for (const [k, v] of buckets) if (now - v.at > 600000) buckets.delete(k);
    next();
  };
}
const rateLimit = limiter({ capacity: Number(process.env.RATE_BURST || 30), perMin: Number(process.env.RATE_PER_MIN || 20) });
// First-party events are cheap but must not be a write amplifier: own, larger bucket.
const eventsLimit = limiter({ capacity: Number(process.env.EVENTS_BURST || 120), perMin: Number(process.env.EVENTS_PER_MIN || 90) });
app.use(['/api/ask', '/api/finder/next', '/api/foryou', '/api/find', '/api/testdrive/book', '/api/testdrive/answers', '/api/testdrive/handover', '/api/promotions/refresh'], rateLimit);
app.post('/api/events', eventsLimit);

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
  res.json(rankOffers(offers(s, { model, body: bodies.has(body) ? body : '' }), s));
}));

// ── dealer priorities (derived nightly from Domo dealer_signals; read-only) ──
app.get('/api/dealer/priorities', wrap(async (req, res) => res.json(priorities(await stock()))));
app.all('/api/dealer/priorities', (req, res) => res.set('Allow', 'GET').status(405).json({ error: 'Dealer priorities are produced by Domo (dealer_signals, refreshed nightly) and cannot be edited here.' }));

// ── promotions (Domo targets + ARAG composition; see server/promotions.mjs) ──
app.get('/api/promotions/explain', wrap(async (req, res) => res.json(explainPromotions(await stock()))));
app.post('/api/promotions/refresh', wrap(async (req, res) => {
  await refreshPromotions(await stock(), priorities);
  res.json(explainPromotions(await stock()));
}));
app.get('/api/promotions', wrap(async (req, res) => {
  const s = await stock();
  const model = String(req.query.model || ''); const unit = String(req.query.unit || '').toUpperCase(); const body = String(req.query.body || '');
  if (model && !modelById(model)) return res.status(400).json({ error: 'unknown model' });
  if (unit && !s.stock_by_site.some((u) => u.id === unit)) return res.status(400).json({ error: 'unknown unit' });
  if (body && !catalog().models.some((m) => m.body === body)) return res.status(400).json({ error: 'unknown body' });
  res.json(promotionsFor(s, { model, unit, body }));
}));

// ── first-party events + report for Domo ─────────────────────────────────────
app.post('/api/events', wrap(async (req, res) => {
  const b = req.body || {};
  const sid = events.sidOf(req);
  if (!sid) return res.status(400).json({ error: 'sid (8-64 chars of A-Z a-z 0-9 _ -) is required in the body or the x-sid header' });
  const type = String(b.type || '');
  if (events.SERVER_ONLY.has(type)) return res.status(202).json({ ok: true, logged: false, note: `${type} is logged by the server` });
  const v = events.validateEvent(type, b.data, await stock());
  if (v.error) return res.status(400).json({ error: v.error });
  const logged = events.logEvent(sid, type, v.data, 'client');
  res.status(logged ? 201 : 202).json({ ok: true, logged, ...(logged ? {} : { note: 'duplicate within 30 minutes' }) });
}));
app.get('/api/report/configurator', (req, res) => {
  const days = Math.max(1, Math.min(365, Number.parseInt(req.query.days, 10) || 30));
  res.json(events.configuratorReport(days));
});

// ── test drives ──────────────────────────────────────────────────────────────
app.get('/api/testdrive/slots', wrap(async (req, res) => {
  const s = await stock();
  const site = String(req.query.site || 'par');
  if (!testdrive.siteIds().includes(site)) return res.status(400).json({ error: `site must be one of ${testdrive.siteIds().join(', ')}` });
  let unit = null;
  if (req.query.unit) {
    unit = s.stock_by_site.find((u) => u.id === String(req.query.unit).toUpperCase());
    if (!unit) return res.status(400).json({ error: 'unknown unit' });
  }
  const { _arrival, ...out } = testdrive.slotsFor({ siteId: site, unit, s });
  res.json(out);
}));
app.post('/api/testdrive/book', wrap(async (req, res) => {
  const r = await testdrive.book(req.body, await stock(), { sid: events.sidOf(req) });
  res.status(r.status).json(r.body);
}));
app.post('/api/testdrive/answers', wrap(async (req, res) => {
  const r = await testdrive.answers(req.body, await stock(), { sid: events.sidOf(req) });
  res.status(r.status).json(r.body);
}));
// Salesperson pre-visit sheet (dealer-side; no auth in the prototype).
app.get('/api/testdrive/handover/:bookingId', wrap(async (req, res) => {
  const r = await testdrive.handover(req.params.bookingId, await stock());
  res.status(r.status).json(r.body);
}));

app.post('/api/ask', wrap(async (req, res) => {
  const b = req.body || {};
  if (typeof b.question !== 'string' || !b.question.trim()) return res.status(400).json({ error: 'question is required' });
  const s = await stock();
  const out = await askAssistant(b, s);
  events.logServer(events.sidOf(req), 'ask', { questionLength: b.question.trim().length, lang: b.lang, modelId: b.build?.modelId || modelsMentioned(b.question.slice(0, 1000))[0] || null }, s);
  res.json(out);
}));

app.post('/api/finder/next', wrap(async (req, res) => {
  const s = await stock();
  const out = await finderNext(req.body || {}, s);
  // Logged only for real (non-prefetch) steps from a page that sends a sid; see events.mjs.
  const sid = events.sidOf(req);
  if (sid && !events.isPrefetch(req)) {
    const answers = cleanAnswers(req.body?.answers);
    const last = answers[answers.length - 1];
    if (last) events.logServer(sid, 'finder_answer', { questionId: last.id, value: canon(last) }, s);
    if (out.done) events.logServer(sid, 'finder_result', { recommended: out.recommendations.map((r) => r.modelId) }, s);
  }
  res.json(out);
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
// ── Harbourline DMS (sales back office): API at /dms/api, SPA at /dms (server/dms/) ──
app.use('/dms/api', dmsRouter);
app.post('/dms/mcp', express.json({ limit: '1mb' }), dmsMcpPost); // MCP Streamable HTTP (stateless)
app.get('/dms/mcp', dmsMcpGet);
app.use('/dms', express.static(join(ROOT, 'public', 'dms'), { maxAge: '5m', setHeaders: (res, path) => { if (path.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
app.get(['/dms', '/dms/*'], (req, res) => res.sendFile(join(ROOT, 'public', 'dms', 'index.html'), { headers: { 'Cache-Control': 'no-cache' } }, (err) => { if (err && !res.headersSent) res.status(404).type('text').send('DMS UI not built yet'); }));
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
