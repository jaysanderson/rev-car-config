// dealer.mjs — dealer-side business logic: priorities (derived from Domo), the
// promotion filters, and the "dealer factor" that nudges finder and offer ranking.
//
// Priorities are no longer edited by a business user. They are COMPUTED from the Domo
// Intelligence output `dealer_signals` (content/domo/dealer_signals.json, refreshed
// nightly from the ERP) plus the aged-stock list, by derivePriorities():
//   stockOnLot  = unit-weighted average days of supply, scaled 20 → 0 … 90 → 100
//   agedStock   = aged units with headroom: count × 7 + (average age − 60) × 1.2
//   promotions  = unit-weighted average marginHeadroomAvg, scaled $0 → 0 … $2,500 → 100
//   pushModel   = model with the highest allocationNextMonth + 2 × targetGap (only
//                 when that score ≥ 8 and the model is not supply-constrained);
//                 weight = score × 2.5
// All weights are integers 0-100, the same `weights` shape as before, so the dealer
// factor, offer ranking and prompts are unchanged. `derivedFrom` explains each one.
//
// Promotions are composed by server/promotions.mjs (Domo targets + ARAG); this file
// only filters them.
//
// Dealer factor (applied after fit scoring, finder ARAG path and fallback alike):
//   + stockOnLot/100 × 6   if the model has a unit on any Harbourline lot
//   + agedStock/100  × 6   if the model has an aged unit with incentive headroom
//   + pushModel.weight/100 × 8  for the pushed model
//   + promotions/100 × 4   if a live promotion applies to the model
//   capped at 12 fit points. Recommendation order = fit + dealerFactor.
// The customer-facing `nudge.reason` never mentions age, headroom, margins or targets.
import { catalog, modelById, siteName, isAged, headroomOf, fmtAud } from './data.mjs';
import { readDealer, writeDealer } from './state.mjs';
import { currentPromotions, usePriorities } from './promotions.mjs';

export { readDealer, writeDealer, isAged };

// ── priorities (derived from Domo dealer_signals) ────────────────────────────
const clamp100 = (n) => Math.max(0, Math.min(100, Math.round(n)));
const nameOf = (id) => modelById(id)?.name || id;
export const PRIORITIES_SOURCE = 'Domo · dealer_signals (nightly)';

/**
 * Compute dealer priorities from Domo signals and stock.
 * @param {Array<{model,unitsInStock,daysOfSupply,allocationNextMonth,targetGap,avgDaysInStock,marginHeadroomAvg}>} signals
 * @param {object} s stock() datasets (stock_by_site, aged_stock_actions)
 */
export function derivePriorities(signals, s, { refreshedAt = null, now = new Date() } = {}) {
  const rows = (signals || []).filter((r) => modelById(r.model));
  const derivedFrom = [];
  const stocked = rows.filter((r) => r.unitsInStock > 0);
  const units = stocked.reduce((n, r) => n + r.unitsInStock, 0);

  // stock on lot ← unit-weighted average days of supply
  const avgDos = units ? stocked.reduce((n, r) => n + r.daysOfSupply * r.unitsInStock, 0) / units : 0;
  const stockOnLot = clamp100(((avgDos - 20) / 70) * 100);
  const longest = [...stocked].sort((a, b) => b.daysOfSupply - a.daysOfSupply).slice(0, 2);
  derivedFrom.push({ signal: 'daysOfSupply (average, weighted by units in stock)', value: Math.round(avgDos),
    effect: `${units} units in stock average ${Math.round(avgDos)} days of supply${longest.length ? ` (longest: ${longest.map((r) => `${nameOf(r.model)} ${r.daysOfSupply}`).join(', ')})` : ''} → stock-on-lot weight ${stockOnLot}` });

  // aged stock ← count and age of aged units that still have headroom
  const aged = (s?.stock_by_site || []).filter((u) => isAged(s, u) && headroomOf(s, u) > 0);
  const avgAge = aged.length ? aged.reduce((n, u) => n + (u.age || 0), 0) / aged.length : 0;
  const agedStock = aged.length ? clamp100(aged.length * 7 + (avgAge - 60) * 1.2) : 0;
  const oldest = [...aged].sort((a, b) => b.age - a.age)[0];
  derivedFrom.push({ signal: 'aged units with incentive headroom', value: aged.length,
    effect: aged.length ? `${aged.length} aged units with headroom, average ${Math.round(avgAge)} days in stock (oldest ${nameOf(oldest.model)} ${oldest.id} at ${oldest.age} days) → aged-stock weight ${agedStock}` : 'No aged units with headroom → aged-stock weight 0' });

  // promotions ← margin headroom
  const avgHeadroom = units ? stocked.reduce((n, r) => n + r.marginHeadroomAvg * r.unitsInStock, 0) / units : 0;
  const promotions = clamp100((avgHeadroom / 2500) * 100);
  const richest = [...stocked].sort((a, b) => b.marginHeadroomAvg - a.marginHeadroomAvg)[0];
  derivedFrom.push({ signal: 'marginHeadroomAvg (average, weighted by units in stock)', value: Math.round(avgHeadroom),
    effect: `Average incentive headroom is ${fmtAud(Math.round(avgHeadroom))} a unit${richest ? ` (highest ${nameOf(richest.model)} ${fmtAud(richest.marginHeadroomAvg)})` : ''} → promotions weight ${promotions}` });

  // push model ← strongest allocation + target gap (never a supply-constrained model)
  const constrained = (r) => r.allocationNextMonth <= 2 && r.daysOfSupply > 0 && r.daysOfSupply < 25;
  const pushScore = (r) => r.allocationNextMonth + 2 * Math.max(0, r.targetGap);
  const ranked = rows.filter((r) => !constrained(r)).sort((a, b) => pushScore(b) - pushScore(a) || b.allocationNextMonth - a.allocationNextMonth);
  const best = ranked[0];
  let pushModel = { modelId: null, weight: 0 };
  if (best && pushScore(best) >= 8) {
    pushModel = { modelId: best.model, weight: clamp100(pushScore(best) * 2.5) };
    derivedFrom.push({ signal: 'allocationNextMonth + targetGap', value: pushScore(best),
      effect: `${nameOf(best.model)} allocation next month is ${best.allocationNextMonth} against a target gap of ${best.targetGap} → push ${nameOf(best.model)} (weight ${pushModel.weight})` });
  } else derivedFrom.push({ signal: 'allocationNextMonth + targetGap', value: best ? pushScore(best) : 0, effect: 'No model has a strong enough allocation and target gap → no pushed model' });
  // Context lines (no weight of their own) so the drawer can show why others were not pushed.
  for (const r of rows.filter(constrained).filter((r) => r.targetGap > 0).slice(0, 2)) {
    derivedFrom.push({ signal: 'allocationNextMonth', value: r.allocationNextMonth, effect: `${nameOf(r.model)} allocation is constrained (${r.allocationNextMonth} next month, ${r.daysOfSupply} days of supply) → not pushed` });
  }
  const runnerUp = ranked.find((r) => r !== best && r.targetGap >= 3);
  if (runnerUp) derivedFrom.push({ signal: 'targetGap', value: runnerUp.targetGap, effect: `${nameOf(runnerUp.model)} is ${runnerUp.targetGap} units short of this month's target (allocation ${runnerUp.allocationNextMonth}) → gets its own promotion, not the push` });

  const computedAt = now.toISOString();
  const parts = [aged.length ? `clear ${aged.length} aged units` : null, pushModel.modelId ? `push ${nameOf(pushModel.modelId)} on allocation` : null, runnerUp ? `close the ${nameOf(runnerUp.model)} target gap` : null].filter(Boolean);
  return {
    source: PRIORITIES_SOURCE, refreshedAt, computedAt,
    updatedAt: computedAt, updatedBy: 'Domo Intelligence (derived)',
    weights: { stockOnLot, agedStock, promotions, pushModel },
    derivedFrom,
    note: parts.length ? `${parts.join('; ').replace(/^./, (c) => c.toUpperCase())}.` : 'No strong signals tonight.',
  };
}

// One derivation per stock() snapshot (stock is cached for 60 s).
const derivedCache = new WeakMap();
let lastDerived = null;
/** Derived priorities for a stock snapshot (the last one when `s` is omitted). */
export function priorities(s) {
  if (!s) return lastDerived || derivePriorities([], { stock_by_site: [], aged_stock_actions: [] });
  let p = derivedCache.get(s);
  if (!p) { p = derivePriorities(s.dealer_signals, s, { refreshedAt: s._refreshed?.dealer_signals || null }); derivedCache.set(s, p); lastDerived = p; }
  return p;
}
usePriorities(priorities);

// ── promotions ───────────────────────────────────────────────────────────────
const todayYmd = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
const PUBLIC_PROMO_KEYS = ['id', 'title', 'kind', 'value', 'desc', 'why', 'reason', 'appliesTo', 'validUntil', 'source', 'composedBy'];
const publicPromo = (p) => Object.fromEntries(PUBLIC_PROMO_KEYS.map((k) => [k, p[k] ?? null]));

/** Live (not expired) promotions with the internal `short` phrase (composed set; see promotions.mjs). */
export function allPromotions(s) {
  const t = todayYmd();
  return currentPromotions(s).filter((p) => p && p.id && (!p.validUntil || p.validUntil >= t));
}

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
  let list = allPromotions(s);
  if (unit) {
    const u = s.stock_by_site.find((x) => x.id === unit);
    list = u ? list.filter((p) => promoMatchesUnit(p, u, s)) : [];
  }
  if (model) list = list.filter((p) => promoMatchesModel(p, model, s));
  if (body) list = list.filter((p) => catalog().models.some((m) => m.body === body && promoMatchesModel(p, m.id, s)));
  sortPromos(list);
  return internal ? list : list.map(publicPromo);
}
export const promotionById = (id, s) => allPromotions(s).find((p) => p.id === id);

// ── dealer factor ────────────────────────────────────────────────────────────
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Dealer factor for a model under the given priorities.
 * Returns {dealerFactor, nudge, parts} — `parts` is for tracing/prompting only.
 */
export function dealerFactorFor(modelId, s, pr = priorities(s)) {
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
  const lines = [`DEALER PRIORITIES (weights 0-100 derived nightly by Domo from ERP signals; a small tie-breaker only, never a reason to recommend a car that does not fit): stock on lot ${w.stockOnLot}, aged stock ${w.agedStock}, promotions ${w.promotions}, push model ${push}.`];
  for (const id of modelIds) {
    const df = dealerFactorFor(id, s, pr);
    if (df.dealerFactor) lines.push(`- ${id}: dealer factor ${df.dealerFactor}; customer-safe angle: ${df.nudge.reason}${df.promo ? ` Promotion ${df.promo.id}: ${df.promo.title}.` : ''}`);
  }
  return lines.join('\n');
}

/** Text block of promotions for the /ask extra_context. */
export function promotionsText(promos) {
  if (!promos.length) return null;
  return ['DEALER PROMOTIONS (the ONLY promotions that exist; quote only these, exactly as described, and explain honestly why each is offered, using the customer-safe "Why" line):',
    ...promos.map((p) => {
      const a = p.appliesTo || {};
      const scope = [a.units ? `unit ${a.units.join(', ')}` : null, a.models ? `models ${a.models.map((id) => modelById(id)?.name || id).join(', ')}` : null, a.bodies ? `body ${a.bodies.join(', ')}` : null, a.aged ? 'older stock units only' : null, a.onLot ? 'cars on our lots only' : null].filter(Boolean).join('; ') || 'any car';
      return `- [${p.id}] ${p.title}${p.value ? ` (value $${p.value.toLocaleString('en-AU')})` : ''}: ${p.desc} Why (customer-safe): ${p.why || 'a current dealer offer'} Dealer-internal reason (never quote): ${p.reason} Applies to: ${scope}. Valid until ${p.validUntil}.`;
    })].join('\n');
}

/**
 * Re-rank /api/offers rows with the dealer weights and attach `promotions:[id]`.
 * Order: same body type first (unchanged), then effective priority ascending where
 *   effective = move priority − pushModel.weight/100 × 3 (pushed model)
 *                             − promotions/100 × 2 (a promotion applies to the unit).
 */
export function rankOffers(rows, s, pr = priorities(s)) {
  const w = pr?.weights || {};
  const out = rows.map((r, i) => {
    const promos = promotionsFor(s, { unit: r.unitId }).map((p) => p.id);
    const boost = (w.pushModel?.modelId === r.modelId ? (w.pushModel.weight || 0) / 100 * 3 : 0) + (promos.length ? (w.promotions || 0) / 100 * 2 : 0);
    return { r: { ...r, promotions: promos }, i, same: r.placement === 'build_ribbon' ? 0 : 1, eff: r.priority - boost };
  });
  out.sort((a, b) => a.same - b.same || a.eff - b.eff || a.i - b.i);
  return out.map((x) => x.r);
}
