// dealer.mjs — dealer-side business data: priorities (editable weights), promotions,
// and the "dealer factor" that nudges finder and offer ranking.
//
// Data: content/dealer/*.json (stand-in, fictional). Writable state
// (priorities.json, bookings.json) lives in DEALER_STATE_DIR when set, else in
// content/dealer. If that directory is not writable (e.g. the container's content/
// is root-owned), the first write switches state to <os tmpdir>/harbourline-dealer
// and logs a warning, so the prototype keeps working (state is then ephemeral).
//
// Dealer factor (applied after fit scoring, finder ARAG path and fallback alike):
//   + stockOnLot/100 × 6   if the model has a unit on any Harbourline lot
//   + agedStock/100  × 6   if the model has an aged unit with incentive headroom
//   + pushModel.weight/100 × 8  for the pushed model
//   + promotions/100 × 4   if a live promotion applies to the model
//   capped at 12 fit points. Recommendation order = fit + dealerFactor.
// The customer-facing `nudge.reason` never mentions age, headroom, margins or targets.
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, statSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ROOT } from './env.mjs';
import { catalog, modelById, siteName } from './data.mjs';

const SEED_DIR = join(ROOT, 'content', 'dealer');
let STATE_DIR = process.env.DEALER_STATE_DIR || SEED_DIR;
const STATE_FILES = new Set(['priorities.json', 'bookings.json']);

// ── JSON IO ──────────────────────────────────────────────────────────────────
const cache = new Map(); // path → {mtime, data}
function pathFor(name) {
  if (STATE_FILES.has(name)) {
    const p = join(STATE_DIR, name);
    if (existsSync(p)) return p;
  }
  return join(SEED_DIR, name);
}
export function readDealer(name, fallback) {
  const p = pathFor(name);
  if (!existsSync(p)) return fallback;
  const m = statSync(p).mtimeMs;
  const c = cache.get(p);
  if (c && c.mtime === m) return c.data;
  try {
    const data = JSON.parse(readFileSync(p, 'utf8'));
    cache.set(p, { mtime: m, data });
    return data;
  } catch (e) {
    console.warn(`[dealer] cannot parse ${name}: ${e.message}`);
    return c ? c.data : fallback;
  }
}

function writeAtomic(dir, name, data) {
  mkdirSync(dir, { recursive: true });
  const p = join(dir, name);
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tmp, p); // atomic on the same filesystem
  cache.set(p, { mtime: statSync(p).mtimeMs, data });
}
let writeChain = Promise.resolve();
/** Serialised atomic write of a state file. Falls back to a tmp dir if the state dir is read-only. */
export function writeDealer(name, data) {
  const job = writeChain.then(() => {
    try { writeAtomic(STATE_DIR, name, data); }
    catch (e) {
      if (!['EACCES', 'EROFS', 'EPERM'].includes(e.code)) throw e;
      const alt = join(tmpdir(), 'harbourline-dealer');
      console.warn(`[dealer] ${STATE_DIR} is not writable (${e.code}); dealer state now in ${alt} (ephemeral)`);
      mkdirSync(alt, { recursive: true });
      for (const f of STATE_FILES) if (f !== name && !existsSync(join(alt, f)) && existsSync(pathFor(f))) copyFileSync(pathFor(f), join(alt, f));
      STATE_DIR = alt;
      writeAtomic(STATE_DIR, name, data);
    }
    return data;
  });
  writeChain = job.catch(() => {});
  return job;
}

// ── priorities ───────────────────────────────────────────────────────────────
const DEFAULT_PRIORITIES = {
  updatedAt: '2026-10-13T09:00:00+11:00', updatedBy: 'Sales manager (demo)',
  weights: { stockOnLot: 60, agedStock: 70, promotions: 40, pushModel: { modelId: 'kluger', weight: 50 } },
  note: 'Clear aged RAV4/Kluger before December; Kluger hybrid allocation is strong this quarter.',
};
export const priorities = () => readDealer('priorities.json', DEFAULT_PRIORITIES);

/** Validate a PUT body. Returns {value} or {error}. */
export function validatePriorities(body, current = priorities()) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'body must be an object' };
  const w = body.weights;
  if (!w || typeof w !== 'object' || Array.isArray(w)) return { error: 'weights is required' };
  const int = (v) => Number.isInteger(v) && v >= 0 && v <= 100;
  for (const k of ['stockOnLot', 'agedStock', 'promotions']) if (!int(w[k])) return { error: `weights.${k} must be an integer 0-100` };
  let pushModel = { modelId: null, weight: 0 };
  if (w.pushModel != null) {
    if (typeof w.pushModel !== 'object' || Array.isArray(w.pushModel)) return { error: 'weights.pushModel must be an object or null' };
    const { modelId = null, weight } = w.pushModel;
    if (modelId !== null && (typeof modelId !== 'string' || !modelById(modelId))) return { error: 'weights.pushModel.modelId must be a catalogue model id or null' };
    if (!int(weight)) return { error: 'weights.pushModel.weight must be an integer 0-100' };
    pushModel = { modelId, weight };
  }
  if (body.note != null && typeof body.note !== 'string') return { error: 'note must be a string' };
  if (body.updatedBy != null && typeof body.updatedBy !== 'string') return { error: 'updatedBy must be a string' };
  const clip = (s, n) => String(s).replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, n);
  return {
    value: {
      updatedAt: new Date().toISOString(),
      updatedBy: body.updatedBy && body.updatedBy.trim() ? clip(body.updatedBy, 80) : (current.updatedBy || 'Sales manager (demo)'),
      weights: { stockOnLot: w.stockOnLot, agedStock: w.agedStock, promotions: w.promotions, pushModel },
      note: body.note != null ? clip(body.note, 500) : (current.note || ''),
    },
  };
}
export const savePriorities = (value) => writeDealer('priorities.json', value);

// ── promotions ───────────────────────────────────────────────────────────────
const todayYmd = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
const PUBLIC_PROMO_KEYS = ['id', 'title', 'kind', 'value', 'desc', 'reason', 'appliesTo', 'validUntil'];
const publicPromo = (p) => Object.fromEntries(PUBLIC_PROMO_KEYS.map((k) => [k, p[k] ?? null]));

/** Live (not expired) promotions with the internal `short` phrase. */
export function allPromotions() {
  const t = todayYmd();
  return (readDealer('promotions.json', { promotions: [] }).promotions || []).filter((p) => p && p.id && (!p.validUntil || p.validUntil >= t));
}

/** True when the unit is on the Domo aged-stock actions list (or aged with a bonus). */
export function isAged(s, u) {
  return s.aged_stock_actions.some((a) => (a.unit_id || a.unitId) === u.id) || (u.age >= 60 && u.bonus > 0);
}
const headroomOf = (s, u) => { const a = s.aged_stock_actions.find((x) => (x.unit_id || x.unitId) === u.id); return a?.incentive_headroom ?? u.bonus ?? 0; };

function promoMatchesUnit(p, u, s) {
  const a = p.appliesTo || {};
  const m = modelById(u.model);
  if (a.models && !a.models.includes(u.model)) return false;
  if (a.units && !a.units.includes(u.id)) return false;
  if (a.bodies && !(m && a.bodies.includes(m.body))) return false;
  if (a.aged && !isAged(s, u)) return false;
  if (a.onLot && u.status === 'in_transit') return false;
  return true;
}
/** A promotion applies to a model when it matches the model and (if unit-bound) a stock unit of it. */
function promoMatchesModel(p, modelId, s) {
  const a = p.appliesTo || {};
  const m = modelById(modelId);
  if (!m) return false;
  if (a.models && !a.models.includes(modelId)) return false;
  if (a.bodies && !a.bodies.includes(m.body)) return false;
  if (a.units || a.aged || a.onLot) return s.stock_by_site.some((u) => u.model === modelId && promoMatchesUnit(p, u, s));
  return true;
}
// Most specific first: unit-bound, then model-bound, then body, then the rest; higher value first.
const specificity = (p) => (p.appliesTo?.units ? 0 : p.appliesTo?.models ? 1 : p.appliesTo?.bodies ? 2 : 3);
const sortPromos = (arr) => arr.sort((a, b) => specificity(a) - specificity(b) || (b.value || 0) - (a.value || 0));

/**
 * Promotions matching every given filter (all live promotions when none).
 * Returns internal objects (with `short`) when `internal`, else the public shape.
 */
export function promotionsFor(s, { model, unit, body } = {}, { internal = false } = {}) {
  let list = allPromotions();
  if (unit) {
    const u = s.stock_by_site.find((x) => x.id === unit);
    list = u ? list.filter((p) => promoMatchesUnit(p, u, s)) : [];
  }
  if (model) list = list.filter((p) => promoMatchesModel(p, model, s));
  if (body) list = list.filter((p) => catalog().models.some((m) => m.body === body && promoMatchesModel(p, m.id, s)));
  sortPromos(list);
  return internal ? list : list.map(publicPromo);
}
export const promotionById = (id) => allPromotions().find((p) => p.id === id);

// ── dealer factor ────────────────────────────────────────────────────────────
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Dealer factor for a model under the given priorities.
 * Returns {dealerFactor, nudge, parts} — `parts` is for tracing/prompting only.
 */
export function dealerFactorFor(modelId, s, pr = priorities()) {
  const w = pr?.weights || {};
  const m = modelById(modelId);
  const units = s.stock_by_site.filter((u) => u.model === modelId);
  const onLot = units.filter((u) => u.status !== 'in_transit');
  const aged = units.filter((u) => isAged(s, u) && headroomOf(s, u) > 0);
  const promos = promotionsFor(s, { model: modelId }, { internal: true });
  const parts = {};
  if (onLot.length && w.stockOnLot > 0) parts.stockOnLot = (w.stockOnLot / 100) * 6;
  if (aged.length && w.agedStock > 0) parts.agedStock = (w.agedStock / 100) * 6;
  if (w.pushModel?.modelId === modelId && w.pushModel.weight > 0) parts.pushModel = (w.pushModel.weight / 100) * 8;
  if (promos.length && w.promotions > 0) parts.promotions = (w.promotions / 100) * 4;
  const dealerFactor = round1(Math.min(12, Object.values(parts).reduce((a, b) => a + b, 0)));
  if (!dealerFactor || !m) return { dealerFactor: 0, nudge: null, parts, promo: null };

  // Customer-safe sentence from the parts that contributed.
  const promo = parts.promotions ? promos[0] : null;
  let lead;
  if (parts.stockOnLot) {
    const home = onLot.filter((u) => u.site === 'par').length;
    if (home) lead = `We have ${NUM[home] || home} ${m.name}${home > 1 ? 's' : ''} on the lot at Parramatta ready to drive`;
    else {
      const bySite = {}; for (const u of onLot) bySite[u.site] = (bySite[u.site] || 0) + 1;
      const [site, n] = Object.entries(bySite).sort((a, b) => b[1] - a[1])[0];
      lead = `We have ${NUM[n] || n} ${m.name}${n > 1 ? 's' : ''} at our ${siteName(s, site)} site, a short transfer away`;
    }
  } else if (parts.pushModel) lead = `We have strong ${m.name} supply this quarter, so we can move quickly`;
  else if (parts.agedStock) lead = `There's a ${m.name} in stock we can be sharp on`;
  let reason;
  if (lead && promo) reason = `${lead}, and can include ${promo.short || promo.title.toLowerCase()}.`;
  else if (lead && parts.agedStock && parts.stockOnLot) reason = `${lead}, and there's room to sharpen the price on one of them.`;
  else if (lead) reason = `${lead}.`;
  else if (promo) reason = `Right now this one comes with ${promo.short || promo.title.toLowerCase()}.`;
  else reason = `We can have a ${m.name} ready for you quickly.`;
  return { dealerFactor, nudge: { reason, ...(promo ? { promotionId: promo.id } : {}) }, parts, promo };
}

/** Text block for ARAG prompts. */
export function prioritiesText(pr, modelIds, s) {
  const w = pr.weights;
  const push = w.pushModel?.modelId ? `${modelById(w.pushModel.modelId)?.name || w.pushModel.modelId} (${w.pushModel.weight})` : 'none';
  const lines = [`DEALER PRIORITIES (business weights 0-100; a small tie-breaker only, never a reason to recommend a car that does not fit): stock on lot ${w.stockOnLot}, aged stock ${w.agedStock}, promotions ${w.promotions}, push model ${push}.`];
  for (const id of modelIds) {
    const df = dealerFactorFor(id, s, pr);
    if (df.dealerFactor) lines.push(`- ${id}: dealer factor ${df.dealerFactor}; customer-safe angle: ${df.nudge.reason}${df.promo ? ` Promotion ${df.promo.id}: ${df.promo.title}.` : ''}`);
  }
  return lines.join('\n');
}

/** Text block of promotions for the /ask extra_context. */
export function promotionsText(promos) {
  if (!promos.length) return null;
  return ['DEALER PROMOTIONS (the ONLY promotions that exist; quote only these, exactly as described, and explain honestly why each is offered):',
    ...promos.map((p) => {
      const a = p.appliesTo || {};
      const scope = [a.units ? `unit ${a.units.join(', ')}` : null, a.models ? `models ${a.models.map((id) => modelById(id)?.name || id).join(', ')}` : null, a.bodies ? `body ${a.bodies.join(', ')}` : null, a.aged ? 'older stock units only' : null, a.onLot ? 'cars on our lots only' : null].filter(Boolean).join('; ') || 'any car';
      return `- [${p.id}] ${p.title}${p.value ? ` (value $${p.value.toLocaleString('en-AU')})` : ''}: ${p.desc} Why we offer it: ${p.reason} Applies to: ${scope}. Valid until ${p.validUntil}.`;
    })].join('\n');
}

/**
 * Re-rank /api/offers rows with the dealer weights and attach `promotions:[id]`.
 * Order: same body type first (unchanged), then effective priority ascending where
 *   effective = move priority − pushModel.weight/100 × 3 (pushed model)
 *                             − promotions/100 × 2 (a promotion applies to the unit).
 */
export function rankOffers(rows, s, pr = priorities()) {
  const w = pr?.weights || {};
  const out = rows.map((r, i) => {
    const promos = promotionsFor(s, { unit: r.unitId }).map((p) => p.id);
    const boost = (w.pushModel?.modelId === r.modelId ? (w.pushModel.weight || 0) / 100 * 3 : 0) + (promos.length ? (w.promotions || 0) / 100 * 2 : 0);
    return { r: { ...r, promotions: promos }, i, same: r.placement === 'build_ribbon' ? 0 : 1, eff: r.priority - boost };
  });
  out.sort((a, b) => a.same - b.same || a.eff - b.eff || a.i - b.i);
  return out.map((x) => x.r);
}
