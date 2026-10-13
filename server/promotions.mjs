// promotions.mjs — promotions composed from Domo (what to push) + Progress Agentic
// RAG (what the offer says), validated against the catalogue.
//
// 1. selectTargets(s, pr): Domo decides WHAT to promote, from dealer_signals,
//    aged_stock_actions and the derived priorities (server/dealer.mjs):
//      aged-<model>  aged units with incentive headroom, grouped by model
//      push-<model>  the pushed model (strongest allocation + target gap)
//      gap-<model>   other models ≥ 3 units short of this month's target
//      body-<body>   body types whose unit-weighted days of supply is ≥ 55 (≥ 4 units)
// 2. composeTarget(): one ARAG /ask per target (run 4 at a time), answer_json_schema
//    constrained to the kinds allowed for that target, retrieval filtered to the
//    accessories, service, finance, towing, dealer-policy and warranty documents. The
//    agent writes title / short / desc / why / value; the code validates:
//      • kind ∈ the target's allowed kinds (accessory-bundle | servicing | trade-in |
//        finance | delivery)
//      • accessory-bundle: packs ⊆ the model's configurator packs not already fitted to
//        the target units; value ≤ the real catalogue price sum of the named packs (of
//        all allowed packs when none are named)
//      • servicing: 1-3 years (never more), value ≤ years × services a year × the
//        capped price per service (SERVICE below, from content/kb/service.md), and ≤ the
//        unit headroom for aged targets
//      • trade-in: $250 ≤ value ≤ the unit headroom (aged) or $1,000
//      • finance / delivery: value null; finance text always carries the credit caveat
//      • no percentages, every $ amount in the text must be the value, a pack price or a
//        service price, and customer-facing text (title, short, desc, why) never
//        mentions age, headroom, margin, targets or allocation.
//    A target whose ARAG answer fails validation gets a deterministic promotion
//    (composedBy "fallback") and the rejection reason is kept for /explain.
// 3. Cache: the composed set lives in memory for PROMO_TTL_MIN (default 30) minutes or
//    until the Domo signature changes, and the last set with at least one ARAG-composed
//    promotion is persisted to promotions.generated.json (state dir, see state.mjs) so
//    restarts are instant. Refreshes run in the background; callers always get the
//    current set synchronously. If ARAG is not configured or unreachable and there is
//    no previous good set, content/dealer/promotions.json (static) is served.
import * as arag from './arag.mjs';
import { catalog, modelById, colourById, isAged, headroomOf, fmtAud, modelsMentioned } from './data.mjs';
import { readDealer, writeDealer } from './state.mjs';

export const KINDS = ['accessory-bundle', 'servicing', 'trade-in', 'finance', 'delivery'];
const TTL_MS = Number(process.env.PROMO_TTL_MIN || 30) * 60000;
const RETRY_MS = 5 * 60000; // after an unreachable ARAG
const KB_TOPICS = ['accessories', 'service', 'finance', 'towing', 'dealer-policy', 'warranty'];
// Genuine accessories cost the dealer roughly 70% of the fitted retail price, so an
// accessory bundle's retail value may be at most headroom ÷ 0.7 when Domo reports headroom.
const ACCESSORY_COST_RATIO = 0.7;

// Toyota Service Advantage: services a year and the top of the indicative capped price
// per service (content/kb/service.md). Used only as a validation ceiling.
const SERVICE = {
  'yaris-cross': [1, 300], corolla: [1, 300], 'corolla-cross': [1, 325], 'c-hr': [1, 325], camry: [1, 325], rav4: [1, 325],
  kluger: [1, 350], bz4x: [1, 300], 'gr-yaris': [1, 350], 'gr-corolla': [1, 350], gr86: [1, 350],
  hilux: [2, 350], fortuner: [2, 350], prado: [2, 395], 'landcruiser-300': [2, 450],
};
const serviceYearCost = (id) => { const [n, p] = SERVICE[id] || [1, 350]; return n * p; };

const nameOf = (id) => modelById(id)?.name || id;
const packOf = (id) => catalog().accessories.find((a) => a.id === id);
const bodyLabel = (body) => catalog().models.find((m) => m.body === body)?.bodyLabel || body;
const sydneyToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
function endOfMonth(ymd, plusMonths = 0) {
  const [y, m] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m + plusMonths, 0)).toISOString().slice(0, 10);
}
function endOfQuarterAfter(ymd, days) {
  const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days);
  const q = Math.floor(d.getUTCMonth() / 3);
  return new Date(Date.UTC(d.getUTCFullYear(), q * 3 + 3, 0)).toISOString().slice(0, 10);
}

// ── 1. Domo targets ──────────────────────────────────────────────────────────
export function selectTargets(s, pr) {
  const sig = new Map((s.dealer_signals || []).map((r) => [r.model, r]));
  const today = sydneyToday();
  const agedUntil = endOfMonth(today, 1);
  const laterUntil = endOfQuarterAfter(today, 45);
  const targets = [];

  // aged units with headroom, grouped by model (most urgent model first)
  const byModel = new Map();
  for (const u of s.stock_by_site.filter((x) => isAged(s, x) && headroomOf(s, x) > 0)) {
    if (!byModel.has(u.model)) byModel.set(u.model, []);
    byModel.get(u.model).push(u);
  }
  const prio = (u) => s.aged_stock_actions.find((a) => (a.unit_id || a.unitId) === u.id)?.move_priority ?? u.priority ?? 99;
  for (const [model, units] of [...byModel].sort((a, b) => Math.min(...a[1].map(prio)) - Math.min(...b[1].map(prio)))) {
    units.sort((a, b) => b.age - a.age);
    const headroom = Math.min(...units.map((u) => headroomOf(s, u)));
    const fitted = new Set(units.flatMap((u) => u.packs || []));
    targets.push({
      id: `aged-${model}`, type: 'aged-stock', models: [model], units: units.map((u) => u.id), headroom,
      kinds: ['servicing', 'trade-in', 'accessory-bundle'],
      packs: (modelById(model)?.accessories || []).filter((p) => !fitted.has(p)),
      appliesTo: { models: [model], units: units.map((u) => u.id), aged: true, bodies: null },
      validUntil: agedUntil,
      signal: `aged_stock_actions: ${units.map((u) => `${u.id} ${nameOf(model)} ${u.age} days in stock, ${fmtAud(headroomOf(s, u))} headroom`).join('; ')}`,
      reason: `${units.length > 1 ? `${units.length} ${nameOf(model)}s are` : `${units[0].id} is`} aged (${units.map((u) => `${u.age} days`).join(', ')}) with ${fmtAud(headroom)}+ approved headroom; a value-add moves ${units.length > 1 ? 'them' : 'it'} without cutting the advertised price.`,
    });
  }

  // pushed model
  const push = pr?.weights?.pushModel;
  if (push?.modelId && modelById(push.modelId)) {
    const r = sig.get(push.modelId) || {};
    targets.push({
      id: `push-${push.modelId}`, type: 'push-model', models: [push.modelId], units: null, headroom: r.marginHeadroomAvg || 0,
      kinds: ['accessory-bundle', 'servicing', 'finance'], packs: modelById(push.modelId).accessories || [],
      appliesTo: { models: [push.modelId], units: null, aged: false, bodies: null }, validUntil: laterUntil,
      signal: `dealer_signals: ${nameOf(push.modelId)} allocationNextMonth ${r.allocationNextMonth}, targetGap ${r.targetGap} → pushModel (weight ${push.weight})`,
      reason: `${nameOf(push.modelId)} allocation next month is ${r.allocationNextMonth} against a target gap of ${r.targetGap}; a value-add moves volume while protecting the drive-away price.`,
    });
  }

  // other models with a real target gap
  for (const r of [...sig.values()].filter((x) => x.targetGap >= 3 && x.model !== push?.modelId && modelById(x.model)).sort((a, b) => b.targetGap - a.targetGap)) {
    targets.push({
      id: `gap-${r.model}`, type: 'target-gap', models: [r.model], units: null, headroom: r.marginHeadroomAvg || 0,
      kinds: ['accessory-bundle', 'trade-in', 'servicing'], packs: modelById(r.model).accessories || [],
      appliesTo: { models: [r.model], units: null, aged: false, bodies: null }, validUntil: laterUntil,
      signal: `dealer_signals: ${nameOf(r.model)} targetGap ${r.targetGap} this month, allocationNextMonth ${r.allocationNextMonth}`,
      reason: `${nameOf(r.model)} is ${r.targetGap} units short of this month's retail target with ${r.allocationNextMonth} more arriving next month.`,
    });
  }

  // body types with high days of supply
  const bodies = new Map();
  for (const r of sig.values()) {
    const m = modelById(r.model); if (!m || !r.unitsInStock) continue;
    const b = bodies.get(m.body) || { units: 0, dos: 0, models: [] };
    b.units += r.unitsInStock; b.dos += r.daysOfSupply * r.unitsInStock; b.models.push(r);
    bodies.set(m.body, b);
  }
  for (const [body, b] of [...bodies].map(([k, v]) => [k, { ...v, avg: Math.round(v.dos / v.units) }]).filter(([, v]) => v.units >= 4 && v.avg >= 55).sort((a, b) => b[1].avg - a[1].avg)) {
    const ids = b.models.map((r) => r.model);
    targets.push({
      id: `body-${body}`, type: 'body-supply', models: ids, units: null, headroom: 0,
      kinds: ['finance', 'delivery'], packs: [],
      appliesTo: { models: null, units: null, aged: false, bodies: [body] }, validUntil: laterUntil,
      signal: `dealer_signals: ${bodyLabel(body)} days of supply ${b.avg} across ${b.units} units (${b.models.map((r) => `${nameOf(r.model)} ${r.daysOfSupply}`).join(', ')})`,
      reason: `${bodyLabel(body)} stock is running at ${b.avg} days of supply; an offer across the body type lifts the rate of sale.`,
    });
  }
  return targets;
}

// ── 2. ARAG composition + validation ─────────────────────────────────────────
const COMPOSE_SYSTEM = (t) => `You are the marketing manager at Harbourline Toyota (Sydney) writing ONE customer-facing promotion for the target below. Domo (the dealer's data platform) chose the target; you decide the offer and its wording.
Use ONLY facts from the knowledge base passages (Toyota Genuine accessory prices, Towing Pack contents, Toyota Service Advantage capped-price servicing, finance basics, dealer policy) and the CARS / LIMITS blocks.
Rules:
- kind: one of ${t.kinds.join(', ')} (listed in order of preference for this target).
- value: the customer value in AUD as a number. accessory-bundle: the sum of the fitted prices of the configurator packs you include (list their ids in "packs"). servicing: years (1-3, put it in "years") × scheduled services a year × the capped price per service for the model. trade-in: a bonus no higher than the LIMITS. finance or delivery: 0.
- title: at most 60 characters; include the dollar value when value > 0.
- short: a lowercase phrase that reads after "can include", e.g. "complimentary 3-year servicing".
- desc: one or two sentences saying exactly what is included and any conditions.
- why: one short customer-safe line on why this suits the car or the buyer.
- Never mention stock age, days in stock, headroom, margins, targets, allocation or why the dealer needs to sell. Never invent interest rates, percentages or prices that are not in the passages or LIMITS.`;

const SCHEMA = (t) => ({
  name: 'dealer_promotion', description: 'One customer-facing dealer promotion',
  parameters: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: t.kinds },
      title: { type: 'string' }, short: { type: 'string' }, desc: { type: 'string' }, why: { type: 'string' },
      value: { type: 'number', description: 'customer value in AUD; 0 for finance or delivery' },
      packs: { type: 'array', items: { type: 'string', enum: ['tow', 'protection', 'roof'] } },
      years: { type: 'integer', description: 'servicing years (1-3); 0 otherwise' },
    },
    required: ['kind', 'title', 'short', 'desc', 'why', 'value', 'packs', 'years'],
  },
});

function limitsOf(t) {
  const packs = t.packs.map(packOf).filter(Boolean);
  const packSum = packs.reduce((n, p) => n + p.price, 0);
  const accessoryMax = t.headroom > 0 ? Math.min(packSum, Math.floor(t.headroom / ACCESSORY_COST_RATIO)) : packSum;
  const svcYear = Math.max(...t.models.map(serviceYearCost));
  let svcYears = 3;
  if (t.type === 'aged-stock' && t.headroom) svcYears = Math.max(1, Math.min(3, Math.floor(t.headroom / svcYear)));
  const tradeMax = t.type === 'aged-stock' && t.headroom ? Math.min(t.headroom, 2000) : 1000;
  return { packs, packSum, accessoryMax, svcYear, svcYears, svcMax: svcYears * svcYear, tradeMax };
}

function contextFor(t, s) {
  const L = limitsOf(t);
  const lines = [`TARGET (dealer-internal, chosen by Domo; never quote): ${t.signal}`, 'CARS:'];
  for (const id of t.models) {
    const m = modelById(id); if (!m) continue;
    lines.push(`- ${m.name} | ${m.bodyLabel || m.body} | ${m.powertrainLabel || m.powertrain} | braked towing ${m.towKg || 0} kg | Toyota Service Advantage: ${SERVICE[id]?.[0] || 1} scheduled service(s) a year, capped price up to ${fmtAud(SERVICE[id]?.[1] || 350)} each`);
  }
  for (const uid of t.units || []) {
    const u = s.stock_by_site.find((x) => x.id === uid);
    if (u) lines.push(`- stock unit ${u.id}: ${nameOf(u.model)} ${u.grade}, ${colourById(u.colour)?.name || u.colour}${u.packs.length ? `, already fitted with ${u.packs.map((p) => packOf(p)?.name || p).join(', ')}` : ''}`);
  }
  lines.push('LIMITS:');
  lines.push(`- allowed kinds: ${t.kinds.join(', ')}`);
  if (t.kinds.includes('accessory-bundle')) {
    if (!L.packs.length) lines.push('- accessory-bundle: no packs available');
    else {
      lines.push(`- accessory-bundle packs: ${L.packs.map((p) => `${p.id} = ${p.name} ${fmtAud(p.price)} fitted (${p.desc})`).join('; ')}.`);
      // Every pack combination the budget allows, with its exact value (the agent picks one).
      const combos = [];
      for (let mask = 1; mask < 1 << L.packs.length; mask++) {
        const set = L.packs.filter((_, i) => mask & (1 << i)); const sum = set.reduce((n, p) => n + p.price, 0);
        if (sum <= L.accessoryMax) combos.push(`${set.map((p) => p.id).join('+')} = ${fmtAud(sum)}`);
      }
      lines.push(combos.length ? `- accessory-bundle: choose exactly one of these bundles and use its value: ${combos.join('; ')}.` : '- accessory-bundle: no bundle fits the budget; choose another kind');
    }
  }
  if (t.kinds.includes('servicing')) lines.push(`- servicing: at most ${L.svcYears} year(s), value at most ${fmtAud(L.svcMax)}`);
  if (t.kinds.includes('trade-in')) lines.push(`- trade-in bonus: between $250 and ${fmtAud(L.tradeMax)}`);
  return lines.join('\n');
}

const INTERNAL = /\b(aged|ageing|aging|days? in stock|headroom|margin|floor ?plan|target|quota|allocation|days of supply|clear(ing)? (out|stock)|move (it|them|stock)|slow[- ]selling|old stock)\b/i;
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const CREDIT = 'Approved credit; fees, charges and conditions apply.';

/** Validate an agent answer for a target. Returns {promo} or {error}. */
export function validateComposed(j, t) {
  if (!j || typeof j !== 'object') return { error: 'no JSON answer' };
  const kind = String(j.kind || '');
  if (!t.kinds.includes(kind)) return { error: `kind "${kind}" not allowed for this target` };
  const title = clean(j.title, 70); const short = clean(j.short, 70).replace(/^[A-Z]/, (c) => c.toLowerCase()).replace(/\.$/, '');
  let desc = clean(j.desc, 600);
  if (desc.length > 420) desc = (desc.slice(0, 420).match(/^.*[.!?](?=\s|$)/) || [desc.slice(0, 417) + '…'])[0]; const why = clean(j.why, 120).replace(/\.$/, '');
  if (title.length < 8 || desc.length < 20 || why.length < 10 || short.length < 6) return { error: 'title/desc/why/short too short' };
  const text = `${title} ${short} ${desc} ${why}`;
  if (INTERNAL.test(text)) return { error: `customer text mentions "${text.match(INTERNAL)[0]}"` };
  if (/\d\s*%|per ?cent|p\.a\./i.test(text)) return { error: 'customer text quotes a rate or percentage' };
  const others = modelsMentioned(text).filter((id) => !t.models.includes(id));
  if (others.length) return { error: `customer text names ${others.map(nameOf).join(', ')}, outside this target` };
  if (/\b([4-9]|10|four|five|six|seven)[- ]years?\b/i.test(text) && kind === 'servicing') return { error: 'servicing longer than 3 years' };
  const L = limitsOf(t);
  let value = Number(j.value); if (!Number.isFinite(value)) value = 0;
  value = Math.round(value);
  let packs = [...new Set((Array.isArray(j.packs) ? j.packs : []).map(String))];
  let years = Number.isInteger(j.years) ? j.years : 0;
  if (kind === 'accessory-bundle') {
    if (packs.some((p) => !t.packs.includes(p))) return { error: `pack ${packs.find((p) => !t.packs.includes(p))} not available for this target` };
    const sum = packs.length ? packs.reduce((n, p) => n + packOf(p).price, 0) : L.packSum;
    if (!sum) return { error: 'no accessory packs available' };
    if (value <= 0 || value > sum) return { error: `accessory value ${fmtAud(value)} above the catalogue price of the packs (${fmtAud(sum)})` };
    if (packs.length && value !== sum) return { error: `accessory value ${fmtAud(value)} is not the catalogue price of ${packs.join('+')} (${fmtAud(sum)})` };
    if (value > L.accessoryMax) return { error: `accessory value ${fmtAud(value)} above what the headroom funds (${fmtAud(L.accessoryMax)})` };
  } else packs = [];
  if (kind === 'servicing') {
    if (years < 1 || years > 3) return { error: `servicing years ${years} (1-3 only)` };
    if (years > L.svcYears) return { error: `servicing ${years} years exceeds ${L.svcYears} for this target` };
    const max = years * L.svcYear;
    if (value <= 0 || value > max) return { error: `servicing value ${fmtAud(value)} above ${fmtAud(max)} (${years} × ${fmtAud(L.svcYear)}/year)` };
  } else years = 0;
  if (kind === 'trade-in' && (value < 250 || value > L.tradeMax)) return { error: `trade-in bonus ${fmtAud(value)} outside $250-${fmtAud(L.tradeMax)}` };
  if (kind === 'finance' || kind === 'delivery') value = null;
  // Every dollar amount must be a number we can stand behind: the title and short
  // phrase may quote only the value; desc and why may also quote a pack or service price.
  const amountsIn = (str) => (str.match(/\$\s?[\d,]+(\.\d+)?/g) || []).map((x) => Math.round(Number(x.replace(/[^\d.]/g, ''))));
  const headline = amountsIn(`${title} ${short}`).find((n) => n !== value);
  if (headline != null) return { error: `title quotes ${fmtAud(headline)} but the value is ${value == null ? 'none' : fmtAud(value)}` };
  const okAmounts = new Set([value, L.svcYear, ...L.packs.map((p) => p.price), ...t.models.map((id) => SERVICE[id]?.[1]), ...[1, 2, 3].map((y) => y * L.svcYear)].filter(Boolean));
  const bad = amountsIn(`${desc} ${why}`).find((n) => !okAmounts.has(n));
  if (bad != null) return { error: `text quotes ${fmtAud(bad)}, which is not the value or a catalogue price` };
  if (kind === 'finance' && !/conditions apply|approved credit/i.test(desc)) desc = `${desc.replace(/\.?$/, '.')} ${CREDIT}`;
  return { promo: { kind, title, short, desc, why, value, packs, years } };
}

/** Deterministic promotion for a target (ARAG down for this target or failed validation). */
export function fallbackFor(t) {
  const L = limitsOf(t);
  const m = modelById(t.models[0]);
  const tow = t.packs.includes('tow') && (m?.towKg || 0) >= 2000 ? 'tow' : null;
  let p;
  if (t.kinds[0] === 'servicing' && SERVICE[t.models[0]]) {
    const y = L.svcYears; const v = y * L.svcYear;
    p = { kind: 'servicing', title: `Complimentary ${y}-year Toyota Service Advantage`, short: `complimentary ${y}-year servicing`, value: v, years: y, packs: [],
      desc: `Your first ${y === 1 ? 'year' : `${y} years`} of Toyota Service Advantage capped-price logbook servicing are on us (worth up to ${fmtAud(v)}).`,
      why: `Toyota Service Advantage servicing included on this car for ${y === 1 ? 'the first year' : `the first ${y} years`}` };
  } else if (t.kinds.includes('accessory-bundle') && L.packs.length) {
    const pack = packOf(tow || (t.packs.includes('protection') ? 'protection' : t.packs[0]));
    p = { kind: 'accessory-bundle', title: `${pack.name} fitted free (${fmtAud(pack.price)})`, short: `the ${pack.name} fitted free`, value: pack.price, packs: [pack.id], years: 0,
      desc: `${pack.desc}, fitted before delivery at no charge.`, why: `Genuine ${pack.name} fitted before you collect the car` };
  } else if (t.kinds[0] === 'finance') {
    const ev = t.models.some((id) => modelById(id)?.powertrain === 'ev');
    p = { kind: 'finance', title: `Toyota Finance options on ${bodyLabel(t.appliesTo.bodies?.[0] || m?.body)}s`, short: 'flexible Toyota Finance options', value: null, packs: [], years: 0,
      desc: `Choose a standard loan, a balloon or a Guaranteed Future Value plan with Toyota Finance${ev ? '; a bZ4X can also suit a novated lease' : ''}. ${CREDIT}`,
      why: 'Finance options to suit how you like to own a car' };
  } else {
    p = { kind: 'trade-in', title: `Trade-in bonus ${fmtAud(Math.min(1000, L.tradeMax))}`, short: `a ${fmtAud(Math.min(1000, L.tradeMax))} trade-in bonus`, value: Math.min(1000, L.tradeMax), packs: [], years: 0,
      desc: `We add ${fmtAud(Math.min(1000, L.tradeMax))} to the valuation of your trade-in on this car.`, why: 'A little extra for the car you trade in' };
  }
  return p;
}

const pool = async (items, n, fn) => {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
};

async function composeTarget(t, s, attempt = 1) {
  const t0 = Date.now();
  try {
    const r = await arag.ask({
      query: `Dealer promotion for ${t.models.map(nameOf).join(', ')}: Toyota Genuine accessories and pack prices, Towing Pack contents, Toyota Service Advantage capped-price servicing, trade-in, finance options`,
      system: COMPOSE_SYSTEM(t), extraContext: [contextFor(t, s)], jsonSchema: SCHEMA(t), timeoutMs: 30000, topK: 8,
      filterExpression: arag.anyLabel('topic', KB_TOPICS),
    });
    const kb = [...new Set(r.sources.map((x) => x.title).filter(Boolean))].slice(0, 4);
    const v = validateComposed(r.json, t);
    if (v.promo) return { promo: v.promo, composedBy: 'arag', kb, ms: Date.now() - t0 };
    return { promo: fallbackFor(t), composedBy: 'fallback', kb: [], rejected: v.error, ms: Date.now() - t0 };
  } catch (e) {
    if (attempt === 1 && (e.status === 0 || e.status >= 500)) { // one retry on timeouts / 5xx
      const again = await composeTarget(t, s, 2);
      return { ...again, ms: Date.now() - t0 };
    }
    return { promo: fallbackFor(t), composedBy: 'fallback', kb: [], rejected: e.message, unreachable: e.status === 0, ms: Date.now() - t0 };
  }
}

const toPromotion = (t, c) => ({
  id: `promo-${t.id}`, title: c.promo.title, short: c.promo.short, kind: c.promo.kind, value: c.promo.value ?? null,
  desc: c.promo.desc, why: c.promo.why, reason: t.reason, appliesTo: t.appliesTo, validUntil: t.validUntil,
  source: { domo: t.signal, kb: c.kb }, composedBy: c.composedBy,
  ...(c.promo.packs?.length ? { packs: c.promo.packs } : {}), ...(c.promo.years ? { years: c.promo.years } : {}),
});

// ── 3. cache ─────────────────────────────────────────────────────────────────
let mem = null;        // {composedAt, signature, composedBy, targets[], promotions[], latencyMs}
let memAt = 0;         // when mem was (re)validated; 0 = stale
let inflight = null;
let lastStock = null;

const signatureOf = (s, targets) => `${s._refreshed?.dealer_signals || ''}|${targets.map((t) => `${t.id}:${(t.units || []).join('+')}`).join(',')}|${sydneyToday()}`;

function staticSet(s, targets) {
  const list = (readDealer('promotions.json', { promotions: [] }).promotions || []).map((p) => {
    const t = targets.find((x) => (p.appliesTo?.units || []).some((u) => (x.units || []).includes(u)))
      || targets.find((x) => (p.appliesTo?.models || []).some((m) => x.models.includes(m)) && Boolean(p.appliesTo?.aged) === (x.type === 'aged-stock'));
    return { ...p, why: p.why || p.short || p.title, source: { domo: t ? t.signal : 'Harbourline promotions register (static fallback)', kb: [] }, composedBy: 'fallback' };
  });
  return { composedAt: null, signature: null, composedBy: 'static', targets: targets.map((t) => ({ ...t, promotionId: list.find((p) => p.source.domo === t.signal)?.id || null, composedBy: 'fallback', kb: [], rejected: 'static promotions register served' })), promotions: list, latencyMs: null };
}

function loadInitial() {
  const g = readDealer('promotions.generated.json', null);
  if (g && Array.isArray(g.promotions) && g.promotions.length) { mem = g; memAt = Date.parse(g.composedAt) || 0; return; }
  mem = null; memAt = 0;
}

/** Compose now (awaitable). Keeps the last good set when ARAG is unreachable. */
export async function refreshPromotions(s, priorities) {
  if (inflight) return inflight;
  inflight = (async () => {
    const targets = selectTargets(s, priorities(s));
    const signature = signatureOf(s, targets);
    if (!arag.configured()) { mem = staticSet(s, targets); memAt = Date.now(); return mem; }
    const t0 = Date.now();
    const results = await pool(targets, 4, (t) => composeTarget(t, s));
    if (results.length && results.every((r) => r.unreachable)) {
      console.warn('[promotions] ARAG unreachable; keeping the last good set');
      if (!mem || mem.composedBy === 'static') mem = staticSet(s, targets);
      memAt = Date.now() - TTL_MS + RETRY_MS;
      return mem;
    }
    const promotions = targets.map((t, i) => toPromotion(t, results[i]));
    const nArag = results.filter((r) => r.composedBy === 'arag').length;
    const set = {
      composedAt: new Date().toISOString(), signature, signalsRefreshedAt: s._refreshed?.dealer_signals || null,
      composedBy: nArag === results.length ? 'arag' : nArag ? 'mixed' : 'fallback', latencyMs: Date.now() - t0,
      targets: targets.map((t, i) => ({ id: t.id, type: t.type, models: t.models, units: t.units, signal: t.signal, kinds: t.kinds, promotionId: promotions[i].id, composedBy: results[i].composedBy, kb: results[i].kb, ms: results[i].ms, ...(results[i].rejected ? { rejected: results[i].rejected } : {}) })),
      promotions,
    };
    mem = set; memAt = Date.now();
    console.log(`[promotions] composed ${promotions.length} (${nArag} by ARAG) in ${set.latencyMs} ms`);
    if (nArag) await writeDealer('promotions.generated.json', set).catch((e) => console.warn(`[promotions] persist: ${e.message}`));
    return set;
  })().finally(() => { inflight = null; });
  return inflight;
}

let prioritiesFn = null;
/** dealer.mjs registers its priorities() here (avoids an import cycle). */
export const usePriorities = (fn) => { prioritiesFn = fn; };

/**
 * The current composed set (synchronous). With a stock snapshot, schedules a
 * background refresh when the set is older than the TTL or the Domo signature changed.
 */
export function currentPromotions(s) {
  if (mem === null && memAt === 0) loadInitial();
  if (s) lastStock = s;
  const st = s || lastStock;
  if (st && prioritiesFn && !inflight) {
    const stale = Date.now() - memAt > TTL_MS;
    let changed = false;
    if (!stale && mem?.signature) changed = signatureOf(st, selectTargets(st, prioritiesFn(st))) !== mem.signature;
    if (stale || changed) refreshPromotions(st, prioritiesFn).catch((e) => console.warn(`[promotions] refresh: ${e.message}`));
  }
  if (!mem && st && prioritiesFn) mem = staticSet(st, selectTargets(st, prioritiesFn(st)));
  return mem?.promotions || readDealer('promotions.json', { promotions: [] }).promotions || [];
}

/** For GET /api/promotions/explain. */
export function explainPromotions(s) {
  currentPromotions(s);
  const set = mem || { targets: [], promotions: [] };
  const byId = new Map(set.promotions.map((p) => [p.id, p]));
  return {
    source: 'Domo (dealer_signals, aged_stock_actions) → Progress Agentic RAG (accessories, service, finance documents) → validated against the catalogue',
    composedAt: set.composedAt, composedBy: set.composedBy, latencyMs: set.latencyMs ?? null,
    ttlMinutes: TTL_MS / 60000, refreshing: Boolean(inflight), signalsRefreshedAt: set.signalsRefreshedAt || s?._refreshed?.dealer_signals || null,
    targets: (set.targets || []).map((t) => {
      const p = byId.get(t.promotionId);
      return {
        target: t.id, type: t.type, models: t.models, units: t.units || null, signal: t.signal, allowedKinds: t.kinds,
        promotion: p ? { id: p.id, title: p.title, kind: p.kind, value: p.value, why: p.why } : null,
        composedBy: t.composedBy, kb: t.kb || [], ...(t.rejected ? { rejected: t.rejected } : {}), ...(t.ms != null ? { ms: t.ms } : {}),
      };
    }),
  };
}
