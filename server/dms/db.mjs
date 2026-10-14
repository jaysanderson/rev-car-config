// db.mjs — Harbourline DMS in-memory tables.
//
// Loads content/dms/data/*.json (written by scripts/dms-seed.mjs) into memory with
// primary-key and foreign-key indexes. A file may hold a bare array or an object
// with `rows` / `items` / `data` / `<table>`. File names may use `-` or `_`.
//
// Writes (insert / patch) change memory and append one JSON line to
// `_changes.jsonl` in the data dir (DMS_CHANGES_DIR overrides; on EACCES/EROFS/EPERM
// it falls back to <tmpdir>/harbourline-dms, like server/state.mjs), and the log is
// replayed on load, so demo edits survive restarts when the dir is writable.
//
// When the data dir is empty (the seed has not run yet) a tiny inline fixture is
// used so the API still works; the dir is polled every 60 s and reloaded when the
// seed lands or is regenerated (mtime change).
import { readFileSync, readdirSync, existsSync, statSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ROOT } from '../env.mjs';

export const DATA_DIR = process.env.DMS_DATA_DIR || join(ROOT, 'content', 'dms', 'data');
let CHANGES_DIR = process.env.DMS_CHANGES_DIR || DATA_DIR;
const CHANGES = '_changes.jsonl';

// ── table metadata (also feeds OpenAPI schemas and the agent's schema summary) ──
export const TABLES = {
  sites: { key: 'id', cols: 'id, name, address, phone, salesTarget{month:units}' },
  staff: { key: 'id', cols: 'id, name, role (gm|sales_manager|salesperson|dxm|finance|…), siteId, email, avatarInitials' },
  customers: { key: 'id', date: 'createdAt', cols: 'id, firstName, lastName, company, email, phone, suburb, postcode, siteId, unitsPurchased, source (web-configurator|walk-in|phone|referral|campaign|service), createdAt, tags[], notes' },
  vehicles: { key: 'stockNo', date: 'arrivedAt', cols: 'vin, stockNo (HL-####), siteId, model, grade, colour, interior, packs[], status (on_lot|in_transit|sold|demo|allocated|ordered), daysInStock, landedCost, listPrice, arrivedAt, soldAt, dealId, bonusHeadroom, movePriority, reasonCode' },
  leads: { key: 'id', date: 'createdAt', owner: 'ownerId', cols: 'id, customerId (nullable), customerRef, siteId, ownerId (staff id), source, channel (configurator|web-form|phone|walk-in|campaign), status (new|contacted|qualified|test_drive_booked|quoted|won|lost), createdAt, updatedAt, interest{modelId,gradeId,colourId,stockNo}, configuratorSessionId, finderAnswers[], viewed[], bookingId, handover, campaignId, lostReason, lostReasonCode, score (0-100), statusHistory[{status,at}]' },
  test_drives: { key: 'id', date: 'when', owner: 'staffId', cols: 'id (TD-xxxxx), leadId, customerId, siteId, staffId, stockNo, modelId, gradeId, when, status (booked|completed|no_show|cancelled), questions[], incentive, handover, outcome' },
  deals: { key: 'id', date: 'createdAt', owner: 'salespersonId', cols: 'id (D-#####), leadId, customerId, siteId, salespersonId, businessManagerId, modelId, gradeId, colourId, stockNo, order{modelId,gradeId,colourId,etaWeeks}, stage (quote|negotiation|finance|approval|contract|delivery|delivered|lost), createdAt, closedAt, vehiclePrice, accessories[], promotions[], tradeInId, discount, driveAway, financeAppId, grossProfit, frontGross, backGross, deliveryDate, lostReason, lostReasonCode, updatedAt, contractAt, deposit, stageHistory[{stage,at}], events[{at,type,note,staffId}]' },
  trade_ins: { key: 'id', cols: 'id, dealId, customerId, make, model, year, km, condition, valuation, offered, documents[]' },
  finance_apps: { key: 'id', date: 'submittedAt', cols: 'id, dealId, lender (Toyota Finance|Macquarie|ANZ|Westpac), amount, termMonths, rate, status (submitted|approved|conditional|declined|settled), submittedAt, decisionAt' },
  promotions: { key: 'id', date: 'startsAt', cols: 'id, title, kind, value, source{domo,kb}, startsAt, endsAt, appliesTo, status' },
  campaigns: { key: 'id', date: 'startsAt', cols: 'id, name, channel (email|sms|web|social), audience, startsAt, endsAt, promotionIds[], sent, opened, clicked, leads, budget' },
  documents: { key: 'id', date: 'uploadedAt', cols: 'id, kind (contract|trade_in_form|supplier_invoice|licence|insurance), dealId, customerId, fileName, uploadedAt, status (uploaded|processing|extracted|verified), extracted{}, aragResourceId' },
  targets: { key: '_key', cols: 'siteId, month (YYYY-MM), units, grossTarget' },
};
const FK = {
  leads: ['customerId', 'siteId', 'ownerId', 'bookingId'], test_drives: ['leadId', 'customerId', 'siteId', 'staffId'],
  deals: ['leadId', 'customerId', 'siteId', 'salespersonId'], trade_ins: ['dealId', 'customerId'], finance_apps: ['dealId'],
  documents: ['dealId', 'customerId'], vehicles: ['siteId', 'dealId', 'vin'], staff: ['siteId', 'email'], targets: ['siteId'],
};

// ── state ────────────────────────────────────────────────────────────────────
const state = { tables: {}, byKey: {}, idx: {}, source: 'none', loadedAt: null, mtime: 0, changes: 0 };
const keyOf = (table, row) => (table === 'targets' ? `${row.siteId}|${row.month}` : row[TABLES[table]?.key || 'id']);

function rowsFrom(j, table) {
  if (Array.isArray(j)) return j;
  if (j && typeof j === 'object') for (const k of ['rows', 'items', 'data', table]) if (Array.isArray(j[k])) return j[k];
  return [];
}
function dataFiles() {
  if (!existsSync(DATA_DIR)) return [];
  return readdirSync(DATA_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
}
function dirMtime() { return dataFiles().reduce((m, f) => Math.max(m, statSync(join(DATA_DIR, f)).mtimeMs), 0); }

function index(table) {
  const rows = state.tables[table];
  const m = new Map();
  for (const r of rows) { if (table === 'targets') r._key = keyOf(table, r); m.set(String(keyOf(table, r)), r); }
  state.byKey[table] = m;
  state.idx[table] = {};
  if (table === 'vehicles') for (const r of rows) if (r.vin) m.set(String(r.vin), r);
}
function fkIndex(table, field) {
  const t = (state.idx[table] ||= {});
  if (!t[field]) {
    const m = new Map();
    for (const r of state.tables[table] || []) { const v = r[field]; if (v == null) continue; const k = String(v); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
    t[field] = m;
  }
  return t[field];
}

export function load() {
  const files = dataFiles();
  const tables = {};
  for (const f of files) {
    const name = f.replace(/\.json$/, '').replace(/-/g, '_');
    if (!(name in TABLES)) continue;
    try { tables[name] = rowsFrom(JSON.parse(readFileSync(join(DATA_DIR, f), 'utf8')), name); }
    catch (e) { console.warn(`[dms] cannot parse ${f}: ${e.message}`); }
  }
  const real = Object.keys(tables).length >= 5;
  const base = real ? tables : fixture();
  for (const t of Object.keys(TABLES)) state.tables[t] = (base[t] || []).slice();
  for (const t of Object.keys(TABLES)) index(t);
  state.source = real ? 'content/dms/data' : 'inline fixture (seed not generated yet)';
  state.loadedAt = new Date().toISOString();
  state.mtime = real ? dirMtime() : 0;
  state.changes = replay();
  version++;
  console.log(`[dms] loaded ${Object.entries(state.tables).map(([k, v]) => `${k} ${v.length}`).join(', ')} from ${state.source}${state.changes ? `; replayed ${state.changes} change(s)` : ''}`);
  for (const fn of loadHooks) { try { fn(); } catch (e) { console.warn(`[dms] load hook: ${e.message}`); } }
}
let version = 0;
export const dataVersion = () => version;
const loadHooks = [];
export const onLoad = (fn) => { loadHooks.push(fn); };
export const isReal = () => state.source === 'content/dms/data';
export const info = () => ({ source: state.source, loadedAt: state.loadedAt, changesReplayed: state.changes, counts: Object.fromEntries(Object.entries(state.tables).map(([k, v]) => [k, v.length])) });

// Poll for the seed (and regeneration).
setInterval(() => {
  try { const m = dirMtime(); if (m && m !== state.mtime) load(); } catch (e) { console.warn(`[dms] poll: ${e.message}`); }
}, 60000).unref();

// ── change log ───────────────────────────────────────────────────────────────
function changesPath() { return join(CHANGES_DIR, CHANGES); }
/** Writable state dir (change log, access tokens); may switch to the tmp fallback. */
export const stateDir = () => CHANGES_DIR;
export function useTmpState() { const alt = join(tmpdir(), 'harbourline-dms'); if (CHANGES_DIR !== alt) { console.warn(`[dms] ${CHANGES_DIR} is not writable; DMS state now in ${alt} (ephemeral)`); CHANGES_DIR = alt; } return alt; }
function replay() {
  const p = changesPath();
  if (!existsSync(p)) return 0;
  let n = 0;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const c = JSON.parse(line); apply(c); n++; } catch { /* torn line */ }
  }
  return n;
}
function apply(c) {
  if (!TABLES[c.table]) return;
  if (c.op === 'insert') {
    const k = String(keyOf(c.table, c.row));
    if (state.byKey[c.table].has(k)) Object.assign(state.byKey[c.table].get(k), c.row);
    else { state.tables[c.table].push(c.row); state.byKey[c.table].set(k, c.row); }
  } else if (c.op === 'patch') {
    const r = state.byKey[c.table].get(String(c.id));
    if (r) Object.assign(r, c.patch);
  }
  state.idx[c.table] = {};
}
function persist(c) {
  const line = `${JSON.stringify({ ...c, at: new Date().toISOString() })}\n`;
  try { mkdirSync(CHANGES_DIR, { recursive: true }); appendFileSync(changesPath(), line); }
  catch (e) {
    if (!['EACCES', 'EROFS', 'EPERM'].includes(e.code)) { console.warn(`[dms] change log: ${e.message}`); return; }
    const alt = join(tmpdir(), 'harbourline-dms');
    if (CHANGES_DIR === alt) return;
    console.warn(`[dms] ${CHANGES_DIR} is not writable (${e.code}); change log now in ${alt} (ephemeral)`);
    CHANGES_DIR = alt;
    try { mkdirSync(alt, { recursive: true }); appendFileSync(changesPath(), line); } catch (e2) { console.warn(`[dms] change log: ${e2.message}`); }
  }
}

// ── read API ─────────────────────────────────────────────────────────────────
export const all = (table) => state.tables[table] || [];
export const get = (table, id) => (id == null ? undefined : state.byKey[table]?.get(String(id)));
export const by = (table, field, value) => (value == null ? [] : fkIndex(table, field).get(String(value)) || []);

const textCache = new WeakMap();
function textOf(row) {
  let t = textCache.get(row);
  if (t === undefined) {
    const parts = [];
    const walk = (v, d) => { if (v == null || d > 3) return; if (typeof v === 'object') { for (const x of Object.values(v)) walk(x, d + 1); } else parts.push(String(v)); };
    walk(row, 0);
    t = parts.join(' ').toLowerCase();
    textCache.set(row, t);
  }
  return t;
}
export const matchesText = (row, q) => { const s = textOf(row); return String(q).toLowerCase().split(/\s+/).filter(Boolean).every((w) => s.includes(w)); };

const num = (v) => (v !== '' && v != null && !Number.isNaN(Number(v)) ? Number(v) : null);
const getPath = (row, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), row);
/** One filter: {field, op, value}; ops eq|ne|gt|gte|lt|lte|contains|in|exists. */
export function testFilter(row, { field, op = 'eq', value }) {
  const v = getPath(row, field);
  const vs = Array.isArray(value) ? value.map(String) : String(value ?? '').split(',').map((s) => s.trim());
  switch (op) {
    case 'eq': return Array.isArray(v) ? v.map(String).includes(String(value)) : String(v ?? '') === String(value ?? '');
    case 'ne': return String(v ?? '') !== String(value ?? '');
    case 'in': return Array.isArray(v) ? v.some((x) => vs.includes(String(x))) : vs.includes(String(v ?? ''));
    case 'contains': return String(Array.isArray(v) ? v.join(' ') : typeof v === 'object' ? JSON.stringify(v) : v ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());
    case 'exists': return (v != null && v !== '') === !(value === false || value === 'false');
    case 'gt': case 'gte': case 'lt': case 'lte': {
      const a = num(v) ?? (v ? Date.parse(v) : null); const b = num(value) ?? (value ? Date.parse(value) : null);
      if (a == null || b == null || Number.isNaN(a) || Number.isNaN(b)) return false;
      return op === 'gt' ? a > b : op === 'gte' ? a >= b : op === 'lt' ? a < b : a <= b;
    }
    default: return false;
  }
}

/**
 * list(table, {q, filters, from, to, sort, page, pageSize, rows, where}) → {items, total, page, pageSize}
 *   filters: {field: value|"a,b"} equality (comma = any of) or [{field, op, value}]
 *   from/to: inclusive range on the table's date field (YYYY-MM-DD or ISO)
 *   sort: "field" or "-field" (default: date field desc)
 *   rows: pre-filtered base rows; where: extra predicate
 */
export function list(table, { q, filters, from, to, sort, page = 1, pageSize = 25, rows, where } = {}) {
  let out = rows || all(table);
  const df = TABLES[table]?.date;
  if (filters) {
    const arr = Array.isArray(filters) ? filters : Object.entries(filters).filter(([, v]) => v !== undefined && v !== '').map(([field, value]) => ({ field, op: String(value).includes(',') ? 'in' : 'eq', value }));
    if (arr.length) out = out.filter((r) => arr.every((f) => testFilter(r, f)));
  }
  if (where) out = out.filter(where);
  if (q && String(q).trim()) out = out.filter((r) => matchesText(r, q));
  if (df && (from || to)) {
    const lo = from ? String(from) : ''; const hi = to ? (String(to).length <= 10 ? `${to}T23:59:59.999Z` : String(to)) : '';
    out = out.filter((r) => { const d = r[df]; if (!d) return false; return (!lo || d >= lo) && (!hi || d <= hi); });
  }
  const s = sort || (df ? `-${df}` : '');
  if (s) {
    const desc = s.startsWith('-'); const f = s.replace(/^[-+]/, '');
    out = [...out].sort((a, b) => {
      const x = getPath(a, f); const y = getPath(b, f);
      if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return desc ? -c : c;
    });
  }
  const ps = Math.max(1, Math.min(500, Number(pageSize) || 25));
  const pg = Math.max(1, Number(page) || 1);
  return { items: out.slice((pg - 1) * ps, pg * ps), total: out.length, page: pg, pageSize: ps };
}

// ── write API ────────────────────────────────────────────────────────────────
export function insert(table, row) {
  if (!TABLES[table]) throw new Error(`unknown table ${table}`);
  const c = { op: 'insert', table, row };
  apply(c); persist(c);
  return get(table, keyOf(table, row));
}
export function patch(table, id, p) {
  const r = get(table, id);
  if (!r) return null;
  const c = { op: 'patch', table, id: String(keyOf(table, r)), patch: p };
  apply(c); persist(c);
  textCache.delete(r);
  return r;
}
/** Next id like D-02101 / C-01401 for a prefix, scanning the table. */
export function nextId(table, prefix, width = 5) {
  let max = 0;
  const re = new RegExp(`^${prefix}-?(\\d+)$`);
  for (const r of all(table)) { const m = re.exec(String(r.id || '')); if (m) max = Math.max(max, Number(m[1])); }
  return `${prefix}-${String(max + 1).padStart(width, '0')}`;
}

// ── fixture (used only until content/dms/data exists) ────────────────────────
function fixture() {
  let a = 20261014;
  const rnd = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const day = (n) => new Date(Date.UTC(2026, 9, 14) - n * 86400000).toISOString();
  const sites = [['par', 'Parramatta'], ['hor', 'Hornsby'], ['pen', 'Penrith'], ['liv', 'Liverpool']].map(([id, name]) => ({ id, name, address: `${name} NSW`, phone: '02 9000 0000', salesTarget: { '2026-10': 40 } }));
  const staff = [
    { id: 'S-GM', name: 'Grace Morton', role: 'gm', siteId: 'par', email: 'gm@harbourline.demo' },
    ...sites.flatMap((s, i) => [{ id: `S-SM-${s.id}`, name: `Manager ${s.name}`, role: 'sales_manager', siteId: s.id }, { id: `S-${i}1`, name: `Sales ${s.name} A`, role: 'salesperson', siteId: s.id }, { id: `S-${i}2`, name: `Sales ${s.name} B`, role: 'salesperson', siteId: s.id }]),
  ].map((x) => ({ ...x, avatarInitials: x.name.split(' ').map((w) => w[0]).join('').slice(0, 2) }));
  const models = ['rav4', 'kluger', 'hilux', 'camry', 'corolla-cross', 'prado'];
  const customers = Array.from({ length: 40 }, (_, i) => ({ id: `C-${String(i + 1).padStart(5, '0')}`, firstName: pick(['Ava', 'Liam', 'Mia', 'Noah', 'Zoe']), lastName: pick(['Nguyen', 'Smith', 'Patel', 'Chen']), email: `c${i}@example.com`, phone: '0400 000 000', suburb: 'Parramatta', postcode: '2150', source: pick(['walk-in', 'phone', 'web-configurator']), createdAt: day(Math.floor(rnd() * 700)), tags: [], notes: '' }));
  const sales = staff.filter((s) => s.role === 'salesperson');
  const leads = customers.map((c, i) => { const sp = pick(sales); return { id: `L-${String(i + 1).padStart(5, '0')}`, customerId: c.id, siteId: sp.siteId, ownerId: sp.id, source: c.source, channel: pick(['phone', 'walk-in', 'web-form']), status: pick(['new', 'contacted', 'won', 'lost', 'quoted']), createdAt: c.createdAt, updatedAt: c.createdAt, interest: { modelId: pick(models) }, finderAnswers: [], viewed: [], score: Math.floor(rnd() * 100) }; });
  const stages = ['quote', 'negotiation', 'finance', 'approval', 'contract', 'delivery', 'delivered', 'delivered', 'delivered', 'lost'];
  const deals = leads.slice(0, 30).map((l, i) => { const stage = pick(stages); const created = l.createdAt; const closed = ['delivered', 'lost'].includes(stage) ? new Date(Date.parse(created) + 20 * 86400000).toISOString() : null; const front = 1200 + Math.floor(rnd() * 3300); const back = 600 + Math.floor(rnd() * 2200); return { id: `D-${String(i + 1).padStart(5, '0')}`, leadId: l.id, customerId: l.customerId, siteId: l.siteId, salespersonId: l.ownerId, stockNo: `HL-${3000 + i}`, stage, createdAt: created, closedAt: closed, deliveryDate: stage === 'delivered' ? closed : null, vehiclePrice: 50000, accessories: [], promotions: [], discount: 500, driveAway: 52000, grossProfit: front + back, frontGross: front, backGross: back, events: [{ at: created, type: 'created', note: 'Deal opened', staffId: l.ownerId }] }; });
  const vehicles = deals.map((d) => ({ vin: `JTFIX${d.id}`, stockNo: d.stockNo, siteId: d.siteId, model: pick(models), grade: 'gx', colour: 'white', interior: 'black', packs: [], status: d.stage === 'delivered' ? 'sold' : 'on_lot', daysInStock: Math.floor(rnd() * 120), landedCost: 45000, listPrice: 50000, arrivedAt: day(200), bonusHeadroom: 1000 }));
  const targets = sites.map((s) => ({ siteId: s.id, month: '2026-10', units: 40, grossTarget: 160000 }));
  return { sites, staff, customers, leads, deals, vehicles, targets, test_drives: [], trade_ins: [], finance_apps: [], promotions: [], campaigns: [], documents: [] };
}

load();
