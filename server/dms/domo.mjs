// domo.mjs — Domo dataset catalogue, CSV exports and the dealer_signals write path.
//
// Datasets = every DMS table + derived ones (sales_daily, stock_ageing_daily,
// funnel_weekly, configurator_events, dealer_signals). Derived rows come from
// server/dms/derive.mjs when it exports them (a function per dataset, a
// `derive(name, db)` function or a `datasets` map), else from the inline versions
// below. Descriptions are merged from content/dms/domo-datasets.json when present.
//
// recomputeSignals() rewrites content/domo/dealer_signals.json (same schema the
// configurator reads) from the DMS tables, matching the seed's calibration:
//   unitsInStock        vehicles with status on_lot or in_transit (not demo)
//   sales90d            delivered deals with fulfilment "stock", closedAt in the trailing
//                       90 days (Sydney wall-clock, from the seed's asOf)
//   daysOfSupply        unitsInStock ÷ (sales90d ÷ 90), rounded (0 when sales90d is 0)
//   allocationNextMonth vehicles with status "ordered"
//   avgDaysInStock      mean daysInStock of the on_lot units
//   targetGap, marginHeadroomAvg  carried forward from the current file (per-model targets
//                       and manager-approvable headroom are Domo inputs the ERP lacks)
// With the seed as generated the recompute reproduces the committed file exactly, so it
// is not rewritten ("unchanged"); it only changes when DMS stock or deliveries change.
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../env.mjs';
import * as db from './db.mjs';
import { today, ymd, currentMonth, deliveredAt, isDelivered, weekOf, AGED_DAYS } from './kpi.mjs';

const SIGNALS_PATH = join(ROOT, 'content', 'domo', 'dealer_signals.json');
const DESCRIPTORS = join(ROOT, 'content', 'dms', 'domo-datasets.json');
const DAY = 86400000;

// ── derived datasets ─────────────────────────────────────────────────────────
let deriveMod = null; let deriveTried = false;
async function deriveModule() {
  if (deriveTried) return deriveMod;
  deriveTried = true;
  const p = join(ROOT, 'server', 'dms', 'derive.mjs');
  if (existsSync(p)) { try { deriveMod = await import('./derive.mjs'); } catch (e) { console.warn(`[dms] derive.mjs failed to load: ${e.message}`); } }
  return deriveMod;
}
let eventsMod = null;
async function events() {
  if (eventsMod === null) { try { eventsMod = await import('../events.mjs'); } catch { eventsMod = false; } }
  return eventsMod ? eventsMod.readEvents() : [];
}
export async function configuratorReport(days = 30) {
  await events();
  return eventsMod && eventsMod.configuratorReport ? eventsMod.configuratorReport(days) : null;
}
export const readConfiguratorEvents = events;

function inlineSalesDaily() {
  const v = new Map(db.all('vehicles').map((x) => [x.stockNo, x]));
  const b = new Map();
  for (const d of db.all('deals')) {
    if (!isDelivered(d) || !deliveredAt(d)) continue;
    const model = d.modelId || v.get(d.stockNo)?.model || d.order?.modelId || 'unknown';
    const k = `${deliveredAt(d).slice(0, 10)}|${d.siteId}|${model}`;
    const r = b.get(k) || { date: deliveredAt(d).slice(0, 10), siteId: d.siteId, modelId: model, units: 0, gross: 0, frontGross: 0, backGross: 0, driveAway: 0 };
    r.units++; r.gross += d.grossProfit || 0; r.frontGross += d.frontGross || 0; r.backGross += d.backGross || 0; r.driveAway += d.driveAway || 0;
    b.set(k, r);
  }
  return [...b.values()].sort((a, c) => a.date.localeCompare(c.date) || a.siteId.localeCompare(c.siteId));
}
function inlineStockAgeingDaily(days = 120) {
  // Reconstructs each day's lot from arrivedAt / soldAt (last `days` days).
  const end = today(); const rows = [];
  const units = db.all('vehicles').filter((u) => u.arrivedAt && u.status !== 'ordered' && u.status !== 'allocated' && u.status !== 'in_transit');
  for (let i = days - 1; i >= 0; i--) {
    const t = end.getTime() - i * DAY; const date = new Date(t).toISOString().slice(0, 10);
    const b = new Map();
    for (const u of units) {
      const a = Date.parse(u.arrivedAt); const s = u.soldAt ? Date.parse(u.soldAt) : Infinity;
      if (!(a <= t && s > t)) continue;
      const age = Math.floor((t - a) / DAY);
      const k = `${u.siteId}|${u.model}`;
      const r = b.get(k) || { date, siteId: u.siteId, modelId: u.model, onLot: 0, aged: 0, ageSum: 0 };
      r.onLot++; r.ageSum += age; if (age > AGED_DAYS) r.aged++;
      b.set(k, r);
    }
    for (const r of b.values()) { const { ageSum, ...x } = r; rows.push({ ...x, avgDaysInStock: Math.round(ageSum / r.onLot) }); }
  }
  return rows;
}
function inlineFunnelWeekly() {
  const b = new Map();
  const row = (wk, site) => { const k = `${wk}|${site}`; if (!b.has(k)) b.set(k, { week: wk, siteId: site, leads: 0, contacted: 0, testDrives: 0, deals: 0, delivered: 0, lost: 0, gross: 0 }); return b.get(k); };
  for (const l of db.all('leads')) { if (!l.createdAt) continue; const r = row(weekOf(l.createdAt), l.siteId); r.leads++; if (l.status && l.status !== 'new') r.contacted++; }
  for (const x of db.all('test_drives')) if (x.when) row(weekOf(x.when), x.siteId).testDrives++;
  for (const d of db.all('deals')) {
    if (d.createdAt) row(weekOf(d.createdAt), d.siteId).deals++;
    if (isDelivered(d) && deliveredAt(d)) { const r = row(weekOf(deliveredAt(d)), d.siteId); r.delivered++; r.gross += d.grossProfit || 0; }
    if (d.stage === 'lost' && d.closedAt) row(weekOf(d.closedAt), d.siteId).lost++;
  }
  return [...b.values()].sort((a, c) => a.week.localeCompare(c.week) || a.siteId.localeCompare(c.siteId));
}
async function inlineConfiguratorEvents() {
  return (await events()).map((e) => {
    const d = e.data || {};
    return { ts: e.ts, sid: e.sid, type: e.type, src: e.src || null, modelId: d.modelId || null, gradeId: d.gradeId || null, colourId: d.colourId || null, unitId: d.unitId || null, questionId: d.questionId || null, value: d.value ?? null, site: d.site || null, bookingId: d.bookingId || null, lang: d.lang || null };
  });
}
function signalsFile() {
  try { return JSON.parse(readFileSync(SIGNALS_PATH, 'utf8')); } catch { return { rows: [] }; }
}

const DERIVED = {
  sales_daily: { description: 'Delivered units and gross by day, site and model (from deals).', build: inlineSalesDaily },
  stock_ageing_daily: { description: 'Units on lot, aged (>60 days) units and average age by day, site and model (last 120 days, reconstructed from arrivedAt/soldAt).', build: inlineStockAgeingDaily },
  funnel_weekly: { description: 'Leads → contacted → test drives → deals → delivered / lost by ISO week and site.', build: inlineFunnelWeekly },
  configurator_events: { description: 'First-party configurator events (finder answers, builds, offer views/clicks, asks, bookings); no PII.', build: inlineConfiguratorEvents },
  deal_events: { description: 'One row per deal timeline event (stage changes, calls, finance, documents).', build: () => db.all('deals').flatMap((d) => (d.events || []).map((e) => ({ dealId: d.id, siteId: d.siteId, at: e.at, type: e.type, staffId: e.staffId || null, note: e.note || '' }))) },
  service_daily: { description: 'Workshop activity by day and site: cards opened and completed, labour hours, labour and parts revenue (from job_cards).', build: async () => (await import('./service.mjs')).serviceDaily() },
  job_card_lines: { description: 'One row per job card line (labour, part, sublet, menu) with source and approval.', build: async () => (await import('./service.mjs')).jobCardLines() },
  support_deflection: { description: 'Help desk log: one row per help answer, feedback and ticket, for call-deflection reporting.', build: async () => (await import('./help.mjs')).supportDeflectionRows() },
  onboarding_progress: { description: 'One row per user and onboarding step with completion time and how it was verified.', build: async () => (await import('./help.mjs')).onboardingRows() },
  dealer_signals: { description: 'Domo Intelligence output per model: units in stock, 90-day sales, days of supply, allocation, target gap, age, incentive headroom. Recomputed from the DMS tables.', build: () => signalsFile().rows || [] },
};
const TABLE_DESC = {
  sites: 'Dealer sites and monthly unit targets.', staff: 'Sales staff and managers.', customers: 'Customers (CRM).', vehicles: 'Stock and sold-vehicle history (one row per VIN).',
  leads: 'Sales leads incl. configurator first-party data.', test_drives: 'Test drives with pre-drive questions and handover.', deals: 'Deals from quote to delivery with gross.',
  trade_ins: 'Trade-in appraisals.', finance_apps: 'Finance applications by lender.', promotions: 'Promotions (Domo-selected, ARAG-composed) and history.',
  campaigns: 'Marketing campaigns and their performance.', job_cards: 'Workshop job cards: vehicle, requests, findings, lines, status history.', memos: 'Memos on job cards, customers and suppliers (kind, text, pinned).', suppliers: 'Supplier register with terms, rating and spend.', support_tickets: 'Support tickets raised from the help bubble.', documents: 'Deal documents and ARAG extraction status.', targets: 'Monthly unit and gross targets per site.',
};

const cache = new Map(); // name → {v, rows}
/** Tables in the shape derive.mjs expects (live in-memory rows incl. demo edits). */
async function deriveTables() {
  const t = Object.fromEntries(Object.keys(db.TABLES).map((n) => [n, db.all(n)]));
  try { t.meta = JSON.parse(readFileSync(join(ROOT, 'content', 'dms', 'data', '_meta.json'), 'utf8')); } catch { t.meta = {}; }
  t.domo_signals = signalsFile();
  t.configurator_events = await events();
  try { const { readDealer } = await import('../state.mjs'); t.bookings = readDealer('bookings.json', { bookings: [] }).bookings || []; } catch { t.bookings = []; }
  return t;
}
/** Rows of a dataset (table or derived). */
export async function datasetRows(name) {
  if (db.TABLES[name]) return db.all(name);
  if (!DERIVED[name]) return null;
  const c = cache.get(name);
  if (c && c.v === db.dataVersion() && name !== 'configurator_events' && name !== 'dealer_signals') return c.rows;
  let rows = null;
  const m = await deriveModule();
  try {
    const fn = m?.DERIVED?.[name];
    if (typeof fn === 'function') { rows = await fn(await deriveTables()); if (rows && !Array.isArray(rows)) rows = rows.rows || null; }
  } catch (e) { console.warn(`[dms] derive ${name}: ${e.message}; using inline`); rows = null; }
  if (!rows) rows = await DERIVED[name].build();
  cache.set(name, { v: db.dataVersion(), rows });
  return rows;
}

function inferSchema(rows) {
  const cols = new Map();
  for (const r of rows.slice(0, 300)) for (const [k, v] of Object.entries(r)) {
    if (k.startsWith('_')) continue;
    const t = v == null ? null : typeof v === 'number' ? (Number.isInteger(v) ? 'LONG' : 'DOUBLE') : typeof v === 'boolean' ? 'STRING' : typeof v === 'object' ? 'STRING' : /^\d{4}-\d{2}-\d{2}T/.test(v) ? 'DATETIME' : /^\d{4}-\d{2}-\d{2}$/.test(v) ? 'DATE' : 'STRING';
    if (!cols.has(k) || (cols.get(k) == null && t)) cols.set(k, t);
    else if (t && cols.get(k) !== t) cols.set(k, cols.get(k) === 'LONG' && t === 'DOUBLE' ? 'DOUBLE' : cols.get(k) === 'DOUBLE' && t === 'LONG' ? 'DOUBLE' : 'STRING');
  }
  return [...cols].map(([name, type]) => ({ name, type: type || 'STRING' }));
}

export async function catalogue() {
  let desc = {};
  try { const j = JSON.parse(readFileSync(DESCRIPTORS, 'utf8')); for (const d of (Array.isArray(j) ? j : j.datasets || [])) if (d && d.name) desc[d.name] = d; } catch { desc = {}; }
  const out = [];
  for (const name of [...Object.keys(db.TABLES), ...Object.keys(DERIVED)]) {
    const rows = await datasetRows(name);
    const d = desc[name] || {};
    out.push({
      name, kind: db.TABLES[name] ? 'table' : 'derived',
      description: d.description || TABLE_DESC[name] || DERIVED[name]?.description || '',
      rows: rows.length, refresh: d.refresh || (db.TABLES[name] ? 'on change (DMS write-through)' : name === 'configurator_events' ? 'streaming (append-only log)' : 'nightly 02:00 AEST'),
      csvUrl: `/dms/api/domo/export/${name}.csv`, schema: d.schema || inferSchema(rows), ...(d.joins ? { joins: d.joins } : {}),
    });
  }
  return { generatedAt: new Date().toISOString(), source: db.info().source, datasets: out };
}

const csvCell = (v) => {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** Stream a dataset as CSV to res (chunks of 500 rows). Returns false when unknown. */
export async function streamCsv(name, res, { where } = {}) {
  let rows = await datasetRows(name);
  if (!rows) return false;
  if (where) rows = rows.filter(where);
  const cols = inferSchema(rows).map((c) => c.name);
  res.status(200).set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.csv"`, 'X-Row-Count': String(rows.length) });
  res.write(`${cols.join(',')}\n`);
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => cols.map((c) => csvCell(r[c])).join(',')).join('\n');
    if (!res.write(`${chunk}\n`)) await new Promise((r) => res.once('drain', r));
  }
  res.end();
  return true;
}

// ── dealer_signals write path ────────────────────────────────────────────────
export function computeSignals() {
  // Same window and rules as derive.mjs / the seed calibration: local (Sydney wall-clock)
  // timestamps, 90 days back from the seed's asOf (or DMS_TODAY / now when absent).
  const localMs = (x) => (x ? Date.parse(`${String(x).slice(0, 19)}Z`) : null);
  const now = localMs(process.env.DMS_TODAY ? `${process.env.DMS_TODAY}T08:00:00` : seedAsOf() || new Date().toISOString());
  const month = new Date(now).toISOString().slice(0, 7);
  const vehicles = db.all('vehicles');
  const prev = signalsFile();
  const prevBy = new Map((prev.rows || []).map((r) => [r.model, r]));
  const models = [...prevBy.keys()];
  for (const v of vehicles) if (v.model && !models.includes(v.model)) models.push(v.model);
  const rows = models.map((m) => {
    const vs = vehicles.filter((v) => v.model === m);
    const stock = vs.filter((v) => v.status === 'on_lot' || v.status === 'in_transit');
    const onLot = vs.filter((v) => v.status === 'on_lot');
    const s90 = db.all('deals').filter((d) => d.modelId === m && d.stage === 'delivered' && d.fulfilment === 'stock' && localMs(d.closedAt) >= now - 90 * DAY && localMs(d.closedAt) <= now).length;
    const p = prevBy.get(m) || {};
    return {
      model: m, unitsInStock: stock.length, sales90d: s90,
      daysOfSupply: s90 ? Math.round(stock.length / (s90 / 90)) : 0,
      allocationNextMonth: vs.filter((v) => v.status === 'ordered').length,
      // Per-model targets and manager-approvable headroom are Domo inputs the ERP does not hold: carried forward.
      targetGap: Number(p.targetGap) || 0,
      avgDaysInStock: onLot.length ? Math.round(onLot.reduce((n, v) => n + (v.daysInStock || 0), 0) / onLot.length) : 0,
      marginHeadroomAvg: Number(p.marginHeadroomAvg) || 0,
    };
  });
  return { prev, rows, month };
}
function seedAsOf() { try { return JSON.parse(readFileSync(join(ROOT, 'content', 'dms', 'data', '_meta.json'), 'utf8')).asOf || null; } catch { return null; } }
/** Recompute and write content/domo/dealer_signals.json atomically. */
export function recomputeSignals({ write = true } = {}) {
  if (!db.isReal()) return { written: false, reason: 'DMS seed data not loaded (fixture); dealer_signals.json left unchanged', rows: [] };
  const { prev, rows, month } = computeSignals();
  const changed = JSON.stringify(rows) !== JSON.stringify(prev.rows || []);
  const out = {
    dataset: prev.dataset || 'dealer_signals', source: prev.source || "Domo stand-in: Intelligence dataflow 'dealer_signals' over the Harbourline ERP.",
    refreshed_at: changed ? new Date().toISOString() : prev.refreshed_at || new Date().toISOString(), month,
    notes: prev.notes || '', rows,
  };
  if (!write || !changed) return { written: false, reason: changed ? 'dry run' : 'unchanged', refreshed_at: out.refreshed_at, month, rows };
  try {
    const tmp = `${SIGNALS_PATH}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(out, null, 2)}\n`);
    renameSync(tmp, SIGNALS_PATH);
    cache.delete('dealer_signals');
    return { written: true, refreshed_at: out.refreshed_at, month, rows };
  } catch (e) {
    console.warn(`[dms] dealer_signals not writable (${e.code || e.message}); served in memory only`);
    return { written: false, reason: `not writable (${e.code || 'error'})`, month, rows };
  }
}
export const signalsPath = SIGNALS_PATH;
export const readSignals = signalsFile;
