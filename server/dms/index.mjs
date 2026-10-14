// index.mjs — Harbourline DMS API router (mounted at /dms/api by server/index.mjs).
//
// Every route is declared once in ROUTES (method, path, tag, capability, list/query
// params, body schema, handler); the Express router and the OpenAPI document
// (GET /openapi.json, rendered by GET /docs) are both generated from it.
//
// Files:  db.mjs (tables) · auth.mjs (users, tokens, permissions, scoping) · kpi.mjs ·
//         domo.mjs (catalogue, CSV, dealer_signals) · dxm.mjs (configurator bridge) ·
//         ai.mjs (ARAG features) · kb.mjs (extra KB calls) · documents.mjs · openapi.mjs
//
// Exports: default router, leadFromBooking(booking) (the configurator bridge hook).
import express from 'express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../env.mjs';
import * as db from './db.mjs';
import * as auth from './auth.mjs';
import * as K from './kpi.mjs';
import * as domo from './domo.mjs';
import * as dxm from './dxm.mjs';
import * as ai from './ai.mjs';
import * as docs from './documents.mjs';
import * as ops from './ops.mjs';
import { createReadStream } from 'node:fs';
import { basename } from 'node:path';
import * as arag from '../arag.mjs';
import { openapi, DOCS_HTML } from './openapi.mjs';
import * as mcpCore from './mcp-core.mjs';
import { MCP_URL as KB_MCP_URL } from './kb.mjs';

export { leadFromBooking, reconcile } from './dxm.mjs';
export { mcpPost, mcpGet } from './mcp.mjs';
export const VERSION = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version; } catch { return '0'; } })();

// ── startup: configurator bookings → leads, Domo signals from the DMS tables ──
function startup() {
  try { dxm.reconcile(); } catch (e) { console.warn(`[dms] reconcile: ${e.message}`); }
  try { const r = domo.recomputeSignals(); console.log(`[dms] dealer_signals ${r.written ? 'recomputed and written' : `not written (${r.reason})`}`); } catch (e) { console.warn(`[dms] signals: ${e.message}`); }
}
startup();
db.onLoad(startup);

// ── helpers ──────────────────────────────────────────────────────────────────
const RESERVED = new Set(['q', 'siteId', 'status', 'from', 'to', 'sort', 'page', 'pageSize', 'token', 'month', 'mine']);
const nf = (res, what = 'not found') => res.status(404).json({ error: what });
const bad = (res, msg) => res.status(400).json({ error: msg });
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
const now = () => new Date().toISOString();

/** Generic list for a table: scoping, forced site, status, any column=value filter. */
function listTable(table, { statusField = 'status', base } = {}) {
  return (req) => {
    const qy = req.query; const user = req.user;
    const filters = [];
    const site = auth.forcedSite(user) || str(qy.siteId);
    if (site && /\bsiteId\b/.test(db.TABLES[table].cols)) filters.push({ field: 'siteId', op: 'in', value: site });
    if (qy.status) filters.push({ field: statusField, op: 'in', value: String(qy.status) });
    for (const [k, v] of Object.entries(qy)) if (!RESERVED.has(k) && /^[A-Za-z][A-Za-z0-9.]{0,40}$/.test(k) && typeof v === 'string') filters.push({ field: k, op: v.includes(',') ? 'in' : 'eq', value: v });
    const sc = auth.scopeFor(user, table);
    let rows = (base ? base(req) : db.all(table)).filter(sc);
    if (qy.mine === '1' && user.staffId) { const f = db.TABLES[table].owner; if (f) rows = rows.filter((r) => r[f] === user.staffId); }
    return db.list(table, { rows, q: str(qy.q), filters, from: str(qy.from, 30), to: str(qy.to, 30), sort: str(qy.sort, 40), page: qy.page, pageSize: qy.pageSize });
  };
}
function getScoped(req, res, table, id) {
  const r = db.get(table, id);
  if (!r || !auth.scopeFor(req.user, table)(r)) { nf(res); return null; }
  return r;
}
const kpiWhere = (user) => (t, r) => auth.scopeFor(user, t)(r);
const siteParam = (req) => auth.forcedSite(req.user) || str(req.query.siteId) || undefined;
const monthParam = (req) => (/^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : undefined);
let configuratorPromos = async () => [];
try {
  const [{ stock }, dealer] = await Promise.all([import('../data.mjs'), import('../dealer.mjs')]);
  configuratorPromos = async (modelId) => { try { return dealer.promotionsFor(await stock(), { model: modelId || '' }); } catch { return []; } };
} catch (e) { console.warn(`[dms] configurator promotions unavailable: ${e.message}`); }

// Health flags: KB reachability from the cached counters (≤ 1.5 s, never throws).
import('../data.mjs').then((m) => { domoModeFn = m.domoMode; }).catch(() => {});
let domoModeFn = null;
const domoModeSafe = () => { try { return domoModeFn ? domoModeFn() : 'stand-in'; } catch { return 'stand-in'; } };
let aragOk = { at: 0, ok: null };
async function aragHealth() {
  if (!arag.configured()) return { ok: false, configured: false, kb: null };
  if (Date.now() - aragOk.at > 30000) {
    const kbm = await import('./kb.mjs');
    const p = kbm.topicCounts().then(() => { aragOk = { at: Date.now(), ok: true }; }).catch(() => { aragOk = { at: Date.now(), ok: false }; });
    if (aragOk.ok === null) await Promise.race([p, new Promise((r) => setTimeout(r, 1500))]);
  }
  return { ok: aragOk.ok === true, configured: true, kb: arag.KB_ID };
}

// ── rate limiting (same token bucket as the main server, separate budget) ────
const buckets = new Map();
const RATE = { capacity: Number(process.env.RATE_BURST || 30), perMin: Number(process.env.RATE_PER_MIN || 20) };
function rateLimit(req, res, next) {
  const key = `${req.get('fly-client-ip') || req.ip || 'unknown'}|${req.user?.email || ''}`;
  const t = Date.now();
  const b = buckets.get(key) || { tokens: RATE.capacity, at: t };
  b.tokens = Math.min(RATE.capacity, b.tokens + ((t - b.at) / 60000) * RATE.perMin); b.at = t;
  if (b.tokens < 1) { buckets.set(key, b); res.set('Retry-After', '10'); return res.status(429).json({ error: 'too many requests, try again shortly' }); }
  b.tokens -= 1; buckets.set(key, b);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (t - v.at > 600000) buckets.delete(k);
  next();
}

// ── schemas used in request bodies ───────────────────────────────────────────
const S = (props, required = []) => ({ type: 'object', properties: props, required });
const sStr = (d, e) => ({ type: 'string', ...(d ? { description: d } : {}), ...(e ? { enum: e } : {}) });
const LANG = sStr('ISO 639-1 language for the reply (default en)', Object.keys(ai.LANGS));
const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'test_drive_booked', 'quoted', 'won', 'lost'];
const DEAL_STAGES = ['quote', 'negotiation', 'finance', 'approval', 'contract', 'delivery', 'delivered', 'lost'];

// ── route table ──────────────────────────────────────────────────────────────
const R = [];
const route = (method, path, meta, handler) => R.push({ method, path, ...meta, handler });

// system
route('get', '/health', { tag: 'System', summary: 'Health (always 200): data source, table counts, arag {ok, kb}, domo stand-in|live', auth: false }, async (req, res) => {
  let info = {}; try { info = db.info(); } catch { /* never fail */ }
  res.status(200).json({ ok: true, version: VERSION, data: info.source || null, loadedAt: info.loadedAt || null, counts: info.counts || {}, arag: await aragHealth(), domo: domoModeSafe() });
});
route('get', '/openapi.json', { tag: 'System', summary: 'OpenAPI 3.0 document (generated from the route table)', auth: false }, (req, res) => res.json(openapi(R, { version: VERSION })));
route('get', '/docs', { tag: 'System', summary: 'API reference (HTML)', auth: false, html: true }, (req, res) => res.type('html').set('Cache-Control', 'no-cache').send(DOCS_HTML));

// auth
route('post', '/auth/login', { tag: 'Auth', summary: 'Log in with a demo user → bearer token', auth: false, rate: true, body: S({ email: sStr('demo user email'), password: sStr('demo1234') }, ['email', 'password']) }, (req, res) => {
  const r = auth.login(req.body?.email, req.body?.password);
  if (!r) return res.status(401).json({ error: 'invalid email or password' });
  res.json(r);
});
route('get', '/auth/me', { tag: 'Auth', summary: 'Current user (role, site, capabilities)' }, (req, res) => res.json({ user: req.user }));
route('post', '/auth/logout', { tag: 'Auth', summary: 'Invalidate the token' }, (req, res) => { auth.logout(req.token); res.json({ ok: true }); });
route('get', '/auth/users', { tag: 'Auth', summary: 'Demo logins (prototype only)', auth: false }, (req, res) => res.json({ password: auth.PASSWORD, users: auth.DEMO_USERS.map((u) => ({ email: u.email, role: u.role, siteId: u.siteId, title: u.title })) }));

// reference
route('get', '/sites', { tag: 'Reference', summary: 'Sites', cap: 'sites.read', list: true, table: 'sites' }, (req, res) => res.json(db.list('sites', { pageSize: 100, sort: 'id' })));
route('get', '/staff', { tag: 'Reference', summary: 'Staff', cap: 'staff.read', list: true }, (req, res) => res.json(listTable('staff')(req)));

// customers
route('get', '/customers', { tag: 'Customers', summary: 'List customers', cap: 'customers.read', list: true }, (req, res) => res.json(listTable('customers')(req)));
route('post', '/customers', { tag: 'Customers', summary: 'Create a customer', cap: 'customers.write', body: S({ firstName: sStr(), lastName: sStr(), email: sStr(), phone: sStr(), suburb: sStr(), postcode: sStr(), source: sStr(null, ['web-configurator', 'walk-in', 'phone', 'referral', 'campaign', 'service']), notes: sStr(), tags: { type: 'array', items: { type: 'string' } } }, ['firstName', 'lastName']) }, (req, res) => {
  const c = customerFrom(req.body);
  if (c.error) return bad(res, c.error);
  res.status(201).json(db.insert('customers', c.value));
});
route('get', '/customers/:id', { tag: 'Customers', summary: 'Customer with leads, deals, test drives and documents', cap: 'customers.read', table: 'customers' }, (req, res) => {
  const c = getScoped(req, res, 'customers', req.params.id); if (!c) return;
  const u = req.user; const sc = (t) => auth.scopeFor(u, t);
  res.json({ ...c, leads: db.by('leads', 'customerId', c.id).filter(sc('leads')), deals: db.by('deals', 'customerId', c.id).filter(sc('deals')), testDrives: db.by('test_drives', 'customerId', c.id).filter(sc('test_drives')), documents: db.by('documents', 'customerId', c.id).filter(sc('documents')).map(docs.pubDoc), tradeIns: db.by('trade_ins', 'customerId', c.id) });
});
function customerFrom(b, partial = false) {
  const v = {};
  for (const k of ['firstName', 'lastName', 'email', 'phone', 'suburb', 'postcode', 'notes']) if (b?.[k] != null) v[k] = str(String(b[k]), k === 'notes' ? 2000 : 120);
  if (!partial && (!v.firstName || !v.lastName)) return { error: 'firstName and lastName are required' };
  if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) return { error: 'email is invalid' };
  return { value: { id: db.nextId('customers', 'C'), source: str(b?.source) || 'walk-in', createdAt: now(), tags: Array.isArray(b?.tags) ? b.tags.slice(0, 10).map(String) : [], notes: '', ...v } };
}

// leads
route('get', '/leads', { tag: 'Leads', summary: 'List leads (configurator leads carry handover, offersClicked[], eventsCount)', cap: 'leads.read', list: true, query: ['channel', 'ownerId', 'mine'] }, async (req, res) => { const r = listTable('leads')(req); res.json({ ...r, items: await Promise.all(r.items.map((l) => ops.decorateLead(l))) }); });
route('post', '/leads', { tag: 'Leads', summary: 'Create a lead', cap: 'leads.write', body: S({ customerId: sStr('optional'), siteId: sStr(), ownerId: sStr(), source: sStr(), channel: sStr(null, ['configurator', 'web-form', 'phone', 'walk-in', 'campaign']), interest: { type: 'object' }, notes: sStr() }, ['channel']) }, (req, res) => {
  const b = req.body || {}; const u = req.user;
  const siteId = auth.forcedSite(u) || str(b.siteId) || 'par';
  if (!db.get('sites', siteId)) return bad(res, 'unknown siteId');
  if (b.customerId && !db.get('customers', b.customerId)) return bad(res, 'unknown customerId');
  const ownerId = u.role === 'salesperson' ? u.staffId : str(b.ownerId) || null;
  if (ownerId && !db.get('staff', ownerId)) return bad(res, 'unknown ownerId');
  const channel = ['configurator', 'web-form', 'phone', 'walk-in', 'campaign'].includes(b.channel) ? b.channel : null;
  if (!channel) return bad(res, 'channel is required');
  const lead = db.insert('leads', { id: db.nextId('leads', 'L'), customerId: b.customerId || null, siteId, ownerId, source: str(b.source) || channel, channel, status: 'new', createdAt: now(), updatedAt: now(), interest: typeof b.interest === 'object' && b.interest ? b.interest : {}, finderAnswers: [], viewed: [], score: 50, notes: str(b.notes, 2000) || '' });
  res.status(201).json(lead);
});
route('get', '/leads/:id', { tag: 'Leads', summary: 'Lead with customer, owner, test drives, deals, the configurator booking, handover, offersClicked[] and events[]', cap: 'leads.read', table: 'leads' }, async (req, res) => {
  const l = getScoped(req, res, 'leads', req.params.id); if (!l) return;
  const booking = l.bookingId ? (dxmBookings().find((b) => b.bookingId === l.bookingId) || null) : null;
  res.json({ ...(await ops.decorateLead(l, { full: true })), customer: db.get('customers', l.customerId) || null, owner: db.get('staff', l.ownerId) || null, testDrives: db.by('test_drives', 'leadId', l.id), deals: db.by('deals', 'leadId', l.id), booking });
});
route('patch', '/leads/:id', { tag: 'Leads', summary: 'Update a lead (status, owner, interest…); customer fields create/link the customer', cap: 'leads.write', body: S({ status: sStr(null, LEAD_STATUSES), ownerId: sStr(), interest: { type: 'object' }, lostReason: sStr(), score: { type: 'number' }, notes: sStr(), contact: S({ channel: sStr(null, ['call', 'phone', 'sms', 'email', 'whatsapp', 'meeting', 'walk-in']), note: sStr() }, ['channel']), customer: S({ firstName: sStr(), lastName: sStr(), email: sStr(), phone: sStr(), suburb: sStr(), postcode: sStr() }) }) }, (req, res) => {
  const l = getScoped(req, res, 'leads', req.params.id); if (!l) return;
  const b = req.body || {}; const p = {};
  if (b.status !== undefined) { if (!LEAD_STATUSES.includes(b.status)) return bad(res, `status must be one of ${LEAD_STATUSES.join(', ')}`); p.status = b.status; }
  if (b.ownerId !== undefined) { if (req.user.role === 'salesperson') return res.status(403).json({ error: 'salespeople cannot reassign leads' }); if (!db.get('staff', b.ownerId)) return bad(res, 'unknown ownerId'); p.ownerId = b.ownerId; }
  if (b.interest && typeof b.interest === 'object') p.interest = { ...l.interest, ...b.interest };
  if (b.lostReason !== undefined) p.lostReason = str(b.lostReason, 300);
  if (b.score !== undefined) { const n = Number(b.score); if (!(n >= 0 && n <= 100)) return bad(res, 'score must be 0-100'); p.score = n; }
  if (b.notes !== undefined) p.notes = str(b.notes, 2000);
  if (b.contact !== undefined) { const c = ops.contactPatch(l, b.contact, req.user); if (c.error) return bad(res, c.error); Object.assign(p, c.value); }
  if (p.status && p.status !== l.status && !p.statusHistory) p.statusHistory = [...(l.statusHistory || []), { status: p.status, at: now() }];
  const cf = b.customer || (b.firstName || b.email ? b : null);
  if (cf) {
    if (l.customerId) { const c = customerFrom(cf, true); if (c.error) return bad(res, c.error); const { id, createdAt, source, tags, ...upd } = c.value; db.patch('customers', l.customerId, upd); }
    else {
      if (!cf.firstName && !cf.email) return bad(res, 'customer needs at least firstName or email');
      const c = customerFrom({ lastName: '', ...cf, source: l.channel === 'configurator' ? 'web-configurator' : l.source }, true); if (c.error) return bad(res, c.error);
      const cust = db.insert('customers', c.value); p.customerId = cust.id;
      for (const t of db.by('test_drives', 'leadId', l.id)) if (!t.customerId) db.patch('test_drives', t.id, { customerId: cust.id });
    }
  }
  if (!Object.keys(p).length && !cf) return bad(res, 'nothing to update');
  p.updatedAt = now();
  const out = db.patch('leads', l.id, p);
  res.json({ ...out, customer: db.get('customers', out.customerId) || null });
});
function dxmBookings() { try { return JSON.parse(readFileSync(join(ROOT, 'content', 'dealer', 'bookings.json'), 'utf8')).bookings || []; } catch { return []; } }

// test drives
route('get', '/test-drives', { tag: 'Test drives', summary: 'List test drives', cap: 'test_drives.read', list: true, query: ['staffId', 'leadId', 'mine'] }, (req, res) => res.json(listTable('test_drives')(req)));
route('post', '/test-drives', { tag: 'Test drives', summary: 'Book a test drive for a lead', cap: 'test_drives.write', body: S({ leadId: sStr(), siteId: sStr(), when: sStr('ISO date-time'), modelId: sStr(), gradeId: sStr(), stockNo: sStr(), staffId: sStr() }, ['leadId', 'when']) }, (req, res) => {
  const l = db.get('leads', req.body?.leadId);
  if (!l || !auth.scopeFor(req.user, 'leads')(l)) return bad(res, 'unknown leadId');
  const r = ops.createTestDrive(req.body, req.user, l);
  if (r.error) return res.status(r.status || 400).json({ error: r.error });
  res.status(201).json(r.value);
});
route('patch', '/test-drives/:id', { tag: 'Test drives', summary: 'Update a test drive: status completed|no_show|cancelled, reschedule (when), licenceChecked', cap: 'test_drives.write', body: S({ status: sStr(null, ['completed', 'no_show', 'cancelled', 'booked']), when: sStr('ISO date-time'), licenceChecked: { type: 'boolean' }, outcome: sStr() }) }, (req, res) => {
  const t = getScoped(req, res, 'test_drives', req.params.id); if (!t) return;
  const r = ops.patchTestDrive(t, req.body || {}, req.user);
  if (r.error) return res.status(r.status || 400).json({ error: r.error });
  res.json(r.value);
});
route('get', '/test-drives/:id', { tag: 'Test drives', summary: 'Test drive with lead, customer and handover', cap: 'test_drives.read', table: 'test_drives' }, (req, res) => {
  const t = getScoped(req, res, 'test_drives', req.params.id); if (!t) return;
  res.json({ ...t, lead: db.get('leads', t.leadId) || null, customer: db.get('customers', t.customerId) || null, staff: db.get('staff', t.staffId) || null, vehicle: db.get('vehicles', t.stockNo) || null });
});

// deals
route('get', '/deals', { tag: 'Deals', summary: 'List deals (status = stage; rows carry daysInStage and stuck)', cap: 'deals.read', list: true, query: ['stage', 'salespersonId', 'mine', 'stuck'] }, (req, res) => {
  const q = { ...req.query }; const stuck = q.stuck; delete q.stuck;
  const base = () => db.all('deals').map((d) => { const x = ai.dealView(d); return x; }).filter((d) => stuck === undefined || String(d.stuck) === String(stuck === '1' || stuck === 'true'));
  res.json(listTable('deals', { statusField: 'stage', base })({ ...req, query: q }));
});
route('post', '/deals', { tag: 'Deals', summary: 'Create a quote-stage deal from a lead: {leadId, stockNo} or {leadId, order:{modelId,gradeId,colourId}} (priced lines)', cap: 'deals.write', body: S({ leadId: sStr(), stockNo: sStr(), order: S({ modelId: sStr(), gradeId: sStr(), colourId: sStr(), etaWeeks: { type: 'integer' } }, ['modelId', 'gradeId']) }, ['leadId']) }, (req, res) => {
  const l = db.get('leads', req.body?.leadId);
  if (!l || !auth.scopeFor(req.user, 'leads')(l)) return bad(res, 'unknown leadId');
  const r = ops.createDeal(req.body, req.user, l);
  if (r.error) return res.status(r.status || 400).json({ error: r.error });
  res.status(201).json(ai.dealView(r.value));
});
route('get', '/deals/:id', { tag: 'Deals', summary: 'Deal with customer, lead, vehicle, finance, trade-in and documents', cap: 'deals.read', table: 'deals' }, (req, res) => {
  const d = getScoped(req, res, 'deals', req.params.id); if (!d) return;
  const c = ai.dealContext(d);
  res.json({ ...d, customer: c.customer || null, lead: c.lead || null, salesperson: c.salesperson, vehicle: c.vehicle || null, financeApp: c.financeApp || null, tradeIn: c.tradeIn || null, documents: c.documents, daysInStage: c.daysInStage });
});
route('patch', '/deals/:id', { tag: 'Deals', summary: 'Update a deal (stage changes add an event)', cap: 'deals.write', body: S({ stage: sStr(null, DEAL_STAGES), discount: { type: 'number' }, readyNowBonus: { type: 'number', description: 'ready-now bonus (≤ the unit\'s bonusHeadroom)' }, deliveryDate: sStr('YYYY-MM-DD'), lostReason: sStr(), salespersonId: sStr(), note: sStr('note for the stage-change event'), event: S({ type: sStr('approval_requested | approved | call | note …'), note: sStr() }, ['type']) }) }, (req, res) => {
  const d = getScoped(req, res, 'deals', req.params.id); if (!d) return;
  const b = req.body || {}; const p = {}; const u = req.user;
  if (b.stage !== undefined) {
    if (!DEAL_STAGES.includes(b.stage)) return bad(res, `stage must be one of ${DEAL_STAGES.join(', ')}`);
    if (b.stage === 'lost' && !b.lostReason && !d.lostReason) return bad(res, 'lostReason is required when a deal is lost');
    Object.assign(p, ops.stagePatch(d, b.stage, str(b.note, 500), u));
  }
  if (b.readyNowBonus !== undefined) { const r = ops.bonusPatch({ ...d, ...p }, b.readyNowBonus); if (r.error) return res.status(r.status || 400).json({ error: r.error }); Object.assign(p, r.value); }
  if (b.event) {
    const type = str(b.event.type, 40); if (!type) return bad(res, 'event.type is required');
    const ap = ops.approvalEvent({ ...d, ...p }, type, str(b.event.note, 1000), u);
    if (ap?.error) return res.status(ap.status || 400).json({ error: ap.error });
    if (ap) Object.assign(p, ap.value);
    else p.events = [...(p.events || d.events || []), { at: now(), type, note: str(b.event.note, 1000) || type, staffId: u.staffId }];
  }
  if (b.discount !== undefined) { const n = Number(b.discount); if (!(n >= 0 && n <= 20000)) return bad(res, 'discount must be 0-20000'); if (u.role === 'salesperson' && n > (d.discount || 0) + 1000) return res.status(403).json({ error: 'discount increases over $1,000 need a sales manager' }); const delta = n - (d.discount || 0); p.discount = n; p.driveAway = (p.driveAway ?? d.driveAway ?? 0) - delta; p.frontGross = (p.frontGross ?? d.frontGross ?? 0) - delta; p.grossProfit = p.frontGross + (d.backGross || 0); }
  if (b.deliveryDate !== undefined) { if (!/^\d{4}-\d{2}-\d{2}/.test(b.deliveryDate)) return bad(res, 'deliveryDate must be YYYY-MM-DD'); p.deliveryDate = b.deliveryDate; }
  if (b.lostReason !== undefined) p.lostReason = str(b.lostReason, 300);
  if (b.salespersonId !== undefined) { if (u.role === 'salesperson') return res.status(403).json({ error: 'salespeople cannot reassign deals' }); if (!db.get('staff', b.salespersonId)) return bad(res, 'unknown salespersonId'); p.salespersonId = b.salespersonId; }
  if (!Object.keys(p).length) return bad(res, 'nothing to update');
  p.updatedAt = now();
  res.json(ai.dealView(db.patch('deals', d.id, p)));
});
route('post', '/deals/:id/events', { tag: 'Deals', summary: 'Add a timeline event', cap: 'deals.write', body: S({ type: sStr('call|email|sms|meeting|note|finance|document… · approval_requested (→ approval) · approved (→ contract; managers / F&I)'), note: sStr() }, ['type']) }, (req, res) => {
  const d = getScoped(req, res, 'deals', req.params.id); if (!d) return;
  const type = str(req.body?.type, 40); const note = str(req.body?.note, 1000);
  if (!type || (!note && !['approval_requested', 'approved'].includes(type))) return bad(res, 'type and note are required');
  const ap = ops.approvalEvent(d, type, note, req.user);
  if (ap?.error) return res.status(ap.status || 400).json({ error: ap.error });
  if (ap) { const row = db.patch('deals', d.id, { ...ap.value, updatedAt: now() }); return res.status(201).json({ ...row.events.at(-1), stage: row.stage }); }
  const ev = { at: now(), type, note, staffId: req.user.staffId };
  db.patch('deals', d.id, { events: [...(d.events || []), ev], updatedAt: now() });
  res.status(201).json({ ...ev, stage: d.stage });
});

// stock & others
route('get', '/vehicles', { tag: 'Stock', summary: 'List vehicles (stock + history); aged=1 → on-lot > 60 days', cap: 'vehicles.read', list: true, query: ['model', 'aged'] }, (req, res) => {
  const aged = req.query.aged === '1';
  const q = { ...req.query }; delete q.aged;
  res.json(listTable('vehicles', { base: () => (aged ? db.all('vehicles').filter((v) => ['on_lot', 'demo'].includes(v.status) && (v.daysInStock || 0) > K.AGED_DAYS) : db.all('vehicles')) })({ ...req, query: q }));
});
route('get', '/vehicles/:stockNo', { tag: 'Stock', summary: 'Vehicle by stock number (or VIN) with deal and model signals', cap: 'vehicles.read', table: 'vehicles' }, (req, res) => {
  const v = db.get('vehicles', req.params.stockNo); if (!v) return nf(res);
  const deal = v.dealId ? db.get('deals', v.dealId) : null;
  res.json({ ...v, deal: deal && auth.scopeFor(req.user, 'deals')(deal) ? deal : null, signal: (domo.readSignals().rows || []).find((r) => r.model === v.model) || null });
});
route('post', '/vehicles/:stockNo/hold', { tag: 'Stock', summary: 'Hold a unit for a lead for 48 hours', cap: 'vehicles.hold', body: S({ leadId: sStr() }, ['leadId']) }, (req, res) => {
  const v = db.get('vehicles', req.params.stockNo); if (!v) return nf(res);
  const l = db.get('leads', req.body?.leadId); if (!l || !auth.scopeFor(req.user, 'leads')(l)) return bad(res, 'unknown leadId');
  const r = ops.hold(v, l, req.user); if (r.error) return res.status(r.status || 400).json({ error: r.error });
  res.json(r.value);
});
route('post', '/vehicles/:stockNo/transfer', { tag: 'Stock', summary: 'Transfer a unit to another site', cap: 'vehicles.transfer', body: S({ toSiteId: sStr(null, ['par', 'hor', 'pen', 'liv']) }, ['toSiteId']) }, (req, res) => {
  const v = db.get('vehicles', req.params.stockNo); if (!v) return nf(res);
  const r = ops.transfer(v, str(req.body?.toSiteId, 10), req.user); if (r.error) return res.status(r.status || 400).json({ error: r.error });
  res.json(r.value);
});
route('get', '/trade-ins', { tag: 'Deals', summary: 'List trade-ins', cap: 'trade_ins.read', list: true }, (req, res) => res.json(listTable('trade_ins', { base: () => siteJoin('trade_ins', req) })(req)));
route('get', '/finance-apps', { tag: 'Deals', summary: 'List finance applications', cap: 'finance_apps.read', list: true, query: ['lender'] }, (req, res) => res.json(listTable('finance_apps', { base: () => siteJoin('finance_apps', req) })(req)));
// trade_ins / finance_apps / documents have no siteId column: filter through the deal.
function siteJoin(table, req) { const site = auth.forcedSite(req.user) || str(req.query.siteId); const rows = db.all(table); return site ? rows.filter((r) => db.get('deals', r.dealId)?.siteId === site) : rows; }
route('get', '/campaigns', { tag: 'Marketing', summary: 'List campaigns', cap: 'campaigns.read', list: true }, (req, res) => res.json(listTable('campaigns')(req)));
route('get', '/promotions', { tag: 'Promotions', summary: 'List promotions; status is published | unpublished | scheduled | expired', cap: 'promotions.read', list: true }, (req, res) => res.json(listTable('promotions', { base: () => db.all('promotions').map(ops.promoView) })(req)));
route('post', '/promotions/compose', { tag: 'Marketing', summary: 'Compose promotions now: Domo targets → ARAG copy (configurator engine); upserted as drafts', cap: 'promotions.compose', arag: true, rate: true }, async (req, res) => {
  let set;
  try {
    const [{ stock }, dealer, promos] = await Promise.all([import('../data.mjs'), import('../dealer.mjs'), import('../promotions.mjs')]);
    const s = await stock();
    set = typeof promos.composePromotions === 'function' ? await promos.composePromotions(s, dealer.priorities) : await promos.refreshPromotions(s, dealer.priorities);
  } catch (e) { console.warn(`[dms compose] ${e.message}`); return res.status(502).json({ error: 'promotion composition failed' }); }
  const out = [];
  for (const p of set?.promotions || []) {
    const t = (set.targets || []).find((x) => x.promotionId === p.id);
    const ex = db.get('promotions', p.id);
    const row = { id: p.id, title: p.title, kind: p.kind, value: p.value ?? null, desc: p.desc || null, why: p.why || null, source: { domo: t ? { target: t.id, type: t.type, signal: t.signal } : p.source || null, kb: t?.kb || null, composedBy: p.composedBy || set.composedBy }, startsAt: ex?.startsAt || K.ymd(), endsAt: p.validUntil || null, appliesTo: p.appliesTo || null, status: ex?.status || 'unpublished', composedAt: set.composedAt };
    out.push(ex ? db.patch('promotions', p.id, { ...row, status: ex.status }) : db.insert('promotions', row));
  }
  res.json({ composedAt: set?.composedAt || null, composedBy: set?.composedBy || null, latencyMs: set?.latencyMs ?? null, promotions: out.map(ops.promoView) });
});
for (const [action, status] of [['publish', 'published'], ['unpublish', 'unpublished']]) {
  route('post', `/promotions/:id/${action}`, { tag: 'Marketing', summary: `${action[0].toUpperCase()}${action.slice(1)} a promotion (status only)`, cap: 'promotions.publish', table: 'promotions' }, (req, res) => {
    const p = db.get('promotions', req.params.id); if (!p) return nf(res);
    res.json(ops.promoView(db.patch('promotions', p.id, { status, [`${action}edAt`]: now(), [`${action}edBy`]: req.user.id })));
  });
}

// documents
route('get', '/documents', { tag: 'Documents', summary: 'List documents', cap: 'documents.read', list: true, query: ['kind', 'dealId'] }, (req, res) => { const r = listTable('documents', { base: () => siteJoin('documents', req) })(req); res.json({ ...r, items: r.items.map(docs.pubDoc) }); });
route('get', '/documents/samples', { tag: 'Documents', summary: 'Sample PDFs available for processing (content/dms/samples/manifest.json)', cap: 'documents.read' }, (req, res) => res.json({ items: docs.samples() }));
route('get', '/documents/:id/file', { tag: 'Documents', summary: 'Stream the document file (PDF) when hasFile', cap: 'documents.read', pdf: true }, (req, res) => {
  const d = getScoped(req, res, 'documents', req.params.id); if (!d) return;
  const p = docs.fileFor(d); if (!p) return nf(res, 'this document has no file');
  res.status(200).set({ 'Content-Type': d.contentType || (p.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'), 'Content-Disposition': `inline; filename="${basename(p).replace(/"/g, '')}"`, 'Cache-Control': 'private, no-store' });
  createReadStream(p).on('error', () => { if (!res.headersSent) nf(res); else res.end(); }).pipe(res);
});
route('get', '/documents/:id', { tag: 'Documents', summary: 'Document', cap: 'documents.read', table: 'documents' }, (req, res) => {
  const d = getScoped(req, res, 'documents', req.params.id); if (!d) return;
  res.json(docs.pubDoc(d));
});
route('post', '/documents', { tag: 'Documents', summary: 'Upload a document (base64 JSON, body ≤ 8 MB)', cap: 'documents.write', body: S({ kind: sStr(null, ai.DOC_KINDS), fileName: sStr(), contentType: sStr(null, ['application/pdf', 'image/png', 'image/jpeg', 'text/plain']), contentBase64: sStr('file bytes, base64'), dealId: sStr(), customerId: sStr() }, ['kind', 'fileName', 'contentBase64']) }, (req, res) => {
  const v = docs.validateUpload(req.body);
  if (v.error) return res.status(v.status || 400).json({ error: v.error });
  if (v.value.dealId && !auth.scopeFor(req.user, 'deals')(db.get('deals', v.value.dealId))) return res.status(403).json({ error: 'deal not in your scope' });
  res.status(201).json(docs.pubDoc(docs.create(v.value, req.user)));
});
route('post', '/documents/:id/process', { tag: 'Documents', summary: 'Upload to the KB (topic/document), wait, extract fields with a per-kind schema → extracted + confidence + verifyFields (202 while processing: call again)', cap: 'documents.write', arag: true, rate: true, table: 'documents' }, async (req, res) => {
  const d = getScoped(req, res, 'documents', req.params.id); if (!d) return;
  const r = await docs.processDoc(d);
  res.status(r.status).json(r.body);
});
route('post', '/documents/:id/verify', { tag: 'Documents', summary: 'Mark extracted fields verified, with optional corrections', cap: 'documents.write', body: S({ corrections: { type: 'object', description: 'field → corrected value' }, note: sStr() }) }, (req, res) => {
  const d = getScoped(req, res, 'documents', req.params.id); if (!d) return;
  if (!['extracted', 'verified'].includes(d.status)) return res.status(409).json({ error: 'process the document first' });
  const corr = req.body?.corrections && typeof req.body.corrections === 'object' ? req.body.corrections : {};
  const known = new Set(Object.keys(d.extracted || {}));
  const unknown = Object.keys(corr).filter((k) => !known.has(k));
  if (unknown.length) return bad(res, `unknown field(s): ${unknown.join(', ')}`);
  const conf = { ...(d.confidence || {}) }; for (const k of Object.keys(corr)) conf[k] = 1;
  const pub = docs.pubDoc(db.patch('documents', d.id, { status: 'verified', extracted: { ...d.extracted, ...corr }, confidence: conf, corrections: corr, verifyFields: [], verifiedAt: now(), verifiedBy: req.user.id, verifyNote: str(req.body?.note, 500) || null }));
  res.json(pub);
});

// KPIs
route('get', '/kpi/overview', { tag: 'KPIs', summary: 'Units, gross, leads, conversion, test-drive rate, days to close, aged stock, days of supply, pipeline, target attainment', cap: 'kpi.read', query: ['siteId', 'month'] }, (req, res) => res.json(K.overview({ siteId: siteParam(req), month: monthParam(req), where: kpiWhere(req.user) })));
route('get', '/kpi/series', { tag: 'KPIs', summary: 'Time series of a metric by month or week', cap: 'kpi.read', query: ['metric', 'by', 'siteId', 'from', 'to'] }, (req, res) => {
  const r = K.series({ metric: str(req.query.metric) || 'units', by: req.query.by === 'week' ? 'week' : 'month', siteId: siteParam(req), from: str(req.query.from, 10), to: str(req.query.to, 10), where: kpiWhere(req.user) });
  if (!r) return bad(res, `metric must be one of ${K.SERIES_METRICS.join(', ')}`);
  res.json(r);
});
route('get', '/kpi/leaderboard', { tag: 'KPIs', summary: 'Salesperson leaderboard (units, gross, conversion)', cap: 'kpi.read', query: ['siteId', 'month', 'from', 'to'] }, (req, res) => res.json(K.leaderboard({ siteId: siteParam(req), month: monthParam(req), from: str(req.query.from, 10), to: str(req.query.to, 10), where: kpiWhere(req.user) })));

// Domo
route('get', '/domo/datasets', { tag: 'Domo', summary: 'Dataset catalogue (name, description, rows, refresh, CSV url, schema)', cap: 'domo.read' }, async (req, res) => res.json(await domo.catalogue()));
route('get', '/domo/export/:dataset.csv', { tag: 'Domo', summary: 'Stream a dataset as CSV (Authorization header or ?token=)', cap: 'domo.read', csv: true, queryAuth: true, query: ['token'] }, async (req, res) => {
  const ok = await domo.streamCsv(req.params.dataset, res);
  if (!ok) nf(res, 'unknown dataset');
});
route('get', '/domo/signals', { tag: 'Domo', summary: 'dealer_signals + derived priorities + move priorities', cap: 'domo.read' }, async (req, res) => {
  const f = domo.readSignals();
  let priorities = null;
  try { const [{ stock }, dealer] = await Promise.all([import('../data.mjs'), import('../dealer.mjs')]); priorities = dealer.priorities(await stock()); } catch { priorities = null; }
  const moves = db.all('vehicles').filter((v) => ['on_lot', 'demo'].includes(v.status) && (v.movePriority != null || (v.daysInStock || 0) > K.AGED_DAYS))
    .sort((a, b) => (a.movePriority ?? 99) - (b.movePriority ?? 99) || (b.daysInStock || 0) - (a.daysInStock || 0)).slice(0, 40)
    .map((v) => ({ stockNo: v.stockNo, siteId: v.siteId, model: v.model, grade: v.grade, daysInStock: v.daysInStock, movePriority: v.movePriority ?? null, reasonCode: v.reasonCode || null, bonusHeadroom: v.bonusHeadroom ?? null, listPrice: v.listPrice, hold: v.hold && v.hold.until > now() ? v.hold : null, why: ops.whyText(v, (f.rows || []).find((r) => r.model === v.model)) }));
  let derived = []; try { derived = await domo.datasetRows('dealer_signals'); } catch { derived = []; }
  res.json({ refreshed_at: f.refreshed_at || null, month: f.month || null, notes: f.notes || null, rows: f.rows || [], derived, priorities, movePriorities: moves });
});
route('post', '/domo/recompute-signals', { tag: 'Domo', summary: 'Recompute content/domo/dealer_signals.json from the DMS tables (runs at startup too)', cap: 'domo.recompute' }, (req, res) => res.json(domo.recomputeSignals({ write: req.query.dryRun !== '1' })));

// DXM
route('get', '/dxm/overview', { tag: 'Digital experience', summary: 'Configurator report + bookings + campaign performance + promotion exposure', cap: 'dxm.read' }, async (req, res) => res.json(await dxm.overview()));
route('get', '/dxm/handovers', { tag: 'Digital experience', summary: 'Handover sheets (configurator bookings and test drives)', cap: 'test_drives.read', list: true }, (req, res) => {
  const items = dxm.handovers({ siteId: siteParam(req), where: auth.scopeFor(req.user, 'test_drives') });
  const ps = Math.max(1, Math.min(200, Number(req.query.pageSize) || 25)); const pg = Math.max(1, Number(req.query.page) || 1);
  res.json({ items: items.slice((pg - 1) * ps, pg * ps), total: items.length, page: pg, pageSize: ps });
});

// ARAG
route('post', '/ask', { tag: 'Assistant', summary: 'Ask the manual / policies (cited answer)', cap: 'assistant', arag: true, rate: true, body: S({ question: sStr(), scope: sStr(null, ['manual', 'policy', 'all']), context: sStr('optional on-screen context'), lang: LANG }, ['question']) }, async (req, res) => {
  const q = str(req.body?.question, 1000); if (!q) return bad(res, 'question is required');
  try { res.json(await ai.ask({ question: q, scope: req.body.scope, context: str(req.body.context, 4000), lang: ai.langOf(req.body.lang) })); }
  catch (e) { console.warn(`[dms ask] ${e.message}`); res.status(502).json({ error: 'knowledge base unavailable' }); }
});
route('post', '/agent/query', { tag: 'Assistant', summary: 'Live-ERP retrieval agent: plan (≤ 4 tool calls) → run erp.search / erp.kpi / erp.get → grounded answer with evidence rows', cap: 'assistant', arag: true, rate: true, body: S({ question: sStr(), lang: LANG }, ['question']) }, async (req, res) => {
  const q = str(req.body?.question, 1000); if (!q) return bad(res, 'question is required');
  res.json(await ai.agentQuery({ question: q, lang: ai.langOf(req.body.lang) }, req.user));
});
route('post', '/deals/:id/summary', { tag: 'Assistant', summary: 'Grounded deal summary, next best action and risks', cap: 'deals.read', arag: true, rate: true, body: S({ lang: LANG }) }, async (req, res) => {
  const d = getScoped(req, res, 'deals', req.params.id); if (!d) return;
  res.json(await ai.dealSummary(d, { lang: ai.langOf(req.body?.lang) }));
});
route('post', '/leads/:id/followup', { tag: 'Assistant', summary: 'Draft a follow-up email/SMS grounded in the lead, its configurator data, live promotions and policy', cap: 'leads.read', arag: true, rate: true, body: S({ tone: sStr(null, ['friendly', 'professional', 'urgent', 'warm', 'concise', 'brief']), channel: sStr(null, ['email', 'sms']), lang: LANG }) }, async (req, res) => {
  const l = getScoped(req, res, 'leads', req.params.id); if (!l) return;
  res.json(await ai.leadFollowup(l, { tone: req.body?.tone, channel: req.body?.channel, lang: ai.langOf(req.body?.lang), configuratorPromos: await configuratorPromos(l.interest?.modelId) }));
});
route('get', '/search', { tag: 'Assistant', summary: 'Semantic KB search (manual, policies, documents) merged with ERP text search', cap: 'search', arag: true, rate: true, query: ['q'] }, async (req, res) => {
  const q = str(req.query.q, 300); if (!q) return res.json({ q: '', items: [], kb: 0, erp: 0 });
  res.json(await ai.search(q, req.user));
});
route('get', '/arag/status', { tag: 'Assistant', summary: 'KB id, resource counts by topic, agents, MCP endpoint', cap: 'arag.read' }, async (req, res) => res.json(await ai.status()));

// access tokens (personal access tokens for MCP clients, Domo connectors, scripts)
route('get', '/access-tokens', { tag: 'Access tokens', summary: 'List your personal access tokens → {items:[{id,name,prefix,createdAt,lastUsedAt,expiresAt}]}' }, (req, res) => res.json({ items: auth.listPats(req.user).map(({ id, name, prefix, createdAt, lastUsedAt, expiresAt }) => ({ id, name, prefix, createdAt, lastUsedAt, expiresAt })) }));
route('post', '/access-tokens', { tag: 'Access tokens', summary: 'Create a personal access token (raw value returned once; acts as you, same role and scope)', body: S({ name: sStr('label, e.g. "Claude Code"'), expiresInDays: { type: 'integer', description: 'optional; omit for no expiry' } }, ['name']) }, (req, res) => {
  const name = str(req.body?.name, 80); if (!name) return bad(res, 'name is required');
  if (req.user.tokenType === 'pat') return res.status(403).json({ error: 'use a session token (login) to create access tokens' });
  const t = auth.createPat(req.user, { name, expiresInDays: req.body?.expiresInDays });
  res.status(201).json({ id: t.id, name: t.name, prefix: t.prefix, token: t.token, createdAt: t.createdAt, expiresAt: t.expiresAt });
});
route('delete', '/access-tokens/:id', { tag: 'Access tokens', summary: 'Revoke a personal access token' }, (req, res) => (auth.deletePat(req.user, req.params.id) ? res.json({ ok: true }) : nf(res)));

// MCP (the transport itself is POST /dms/mcp, outside /dms/api)
route('get', '/mcp/info', { tag: 'MCP', summary: 'MCP endpoints, tool catalogue, resources and prompts (for the settings page)' }, (req, res) => {
  const origin = `${req.protocol}://${req.get('host')}`;
  const tools = mcpCore.catalogue(openapi(R, { version: VERSION }));
  res.json({
    httpUrl: `${origin}/dms/mcp`, transport: 'streamable-http (stateless)',
    stdioCommand: `DMS_API_URL=${origin} DMS_API_TOKEN=<token> node scripts/dms-mcp-stdio.mjs`,
    claudeCode: { http: `claude mcp add --transport http harbourline-dms ${origin}/dms/mcp --header "Authorization: Bearer <token>"`, stdio: `claude mcp add harbourline-dms -- env DMS_API_URL=${origin} DMS_API_TOKEN=<token> node <repo>/scripts/dms-mcp-stdio.mjs` },
    auth: 'Authorization: Bearer <session token from /dms/api/auth/login or a personal access token from /dms/api/access-tokens>',
    toolCount: tools.length, tools: tools.map(({ name, op }) => ({ name, method: op.method, path: `/dms/api${op.path}`, summary: op.summary || '' })),
    resources: [...mcpCore.FIXED_RESOURCES.map(({ api, ...r }) => r), ...mcpCore.RESOURCE_TEMPLATES.map(({ api, ...r }) => r)],
    prompts: mcpCore.PROMPTS.map(({ render, ...p }) => p),
    kbMcpUrl: KB_MCP_URL, docs: 'docs/DMS-MCP.md',
  });
});

// Tags name the resource each route belongs to (they drive the MCP tool names).
const TAGS = [[/^\/auth/, 'Auth'], [/^\/sites/, 'Sites'], [/^\/staff/, 'Staff'], [/^\/customers/, 'Customers'], [/^\/leads/, 'Leads'], [/^\/test-drives/, 'Test drives'], [/^\/deals/, 'Deals'], [/^\/vehicles/, 'Stock'], [/^\/trade-ins/, 'Trade-ins'], [/^\/finance-apps/, 'Finance'], [/^\/campaigns/, 'Campaigns'], [/^\/promotions/, 'Promotions'], [/^\/documents/, 'Documents'], [/^\/kpi/, 'KPI'], [/^\/domo/, 'Domo'], [/^\/dxm/, 'DXM'], [/^\/(ask|agent|search|arag)/, 'Assistant'], [/^\/access-tokens/, 'Access tokens'], [/^\/mcp/, 'MCP'], [/^\/(health|openapi|docs)/, 'System']];
for (const r of R) r.tag = TAGS.find(([re]) => re.test(r.path))?.[1] || r.tag;

// ── router ───────────────────────────────────────────────────────────────────
const router = express.Router();
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.setTimeout(58000, () => { if (!res.headersSent) res.status(504).json({ error: 'timeout' }); });
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.get('origin');
    if (origin) { let host; try { host = new URL(origin).host; } catch { host = ''; } if (host !== req.get('host')) return res.status(403).json({ error: 'cross-origin requests are not allowed' }); }
  }
  next();
});
const small = express.json({ limit: '64kb' }); const big = express.json({ limit: '8mb' });
router.use((req, res, next) => (req.method === 'POST' && req.path === '/documents' ? big : small)(req, res, next));

const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  console.error(`[dms ${req.method} ${req.path}] ${e.stack || e.message}`);
  if (!res.headersSent) res.status(500).json({ error: 'internal error' });
});
for (const r of R) {
  const chain = [];
  if (r.auth !== false) chain.push(auth.requireAuth({ allowQuery: Boolean(r.queryAuth) }));
  if (r.auth !== false) chain.push((req, res, next) => { try { dxm.reconcile(); } catch { /* best effort */ } next(); });
  if (r.cap) chain.push(auth.requireCap(r.cap));
  if (r.rate) chain.push(rateLimit);
  router[r.method](r.path, ...chain, wrap(r.handler));
}
router.use((req, res) => res.status(404).json({ error: 'not found' }));
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  if (res.headersSent) return;
  const status = err.status && err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) console.error(`[dms ${req.method} ${req.path}] ${err.message}`);
  res.status(status).json({ error: err.type === 'entity.parse.failed' ? 'invalid JSON' : status === 413 ? 'body too large' : status === 500 ? 'internal error' : 'bad request' });
});

export const ROUTES = R;
export default router;
