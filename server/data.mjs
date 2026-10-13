// data.mjs — catalogue + stock (Domo) data access, and the pure helpers built on
// them: pricing, availability, offers, compact text summaries for the LLM.
//
// Stock source:
//   • stand-in (default): content/domo/*.json — exported DMS/Domo datasets.
//   • live: when DOMO_CLIENT_ID + DOMO_CLIENT_SECRET + DOMO_DATASET_STOCK are set,
//     rows are pulled from Domo's dataset query API (client-credentials OAuth,
//     scope=data) and mapped into the same shape. Optional DOMO_DATASET_AGED,
//     DOMO_DATASET_TRANSFER, DOMO_DATASET_INBOUND, DOMO_DATASET_ORDERBANK override
//     the matching stand-in file. Any live failure falls back to the stand-in.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './env.mjs';

const CONTENT = join(ROOT, 'content');

// ── catalogue ────────────────────────────────────────────────────────────────
let catCache = { mtime: 0, data: null };
export function catalog() {
  const p = join(CONTENT, 'catalog.json');
  if (!existsSync(p)) return { models: [], colours: [], interiors: [], accessories: [] };
  const m = statSync(p).mtimeMs;
  if (m !== catCache.mtime) catCache = { mtime: m, data: JSON.parse(readFileSync(p, 'utf8')) };
  return catCache.data;
}
export const catalogPath = () => join(CONTENT, 'catalog.json');
export const modelById = (id) => catalog().models.find((m) => m.id === id);
export const gradeOf = (modelId, gradeId) => modelById(modelId)?.grades?.find((g) => g.id === gradeId);
export const colourById = (id) => catalog().colours.find((c) => c.id === id);
export const interiorById = (id) => catalog().interiors.find((c) => c.id === id);
export const packById = (id) => catalog().accessories.find((c) => c.id === id);

export function priceOf({ modelId, gradeId, colourId, interiorId, packs = [] }) {
  const g = gradeOf(modelId, gradeId) || modelById(modelId)?.grades?.[0];
  if (!g) return null;
  return g.price + (colourById(colourId)?.price || 0) + (interiorById(interiorId)?.price || 0)
    + packs.reduce((s, p) => s + (packById(p)?.price || 0), 0);
}

/** Find model ids mentioned in free text (ids, names, common aliases). */
export function modelsMentioned(text) {
  const t = ` ${String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  const alias = { 'landcruiser-300': ['landcruiser', 'land cruiser', 'lc300', '300 series'], 'c-hr': ['chr', 'c hr'], hilux: ['hi lux'], bz4x: ['bz4x', 'bz 4x'], gr86: ['gr86', 'gr 86', '86'] };
  const out = [];
  // longest names first so "corolla cross" beats "corolla"
  const models = [...catalog().models].sort((a, b) => b.name.length - a.name.length);
  let rest = t;
  for (const m of models) {
    const names = [m.name.toLowerCase(), m.id.replace(/-/g, ' '), ...(alias[m.id] || [])].map((s) => ` ${s.replace(/[^a-z0-9]+/g, ' ').trim()} `);
    if (names.some((n) => rest.includes(n))) { out.push(m.id); for (const n of names) rest = rest.split(n).join(' '); }
  }
  return out;
}

// ── stock (Domo) ─────────────────────────────────────────────────────────────
const DATASETS = ['stock_by_site', 'aged_stock_actions', 'transfer_feasibility', 'inbound_pipeline', 'order_bank_eta'];
const DOMO_ENV = { stock_by_site: 'DOMO_DATASET_STOCK', aged_stock_actions: 'DOMO_DATASET_AGED', transfer_feasibility: 'DOMO_DATASET_TRANSFER', inbound_pipeline: 'DOMO_DATASET_INBOUND', order_bank_eta: 'DOMO_DATASET_ORDERBANK' };
export const domoMode = () => (process.env.DOMO_CLIENT_ID && process.env.DOMO_CLIENT_SECRET && process.env.DOMO_DATASET_STOCK ? 'live' : 'stand-in');

function readStandIn(name) {
  const p = join(CONTENT, 'domo', `${name}.json`);
  if (!existsSync(p)) return { rows: [], refreshed_at: null };
  const j = JSON.parse(readFileSync(p, 'utf8'));
  return { rows: j.rows || [], refreshed_at: j.refreshed_at || null, sites: j.sites };
}

let domoToken = { value: null, exp: 0 };
async function domoQuery(datasetId) {
  const host = process.env.DOMO_API_HOST || 'https://api.domo.com';
  if (!domoToken.value || Date.now() > domoToken.exp) {
    const basic = Buffer.from(`${process.env.DOMO_CLIENT_ID}:${process.env.DOMO_CLIENT_SECRET}`).toString('base64');
    const r = await fetch(`${host}/oauth/token?grant_type=client_credentials&scope=data`, { headers: { Authorization: `Basic ${basic}` }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`Domo auth ${r.status}`);
    const j = await r.json();
    domoToken = { value: j.access_token, exp: Date.now() + Math.max(60, (j.expires_in || 3600) - 60) * 1000 };
  }
  const r = await fetch(`${host}/v1/datasets/query/execute/${datasetId}`, {
    method: 'POST', headers: { Authorization: `Bearer ${domoToken.value}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ sql: 'SELECT * FROM table' }), signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`Domo query ${r.status}`);
  const j = await r.json();
  const cols = j.columns || [];
  return (j.rows || []).map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
}
// Domo columns are flat; normalise list/number fields to the stand-in shape.
function normaliseUnit(u) {
  const packs = Array.isArray(u.packs) ? u.packs : String(u.packs || '').split(/[|,;]/).map((s) => s.trim()).filter(Boolean);
  const num = (v) => (v === '' || v == null ? undefined : Number(v));
  const out = { ...u, packs, age: num(u.age ?? u.days_in_stock) ?? 0, bonus: num(u.bonus) ?? 0 };
  out.days_in_stock = out.age;
  if (u.transit != null && u.transit !== '') out.transit = num(u.transit);
  if (u.priority != null && u.priority !== '') out.priority = num(u.priority); else delete out.priority;
  out.status = out.status || (out.transit != null ? 'in_transit' : 'on_lot');
  return out;
}

let stockCache = { at: 0, data: null };
export async function stock() {
  if (stockCache.data && Date.now() - stockCache.at < 60_000) return stockCache.data;
  const out = {}; let refreshed = null;
  for (const name of DATASETS) {
    const s = readStandIn(name);
    out[name] = s.rows; refreshed = refreshed || s.refreshed_at;
    if (name === 'stock_by_site') out._sites = s.sites || [];
  }
  if (domoMode() === 'live') {
    try {
      for (const name of DATASETS) {
        const id = process.env[DOMO_ENV[name]];
        if (id) out[name] = await domoQuery(id);
      }
      refreshed = new Date().toISOString();
    } catch (e) {
      console.warn(`[domo] live query failed, using stand-in: ${e.message}`);
    }
  }
  out.stock_by_site = out.stock_by_site.map(normaliseUnit);
  out.refreshed_at = refreshed || new Date().toISOString();
  stockCache = { at: Date.now(), data: out };
  return out;
}
/** The public /api/stock shape (exactly these keys). */
export const stockPublic = (s) => ({
  stock_by_site: s.stock_by_site, aged_stock_actions: s.aged_stock_actions, transfer_feasibility: s.transfer_feasibility,
  inbound_pipeline: s.inbound_pipeline, order_bank_eta: s.order_bank_eta, refreshed_at: s.refreshed_at,
});

const HOME = 'par';
export function siteName(s, id) { return (s._sites || []).find((x) => x.id === id)?.name || s.transfer_feasibility.find((t) => t.from_site === id)?.from_name || id; }
function transferOf(s, site) { return s.transfer_feasibility.find((t) => t.from_site === site); }

/** {onLot, nearby, inTransit, soonest} for a model (optionally a grade). */
export function availability(s, modelId, gradeId) {
  const units = s.stock_by_site.filter((u) => u.model === modelId && (!gradeId || u.grade === gradeId));
  const onLot = units.filter((u) => u.status !== 'in_transit' && u.site === HOME).length;
  const nearbyUnits = units.filter((u) => u.status !== 'in_transit' && u.site !== HOME);
  const transit = units.filter((u) => u.status === 'in_transit');
  let soonest;
  if (onLot) soonest = 'Today at Parramatta';
  else if (nearbyUnits.length) {
    const best = nearbyUnits.map((u) => ({ u, t: transferOf(s, u.site) })).sort((a, b) => (a.t?.lead_days ?? 9) - (b.t?.lead_days ?? 9))[0];
    soonest = best.t ? `${best.t.run_day} transfer from ${best.t.from_name} (${best.t.distance_km} km)` : `Transfer from ${siteName(s, best.u.site)}`;
  } else if (transit.length) soonest = `~${Math.min(...transit.map((u) => u.transit ?? u.eta_days ?? 14))} days (inbound)`;
  else {
    const ob = s.order_bank_eta.find((o) => o.model === modelId);
    soonest = ob ? `Factory order ${ob.label || `${ob.eta_weeks_min}-${ob.eta_weeks_max} weeks`}` : 'Factory order — ETA to confirm';
  }
  return { onLot, nearby: nearbyUnits.length, inTransit: transit.length, soonest };
}

const fmt$ = (n) => `$${Number(n).toLocaleString('en-AU')}`;
function unitLine(s, u) {
  const m = modelById(u.model); const g = gradeOf(u.model, u.grade);
  const where = u.status === 'in_transit' ? `in transit to ${siteName(s, u.site)}, ETA ${u.transit ?? u.eta_days} days` : `${siteName(s, u.site)}, ${u.age} days in stock`;
  const price = priceOf({ modelId: u.model, gradeId: u.grade, colourId: u.colour, interiorId: u.interior, packs: u.packs });
  return `${u.id}: ${m?.name || u.model} ${g?.name || u.grade}, ${colourById(u.colour)?.name || u.colour}, ${interiorById(u.interior)?.name || u.interior}${u.packs.length ? `, packs ${u.packs.join('+')}` : ''} — ${where}${price ? `, ${fmt$(price)} drive-away` : ''}${u.bonus ? `, bonus headroom ${fmt$(u.bonus)} (priority ${u.priority}, ${u.reason_code})` : ''}`;
}

/** Compact plain-text stock summary for the LLM / the agent's HTTP context agent. */
export function stockSummary(s, modelIds = []) {
  const ids = modelIds.length ? modelIds : [...new Set(s.stock_by_site.map((u) => u.model))];
  const lines = [`DOMO STOCK FEED (Harbourline DMS, refreshed ${s.refreshed_at}). Home site Parramatta (par).`];
  const tr = s.transfer_feasibility.map((t) => `${t.from_name} ${t.distance_km} km, ${t.run_day} run`).join('; ');
  if (tr) lines.push(`Transfers to Parramatta: ${tr}.`);
  for (const id of ids) {
    const units = s.stock_by_site.filter((u) => u.model === id);
    const ob = s.order_bank_eta.find((o) => o.model === id);
    lines.push(`${modelById(id)?.name || id}: ${units.length} unit(s)${ob ? `; factory order ETA ${ob.label}${ob.note ? ` (${ob.note})` : ''}` : ''}.`);
    for (const u of units) lines.push(`  - ${unitLine(s, u)}`);
  }
  return lines.join('\n');
}

/** Ranked aged-stock offers for /api/offers. */
export function offers(s, { model, body } = {}) {
  const bodyType = body || modelById(model)?.body;
  const rows = [];
  for (const a of s.aged_stock_actions) {
    const u = s.stock_by_site.find((x) => x.id === (a.unit_id || a.unitId));
    if (!u) continue;
    const m = modelById(u.model);
    const sameBody = Boolean(bodyType && m?.body === bodyType);
    const bonus = a.incentive_headroom ?? u.bonus ?? 0;
    const age = a.days_in_stock ?? u.age;
    const reasonBits = [`${age} days in stock`, bonus ? `${fmt$(bonus)} bonus headroom` : null,
      u.site !== HOME ? `at ${siteName(s, u.site)}${transferOf(s, u.site) ? ` (${transferOf(s, u.site).run_day} transfer)` : ''}` : 'at Parramatta',
      sameBody ? `same body type as your ${modelById(model)?.name || 'build'}` : null];
    rows.push({
      unitId: u.id, modelId: u.model, gradeId: u.grade, colourId: u.colour,
      price: priceOf({ modelId: u.model, gradeId: u.grade, colourId: u.colour, interiorId: u.interior, packs: u.packs }),
      bonus, site: u.site, age, priority: a.move_priority ?? u.priority ?? 99,
      placement: sameBody ? 'build_ribbon' : 'stage_strip',
      reason: reasonBits.filter(Boolean).join(' · '),
      _same: sameBody ? 0 : 1,
    });
  }
  rows.sort((a, b) => a._same - b._same || a.priority - b.priority);
  return rows.map(({ _same, ...r }) => r);
}

/** Best stock unit for a model (prefer colour, then grade, then home site, then priority/age). */
export function bestUnit(s, modelId, { colourId, gradeId, exclude = new Set() } = {}) {
  const units = s.stock_by_site.filter((u) => u.model === modelId && !exclude.has(u.id));
  const score = (u) => (colourId && u.colour === colourId ? 0 : 10) + (gradeId && u.grade === gradeId ? 0 : 3) + (u.site === HOME ? 0 : 1) + (u.status === 'in_transit' ? 2 : 0);
  return units.sort((a, b) => score(a) - score(b) || (a.priority ?? 99) - (b.priority ?? 99) || b.age - a.age)[0] || null;
}

/** One-paragraph catalogue summary per model, for finder prompts. */
export function catalogSummary() {
  const c = catalog();
  return c.models.map((m) => `${m.id} | ${m.name} | ${m.bodyLabel || m.body} | ${m.powertrainLabel || m.powertrain} | ${m.seats} seats | tow ${m.towKg || 0} kg | from ${fmt$(m.fromPrice)} | grades: ${m.grades.map((g) => `${g.id} ${fmt$(g.price)}${g.drive ? ` ${g.drive}` : ''}`).join(', ')} | tags: ${(m.tags || []).join(',')}`).join('\n');
}
