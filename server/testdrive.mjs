// testdrive.mjs — test-drive slots, booking and pre-drive questions.
//
//  GET  /api/testdrive/slots   → slotsFor()   10 days from today (Australia/Sydney), 45-min
//                                slots inside each site's hours; taken = stand-in diary
//                                pattern (calendar.json) + bookings.json + in-flight holds.
//  POST /api/testdrive/book    → book()       validates the slot, holds it, asks the ARAG
//                                agent for 3 salesperson questions (answer_json_schema),
//                                tops up / falls back from testdrive-fallback.mjs, picks an
//                                incentive (deterministic), appends to bookings.json.
//  POST /api/testdrive/answers → answers()    validates answers against the booking's own
//                                questions, builds the prep list (deterministic) and asks
//                                ARAG for a two-sentence salesperson reply (fallback).
//  GET  /api/testdrive/handover/:id → handover()  the salesperson's pre-visit sheet: car,
//                                what they viewed, finder and booking answers, promotions to
//                                offer, incentive, prep, and 3-5 talking points written by
//                                the ARAG agent as a sales-manager briefing (deterministic
//                                fallback). Written into the booking record (`handover`) so
//                                the DMS write-back carries it; regenerated when the answers
//                                change. Generated in the background after book and answers.
//
// Client free text never reaches a prompt: models/grades/units resolve against the
// catalogue and stock, finder answers are canonical slugs, and answer labels come
// from the booking's stored options.
import { randomInt } from 'node:crypto';
import * as arag from './arag.mjs';
import { modelById, gradeOf, siteName, stockSummary, colourById, interiorById, packById, priceOf, fmtAud } from './data.mjs';
import { readDealer, updateDealer } from './state.mjs';
import { promotionsFor } from './dealer.mjs';
import { cleanAnswers, buildText, LANG } from './assistant.mjs';
import { canon, describeAnswer } from './finder-fallback.mjs';
import { logServer, eventsForSession } from './events.mjs';
import { pickQuestions, pickIncentive, prepFor, replyFor, bankGroup, bankQuestion } from './testdrive-fallback.mjs';

const TZ = 'Australia/Sydney';
const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ── time helpers (all dates are Sydney calendar dates, YYYY-MM-DD) ───────────
function sydneyNow(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, mins: Number(p.hour) * 60 + Number(p.minute) };
}
const utcNoon = (ymd) => new Date(`${ymd}T12:00:00Z`);
const addDays = (ymd, n) => { const d = utcNoon(ymd); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dowOf = (ymd) => utcNoon(ymd).getUTCDay();
const dayLabel = (ymd) => new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(utcNoon(ymd)).replace(/,/g, '');
const toMins = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const hhmm = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}${String(mins % 60).padStart(2, '0')}`;
const timeLabel = (mins) => { const h = Math.floor(mins / 60); const m = mins % 60; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };
function sydneyOffset(ymd, mins) {
  // Offset in force at that local time (DST changes at 2-3 am, never near a slot).
  const guess = new Date(Date.UTC(...ymd.split('-').map((x, i) => (i === 1 ? Number(x) - 1 : Number(x))), Math.floor(mins / 60), mins % 60) - 10 * 3600e3);
  const name = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, timeZoneName: 'longOffset' }).formatToParts(guess).find((x) => x.type === 'timeZoneName')?.value || 'GMT+10:00';
  return name.replace('GMT', '') || '+00:00';
}
const isoAt = (ymd, mins) => `${ymd}T${hhmm(mins).slice(0, 2)}:${hhmm(mins).slice(2)}:00${sydneyOffset(ymd, mins)}`;
function fnv(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }

// ── calendar ─────────────────────────────────────────────────────────────────
const calendar = () => readDealer('calendar.json', { sites: [], slotMinutes: 45, daysAhead: 10, minLeadMinutes: 60, extraBusyPercent: 0 });
export const siteIds = () => calendar().sites.map((x) => x.id);
const siteOf = (id) => calendar().sites.find((x) => x.id === id);
const bookingsData = () => readDealer('bookings.json', { bookings: [] });
const holds = new Set(); // slot ids held while a booking is being prepared

function takenSlots() {
  const t = new Set(holds);
  for (const b of bookingsData().bookings || []) if (b.slotId && b.status !== 'cancelled') t.add(b.slotId);
  return t;
}

/** When a unit can be at `siteId`: {availableFrom, note, transferFrom}. */
function unitArrival(s, unit, siteId, today) {
  const target = siteOf(siteId)?.name || siteId;
  if (unit.status === 'in_transit') {
    const days = Number(unit.transit ?? unit.eta_days ?? 14) + (unit.site !== siteId ? 3 : 0);
    return { availableFrom: addDays(today, days), lead: `This car is still on its way to ${siteName(s, unit.site)}`, transferFrom: null };
  }
  if (unit.site === siteId) return null;
  const tf = s.transfer_feasibility.find((t) => t.from_site === unit.site && t.to_site === siteId)
    || s.transfer_feasibility.find((t) => t.from_site === siteId && t.to_site === unit.site);
  let from;
  if (tf?.run_day) { const want = DOW_LONG.indexOf(tf.run_day); from = addDays(today, 1); while (dowOf(from) !== want) from = addDays(from, 1); }
  else from = addDays(today, tf?.lead_days ?? 4);
  return { availableFrom: from, lead: `This car is at ${siteName(s, unit.site)}`, transferFrom: siteName(s, unit.site) };
}

/** Availability for a site (and optionally a unit). Pure apart from the clock. */
export function slotsFor({ siteId, unit, s, now = new Date() }) {
  const cal = calendar(); const site = siteOf(siteId);
  const { date: today, mins: nowMins } = sydneyNow(now);
  const step = cal.slotMinutes || 45; const lead = cal.minLeadMinutes ?? 60; const busyPct = cal.extraBusyPercent || 0;
  const taken = takenSlots();
  const arrival = unit ? unitArrival(s, unit, siteId, today) : null;
  const days = [];
  for (let i = 0; i < (cal.daysAhead || 10); i++) {
    const date = addDays(today, i); const dow = DOW[dowOf(date)];
    const hours = site.hours?.[dow];
    const day = { date, label: dayLabel(date), slots: [] };
    if (!hours) { day.closed = true; days.push(day); continue; }
    const pattern = new Set(site.booked?.[dow] || []);
    for (let t = toMins(hours[0]); t + step <= toMins(hours[1]); t += step) {
      const id = `${site.id}-${date}-${hhmm(t)}`;
      const hm = `${hhmm(t).slice(0, 2)}:${hhmm(t).slice(2)}`;
      const available = !(i === 0 && t < nowMins + lead) && !pattern.has(hm) && fnv(id) % 100 >= busyPct && !taken.has(id)
        && !(arrival && date < arrival.availableFrom);
      day.slots.push({ id, time: timeLabel(t), available });
    }
    days.push(day);
  }
  const out = { site: site.id, siteName: site.name };
  if (unit) out.unitId = unit.id;
  if (arrival) {
    const first = days.find((d) => d.slots.some((x) => x.available));
    out.transferNote = `${arrival.lead}; first available at ${site.name} is ${first ? `${DOW_LONG[dowOf(first.date)]} ${first.label.replace(/^\w+ /, '')}` : 'after the next 10 days'}.`;
  }
  out.days = days;
  return { ...out, _arrival: arrival };
}

// ── questions via ARAG ───────────────────────────────────────────────────────
const Q_SCHEMA = {
  name: 'testdrive_questions',
  description: 'Four candidate pre-drive questions for this customer, best first',
  parameters: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'short kebab-case id' },
            text: { type: 'string' },
            type: { type: 'string', enum: ['choice', 'yesno'] },
            options: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' } }, required: ['id', 'label'] } },
            why: { type: 'string', description: 'one short line: why the answer helps prepare the drive' },
          },
          required: ['id', 'text', 'type', 'options', 'why'],
        },
      },
    },
    required: ['questions'],
  },
};

// Topic of a question (agent-written) → bank group, to avoid duplicates and answered topics.
const TOPICS = [[/charg/i, 'ev'], [/tow|caravan|trailer|ball weight/i, 'tow'], [/child seat|car seat|booster|third row|3rd row/i, 'seats'], [/trad(e|ing).?in/i, 'trade'], [/financ|how .*pay|lease|repayment/i, 'finance'], [/off.?road|beach|sand|low.?range|4wd/i, 'offroad'], [/\btub\b|\btray\b|canopy/i, 'ute'], [/manual|clutch/i, 'gr'], [/hybrid/i, 'hybrid'], [/park|garage/i, 'size'], [/back.?to.?back|compare/i, 'compare'], [/longest|range/i, 'ev-range'], [/track day|motorsport/i, 'gr-use'], [/city|traffic|commut/i, 'commute']];
const topicOf = (text) => (TOPICS.find(([re]) => re.test(text)) || [])[1] || null;
// Questions the finder already answered (never re-ask).
const ANSWERED_RE = {
  use: /what will (you|the car) (mostly )?(use|be)|main(ly)? (use|be (for|used))|mostly be (for|used)|be (mainly|mostly) (for|used)/i,
  people: /how many (people|seats|passengers)/i,
  distance: /how (far|many (km|kilomet))/i,
  towing: /\b(will|do) you (need to )?tow\b|\btow anything\b/i,
  power: /(petrol|diesel|hybrid|electric|powertrain) or /i,
  budget: /budget|how much .*spend|price range/i,
  terrain: /where (does|do) .*road end|sealed or/i,
  worktype: /what kind of work/i,
  priorities: /what matters most/i,
};
const slug = (v, n = 40) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, n);

function validQuestions(json, ctx) {
  const out = []; const seenTopics = new Set();
  for (const q of Array.isArray(json?.questions) ? json.questions : []) {
    if (!q || typeof q.text !== 'string' || !['choice', 'yesno'].includes(q.type)) continue;
    const text = q.text.replace(/\s+/g, ' ').trim().slice(0, 200);
    if (text.length < 8) continue;
    if ([...ctx.answered].some((id) => ANSWERED_RE[id]?.test(text))) continue;
    const id = slug(q.id) || slug(text, 30);
    if (out.some((x) => x.id === id)) continue;
    const topic = topicOf(text);
    if (topic && seenTopics.has(topic)) continue;
    let options;
    if (q.type === 'yesno') {
      const lab = (Array.isArray(q.options) ? q.options : []).map((o) => String(o?.label || '').trim().slice(0, 20));
      options = [{ id: 'yes', label: lab[0] || 'Yes' }, { id: 'no', label: lab[1] || 'No' }];
    } else {
      options = (Array.isArray(q.options) ? q.options : []).filter((o) => o && o.label)
        .map((o) => ({ id: slug(o.id, 30) || slug(o.label, 30), label: String(o.label).replace(/\s+/g, ' ').trim().slice(0, 50) }))
        .filter((o, i, arr) => o.id && arr.findIndex((x) => x.id === o.id) === i);
      if (options.length < 2) continue;
      options = options.slice(0, 4);
    }
    if (topic) seenTopics.add(topic);
    out.push({ id, text, type: q.type, options, why: String(q.why || '').replace(/\s+/g, ' ').trim().slice(0, 140) || 'Helps us have the right car ready.', _topic: topic });
    if (out.length === 3) break;
  }
  return out;
}

const QUESTIONS_SYSTEM = (ctx, langName) => `You are an experienced Toyota salesperson at Harbourline Toyota ${ctx.siteName} (Sydney), preparing for a test drive this customer has just booked for ${ctx.whenLabel}.
Write 4 short candidate questions, best first (we use the first 3 that pass our checks), to ask them before they arrive, so you can have the right car, accessories and information ready.
Rules:
- Every question must be specific to the cars they looked at (VIEWED CARS / CURRENT BUILD) and what they told the finder. Use the knowledge base: spec sheets, the towing guide, finance, trade-in and dealer policy.
- Good examples: looked at Prado and HiLux and tows → "What are you towing and roughly how heavy?" (choice); looked at bZ4X → "Can you charge at home?" (yesno); RAV4 with a family → "Do you need to fit three child seats?" (yesno).
- Never generic, never about budget, and never re-ask what the finder already answered: ${[...ctx.answered].join(', ') || 'nothing yet'} (you may ask a deeper follow-up, e.g. how heavy the caravan is).
- Four different topics. type "yesno" → options [{id:"yes"},{id:"no"}]; type "choice" → 2-4 options with short kebab-case ids and short labels.
- "why" is one short line, in the customer's language, on how the answer helps you prepare.
- Write the questions, labels and why in ${langName}.`;

function contextText(ctx) {
  const lines = ['VIEWED CARS (catalogue facts):'];
  for (const m of ctx.models) lines.push(`- ${m.id} | ${m.name} | ${m.bodyLabel || m.body} | ${m.powertrainLabel || m.powertrain} | ${m.seats} seats | braked tow ${m.towKg || 0} kg${m.towNote ? ` (${m.towNote})` : ''} | tags: ${(m.tags || []).join(', ')}`);
  if (ctx.unit) lines.push(`BOOKED CAR: stock unit ${ctx.unit.id}, ${modelById(ctx.unit.model)?.name} ${gradeOf(ctx.unit.model, ctx.unit.grade)?.name || ''}${ctx.transferFrom ? `, transferring from ${ctx.transferFrom}` : ''}.`);
  lines.push(`FINDER ANSWERS: ${ctx.answers.length ? ctx.answers.map((a) => `${a.id}=${a.value}`).join('; ') : 'none (customer did not use the finder)'}.`);
  return lines.join('\n');
}

// ── booking ──────────────────────────────────────────────────────────────────
function newBookingId() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const used = new Set((bookingsData().bookings || []).map((b) => b.bookingId));
  for (;;) { let id = 'TD-'; for (let i = 0; i < 5; i++) id += A[randomInt(A.length)]; if (!used.has(id)) return id; }
}

/** Returns {status, body}. `sid` = the page's session id (first-party events, handover). */
export async function book(input, s, { sid = null } = {}) {
  const b = input || {};
  const site = siteOf(String(b.site || ''));
  if (!site) return { status: 400, body: { error: `site must be one of ${siteIds().join(', ')}` } };
  const m = /^([a-z]{3})-(\d{4}-\d{2}-\d{2})-(\d{4})$/.exec(String(b.slotId || ''));
  if (!m || m[1] !== site.id) return { status: 400, body: { error: 'slotId is invalid for this site' } };
  let unit = null;
  if (b.unitId != null && b.unitId !== '') {
    unit = s.stock_by_site.find((u) => u.id === String(b.unitId).toUpperCase());
    if (!unit) return { status: 400, body: { error: 'unknown unitId' } };
  }
  const build = b.build && typeof b.build === 'object' && modelById(b.build.modelId) ? b.build : null;
  const viewed = (Array.isArray(b.viewed) ? b.viewed : []).filter((v) => v && modelById(v.modelId)).slice(0, 12);
  const modelId = unit?.model || build?.modelId || viewed[0]?.modelId;
  if (!modelId) return { status: 400, body: { error: 'one of unitId, build.modelId or viewed[] is required' } };
  const gradeId = (unit && unit.grade) || (build && build.modelId === modelId && gradeOf(modelId, build.gradeId)?.id)
    || viewed.map((v) => v.modelId === modelId && gradeOf(modelId, v.gradeId)?.id).find(Boolean) || modelById(modelId).grades[0].id;
  const lang = LANG[b.lang] ? b.lang : 'en';

  const avail = slotsFor({ siteId: site.id, unit, s });
  const day = avail.days.find((d) => d.date === m[2]);
  const slot = day?.slots.find((x) => x.id === b.slotId);
  if (!slot) return { status: 400, body: { error: 'slot is outside the bookable window' } };
  if (!slot.available) return { status: 409, body: { error: 'slot is no longer available' } };
  holds.add(slot.id); // no await between the availability check and this hold
  try {
    const mins = toMins(`${m[3].slice(0, 2)}:${m[3].slice(2)}`);
    const whenLabel = `${day.label}, ${slot.time}`;
    const finderAnswers = cleanAnswers(b.finder?.answers).map((a) => ({ id: a.id, value: canon(a) }));
    const models = [...new Set([modelId, build?.modelId, ...viewed.map((v) => v.modelId)].filter(Boolean))].map(modelById);
    const ctx = { models, primary: modelById(modelId), unit, answers: finderAnswers, answered: new Set(finderAnswers.map((a) => a.id)), siteName: site.name, whenLabel, transferFrom: avail._arrival?.transferFrom || null };
    const trace = [];

    // 1. Questions: ARAG agent, validated, topped up from the bank.
    let questions = [];
    if (arag.configured()) {
      try {
        const extra = [contextText(ctx), buildText(build), stockSummary(s, models.map((x) => x.id))].filter(Boolean);
        const r = await arag.ask({
          query: `Test drive preparation for a customer looking at ${models.map((x) => x.name).join(', ')}: what should the salesperson ask about towing, charging, seating, off-road use, finance or trade-in?`,
          system: QUESTIONS_SYSTEM(ctx, LANG[lang]), extraContext: extra, jsonSchema: Q_SCHEMA, timeoutMs: 20000, topK: 10,
        });
        questions = validQuestions(r.json, ctx);
        trace.push({ kind: 'kb', label: `Knowledge base: ${r.sources.length} document(s) used to write ${questions.length} salesperson question(s)` });
      } catch (e) {
        console.warn(`[testdrive] questions: ${e.message}`);
        trace.push({ kind: 'kb', label: 'Knowledge base unavailable; used the question bank' });
      }
    } else trace.push({ kind: 'kb', label: 'Knowledge base not configured; used the question bank' });
    if (questions.length < 3) {
      const exclude = [...questions.map((q) => q._topic).filter(Boolean), ...questions.map((q) => q.id)];
      const extra = pickQuestions(ctx, 3 - questions.length, exclude);
      if (extra.length) trace.push({ kind: 'kb', label: `Question bank supplied ${extra.length} question(s) (tags, body, powertrain, finder answers)` });
      questions = [...questions, ...extra.filter((q) => !questions.some((x) => x.id === q.id || (bankGroup(q.id) && x._topic === bankGroup(q.id))))];
      // Last resort so there are always exactly 3 (trade-in and finance always apply to a purchase).
      for (const fid of ['trade-in', 'finance-plan', 'hybrid-first']) if (questions.length < 3 && !questions.some((q) => q.id === fid || q._topic === bankGroup(fid))) questions.push(bankQuestion(fid, ctx));
    }
    questions = questions.slice(0, 3).map(({ _topic, ...q }) => q);

    // 2. Incentive (deterministic).
    const incentive = pickIncentive(ctx, readDealer('incentives.json', { incentives: [] }).incentives);
    trace.push({ kind: 'domo', label: `Incentive: ${incentive.title} (${incentive.reason.replace(/^Because /, 'because ').replace(/\.$/, '')})` });

    // 3. Persist (stand-in DMS write-back).
    const bookingId = newBookingId();
    const record = {
      bookingId, status: 'booked', createdAt: new Date().toISOString(), site: site.id, siteName: site.name, slotId: slot.id,
      when: isoAt(m[2], mins), whenLabel, time: slot.time, unitId: unit?.id || null, transferFrom: ctx.transferFrom,
      modelId, gradeId, build: build ? { modelId: build.modelId, gradeId: gradeOf(build.modelId, build.gradeId)?.id || null, colourId: typeof build.colourId === 'string' ? build.colourId.slice(0, 40) : null, interiorId: typeof build.interiorId === 'string' ? build.interiorId.slice(0, 40) : null, packs: (Array.isArray(build.packs) ? build.packs : []).filter((p) => typeof p === 'string').slice(0, 6) } : null,
      viewed: viewed.map((v) => ({ modelId: v.modelId, gradeId: gradeOf(v.modelId, v.gradeId)?.id || null, unitId: s.stock_by_site.some((u) => u.id === v.unitId) ? v.unitId : null })),
      finderAnswers, lang, questions, incentive, answers: null, sid: sid || null,
    };
    await updateDealer('bookings.json', (data) => ({ ...data, bookings: [...(data.bookings || []), record].slice(-500) }), { bookings: [] });
    logServer(sid, 'booking', { bookingId, modelId, unitId: record.unitId, site: site.id, whenLabel }, s);
    scheduleHandover(bookingId, s);
    trace.push({ kind: 'domo', label: `Booking ${bookingId} written to the DMS diary (stand-in) at ${site.name}${unit ? ` for ${unit.id}` : ''}` });
    if (ctx.transferFrom) trace.push({ kind: 'domo', label: `Transfer from ${ctx.transferFrom} flagged for ${unit.id}` });

    return {
      status: 200,
      body: {
        bookingId, site: site.id, siteName: site.name, when: record.when, whenLabel, unitId: record.unitId,
        model: modelById(modelId).name, grade: gradeOf(modelId, gradeId)?.name || null, modelId, gradeId,
        questions, incentive, handover: `/api/testdrive/handover/${bookingId}`, trace,
      },
    };
  } finally {
    holds.delete(slot.id);
  }
}

// ── answers ──────────────────────────────────────────────────────────────────
const REPLY_SCHEMA = {
  name: 'salesperson_reply', description: 'Two-sentence reply',
  parameters: { type: 'object', properties: { reply: { type: 'string' } }, required: ['reply'] },
};
const twoSentences = (t) => (String(t).replace(/\s+/g, ' ').trim().match(/[^.!?。！？]+[.!?。！？]+/g) || [String(t)]).slice(0, 2).map((x) => x.trim()).join(' ');

export async function answers(input, s, { sid = null } = {}) {
  const b = input || {};
  const id = String(b.bookingId || '').toUpperCase();
  if (!/^TD-[A-Z0-9]{5}$/.test(id)) return { status: 400, body: { error: 'bookingId is required' } };
  const data = bookingsData();
  const booking = (data.bookings || []).find((x) => x.bookingId === id);
  if (!booking) return { status: 404, body: { error: 'booking not found' } };
  const valid = [];
  for (const a of Array.isArray(b.answers) ? b.answers : []) {
    const q = booking.questions.find((x) => x.id === a?.id);
    const opt = q?.options.find((o) => o.id === String(a?.value ?? ''));
    if (q && opt && !valid.some((x) => x.id === q.id)) valid.push({ id: q.id, value: opt.id, label: opt.label, questionText: q.text });
  }
  if (!valid.length) return { status: 400, body: { error: 'answers must reference this booking\'s questions and options' } };

  const prep = prepFor(booking, valid);
  const trace = [];
  let reply = '';
  if (arag.configured()) {
    try {
      const m = modelById(booking.modelId);
      const r = await arag.ask({
        query: `Customer answers before their ${m?.name} test drive: ${valid.map((a) => `${a.questionText} → ${a.label}`).join('; ')}`,
        system: `You are the salesperson at Harbourline Toyota ${booking.siteName} who will take this customer on a test drive (${booking.whenLabel}). They have just answered your preparation questions. Write exactly two sentences in ${LANG[booking.lang] || 'English'}: first thank them and acknowledge their answers specifically; then say what you will have ready, using only the PREPARATION LIST. Promise nothing else, quote no prices, and do not ask further questions.`,
        extraContext: [`BOOKING: ${booking.bookingId}, ${m?.name} ${gradeOf(booking.modelId, booking.gradeId)?.name || ''}${booking.unitId ? ` (stock unit ${booking.unitId})` : ''} at ${booking.siteName}, ${booking.whenLabel}. Test-drive incentive: ${booking.incentive?.title}.`,
          `ANSWERS:\n${valid.map((a) => `- ${a.questionText} → ${a.label}`).join('\n')}`, `PREPARATION LIST:\n${prep.map((p) => `- ${p}`).join('\n')}`],
        jsonSchema: REPLY_SCHEMA, timeoutMs: 15000, topK: 5,
      });
      const t = typeof r.json?.reply === 'string' ? twoSentences(r.json.reply) : '';
      if (t.length >= 20 && !/^not enough data/i.test(t)) { reply = t.slice(0, 600); trace.push({ kind: 'kb', label: `Knowledge base: reply written with ${r.sources.length} source document(s)` }); }
    } catch (e) { console.warn(`[testdrive] reply: ${e.message}`); }
  }
  if (!reply) { reply = replyFor(booking, valid, prep); trace.push({ kind: 'kb', label: 'Reply from the deterministic template' }); }

  await updateDealer('bookings.json', (fresh) => ({ ...fresh, bookings: (fresh.bookings || []).map((x) => (x.bookingId === id ? { ...x, answers: valid.map(({ questionText, ...a }) => a), prep, answeredAt: new Date().toISOString() } : x)) }), { bookings: [] });
  for (const a of valid) logServer(sid || booking.sid, 'booking_answer', { bookingId: id, questionId: a.id, value: a.value }, s);
  scheduleHandover(id, s, { force: true });
  trace.push({ kind: 'domo', label: `Answers and prep list saved to booking ${id} (DMS stand-in)` });
  return { status: 200, body: { ok: true, reply, prep, trace } };
}

// ── salesperson handover ─────────────────────────────────────────────────────
const HANDOVER_SCHEMA = {
  name: 'sales_briefing', description: 'Sales-manager briefing for the salesperson',
  parameters: { type: 'object', properties: { talkingPoints: { type: 'array', items: { type: 'string' } } }, required: ['talkingPoints'] },
};
const HANDOVER_SYSTEM = `You are the sales manager at Harbourline Toyota (Sydney) briefing the salesperson who will take this customer on a test drive.
Write 3 to 5 talking points, one sentence each (at most 35 words), best first.
Rules:
- Every point links something the customer told us (FINDER ANSWERS, BOOKING ANSWERS, what they viewed) to a specific fact about the booked car from the spec-sheet passages or the CAR block (towing capacity, seats, powertrain, drive, safety, servicing), or to a listed PROMOTION / INCENTIVE.
- Use only facts in the passages and blocks. Never invent prices, specs, rates or stock.
- Practical and respectful: what to show, what to check, what to have ready. No pressure tactics.
- English.`;

const handoverJobs = new Map(); // bookingId → in-flight promise
/** Generate (or refresh) a booking's handover in the background after book / answers. */
function scheduleHandover(bookingId, s, { force = false } = {}) {
  const cur = handoverJobs.get(bookingId);
  if (cur) return force ? cur.then(() => scheduleHandover(bookingId, s)) : cur;
  const job = buildHandover(bookingId, s).catch((e) => { console.warn(`[handover] ${bookingId}: ${e.message}`); return null; })
    .finally(() => handoverJobs.delete(bookingId));
  handoverJobs.set(bookingId, job);
  return job;
}

function carOf(booking, s) {
  const unit = booking.unitId ? s.stock_by_site.find((u) => u.id === booking.unitId) : null;
  const b = booking.build && booking.build.modelId === booking.modelId ? booking.build : null;
  const spec = unit
    ? { modelId: unit.model, gradeId: unit.grade, colourId: unit.colour, interiorId: unit.interior, packs: unit.packs || [] }
    : { modelId: booking.modelId, gradeId: booking.gradeId, colourId: b?.colourId || null, interiorId: b?.interiorId || null, packs: b?.packs || [] };
  const m = modelById(spec.modelId);
  return {
    modelId: spec.modelId, model: m?.name || spec.modelId, gradeId: spec.gradeId, grade: gradeOf(spec.modelId, spec.gradeId)?.name || null,
    colour: colourById(spec.colourId)?.name || null, interior: interiorById(spec.interiorId)?.name || null,
    packs: spec.packs.map((p) => packById(p)?.name).filter(Boolean), unitId: unit?.id || null,
    price: priceOf(spec), priceNote: 'NSW drive-away estimate', ...(booking.transferFrom ? { transferFrom: booking.transferFrom } : {}),
    _spec: spec,
  };
}

function viewedOf(booking, s) {
  const out = []; const seen = new Set();
  const add = (modelId, gradeId, unitId, source) => {
    const key = `${modelId}|${unitId || ''}`; if (!modelById(modelId) || seen.has(key)) return; seen.add(key);
    out.push({ modelId, model: modelById(modelId).name, grade: gradeOf(modelId, gradeId)?.name || null, unitId: unitId || null, source });
  };
  for (const v of booking.viewed || []) add(v.modelId, v.gradeId, v.unitId, 'booking');
  for (const e of eventsForSession(booking.sid)) {
    if (e.type === 'build_change') add(e.data.modelId, e.data.gradeId, null, 'configurator');
    if (e.type === 'offer_click' || e.type === 'offer_view') { const u = s.stock_by_site.find((x) => x.id === e.data.unitId); if (u) add(u.model, u.grade, u.id, e.type === 'offer_click' ? 'offer clicked' : 'offer seen'); }
  }
  return out.slice(0, 10);
}

/** Deterministic talking points (fallback and top-up). */
function talkingPointsFallback(booking, car, finder, qa, promos) {
  const m = modelById(car.modelId); const pts = [];
  const tow = finder.find((a) => a.id === 'towing' && a.value !== 'none') || qa.find((x) => /tow/i.test(x.question) && x.answer && !/nothing|^no$/i.test(x.answer));
  if (tow && m) pts.push(`They tow (${tow.answer || tow.value}): the ${m.name} is rated to ${(m.towKg || 0).toLocaleString('en-AU')} kg braked, so confirm their loaded weight and show the Towing Pack.`);
  const seats = finder.find((a) => a.id === 'people') || qa.find((x) => /seat|third row/i.test(x.question));
  if (seats && m) pts.push(`Seating matters to them (${seats.answer || seats.value}): the ${m.name} has ${m.seats} seats, so let them try the back${m.seats >= 7 ? ' and third' : ''} row with their own setup.`);
  if (m?.powertrain === 'hybrid' && qa.some((x) => /hybrid/i.test(x.question) && /^no$/i.test(x.answer || ''))) pts.push(`First hybrid for them: explain how the ${m.powertrainLabel || 'hybrid system'} starts in EV mode and charges itself; no plugging in.`);
  if (m?.powertrain === 'ev') pts.push(`Electric: walk through home and public charging on the ${m.name}, using their answer on home charging.`);
  if (promos[0]) pts.push(`Offer ${promos[0].title}: ${promos[0].why}.`);
  if (qa.some((x) => /trad/i.test(x.question) && /^yes$/i.test(x.answer || ''))) pts.push('They plan to trade in: have the valuation done while they are out on the drive.');
  if (booking.incentive) pts.push(`Confirm their test-drive incentive in writing: ${booking.incentive.title}.`);
  pts.push(`Have the ${car.model}${car.grade ? ` ${car.grade}` : ''}${car.unitId ? ` (${car.unitId})` : ''} clean, fuelled and ready at ${booking.time}.`);
  return pts.slice(0, 5);
}

async function buildHandover(bookingId, s) {
  const booking = (bookingsData().bookings || []).find((x) => x.bookingId === bookingId);
  if (!booking) return null;
  const car = carOf(booking, s);
  const finder = (booking.finderAnswers || []).map((a) => ({ id: a.id, value: a.value, ...describeAnswer(a, booking.finderAnswers) }));
  const qa = (booking.questions || []).map((q) => {
    const a = (booking.answers || []).find((x) => x.id === q.id);
    return { id: q.id, question: q.text, answer: a ? (a.label || q.options.find((o) => o.id === a.value)?.label || a.value) : null };
  });
  const promosFull = promotionsFor(s, car.unitId ? { unit: car.unitId } : { model: car.modelId }, { internal: true }).slice(0, 3);
  const promos = promosFull.map((p) => ({ id: p.id, title: p.title, why: p.why || p.short || '' }));
  const trace = [];
  let points = []; let by = 'fallback';
  if (arag.configured()) {
    const t0 = Date.now();
    try {
      const m = modelById(car.modelId);
      const blocks = [
        `CAR: ${car.model} ${car.grade || ''}${car.unitId ? ` (stock unit ${car.unitId})` : ''} | ${m?.bodyLabel || m?.body} | ${m?.powertrainLabel || m?.powertrain} | ${m?.seats} seats | braked tow ${(m?.towKg || 0).toLocaleString('en-AU')} kg | ${car.colour || 'colour tbc'}${car.packs.length ? ` | packs: ${car.packs.join(', ')}` : ''} | ${car.price ? `${fmtAud(car.price)} NSW drive-away estimate` : ''}`,
        `FINDER ANSWERS: ${finder.length ? finder.map((a) => `${a.question} → ${a.answer}`).join('; ') : 'none (did not use the finder)'}`,
        `BOOKING ANSWERS: ${qa.filter((x) => x.answer).map((x) => `${x.question} → ${x.answer}`).join('; ') || 'not answered yet'}`,
        `PROMOTIONS TO OFFER: ${promosFull.map((p) => `${p.title}${p.value ? ` (${fmtAud(p.value)})` : ''}: ${p.desc}`).join(' | ') || 'none'}`,
        `INCENTIVE: ${booking.incentive ? `${booking.incentive.title} (${booking.incentive.reason})` : 'none'}`,
      ];
      const r = await arag.ask({
        query: `${car.model} ${car.grade || ''} specifications, towing, seating, powertrain and safety for a customer who said: ${[...finder.map((a) => a.answer), ...qa.filter((x) => x.answer).map((x) => x.answer)].join(', ')}`,
        system: HANDOVER_SYSTEM, extraContext: blocks, jsonSchema: HANDOVER_SCHEMA, timeoutMs: 25000, topK: 10,
        filterExpression: arag.anyLabel('model', [car.modelId, 'all']),
      });
      const known = new Set([car.price, ...promosFull.map((p) => p.value), booking.incentive?.value, ...[1650, 890, 1290]].filter(Boolean));
      points = (Array.isArray(r.json?.talkingPoints) ? r.json.talkingPoints : []).map((x) => String(x || '').replace(/\s+/g, ' ').trim())
        .filter((x) => x.length >= 20 && x.length <= 300 && !/^not enough data/i.test(x))
        .filter((x) => (x.match(/\$\s?[\d,]+/g) || []).every((a) => known.has(Number(a.replace(/[^\d]/g, ''))))).slice(0, 5);
      if (points.length >= 3) { by = 'arag'; trace.push({ kind: 'kb', label: `Knowledge base: ${r.sources.length} document(s) (${r.sources.slice(0, 3).map((x) => x.title).join('; ')}) used to write ${points.length} talking points in ${Date.now() - t0} ms` }); }
      else { trace.push({ kind: 'kb', label: `Agent wrote ${points.length} usable talking point(s); topped up from the deterministic briefing` }); }
    } catch (e) {
      console.warn(`[handover] talking points: ${e.message}`);
      trace.push({ kind: 'kb', label: 'Knowledge base unavailable; deterministic briefing' });
    }
  } else trace.push({ kind: 'kb', label: 'Knowledge base not configured; deterministic briefing' });
  if (points.length < 3) {
    const fb = talkingPointsFallback(booking, car, finder, qa, promos);
    points = [...points, ...fb.filter((x) => !points.includes(x))].slice(0, Math.max(3, Math.min(5, points.length + fb.length)));
  }
  const prep = booking.prep || prepFor(booking, []);
  trace.push({ kind: 'domo', label: `Promotions to offer: ${promos.length} (Domo-selected, composed ${promosFull[0]?.composedBy === 'arag' ? 'by the ARAG agent' : 'from the fallback'})` });
  trace.push({ kind: 'domo', label: `Handover sheet written to booking ${bookingId} (DMS stand-in)` });
  const { _spec, ...carPublic } = car;
  const sheet = {
    bookingId, whenLabel: booking.whenLabel, when: booking.when, site: booking.site, siteName: booking.siteName,
    customerRef: booking.sid ? `${booking.sid.slice(0, 8)}…` : null, lang: booking.lang,
    car: carPublic, viewed: viewedOf(booking, s),
    finderAnswers: finder.map(({ question, answer }) => ({ question, answer })),
    questions: qa.map(({ question, answer }) => ({ question, answer })),
    promotionsToOffer: promos.map(({ title, why }) => ({ title, why })),
    incentive: booking.incentive || null,
    talkingPoints: points, talkingPointsBy: by, prep,
    generatedAt: new Date().toISOString(), basis: booking.answeredAt || booking.createdAt,
    trace,
  };
  await updateDealer('bookings.json', (data) => ({ ...data, bookings: (data.bookings || []).map((x) => (x.bookingId === bookingId ? { ...x, handover: sheet } : x)) }), { bookings: [] });
  return sheet;
}

/** GET /api/testdrive/handover/:bookingId → {status, body}. */
export async function handover(bookingIdRaw, s) {
  const id = String(bookingIdRaw || '').toUpperCase();
  if (!/^TD-[A-Z0-9]{5}$/.test(id)) return { status: 400, body: { error: 'bookingId must look like TD-XXXXX' } };
  const booking = (bookingsData().bookings || []).find((x) => x.bookingId === id);
  if (!booking) return { status: 404, body: { error: 'booking not found' } };
  if (handoverJobs.has(id)) await handoverJobs.get(id);
  const fresh = (bookingsData().bookings || []).find((x) => x.bookingId === id);
  if (fresh?.handover && fresh.handover.basis === (fresh.answeredAt || fresh.createdAt)) return { status: 200, body: fresh.handover };
  const sheet = await scheduleHandover(id, s);
  return sheet ? { status: 200, body: sheet } : { status: 500, body: { error: 'could not build the handover sheet' } };
}
