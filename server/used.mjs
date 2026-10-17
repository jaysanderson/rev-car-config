// used.mjs — /api/used: the Harbourline Used (pre-owned) API. See docs/USED-SPEC.md §4.
//
// Listing + facets, semantic "most relevant" with a query (ARAG /find over the
// topic/used resources), the vehicle page with market position and provenance,
// agent-written dealer comments (cached; regenerated via /comments/refresh), the
// car-scoped and general assistants with per-session memory, the five-step used
// finder, enquiries (lead in the DMS, 48 h hold for "reserve"), watches, the
// journey-based "For you" rows and a Domo report.
import express from 'express';
import * as arag from './arag.mjs';
import * as events from './events.mjs';
import * as D from './used-data.mjs';
import { LANG } from './assistant.mjs';

const router = express.Router();
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => { console.error(`[used ${req.method} ${req.path}] ${e.message}`); if (!res.headersSent) res.status(500).json({ error: 'internal error' }); });
const sidOf = (req) => events.sidOf(req);
const str = (v, n = 200) => (v == null ? '' : String(v).replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, n));
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const STOCK_RE = /^U-\d{5}$/i;
const POLICY_TOPICS = ['policy', 'dealer-policy', 'warranty', 'service', 'towing', 'finance', 'finder'];
const labelOr = (pairs) => ({ field: { or: pairs } });
const topicPairs = (topics) => topics.map((t) => ({ prop: 'label', labelset: 'topic', label: t }));

// ── listing ──────────────────────────────────────────────────────────────────
const FACETS = ['make', 'model', 'body', 'colour', 'fuel', 'transmission', 'drive', 'siteId'];
const STOP = new Set(['a', 'an', 'the', 'for', 'with', 'and', 'or', 'to', 'of', 'in', 'on', 'me', 'my', 'i', 'under', 'over', 'something', 'car', 'cars', 'that', 'can', 'is', 'it', 'want', 'need', 'looking', 'good']);
const SYN = { tow: 'tows', towing: 'tows', caravan: 'tows', boat: 'tows', trailer: 'tows', ute: 'ute', family: '7 seats', kids: '7 seats', seven: '7 seats', cheap: 'under-35k', economical: 'hybrid', efficient: 'hybrid', ev: 'electric', suv: 'suv', '4wd': '4x4', offroad: '4x4', 'off-road': '4x4', manual: 'manual', auto: 'automatic', sports: 'coupe', fun: 'gr' };
const unitText = (u) => `${u.year} ${u.make} ${u.model} ${u.grade} ${u.variantCode} ${u.colour} ${u.fuel} ${u.drive} ${u.transmission} ${u.bodyLabel} ${u.body} ${u.stockNo} ${u.features.join(' ')} ${D.siteName(u.siteId)} ${u.seats} seats${u.towKg >= 1500 ? ' tows' : ''}${u.price < 35000 ? ' under-35k' : ''}${u.certified ? ' certified' : ''}${u.owners === 1 ? ' one owner' : ''}`.toLowerCase();
const words = (q) => q.toLowerCase().replace(/[^a-z0-9$\- ]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)).map((w) => SYN[w] || w);
const textScore = (u, q) => { const s = unitText(u); const ws = words(q); if (!ws.length) return 1; return ws.filter((w) => s.includes(w)).length / ws.length; };
const matchesText = (u, q) => textScore(u, q) >= 0.5;
const stockNoInHit = (h) => (String(h.title || '').match(/\((U-\d{5})\)/i) || [])[1]?.toUpperCase() || null;

async function semanticOrder(q) {
  if (!arag.configured()) return null;
  try {
    const hits = await arag.find({ query: q, topK: 20, filterExpression: arag.labelFilter('topic', 'used'), timeoutMs: 8000 });
    const order = []; for (const h of hits) { const s = stockNoInHit(h); if (s && !order.includes(s)) order.push(s); }
    return order.length ? order : null;
  } catch (e) { console.warn(`[used find] ${e.message}`); return null; }
}

router.get('/', wrap(async (req, res) => {
  const t0 = Date.now(); const q = req.query; const sid = sidOf(req);
  const text = str(q.q, 200);
  let rows = D.units().filter((u) => u.status !== 'sold');
  const eq = (k, v) => (v ? rows.filter((u) => String(u[k]).toLowerCase() === String(v).toLowerCase() || (k === 'model' && u.modelId === v)) : rows);
  for (const k of ['make', 'model', 'body', 'colour', 'fuel', 'transmission', 'drive']) rows = eq(k, str(q[k], 40));
  if (str(q.site, 10)) rows = rows.filter((u) => u.siteId === str(q.site, 10));
  if (q.certified === '1' || q.certified === 'true') rows = rows.filter((u) => u.certified);
  if (num(q.priceMin)) rows = rows.filter((u) => u.price >= num(q.priceMin));
  if (num(q.priceMax)) rows = rows.filter((u) => u.price <= num(q.priceMax));
  if (num(q.kmMax)) rows = rows.filter((u) => u.km <= num(q.kmMax));
  if (num(q.yearMin)) rows = rows.filter((u) => u.year >= num(q.yearMin));
  if (num(q.seats)) rows = rows.filter((u) => u.seats >= num(q.seats));
  const sort = ['relevant', 'latest', 'price-asc', 'price-desc', 'km-asc'].includes(q.sort) ? q.sort : 'relevant';
  let semantic = false;
  if (text) {
    const order = sort === 'relevant' ? await semanticOrder(text) : null;
    if (order) { semantic = true; const kw = rows.filter((u) => matchesText(u, text)).map((u) => u.stockNo); rows = rows.filter((u) => order.includes(u.stockNo) || kw.includes(u.stockNo)); rows.sort((a, b) => (order.indexOf(a.stockNo) + 1 || 99) - (order.indexOf(b.stockNo) + 1 || 99)); }
    else { rows = rows.filter((u) => matchesText(u, text)); if (sort === 'relevant') rows.sort((a, b) => textScore(b, text) - textScore(a, text)); }
  }
  if (!(semantic && sort === 'relevant') && !(text && sort === 'relevant')) {
    const relevance = (u) => (u.certified ? 2 : 0) + (D.effectiveStatus(u) === 'on_lot' ? 2 : 0) + (u.daysInStock > 45 ? 1 : 0) + (u.siteId === 'par' ? 0.5 : 0) + (u.photo ? 0.5 : 0);
    rows.sort(sort === 'latest' ? (a, b) => (b.arrivedAt || '9').localeCompare(a.arrivedAt || '9') : sort === 'price-asc' ? (a, b) => a.price - b.price : sort === 'price-desc' ? (a, b) => b.price - a.price : sort === 'km-asc' ? (a, b) => a.km - b.km : (a, b) => relevance(b) - relevance(a) || a.daysInStock - b.daysInStock);
  }
  const all = D.units().filter((u) => u.status !== 'sold');
  const facets = {};
  for (const f of FACETS) { const m = new Map(); for (const u of all) { const v = u[f]; m.set(v, (m.get(v) || 0) + 1); } facets[f === 'siteId' ? 'site' : f] = [...m].map(([value, count]) => ({ value, label: f === 'siteId' ? D.siteName(value) : f === 'body' ? value : String(value), count })).sort((a, b) => a.label.localeCompare(b.label)); }
  facets.certified = all.filter((u) => u.certified).length;
  const counts = sid ? D.questionCounts(sid).byStock : {};
  const page = Math.max(1, num(q.page) || 1); const pageSize = Math.min(48, Math.max(3, num(q.pageSize) || 48));
  const items = rows.slice((page - 1) * pageSize, page * pageSize).map((u) => D.card(u, { youAsked: counts[u.stockNo] || 0, watchers: D.watchersOf(u.stockNo) }));
  res.json({ total: rows.length, tookMs: Date.now() - t0, semantic, q: text, sort, page, pageSize, items, facets, refreshedAt: D.stockFile().generated, priceNote: D.priceNote() });
}));

// ── per-session helpers (before /:stockNo) ───────────────────────────────────
router.get('/questions', (req, res) => { const sid = sidOf(req); res.json(sid ? D.questionCounts(sid) : { byStock: {}, recent: [] }); });
router.get('/watch', (req, res) => { const sid = sidOf(req); res.json({ watches: sid ? D.watches().filter((w) => w.sid === sid) : [] }); });
router.delete('/session', wrap(async (req, res) => { const sid = sidOf(req); if (sid) await D.forgetSession(sid); res.json({ ok: true }); }));

router.post('/watch', wrap(async (req, res) => {
  const sid = sidOf(req); if (!sid) return res.status(400).json({ error: 'x-sid header required' });
  const b = req.body || {};
  const stockNo = STOCK_RE.test(str(b.stockNo, 10)) ? str(b.stockNo, 10).toUpperCase() : null;
  const c = b.criteria && typeof b.criteria === 'object' ? { model: str(b.criteria.model, 30) || null, body: str(b.criteria.body, 20) || null, fuel: str(b.criteria.fuel, 12) || null, priceMax: num(b.criteria.priceMax), kmMax: num(b.criteria.kmMax), seats: num(b.criteria.seats) } : null;
  if (!stockNo && !c) return res.status(400).json({ error: 'stockNo or criteria required' });
  if (stockNo && !D.unitById(stockNo)) return res.status(404).json({ error: 'unknown stock number' });
  const w = await D.addWatch(sid, { stockNo, criteria: c });
  const matchesNow = stockNo ? 1 : D.units().filter((u) => D.criteriaMatches(c, u)).length;
  events.logServer(sid, 'used_watch', { stockNo, criteria: c ? Object.entries(c).filter(([, v]) => v).map(([k, v]) => `${k}-${v}`).join('-').toLowerCase() : null });
  res.json({ ok: true, watchId: w.id, matchesNow, watchers: stockNo ? D.watchersOf(stockNo) : null });
}));

// ── journey-based "For you" rows ─────────────────────────────────────────────
async function findUnits(query, { exclude = new Set(), n = 6 } = {}) {
  const order = await semanticOrder(query);
  const out = [];
  for (const s of order || []) { const u = D.unitById(s); if (u && !exclude.has(s) && u.status !== 'sold') out.push(u); if (out.length >= n) break; }
  return { items: out, semantic: Boolean(order) };
}
router.get('/foryou', wrap(async (req, res) => {
  const sid = sidOf(req);
  const journey = { viewed: [], asked: [], answers: D.lastMatch(sid) || null, watches: [] };
  if (sid) {
    for (const e of events.eventsForSession(sid)) if (e.type === 'used_view' && e.data?.stockNo && !journey.viewed.includes(e.data.stockNo)) journey.viewed.push(e.data.stockNo);
    journey.asked = D.questionsFor(sid).slice(-6).map((x) => ({ stockNo: x.stockNo, q: x.q }));
    journey.watches = D.watches().filter((w) => w.sid === sid).map((w) => ({ stockNo: w.stockNo, criteria: w.criteria }));
  }
  const rows = []; const used = new Set(journey.viewed.slice(-1));
  const push = (id, title, why, query, items) => { const fresh = items.filter((u) => !used.has(u.stockNo)).slice(0, 6); if (fresh.length) { fresh.forEach((u) => used.add(u.stockNo)); rows.push({ id, title, why, query, items: fresh.map((u) => D.card(u)) }); } };
  const last = journey.viewed.length ? D.unitById(journey.viewed[journey.viewed.length - 1]) : null;
  if (last) {
    const q = `${last.year} ${last.make} ${last.model} ${last.grade} alternatives: ${last.bodyLabel} ${last.fuel} ${last.drive} ${last.seats} seats around ${D.fmt(last.price)}`;
    const r = await findUnits(q, { exclude: new Set([last.stockNo]) });
    push('viewed', `Because you looked at the ${D.title(last)} ${last.grade}`, r.semantic ? 'Natural-language retrieval over the car resources' : 'Similar cars by body, price and year', q, r.items.length ? r.items : D.similarTo(last, 6));
  }
  const lastQ = journey.asked.length ? journey.asked[journey.asked.length - 1] : null;
  if (lastQ) {
    const r = await findUnits(lastQ.q, { exclude: new Set(journey.viewed.slice(-1)) });
    const theme = lastQ.q.length > 60 ? `${lastQ.q.slice(0, 57)}…` : lastQ.q;
    push('asked', `Because you asked "${theme}"`, r.semantic ? 'Your question, run as a search over every listing' : 'Keyword match on your question', lastQ.q, r.items.length ? r.items : D.units().filter((u) => matchesText(u, lastQ.q)).slice(0, 6));
  }
  const w = journey.watches.find((x) => x.criteria);
  if (w) push('watch', 'Because you are watching for one of these', 'Live match of your watch criteria against stock', JSON.stringify(w.criteria), D.units().filter((u) => D.criteriaMatches(w.criteria, u)));
  if (journey.answers?.length) { const r = rankUnits(journey.answers).slice(0, 6).map((x) => x.unit); push('match', 'Because of your finder answers', 'Re-ranked against today\'s stock', journey.answers.map((a) => `${a.id}:${a.value}`).join(','), r); }
  res.json({ journey, rows });
}));

// ── finder: five scripted questions, scored against the real units ───────────
const Q = {
  budget: { text: 'What is your budget, before government charges?', why: 'It sets the shortlist; we add stamp duty and registration on a drive-away quote.', options: [{ id: 'under-30k', label: 'Under $30,000', sub: 'Small cars, older SUVs, workhorse utes' }, { id: '30-45k', label: '$30,000 to $45,000', sub: 'Most hybrids and mid-size SUVs' }, { id: '45-65k', label: '$45,000 to $65,000', sub: 'Newer SUVs, 4x4 utes, seven-seaters' }, { id: '65k-plus', label: 'Over $65,000', sub: 'Prado, LandCruiser, top-grade Kluger and HiLux' }] },
  use: { text: 'What will the car mostly do?', why: 'Use decides body style and seats before anything else.', options: [{ id: 'family', label: 'Family and school runs', sub: 'Space, safety, easy to load' }, { id: 'commute', label: 'Commuting', sub: 'Running costs and comfort' }, { id: 'work', label: 'Work and towing', sub: 'Utes and large SUVs' }, { id: 'adventure', label: 'Touring and off-road', sub: 'Range, clearance, 4x4' }, { id: 'fun', label: 'A car to enjoy', sub: 'Coupes and hot hatches' }] },
  people: { text: 'How many seats do you need?', why: 'Seven seats rules out every five-seat SUV.', options: [{ id: 'five', label: 'Five is fine', sub: 'Most SUVs, hatches, sedans' }, { id: 'seven', label: 'Seven', sub: 'Kluger, Prado, Fortuner, LandCruiser, Outlander', note: 'Rules out five-seat cars' }] },
  towing: { text: 'How much will you tow?', why: 'Braked towing capacity varies from 400 kg to 3,500 kg across the range.', options: [{ id: 'light', label: 'A box trailer (under 750 kg)', sub: 'Almost anything' }, { id: 'medium', label: 'A boat or camper (about 1,500 kg)', sub: 'Mid-size SUVs and up' }, { id: 'heavy', label: 'A caravan (2,500 kg or more)', sub: 'HiLux, Prado, Fortuner, LandCruiser, Kluger', note: 'Rules out cars rated under 2,500 kg' }] },
  power: { text: 'Which fuel do you prefer?', why: 'Hybrids suit high-kilometre commuters; electric suits home charging.', options: [{ id: 'hybrid', label: 'Hybrid', sub: 'Lowest running costs on the daily drive' }, { id: 'electric', label: 'Electric', sub: 'bZ4X, if you can charge at home' }, { id: 'any', label: 'No preference', sub: 'Petrol and diesel included' }] },
  terrain: { text: 'How far off the bitumen?', why: 'Low-range 4x4 matters on tracks; AWD is enough for gravel and snow.', options: [{ id: 'offroad', label: 'Real tracks and beaches', sub: 'Low-range 4x4', note: 'Keeps HiLux, Prado, Fortuner, LandCruiser, Ranger' }, { id: 'gravel', label: 'Gravel, snow, the odd campsite', sub: 'AWD is enough' }] },
  gearbox: { text: 'Manual or automatic?', why: 'Our GR cars come in both.', options: [{ id: 'manual', label: 'Manual', sub: 'GR Yaris, GR86, Workmate HiLux' }, { id: 'auto', label: 'Automatic', sub: 'Everything else' }] },
  priorities: { text: 'What matters most?', why: 'It re-orders the shortlist.', options: [{ id: 'low-km', label: 'Lowest kilometres', sub: '' }, { id: 'newest', label: 'Newest car', sub: '' }, { id: 'certified', label: 'Toyota Certified warranty', sub: '12-month warranty and roadside' }, { id: 'price', label: 'Lowest price', sub: '' }] },
  when: { text: 'When do you need it?', why: 'Cars arriving or in reconditioning only count if you can wait.', options: [{ id: 'this-week', label: 'This week', sub: 'On the lot now' }, { id: 'this-month', label: 'This month', sub: 'Arriving and reconditioning cars included' }, { id: 'looking', label: 'Just looking', sub: 'Everything, and we can watch for you' }] },
};
const BUDGET = { 'under-30k': [0, 30000], '30-45k': [30000, 45000], '45-65k': [45000, 65000], '65k-plus': [65000, 1e9] };
const USE_BODY = { family: ['suv-mid', 'suv-large', 'suv-small', 'sedan', 'hatch'], commute: ['hatch', 'sedan', 'suv-small', 'suv-mid'], work: ['ute', 'suv-large'], adventure: ['suv-large', 'ute', 'suv-mid'], fun: ['coupe', 'hatch'] };
const FOLLOW = { family: 'people', work: 'towing', commute: 'power', adventure: 'terrain', fun: 'gearbox' };
export function nextQuestionId(answers) {
  const a = Object.fromEntries(answers.map((x) => [x.id, x.value]));
  if (!a.budget) return 'budget'; if (!a.use) return 'use';
  const f = FOLLOW[a.use] || 'power'; if (!a[f]) return f;
  if (!a.priorities) return 'priorities'; if (!a.when) return 'when';
  return null;
}
export function rankUnits(answers) {
  const a = Object.fromEntries(answers.map((x) => [x.id, x.value]));
  const [lo, hi] = BUDGET[a.budget] || [0, 1e9];
  return D.units().filter((u) => u.status !== 'sold').map((u) => {
    const why = []; const watch = []; let fit = 50; let out = false;
    const st = D.effectiveStatus(u);
    if (u.price >= lo && u.price <= hi) { fit += 15; why.push(`${D.fmt(u.price)} sits inside your budget`); } else if (u.price > hi && u.price <= hi * 1.08) { fit -= 5; watch.push(`${D.fmt(u.price)} is a little over your budget`); } else out = true;
    const bodies = USE_BODY[a.use] || []; const bi = bodies.indexOf(u.body);
    if (bi >= 0) { fit += 12 - bi * 3; } else if (a.use) { fit -= 15; }
    if (a.people === 'seven') { if (u.seats >= 7) { fit += 10; why.push('Seven seats'); } else out = true; }
    if (a.towing === 'heavy') { if (u.towKg >= 2500) { fit += 10; why.push(`Rated to tow ${u.towKg.toLocaleString('en-AU')} kg braked`); } else out = true; }
    if (a.towing === 'medium') { if (u.towKg >= 1500) { fit += 6; why.push(`Tows ${u.towKg.toLocaleString('en-AU')} kg braked`); } else out = true; }
    if (a.power === 'hybrid') { if (u.fuel === 'Hybrid') { fit += 10; why.push('Hybrid'); } else fit -= 12; }
    if (a.power === 'electric') { if (u.fuel === 'Electric') { fit += 15; why.push('Electric'); } else out = true; }
    if (a.terrain === 'offroad') { if (u.drive === '4x4') { fit += 10; why.push('Low-range 4x4'); } else out = true; }
    if (a.terrain === 'gravel') { if (/AWD|4x4/.test(u.drive)) { fit += 6; why.push(u.drive); } else fit -= 8; }
    if (a.gearbox === 'manual') { if (u.transmission === 'Manual') { fit += 12; why.push('Manual'); } else out = true; }
    if (a.gearbox === 'auto' && u.transmission !== 'Automatic') out = true;
    if (a.when === 'this-week' && st !== 'on_lot') out = true;
    if (a.when === 'this-month' && st === 'arriving' && u.etaDays > 30) out = true;
    if (st === 'arriving') watch.push(`Arriving in about ${u.etaDays} days`); if (st === 'reconditioning') watch.push('In reconditioning, viewable by appointment'); if (st === 'held') watch.push('On a 48-hour hold for another customer');
    if (a.priorities === 'low-km') fit += Math.max(0, 10 - u.km / 10000);
    if (a.priorities === 'newest') fit += Math.max(0, (u.year - 2019) * 2);
    if (a.priorities === 'certified') { if (u.certified) { fit += 8; why.push('Toyota Certified: 12-month warranty and roadside'); } else { fit -= 10; watch.push('Not Toyota Certified'); } }
    if (a.priorities === 'price') fit += Math.max(0, 10 - (u.price - lo) / 5000);
    if (u.certified && a.priorities !== 'certified') why.push('Toyota Certified');
    if (u.owners === 1) why.push('One owner');
    const noted = u.inspection.items.filter((i) => i.action === 'noted').map((i) => i.note); if (noted.length) watch.push(noted[0]);
    return { unit: u, fit: Math.max(5, Math.min(98, Math.round(fit))), why: why.slice(0, 4), watch: watch.slice(0, 3), out };
  }).filter((r) => !r.out).sort((x, y) => y.fit - x.fit);
}
const cleanAnswers = (list) => (Array.isArray(list) ? list : []).filter((x) => x && Q[x.id] && Q[x.id].options.some((o) => o.id === x.value)).map((x) => ({ id: x.id, value: x.value })).slice(0, 5);
const describe = (answers) => answers.map((a) => Q[a.id].options.find((o) => o.id === a.value)?.label).filter(Boolean).join(', ');

router.post('/match', wrap(async (req, res) => {
  const sid = sidOf(req); const b = req.body || {};
  const answers = cleanAnswers(b.answers);
  const next = nextQuestionId(answers);
  const asked = answers.length;
  if (next) return res.json({ done: false, step: asked + 1, total: 5, question: { id: next, ...Q[next] }, answers });
  const ranked = rankUnits(answers).slice(0, 5);
  D.rememberMatch(sid, answers);
  let summary = ranked.length ? `${ranked.length} car${ranked.length > 1 ? 's' : ''} fit ${describe(answers).toLowerCase()}. Ranked by fit, with the inspection notes you should read before a test drive.` : `Nothing in stock fits ${describe(answers).toLowerCase()} right now. Watch this search and we will tell you when a trade-in or arrival matches.`;
  const trace = [{ kind: 'dms', label: `${D.units().length} used units scored against ${answers.length} answers` }];
  if (ranked.length && arag.configured() && b.lang !== 'none') {
    try {
      const r = await arag.ask({ query: `Write one friendly sentence (max 35 words) for a visitor who answered: ${describe(answers)}. Recommend the first car and say why, using only the facts given.`, system: `You write for Harbourline Toyota's used-car finder. Use only the CANDIDATES in the context; never invent features or figures.${b.lang && LANG[b.lang] && b.lang !== 'en' ? ` Write in ${LANG[b.lang]}.` : ''}`, extraContext: [`CANDIDATES:\n${ranked.map((r) => `${r.unit.stockNo}: ${D.title(r.unit)} ${r.unit.grade}, ${D.fmtKm(r.unit.km)}, ${D.fmt(r.unit.price)}, fit ${r.fit}%, ${r.why.join('; ')}`).join('\n')}`], filterExpression: arag.labelFilter('topic', 'finder'), timeoutMs: 9000, topK: 5 });
      if (r.answer && r.answer.trim().length > 20 && !/not enough data/i.test(r.answer)) { summary = r.answer.trim(); trace.unshift({ kind: 'kb', label: 'Summary written by the agent (buying guide + candidates)' }); }
    } catch (e) { console.warn(`[used match] ${e.message}`); }
  }
  if (ranked.length) events.logServer(sid, 'used_match_result', { recommended: ranked.map((r) => r.unit.stockNo) });
  const counts = sid ? D.questionCounts(sid).byStock : {};
  res.json({ done: true, summary, answers, results: ranked.map((r) => ({ stockNo: r.unit.stockNo, fit: r.fit, why: r.why, watch: r.watch, card: D.card(r.unit, { youAsked: counts[r.unit.stockNo] || 0, watchers: D.watchersOf(r.unit.stockNo) }) })), criteria: { body: USE_BODY[Object.fromEntries(answers.map((a) => [a.id, a.value])).use]?.[0] || null, priceMax: (BUDGET[answers.find((a) => a.id === 'budget')?.value] || [])[1] || null, seats: answers.some((a) => a.id === 'people' && a.value === 'seven') ? 7 : null, fuel: answers.find((a) => a.id === 'power')?.value === 'hybrid' ? 'Hybrid' : null }, trace });
}));

// ── assistant ────────────────────────────────────────────────────────────────
const ASK_SYSTEM = `You are the Harbourline Toyota pre-owned assistant (Sydney). Answer in the language of the question. Use only the LISTING, PROVENANCE, STOCK and policy documents you are given. Be specific: quote dates, kilometres and prices from the record. If the record does not say, say so and offer to check with the site. Never speculate about accident history beyond the PPSR result and inspection notes. Keep answers under 120 words unless a table of services is asked for. Prices exclude government charges.`;
const ASK_SCHEMA = { name: 'used_answer', description: 'Answer with optional suggested actions', parameters: { type: 'object', properties: { answer: { type: 'string' }, actions: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: ['open', 'enquire', 'finance', 'reserve', 'watch', 'match'] }, stockNo: { type: 'string' }, label: { type: 'string' } }, required: ['type', 'label'] } } }, required: ['answer', 'actions'] } };
const historyFor = (h) => (Array.isArray(h) ? h : []).slice(-8).filter((m) => m && typeof m.content === 'string' && ['user', 'assistant'].includes(m.author || m.role)).map((m) => ({ author: m.author || m.role === 'user' ? 'USER' : 'NUCLIA', text: m.content.slice(0, 1200) })).map((m) => ({ author: m.author === 'user' || m.author === 'USER' ? 'USER' : 'NUCLIA', text: m.text }));
const validActions = (list, unit) => (Array.isArray(list) ? list : []).filter((a) => a && ['open', 'enquire', 'finance', 'reserve', 'watch', 'match'].includes(a.type)).map((a) => ({ type: a.type, stockNo: STOCK_RE.test(String(a.stockNo || '')) && D.unitById(a.stockNo) ? String(a.stockNo).toUpperCase() : unit?.stockNo || null, label: str(a.label, 60) || a.type })).filter((a) => a.type === 'match' || a.stockNo).slice(0, 3);
const citationsFrom = (sources) => sources.slice(0, 4).map((s) => ({ title: s.title, resourceId: s.resourceId, topic: (s.topic || [])[0] || null }));

function scriptedAnswer(q, u, prior) {
  const s = q.toLowerCase();
  if (!u) { const n = D.units().filter((x) => matchesText(x, q)); return n.length ? `${n.length} car${n.length > 1 ? 's' : ''} match "${q}": ${n.slice(0, 4).map((x) => `${D.title(x)} ${x.grade} (${D.fmt(x.price)}, ${D.fmtKm(x.km)}, ${D.siteName(x.siteId)})`).join('; ')}.` : `I could not match that against the ${D.units().length} cars in stock. Try a model, body style, fuel or budget, or use "Find what's right for me".`; }
  const svc = u.serviceHistory; const last = svc[svc.length - 1];
  if (/service|log ?book|history/.test(s)) return `${D.title(u)} ${u.grade} has ${svc.length} logged services: ${svc.map((x) => `${x.date} at ${D.fmtKm(x.km)} (${x.by})`).join('; ')}. Next service is due at ${D.fmtKm(u.nextServiceDue.km)} or by ${u.nextServiceDue.date}.`;
  if (/accident|damage|write|written|ppsr|finance owing|encumb/.test(s)) return `The PPSR check on ${u.ppsr.checkedAt} (${u.ppsr.certificate}) shows no encumbrance and the car is not on the written-off register. The ${u.inspection.points}-point inspection on ${u.inspection.date} noted: ${u.inspection.items.map((i) => `${i.note.toLowerCase()} (${i.action})`).join('; ')}. We do not have an accident history beyond that; ask the ${D.siteName(u.siteId)} team to check the service record for panel work.`;
  if (/tow/.test(s)) return u.towKg ? `${D.title(u)} ${u.grade} is rated to tow ${u.towKg.toLocaleString('en-AU')} kg braked${u.features.some((f) => /Tow bar/.test(f)) ? ' and it has a tow bar fitted' : '; a tow bar can be fitted before delivery'}.` : `${D.title(u)} is not rated for towing.`;
  if (/price|why|market|negotiat|deal|discount/.test(s)) { const m = D.marketFor(u); return m ? `${D.fmt(u.price)} excluding government charges is ${m.position === 'below' ? `${D.fmt(Math.abs(m.diff))} below` : m.position === 'above' ? `${D.fmt(m.diff)} above` : 'in line with'} the median asking price (${D.fmt(m.median)}) for ${u.year}-era ${u.make} ${u.model}s in our market data (${m.sample} comparable listings). ${u.certified ? 'The price includes the Toyota Certified 12-month warranty and roadside.' : ''}` : `${D.fmt(u.price)} excluding government charges; we have no market comparison for this model yet.`; }
  if (/warrant/.test(s)) return `Warranty: ${u.warranty.type}${u.warranty.until ? ` until ${u.warranty.until}` : ''}${u.warranty.note ? `, ${u.warranty.note}` : ''}${u.warranty.roadside ? ', with roadside assistance' : ''}.`;
  if (/owner|key|book/.test(s)) return `${u.owners} previous owner${u.owners > 1 ? 's' : ''}, first registered ${u.firstRegistered}, ${u.keys} key${u.keys > 1 ? 's' : ''}, ${u.books ? 'service books present' : 'no books'}. Acquired via ${u.acquiredVia}.`;
  if (/tyre|brake/.test(s)) return `Tyres have ${u.inspection.tyresMm.front} mm front and ${u.inspection.tyresMm.rear} mm rear; brakes ${u.inspection.brakesPct.front}% front and ${u.inspection.brakesPct.rear}% rear remaining, as measured on ${u.inspection.date}.`;
  return `${D.commentsFor(u).body}${prior?.length ? ` Earlier you asked about ${prior[prior.length - 1].q.toLowerCase().replace(/\?$/, '')}; happy to go deeper on that.` : ''}`;
}

async function answer({ question, lang, history, unit, sid }) {
  const q = str(question, 1000);
  const prior = sid ? D.questionsFor(sid) : [];
  const priorOther = prior.filter((p) => !unit || p.stockNo !== unit.stockNo).slice(-4);
  const priorHere = unit ? prior.filter((p) => p.stockNo === unit.stockNo).slice(-4) : [];
  const extra = [];
  if (unit) extra.push(`LISTING AND PROVENANCE:\n${D.unitContext(unit)}`); else extra.push(`STOCK:\n${D.rangeSummary()}`);
  if (unit) { const m = D.marketFor(unit); if (m) extra.push(`MARKET (Domo used_market_prices): median asking ${D.fmt(m.median)} for ${unit.year}-era ${unit.make} ${unit.model}, range ${D.fmt(m.low)} to ${D.fmt(m.high)}, ${m.sample} listings; this car is ${m.position} market by ${D.fmt(Math.abs(m.diff))}.`); }
  if (priorHere.length) extra.push(`EARLIER QUESTIONS FROM THIS VISITOR ABOUT THIS CAR:\n${priorHere.map((p) => `Q: ${p.q}\nA: ${p.a}`).join('\n')}`);
  if (priorOther.length) extra.push(`EARLIER QUESTIONS FROM THIS VISITOR ABOUT OTHER CARS (use to personalise, e.g. they care about towing):\n${priorOther.map((p) => `[${p.stockNo || 'general'}] ${p.q}`).join('\n')}`);
  const trace = [{ kind: 'dms', label: unit ? `Listing + provenance for ${unit.stockNo} passed to the agent` : `${D.units().length} used units summarised for the agent` }];
  if (prior.length) trace.push({ kind: 'memory', label: `${priorHere.length} earlier question(s) on this car, ${priorOther.length} on others, recalled for this session` });
  const langHint = lang && LANG[lang] && lang !== 'en' ? ` UI language: ${LANG[lang]}.` : '';
  if (arag.configured() && q) {
    try {
      const rid = unit ? D.resourceIdOf(unit.stockNo) : null;
      const filter = unit ? labelOr([...(rid ? [{ prop: 'resource', id: rid }] : [{ prop: 'label', labelset: 'topic', label: 'used' }]), ...topicPairs(POLICY_TOPICS), ...(unit.modelId ? [{ prop: 'label', labelset: 'model', label: unit.modelId }] : [])]) : labelOr([...topicPairs(['used', ...POLICY_TOPICS])]);
      const r = await arag.ask({ query: q, system: ASK_SYSTEM + langHint, extraContext: extra, jsonSchema: ASK_SCHEMA, history: historyFor(history), filterExpression: filter, timeoutMs: 20000, topK: 12 });
      trace.unshift({ kind: 'kb', label: `Knowledge box: ${r.sources.length} source document(s)${rid ? ' including this car\'s own resource' : ''}` });
      const json = r.json && typeof r.json === 'object' ? r.json : null;
      if (json && typeof json.answer === 'string' && json.answer.trim() && !/^not enough data/i.test(json.answer)) return { answer: json.answer.trim(), citations: citationsFrom(r.sources), trace, actions: validActions(json.actions, unit), by: 'agent' };
      trace.push({ kind: 'kb', label: `No grounded answer (${r.status}); scripted answer from the record` });
    } catch (e) { trace.unshift({ kind: 'kb', label: 'Knowledge box unavailable; scripted answer from the record' }); console.warn(`[used ask] ${e.message}`); }
  } else trace.unshift({ kind: 'kb', label: 'Knowledge box not configured; scripted answer from the record' });
  return { answer: scriptedAnswer(q, unit, priorHere), citations: [], trace, actions: unit ? [{ type: 'enquire', stockNo: unit.stockNo, label: 'Enquire about this car' }] : [{ type: 'match', stockNo: null, label: 'Find what\'s right for me' }], by: 'scripted' };
}

router.post('/ask', wrap(async (req, res) => {
  const b = req.body || {}; if (!str(b.question)) return res.status(400).json({ error: 'question is required' });
  const sid = sidOf(req);
  const out = await answer({ question: b.question, lang: b.lang, history: b.history, unit: null, sid });
  D.rememberAsk(sid, null, b.question, out.answer, b.lang);
  events.logServer(sid, 'used_ask', { stockNo: null, questionLength: str(b.question, 1000).length, lang: b.lang });
  res.json(out);
}));

// ── report for Domo ──────────────────────────────────────────────────────────
router.get('/report', (req, res) => {
  const days = Math.min(365, Math.max(1, num(req.query.days) || 30)); const cut = Date.now() - days * 86400000;
  const ev = events.readEvents().filter((e) => e.type.startsWith('used_') && Date.parse(e.ts) > cut);
  const views = {}; const enq = { enquire: 0, finance: 0, reserve: 0 }; let asks = 0, watches = 0, matches = 0; const sessions = new Set();
  for (const e of ev) { if (e.sid) sessions.add(e.sid); if (e.type === 'used_view') views[e.data.stockNo] = (views[e.data.stockNo] || 0) + 1; if (e.type === 'used_ask') asks++; if (e.type === 'used_enquiry') enq[e.data.kind]++; if (e.type === 'used_watch') watches++; if (e.type === 'used_match_result') matches++; }
  const qpc = {}; for (const r of D.sessionRows()) if (r.kind === 'ask' && r.stockNo && Date.parse(r.ts) > cut) qpc[r.stockNo] = (qpc[r.stockNo] || 0) + 1;
  res.json({ days, sessions: sessions.size, views: Object.values(views).reduce((a, b) => a + b, 0), asks, enquiries: enq, watches, matchCompletions: matches, topViewed: Object.entries(views).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([stockNo, n]) => ({ stockNo, n })), questionsPerCar: Object.entries(qpc).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([stockNo, n]) => ({ stockNo, n })), watchersByCar: D.units().map((u) => ({ stockNo: u.stockNo, n: D.watchersOf(u.stockNo) })).filter((x) => x.n).sort((a, b) => b.n - a.n), commentsGenerated: Object.keys(D.commentsStore().items || {}).length, unitsListed: D.units().length });
});

// ── per-unit routes ──────────────────────────────────────────────────────────
router.param('stockNo', (req, res, next, v) => { const u = STOCK_RE.test(String(v)) ? D.unitById(v) : null; if (!u) return res.status(404).json({ error: 'unknown stock number' }); req.unit = u; next(); });

router.get('/:stockNo', (req, res) => {
  const u = req.unit; const sid = sidOf(req);
  const comments = D.commentsFor(u);
  res.json({ unit: { ...u, status: D.effectiveStatus(u), siteName: D.siteName(u.siteId), site: D.sites().find((s) => s.id === u.siteId) }, comments, market: D.marketFor(u), similar: D.similarTo(u).map((x) => D.card(x)), yourQuestions: sid ? D.questionsFor(sid, u.stockNo) : [], watchers: D.watchersOf(u.stockNo), resourceId: D.resourceIdOf(u.stockNo), priceNote: D.priceNote(),
    trace: [{ kind: comments.by === 'agent' ? 'kb' : 'dms', label: comments.by === 'agent' ? `Dealer comments written by the agent on ${(comments.generatedAt || '').slice(0, 10)} from this car's listing and provenance` : 'Dealer comments composed from the record (agent copy not generated yet)' }, { kind: 'domo', label: 'Market position from Domo used_market_prices (stand-in)' }] });
});
router.get('/:stockNo/questions', (req, res) => { const sid = sidOf(req); res.json({ questions: sid ? D.questionsFor(sid, req.unit.stockNo) : [] }); });

router.post('/:stockNo/ask', wrap(async (req, res) => {
  const b = req.body || {}; if (!str(b.question)) return res.status(400).json({ error: 'question is required' });
  const sid = sidOf(req); const u = req.unit;
  const out = await answer({ question: b.question, lang: b.lang, history: b.history, unit: u, sid });
  D.rememberAsk(sid, u.stockNo, b.question, out.answer, b.lang);
  events.logServer(sid, 'used_ask', { stockNo: u.stockNo, questionLength: str(b.question, 1000).length, lang: b.lang });
  res.json({ ...out, yourQuestions: sid ? D.questionsFor(sid, u.stockNo) : [] });
}));

router.post('/:stockNo/enquiry', wrap(async (req, res) => {
  const b = req.body || {}; const u = req.unit; const sid = sidOf(req);
  const kind = ['enquire', 'finance', 'reserve'].includes(b.kind) ? b.kind : 'enquire';
  const name = str(b.name, 80); const email = str(b.email, 120); const phone = str(b.phone, 40);
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!email && !phone) return res.status(400).json({ error: 'email or phone is required' });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'email is invalid' });
  if (kind === 'reserve' && D.effectiveStatus(u) !== 'on_lot') return res.status(409).json({ error: `this car is ${D.effectiveStatus(u).replace('_', ' ')} and cannot be reserved online` });
  const ref = `UE-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const [firstName, ...rest] = name.split(/\s+/); const lastName = rest.join(' ') || '-';
  let leadId = null;
  try {
    const db = await import('./dms/db.mjs');
    const now = new Date().toISOString();
    const cust = db.insert('customers', { id: db.nextId('customers', 'C'), firstName, lastName, email: email || null, phone: phone || null, suburb: null, postcode: null, siteId: u.siteId, unitsPurchased: 0, source: 'web-used', createdAt: now, tags: ['used-web'], notes: '' });
    const owner = db.all('staff').find((s) => s.role === 'salesperson' && s.siteId === u.siteId)?.id || null;
    const lead = db.insert('leads', { id: db.nextId('leads', 'L'), customerId: cust.id, customerRef: sid, siteId: u.siteId, ownerId: owner, source: 'harbourline.com.au/used', channel: 'web-form', status: 'new', createdAt: now, updatedAt: now,
      interest: { used: true, stockNo: u.stockNo, make: u.make, model: u.model, modelId: u.modelId, year: u.year, grade: u.grade, price: u.price, kind }, configuratorSessionId: sid, finderAnswers: (D.lastMatch(sid) || []), viewed: [], bookingId: null, campaignId: null, score: kind === 'reserve' ? 92 : kind === 'finance' ? 80 : 68,
      notes: [`${kind === 'reserve' ? 'Online reservation (48 h hold, no payment taken)' : kind === 'finance' ? `Finance enquiry${num(b.financeTermMonths) ? `, ${num(b.financeTermMonths)} months` : ''}${num(b.deposit) ? `, deposit ${D.fmt(num(b.deposit))}` : ''}` : 'Web enquiry'} for ${u.stockNo} ${D.title(u)} ${u.grade}.`, str(b.message, 1000)].filter(Boolean).join(' '), statusHistory: [{ status: 'new', at: now }], usedRef: ref });
    leadId = lead.id;
  } catch (e) { console.warn(`[used enquiry] DMS lead not created: ${e.message}`); }
  let hold = null;
  if (kind === 'reserve') { hold = { stockNo: u.stockNo, ref, until: new Date(Date.now() + 48 * 3600000).toISOString(), sid }; await D.addHold(hold); }
  await D.addEnquiry({ ref, kind, stockNo: u.stockNo, leadId, sid, at: new Date().toISOString() });
  events.logServer(sid, 'used_enquiry', { stockNo: u.stockNo, kind });
  const site = D.sites().find((s) => s.id === u.siteId);
  res.status(201).json({ ok: true, ref, leadId, hold: hold ? { until: hold.until } : null, message: kind === 'reserve' ? `Held for you until ${new Date(hold.until).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' })}. No payment has been taken in this prototype; ${site?.name || 'the site'} will call to confirm.` : kind === 'finance' ? `Thanks ${firstName}. A business manager at ${site?.name || 'the site'} will send an indicative quote within one business hour (${site?.phone || ''}).` : `Thanks ${firstName}. The ${site?.name || ''} team will be in touch within one business hour (${site?.phone || ''}).` });
}));

// ── agent-written dealer comments ────────────────────────────────────────────
const COMMENTS_SCHEMA = { name: 'dealer_comments', description: 'Dealer comments for a pre-owned listing', parameters: { type: 'object', properties: { headline: { type: 'string', description: 'Max 90 characters, factual, no exclamation marks' }, body: { type: 'string', description: '90 to 160 words, plain prose, Australian English, no bullet points' }, highlights: { type: 'array', items: { type: 'string' }, description: '3 to 5 short facts from the record' }, honest: { type: 'array', items: { type: 'string' }, description: 'Things a careful buyer should know, taken from inspection notes; empty if none' } }, required: ['headline', 'body', 'highlights', 'honest'] } };
const COMMENTS_SYSTEM = `You write dealer comments for Harbourline Toyota's pre-owned listings. Write like a knowledgeable, honest salesperson: specific, calm, no hype, no exclamation marks, no superlatives ("immaculate", "perfect"), never claim "accident-free". Use ONLY facts in the LISTING AND PROVENANCE context (and the programme terms document for what Toyota Certified includes). Mention: what the car is and who it suits, kilometres and service history (how many logged services, where), the inspection and anything it noted, warranty, and the price excluding government charges. The headline must lead with what is most distinctive about THIS car (one owner, low kilometres for its age, an ex-demonstrator, a repaired item, a price below market, seven seats, a manual gearbox, a tow bar); do not use the phrase "with Toyota Certified cover" and do not repeat the year-make-model as the headline. Vary sentence openings; never start the body with the year. Australian English.`;
export async function generateComments(u) {
  if (!arag.configured()) return { ok: false, reason: 'not configured' };
  const rid = D.resourceIdOf(u.stockNo);
  const r = await arag.ask({ query: `Write the dealer comments for ${D.longTitle(u)}.`, system: COMMENTS_SYSTEM, extraContext: [`LISTING AND PROVENANCE:\n${D.unitContext(u)}`], jsonSchema: COMMENTS_SCHEMA, filterExpression: labelOr([...(rid ? [{ prop: 'resource', id: rid }] : []), ...topicPairs(['warranty', 'policy'])]), timeoutMs: 30000, topK: 8 });
  const c = r.json; const err = D.validateComments(u, c);
  if (err) return { ok: false, reason: err, raw: c };
  return { ok: true, comments: { headline: c.headline.trim(), body: c.body.trim(), highlights: c.highlights.map((x) => str(x, 120)).filter(Boolean).slice(0, 5), honest: (c.honest || []).map((x) => str(x, 160)).filter(Boolean).slice(0, 4), sources: r.sources.slice(0, 3).map((s) => s.title), generatedAt: new Date().toISOString(), resourceId: rid } };
}
router.post('/comments/refresh', wrap(async (req, res) => {
  const only = str(req.body?.stockNo, 10).toUpperCase();
  const list = only ? [D.unitById(only)].filter(Boolean) : D.units().slice(0, 3);
  if (!list.length) return res.status(404).json({ error: 'unknown stock number' });
  const items = {}; const failed = [];
  for (const u of list) { try { const r = await generateComments(u); if (r.ok) items[u.stockNo] = r.comments; else failed.push({ stockNo: u.stockNo, reason: r.reason }); } catch (e) { failed.push({ stockNo: u.stockNo, reason: e.message }); } }
  if (Object.keys(items).length) { const { updateDealer } = await import('./state.mjs'); await updateDealer('used_comments.generated.json', (cur) => ({ generatedAt: new Date().toISOString(), model: process.env.ARAG_GENERATIVE_MODEL || 'kb default', items: { ...(cur?.items || {}), ...items } }), { items: {} }); }
  res.json({ regenerated: Object.keys(items).length, items, failed });
}));

export default router;
