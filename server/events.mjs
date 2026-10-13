// events.mjs — first-party configurator events (append-only JSON lines) and the
// aggregate report for Domo.
//
// File: events.jsonl in the dealer state dir (see state.mjs; seed copy in
// content/dealer). One line per event: {ts, sid, type, data, src}. No PII: `sid` is a
// random id the page generates per browser session; data holds only catalogue ids,
// canonical answer slugs, stock unit ids, booking ids, lengths and language codes
// (never free text).
//
// Who logs what (so nothing is counted twice):
//   server  ask, booking, booking_answer   — logged by /api/ask, /api/testdrive/book,
//           /api/testdrive/answers. POST /api/events answers 202 {logged:false}.
//   server+client  finder_answer, finder_result — /api/finder/next logs the newest
//           answer (and the result on step 5) when the request carries a sid and is NOT
//           a prefetch (header `x-prefetch: 1` or body `prefetch: true`). The page also
//           POSTs them when it shows a prefetched step. Duplicates (same sid, type and
//           payload within 30 min) are dropped.
//   client  build_change, offer_view, offer_click — POST /api/events only
//           (offer_view de-duplicated per sid + unit for 30 min).
//
// Seed: seedEvents() writes ~400 synthetic events over the last 30 days across ~60
// sessions (src "seed"), only when the file is missing or empty
// (scripts/seed-events.mjs).
import { readFileSync, existsSync, statSync } from 'node:fs';
import { modelById, gradeOf, colourById, interiorById, packById } from './data.mjs';
import { dealerPath, appendDealerLines } from './state.mjs';
import { VOCAB } from './finder-fallback.mjs';

export const TYPES = ['finder_answer', 'finder_result', 'build_change', 'offer_view', 'offer_click', 'ask', 'booking', 'booking_answer'];
export const SERVER_ONLY = new Set(['ask', 'booking', 'booking_answer']);
const LANGS = new Set(['en', 'es', 'zh', 'ar', 'hi', 'vi', 'ko', 'ja', 'it', 'el', 'fr', 'de', 'pt', 'tl', 'id']);
const SID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9:-]{0,39}$/;
const BOOKING_RE = /^TD-[A-Z0-9]{5}$/;
const DEDUPE_MS = 30 * 60000;

export const validSid = (v) => (typeof v === 'string' && SID_RE.test(v) ? v : null);
/** Session id from the `x-sid` header or a body `sid` field. */
export const sidOf = (req) => validSid(req.get?.('x-sid')) || validSid(req.body?.sid) || null;
export const isPrefetch = (req) => req.get?.('x-prefetch') === '1' || req.body?.prefetch === true;

const slug = (v) => { const s = String(v ?? '').toLowerCase().replace(/[^a-z0-9:-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); return SLUG_RE.test(s) ? s : null; };
const modelOk = (v) => (typeof v === 'string' && modelById(v) ? v : null);

/** Validate + normalise an event payload. Returns {data} or {error}. */
export function validateEvent(type, d, s) {
  if (!TYPES.includes(type)) return { error: `type must be one of ${TYPES.join(', ')}` };
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { error: 'data must be an object' };
  const unitOk = (v) => (typeof v === 'string' && s?.stock_by_site.some((u) => u.id === v.toUpperCase()) ? v.toUpperCase() : null);
  switch (type) {
    case 'finder_answer': {
      if (!VOCAB.includes(d.questionId)) return { error: 'data.questionId must be a finder question id' };
      const value = slug(d.value); if (!value) return { error: 'data.value must be an option id' };
      return { data: { questionId: d.questionId, value } };
    }
    case 'finder_result': {
      const recommended = [...new Set((Array.isArray(d.recommended) ? d.recommended : []).map(modelOk).filter(Boolean))].slice(0, 4);
      if (!recommended.length) return { error: 'data.recommended must list catalogue model ids' };
      return { data: { recommended } };
    }
    case 'build_change': {
      const modelId = modelOk(d.modelId); if (!modelId) return { error: 'data.modelId must be a catalogue model id' };
      return { data: {
        modelId, gradeId: gradeOf(modelId, d.gradeId)?.id || null, colourId: colourById(d.colourId)?.id || null,
        ...(d.interiorId != null ? { interiorId: interiorById(d.interiorId)?.id || null } : {}),
        packs: [...new Set((Array.isArray(d.packs) ? d.packs : []).filter((p) => typeof p === 'string' && packById(p)))].slice(0, 6),
      } };
    }
    case 'offer_view': case 'offer_click': {
      const unitId = unitOk(d.unitId); if (!unitId) return { error: 'data.unitId must be a stock unit id' };
      return { data: { unitId } };
    }
    case 'ask': {
      const n = Number(d.questionLength);
      if (!Number.isInteger(n) || n < 0 || n > 5000) return { error: 'data.questionLength must be an integer' };
      return { data: { questionLength: n, lang: LANGS.has(d.lang) ? d.lang : 'en', modelId: modelOk(d.modelId) } };
    }
    case 'booking': {
      if (!BOOKING_RE.test(String(d.bookingId || ''))) return { error: 'data.bookingId invalid' };
      return { data: { bookingId: d.bookingId, modelId: modelOk(d.modelId), unitId: unitOk(d.unitId), site: slug(d.site), whenLabel: String(d.whenLabel || '').replace(/[\u0000-\u001f]+/g, ' ').slice(0, 40) } };
    }
    case 'booking_answer': {
      if (!BOOKING_RE.test(String(d.bookingId || ''))) return { error: 'data.bookingId invalid' };
      const questionId = slug(d.questionId); const value = slug(d.value);
      if (!questionId || !value) return { error: 'data.questionId and data.value must be ids' };
      return { data: { bookingId: d.bookingId, questionId, value } };
    }
    default: return { error: 'unknown type' };
  }
}

// ── write ────────────────────────────────────────────────────────────────────
const recent = new Map(); // dedupe key → ts
function dedupeKey(sid, type, data) {
  if (!sid) return null;
  if (type === 'finder_answer') return `${sid}|${type}|${data.questionId}|${data.value}`;
  if (type === 'finder_result') return `${sid}|${type}|${data.recommended.join(',')}`;
  if (type === 'offer_view') return `${sid}|${type}|${data.unitId}`;
  return null;
}
/**
 * Append one already-validated event. Returns true when written (false = duplicate).
 * Never throws: analytics must not break the request that triggered it.
 */
export function logEvent(sid, type, data, src = 'server') {
  try {
    const now = Date.now();
    const key = dedupeKey(sid, type, data);
    if (key) {
      if (now - (recent.get(key) || 0) < DEDUPE_MS) return false;
      recent.set(key, now);
      if (recent.size > 20000) for (const [k, t] of recent) if (now - t > DEDUPE_MS) recent.delete(k);
    }
    appendDealerLines('events.jsonl', [JSON.stringify({ ts: new Date(now).toISOString(), sid: sid || null, type, data, src })]);
    return true;
  } catch (e) {
    console.warn(`[events] ${type}: ${e.message}`);
    return false;
  }
}
/** Validate then log (server-side call sites). */
export function logServer(sid, type, data, s) {
  const v = validateEvent(type, data, s);
  if (v.error) { console.warn(`[events] dropped ${type}: ${v.error}`); return false; }
  return logEvent(sid, type, v.data, 'server');
}

// ── read ─────────────────────────────────────────────────────────────────────
let readCache = { path: null, mtime: 0, size: 0, rows: [] };
export function readEvents() {
  const p = dealerPath('events.jsonl');
  if (!existsSync(p)) return [];
  const st = statSync(p);
  if (readCache.path === p && readCache.mtime === st.mtimeMs && readCache.size === st.size) return readCache.rows;
  const rows = [];
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const e = JSON.parse(line); if (e && e.type && e.ts) rows.push(e); } catch { /* skip a torn line */ }
  }
  readCache = { path: p, mtime: st.mtimeMs, size: st.size, rows };
  return rows;
}
export const eventsForSession = (sid) => (sid ? readEvents().filter((e) => e.sid === sid) : []);

// ── report ───────────────────────────────────────────────────────────────────
const inc = (o, k, n = 1) => { if (k == null) return; o[k] = (o[k] || 0) + n; };
const inc2 = (o, k1, k2) => { if (k1 == null || k2 == null) return; o[k1] = o[k1] || {}; inc(o[k1], k2); };
const ratio = (a, b) => (b ? Math.round((a / b) * 1000) / 1000 : 0);

/** Aggregate of the last `days` days, shaped for a Domo dataset / card. */
export function configuratorReport(days = 30, now = new Date()) {
  const since = new Date(now.getTime() - days * 86400000);
  const ev = readEvents().filter((e) => Date.parse(e.ts) >= since.getTime());
  const sessions = new Set(); const finderStarted = new Set(); const finderDone = new Set(); const clicked = new Set(); const booked = new Set();
  const out = {
    since: since.toISOString(), days, generatedAt: now.toISOString(), events: ev.length,
    sessions: 0, finderStarts: 0, finderCompletions: 0, answersByQuestion: {}, modelsConfigured: {}, coloursChosen: {}, packsChosen: {},
    offersShown: {}, offersClicked: {}, questionsAsked: 0, bookings: { count: 0, bySite: {}, byModel: {} }, bookingAnswers: {},
    conversion: { finderToBooking: 0, offerClickToBooking: 0 },
  };
  const seenBuild = new Set();
  for (const e of ev) {
    const d = e.data || {}; const sid = e.sid;
    if (sid) sessions.add(sid);
    switch (e.type) {
      case 'finder_answer': if (sid) finderStarted.add(sid); inc2(out.answersByQuestion, d.questionId, d.value); break;
      case 'finder_result': if (sid) finderDone.add(sid); else out.finderCompletions += 1; break;
      case 'build_change': {
        // Counted once per session per model / colour / pack, so flicking through swatches is not inflation.
        const k = (x) => `${sid}|${x}`;
        if (!seenBuild.has(k(`m:${d.modelId}`))) { seenBuild.add(k(`m:${d.modelId}`)); inc(out.modelsConfigured, d.modelId); }
        if (d.colourId && !seenBuild.has(k(`c:${d.colourId}`))) { seenBuild.add(k(`c:${d.colourId}`)); inc(out.coloursChosen, d.colourId); }
        for (const p of d.packs || []) if (!seenBuild.has(k(`p:${p}`))) { seenBuild.add(k(`p:${p}`)); inc(out.packsChosen, p); }
        break;
      }
      case 'offer_view': inc(out.offersShown, d.unitId); break;
      case 'offer_click': inc(out.offersClicked, d.unitId); if (sid) clicked.add(sid); break;
      case 'ask': out.questionsAsked += 1; break;
      case 'booking': out.bookings.count += 1; inc(out.bookings.bySite, d.site); inc(out.bookings.byModel, d.modelId); if (sid) booked.add(sid); break;
      case 'booking_answer': inc2(out.bookingAnswers, d.questionId, d.value); break;
      default: break;
    }
  }
  out.sessions = sessions.size;
  out.finderStarts = finderStarted.size;
  out.finderCompletions += finderDone.size;
  out.conversion = {
    finderToBooking: ratio([...finderDone].filter((x) => booked.has(x)).length, finderDone.size),
    offerClickToBooking: ratio([...clicked].filter((x) => booked.has(x)).length, clicked.size),
  };
  return out;
}

// ── seed ─────────────────────────────────────────────────────────────────────
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Synthetic but plausible events over the last `days` days (deterministic for a given `now` day). */
export function syntheticEvents({ sessions = 66, days = 30, now = new Date(), stockUnits = [], seed = 20261014 } = {}) {
  const rnd = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const wpick = (pairs) => { const tot = pairs.reduce((n, [, w]) => n + w, 0); let r = rnd() * tot; for (const [v, w] of pairs) { if ((r -= w) < 0) return v; } return pairs[0][0]; };
  const id = (n, A = 'abcdefghijklmnopqrstuvwxyz0123456789') => Array.from({ length: n }, () => A[Math.floor(rnd() * A.length)]).join('');
  const PATHS = {
    family: { answers: [['people', ['five', 'five', 'seven', 'seven', 'two']], ['towing', ['none', 'none', 'light', 'medium']], ['power', ['hybrid', 'hybrid', 'any', 'ev']], ['budget', ['b55', 'b75', 'b75', 'b100']]], models: [['rav4', 5], ['kluger', 4], ['corolla-cross', 3], ['prado', 1], ['bz4x', 1]] },
    commute: { answers: [['distance', ['short', 'medium', 'medium', 'long']], ['power', ['hybrid', 'hybrid', 'ev', 'any']], ['priorities', ['efficiency', 'efficiency', 'safety', 'tech', 'style']], ['budget', ['b40', 'b55', 'b55', 'b75']]], models: [['corolla-cross', 4], ['yaris-cross', 3], ['camry', 3], ['corolla', 2], ['c-hr', 2], ['bz4x', 2], ['rav4', 2]] },
    work: { answers: [['worktype', ['trade', 'trade', 'farm', 'fleet']], ['towing', ['light', 'medium', 'heavy', 'heavy']], ['terrain', ['sealed', 'gravel', 'gravel', 'offroad']], ['budget', ['b60', 'b80', 'b80', 'b110']]], models: [['hilux', 6], ['landcruiser-300', 1], ['fortuner', 1], ['camry', 1]] },
    adventure: { answers: [['towing', ['medium', 'heavy', 'heavy']], ['terrain', ['gravel', 'offroad', 'offroad']], ['people', ['two', 'five', 'five', 'seven']], ['budget', ['b80', 'b110', 'b110', 'b160']]], models: [['prado', 5], ['landcruiser-300', 3], ['hilux', 3], ['fortuner', 2], ['kluger', 1]] },
  };
  const SITES = [['par', 6], ['hor', 2], ['pen', 2], ['liv', 1]];
  const LANG_W = [['en', 30], ['zh', 3], ['vi', 2], ['ar', 2], ['hi', 2], ['ko', 1], ['es', 1]];
  const BOOK_Q = { tow: ['tow-load', ['caravan', 'boat-camper', 'trailer', '2500-3000']], ev: ['ev-home-charge', ['yes', 'yes', 'no']], seats: ['three-child-seats', ['yes', 'no']], third: ['third-row-who', ['kids', 'kids', 'teens-adults']], ute: ['ute-tub-tray', ['tub', 'tray', 'canopy']], trade: ['trade-in', ['yes', 'yes', 'no']], finance: ['finance-plan', ['cash', 'toyota-finance', 'novated', 'undecided']], hybrid: ['hybrid-first', ['yes', 'no', 'no']] };
  const unitsOf = (m) => stockUnits.filter((u) => u.model === m);
  const agedUnits = stockUnits.filter((u) => u.bonus > 0);
  const out = [];
  const t0 = now.getTime() - days * 86400000;
  for (let i = 0; i < sessions; i++) {
    // Sessions skew to evenings and weekends; spread over the window.
    const day = 1 + Math.floor(rnd() * (days - 1));
    const base = new Date(t0 + day * 86400000); base.setUTCHours(0, 0, 0, 0);
    const hourSyd = wpick([[9, 1], [11, 2], [13, 2], [17, 2], [19, 4], [20, 4], [21, 3]]);
    let t = base.getTime() + ((hourSyd - 11 + 24) % 24) * 3600000 + Math.floor(rnd() * 3600000);
    if (t > now.getTime() - 3600000) t = now.getTime() - 3600000 - Math.floor(rnd() * 86400000);
    const sid = `s_${id(14)}`;
    const push = (type, data) => { t += 15000 + Math.floor(rnd() * 90000); out.push({ ts: new Date(t).toISOString(), sid, type, data, src: 'seed' }); };
    const pathKey = wpick([['family', 4], ['commute', 3], ['work', 2], ['adventure', 2]]);
    const path = PATHS[pathKey];
    let recommended = [];
    let finderDone = false;
    if (rnd() < 0.68) {
      push('finder_answer', { questionId: 'use', value: pathKey });
      const steps = rnd() < 0.78 ? 4 : Math.floor(rnd() * 4);
      for (const [q, vals] of path.answers.slice(0, steps)) push('finder_answer', { questionId: q, value: pick(vals) });
      if (steps === 4) {
        const pool = [...path.models]; recommended = [];
        while (recommended.length < 3 && pool.length) { const m = wpick(pool); recommended.push(m); pool.splice(pool.findIndex(([x]) => x === m), 1); }
        push('finder_result', { recommended }); finderDone = true;
      }
    }
    const configured = [];
    const nBuilds = finderDone ? 1 + Math.floor(rnd() * 3) : Math.floor(rnd() * 3);
    for (let b = 0; b < nBuilds; b++) {
      const modelId = recommended.length && rnd() < 0.8 ? pick(recommended) : wpick(path.models);
      const m = modelById(modelId); if (!m) continue;
      const g = m.grades[Math.min(m.grades.length - 1, Math.floor(rnd() * m.grades.length))];
      const colourId = wpick(m.colours.map((c, k) => [c, k < 3 ? 3 : 1]));
      const packs = (m.accessories || []).filter((p) => (p === 'tow' && ['work', 'adventure'].includes(pathKey) ? rnd() < 0.75 : rnd() < 0.25));
      push('build_change', { modelId, gradeId: g.id, colourId, packs });
      configured.push(modelId);
    }
    let clickedUnit = null;
    if (configured.length || rnd() < 0.3) {
      const shown = [...new Set([...configured.flatMap(unitsOf).filter((u) => u.bonus > 0), ...(rnd() < 0.5 && agedUnits.length ? [pick(agedUnits)] : [])])].slice(0, 2);
      for (const u of shown) push('offer_view', { unitId: u.id });
      if (shown.length && rnd() < 0.28) { clickedUnit = pick(shown); push('offer_click', { unitId: clickedUnit.id }); }
    }
    const asks = rnd() < 0.45 ? 1 + Math.floor(rnd() * 2) : 0;
    for (let a = 0; a < asks; a++) push('ask', { questionLength: 18 + Math.floor(rnd() * 120), lang: wpick(LANG_W), modelId: configured[0] || null });
    const pBook = 0.05 + (finderDone ? 0.13 : 0) + (clickedUnit ? 0.3 : 0) + (configured.length ? 0.04 : 0);
    if (rnd() < pBook) {
      const modelId = clickedUnit?.model || configured[0] || recommended[0] || wpick(path.models);
      const unit = clickedUnit || unitsOf(modelId)[0] || null;
      const bookingId = `TD-${id(5, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789')}`;
      const when = new Date(t + (1 + Math.floor(rnd() * 6)) * 86400000);
      const whenLabel = `${new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric', month: 'short' }).format(when).replace(/,/g, '')}, ${pick(['9:00 am', '9:45 am', '10:30 am', '11:15 am', '1:30 pm', '2:15 pm', '3:00 pm', '3:45 pm'])}`;
      const site = unit?.site && rnd() < 0.7 ? unit.site : wpick(SITES);
      push('booking', { bookingId, modelId, unitId: unit?.id || null, site, whenLabel });
      if (rnd() < 0.8) {
        const m = modelById(modelId);
        const groups = [m.towKg >= 2000 ? 'tow' : null, m.powertrain === 'ev' ? 'ev' : null, m.seats >= 7 ? 'third' : m.body.startsWith('suv') ? 'seats' : null, m.body === 'ute' ? 'ute' : null, m.powertrain === 'hybrid' ? 'hybrid' : null, 'trade', 'finance'].filter(Boolean).slice(0, 3);
        for (const gk of groups) { const [questionId, vals] = BOOK_Q[gk]; push('booking_answer', { bookingId, questionId, value: pick(vals) }); }
      }
    }
  }
  return out.sort((a, b) => a.ts.localeCompare(b.ts));
}

/** Seed events.jsonl when it is missing or empty. Returns the number of events written. */
export function seedEvents({ stockUnits = [], now = new Date() } = {}) {
  const p = dealerPath('events.jsonl');
  if (existsSync(p) && readFileSync(p, 'utf8').trim()) return 0;
  const rows = syntheticEvents({ stockUnits, now });
  appendDealerLines('events.jsonl', rows.map((e) => JSON.stringify(e)));
  return rows.length;
}
