// derive.mjs — derived Domo datasets for the Harbourline DMS.
//
// Pure functions over the loaded tables (content/dms/data/*.json plus the read-through
// configurator files). Each returns an array of flat rows whose keys match the column
// list in content/dms/domo-datasets.json, so the API can stream them straight to CSV:
//
//   import { loadTables, DERIVED, toCsv } from './derive.mjs';
//   const t = loadTables();                       // once at startup
//   res.type('text/csv').send(toCsv(DERIVED.sales_daily(t), columnsFor('sales_daily')));
//
// `t` is { sites, staff, customers, vehicles, leads, test_drives, deals, trade_ins,
// finance_apps, promotions, campaigns, documents, targets, domo_signals, configurator_events,
// bookings, meta }. Only loadTables touches the filesystem.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DAY = 864e5;
/** Local (Sydney wall-clock) ms from an ISO string with offset; comparisons/dates stay in local time. */
export const localMs = (s) => (s ? Date.parse(`${String(s).slice(0, 19)}Z`) : null);
const dateOf = (s) => (s ? String(s).slice(0, 10) : null);
const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);
const asOfMs = (t, opts) => localMs(opts?.asOf || t.meta?.asOf || '2026-10-14T08:00:00');
const r2 = (x) => Math.round(x * 100) / 100;
/** Monday of the ISO week containing a YYYY-MM-DD date. */
export function weekOf(date) { const ms = Date.parse(`${date}T00:00:00Z`); const d = new Date(ms).getUTCDay(); return isoDate(ms - ((d + 6) % 7) * DAY); }

/** Load every table from content/dms/data plus the read-through configurator/Domo files. */
export function loadTables(root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')) {
  const rd = (p, fb) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fb);
  const dir = join(root, 'content', 'dms', 'data');
  const names = ['sites', 'staff', 'customers', 'vehicles', 'leads', 'test_drives', 'deals', 'trade_ins', 'finance_apps', 'promotions', 'campaigns', 'documents', 'targets'];
  const t = Object.fromEntries(names.map((n) => [n, rd(join(dir, `${n}.json`), [])]));
  t.meta = rd(join(dir, '_meta.json'), {});
  t.domo_signals = rd(join(root, 'content', 'domo', 'dealer_signals.json'), { rows: [] });
  const ev = join(process.env.DEALER_STATE_DIR || join(root, 'content', 'dealer'), 'events.jsonl');
  t.configurator_events = existsSync(ev) ? readFileSync(ev, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
  t.bookings = rd(join(process.env.DEALER_STATE_DIR || join(root, 'content', 'dealer'), 'bookings.json'), { bookings: [] }).bookings || [];
  return t;
}

// ── sales_daily: date × site × model ─────────────────────────────────────────
export function salesDaily(t) {
  const rows = new Map();
  const row = (date, siteId, modelId) => {
    const k = `${date}|${siteId}|${modelId}`;
    if (!rows.has(k)) rows.set(k, { date, month: date.slice(0, 7), week: weekOf(date), siteId, modelId, leads: 0, testDrivesCompleted: 0, dealsCreated: 0, contractsSigned: 0, unitsDelivered: 0, unitsDeliveredFromStock: 0, dealsLost: 0, revenue: 0, discount: 0, frontGross: 0, backGross: 0, grossProfit: 0, financeDeals: 0, tradeIns: 0 });
    return rows.get(k);
  };
  for (const l of t.leads) if (!l.mergedIntoLeadId) row(dateOf(l.createdAt), l.siteId, l.interest?.modelId || 'unknown').leads++;
  for (const d of t.test_drives) if (d.status === 'completed') row(dateOf(d.when), d.siteId, d.modelId).testDrivesCompleted++;
  for (const d of t.deals) {
    row(dateOf(d.createdAt), d.siteId, d.modelId).dealsCreated++;
    if (d.contractAt) row(dateOf(d.contractAt), d.siteId, d.modelId).contractsSigned++;
    if (d.stage === 'lost') row(dateOf(d.closedAt), d.siteId, d.modelId).dealsLost++;
    if (d.stage === 'delivered') {
      const r = row(dateOf(d.closedAt), d.siteId, d.modelId);
      r.unitsDelivered++; if (d.fulfilment === 'stock') r.unitsDeliveredFromStock++;
      r.revenue += d.driveAway; r.discount += d.discount + (d.bonus || 0); r.frontGross += d.frontGross; r.backGross += d.backGross; r.grossProfit += d.grossProfit;
      if (d.financeAppId) r.financeDeals++; if (d.tradeInId) r.tradeIns++;
    }
  }
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date) || a.siteId.localeCompare(b.siteId) || a.modelId.localeCompare(b.modelId));
}

// ── stock_ageing_daily: end-of-day snapshot date × site × model ──────────────
export function stockAgeingDaily(t, opts = {}) {
  const now = asOfMs(t, opts);
  const to = opts.to ? localMs(`${opts.to}T23:59:59`) : now;
  const from = opts.from ? localMs(`${opts.from}T00:00:00`) : localMs(`${t.meta?.historyFrom?.slice(0, 10) || '2024-10-15'}T00:00:00`);
  const units = t.vehicles.filter((v) => v.arrivedAt && v.status !== 'demo').map((v) => ({ v, a: localMs(v.arrivedAt), s: v.soldAt ? localMs(v.soldAt) : Infinity }));
  const out = [];
  for (let day = from - (from % DAY); day <= to; day += DAY) {
    const eod = Math.min(day + DAY - 1, now);
    const groups = new Map();
    for (const u of units) {
      if (u.a > eod || u.s <= eod) continue;
      const k = `${u.v.siteId}|${u.v.model}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(Math.max(0, Math.floor((eod - u.a) / DAY)));
    }
    for (const [k, ages] of groups) {
      const [siteId, modelId] = k.split('|');
      const vs = units.filter((u) => u.v.siteId === siteId && u.v.model === modelId && u.a <= eod && u.s > eod);
      out.push({ date: isoDate(day), siteId, modelId, unitsOnLot: ages.length, avgDaysInStock: Math.round(ages.reduce((a, b) => a + b, 0) / ages.length), maxDaysInStock: Math.max(...ages), units60Plus: ages.filter((a) => a > 60).length, units90Plus: ages.filter((a) => a > 90).length, stockValueLanded: vs.reduce((s, u) => s + u.v.landedCost, 0) });
    }
  }
  return out;
}

// ── funnel_weekly: lead-cohort week × site × channel ─────────────────────────
const REACHED = { contacted: ['contacted', 'qualified', 'test_drive_booked', 'quoted', 'won'], qualified: ['qualified', 'test_drive_booked', 'quoted', 'won'], testDriveBooked: ['test_drive_booked', 'quoted', 'won'], quoted: ['quoted', 'won'], won: ['won'] };
export function funnelWeekly(t) {
  const tdDone = new Set(t.test_drives.filter((d) => d.status === 'completed').map((d) => d.leadId));
  const delivered = new Set(t.deals.filter((d) => d.stage === 'delivered').map((d) => d.leadId));
  const rows = new Map();
  for (const l of t.leads) {
    const week = weekOf(dateOf(l.createdAt));
    const k = `${week}|${l.siteId}|${l.channel}`;
    if (!rows.has(k)) rows.set(k, { week, siteId: l.siteId, channel: l.channel, leads: 0, duplicates: 0, contacted: 0, qualified: 0, testDriveBooked: 0, testDrivesCompleted: 0, quoted: 0, won: 0, delivered: 0, lost: 0, open: 0 });
    const r = rows.get(k);
    if (l.mergedIntoLeadId) { r.duplicates++; continue; }
    r.leads++;
    const seen = new Set((l.statusHistory || []).map((h) => h.status)); seen.add(l.status);
    for (const [col, sts] of Object.entries(REACHED)) if (sts.some((s) => seen.has(s))) r[col]++;
    if (tdDone.has(l.id)) r.testDrivesCompleted++;
    if (delivered.has(l.id)) r.delivered++;
    if (l.status === 'lost') r.lost++; else if (l.status !== 'won') r.open++;
  }
  return [...rows.values()].map((r) => ({ ...r, leadToTestDrive: r.leads ? r2(r.testDrivesCompleted / r.leads) : 0, leadToQuote: r.leads ? r2(r.quoted / r.leads) : 0, leadToWon: r.leads ? r2(r.won / r.leads) : 0 })).sort((a, b) => a.week.localeCompare(b.week) || a.siteId.localeCompare(b.siteId) || a.channel.localeCompare(b.channel));
}

// ── deal_events: one row per deal timeline event ─────────────────────────────
export function dealEvents(t) {
  const out = [];
  for (const d of t.deals) for (const e of d.events || []) out.push({ dealId: d.id, siteId: d.siteId, salespersonId: d.salespersonId, modelId: d.modelId, at: e.at, date: dateOf(e.at), type: e.type, staffId: e.staffId, note: e.note, dealStage: d.stage });
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

// ── configurator_events: live events.jsonl + sessions reconstructed from configurator leads ──
function h32(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function configuratorEvents(t) {
  const out = [];
  const liveSids = new Set();
  for (const e of t.configurator_events || []) {
    const d = e.data || {};
    liveSids.add(e.sid);
    const at = e.at && /[+-]\d{2}:\d{2}$/.test(e.at) ? e.at : utcToSydney(e.at || e.ts);
    if (!at) continue;
    out.push({ at, date: dateOf(at), sid: e.sid, type: e.type, modelId: d.modelId || null, gradeId: d.gradeId || null, colourId: d.colourId || null, unitId: d.unitId || null, questionId: d.questionId || null, value: d.value ?? null, bookingId: d.bookingId || null, siteId: d.site || null, leadId: null, origin: 'live' });
  }
  const tdById = Object.fromEntries(t.test_drives.map((d) => [d.id, d]));
  for (const l of t.leads) {
    if (l.channel !== 'configurator' || !l.configuratorSessionId || liveSids.has(l.configuratorSessionId)) continue;
    const end = localMs(l.createdAt), h = h32(l.id);
    const answers = l.finderAnswers || [], viewed = l.viewed || [];
    const steps = answers.length + 1 + viewed.length * 2 + (l.interest?.stockNo ? 1 : 0) + 1;
    let at = end - (6 + (h % 25) + steps * 0.9) * 60000;
    const tick = (n) => { at += (40 + ((h >> (n % 24)) % 70)) * 1000; return at; };
    const base = { sid: l.configuratorSessionId, siteId: l.siteId, leadId: l.id, origin: 'dms_reconstructed', colourId: null, unitId: null, questionId: null, value: null, bookingId: null, gradeId: null, modelId: null };
    const fmt = (ms) => { const off = tzOf(ms); return `${new Date(ms).toISOString().slice(0, 19)}${off}`; };
    let n = 0;
    for (const a of answers) { const ms = tick(n++); out.push({ ...base, at: fmt(ms), date: isoDate(ms), type: 'finder_answer', questionId: a.id, value: a.value }); }
    if (answers.length) { const ms = tick(n++); out.push({ ...base, at: fmt(ms), date: isoDate(ms), type: 'finder_result', modelId: viewed[0]?.modelId || l.interest?.modelId }); }
    for (const v of viewed) {
      let ms = tick(n++); out.push({ ...base, at: fmt(ms), date: isoDate(ms), type: 'build_change', modelId: v.modelId, gradeId: v.gradeId, colourId: v.modelId === l.interest?.modelId ? l.interest?.colourId : null });
      if (v.unitId) { ms = tick(n++); out.push({ ...base, at: fmt(ms), date: isoDate(ms), type: 'offer_view', modelId: v.modelId, unitId: v.unitId }); }
    }
    if (l.interest?.stockNo) { const ms = tick(n++); out.push({ ...base, at: fmt(ms), date: isoDate(ms), type: 'offer_click', modelId: l.interest.modelId, unitId: l.interest.stockNo }); }
    const td = l.bookingId ? tdById[l.bookingId] : null;
    out.push({ ...base, at: l.createdAt, date: dateOf(l.createdAt), type: 'booking', modelId: l.interest?.modelId, gradeId: l.interest?.gradeId, unitId: l.interest?.stockNo || null, bookingId: l.bookingId, siteId: td?.siteId || l.siteId });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}
/** UTC ISO (…Z) → Sydney wall-clock ISO with +10:00/+11:00. */
export function utcToSydney(s) { const u = Date.parse(s); if (Number.isNaN(u)) return null; let l = u + 10 * 36e5; if (tzOf(l) === '+11:00') l = u + 11 * 36e5; return `${new Date(l).toISOString().slice(0, 19)}${tzOf(l)}`; }
function firstSunday(y, m) { for (let d = 1; d <= 7; d++) if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0) return d; return 1; }
function tzOf(ms) { const y = new Date(ms).getUTCFullYear(); return ms < Date.UTC(y, 3, firstSunday(y, 4), 3) || ms >= Date.UTC(y, 9, firstSunday(y, 10), 2) ? '+11:00' : '+10:00'; }

// ── dealer_signals: Domo dataflow rows + priorities derived from the ERP ──────
export function dealerSignals(t, opts = {}) {
  const now = asOfMs(t, opts), d90 = now - 90 * DAY;
  const src = t.domo_signals?.rows || [];
  const models = [...new Set([...src.map((r) => r.model), ...t.vehicles.map((v) => v.model)])];
  const month = new Date(now).toISOString().slice(0, 7);
  return models.map((model) => {
    const s = src.find((r) => r.model === model) || {};
    const vs = t.vehicles.filter((v) => v.model === model);
    const onLot = vs.filter((v) => v.status === 'on_lot'), transit = vs.filter((v) => v.status === 'in_transit');
    const inbound = vs.filter((v) => v.status === 'ordered' || v.status === 'allocated');
    const del90 = t.deals.filter((d) => d.modelId === model && d.stage === 'delivered' && localMs(d.closedAt) >= d90);
    const stock90 = del90.filter((d) => d.fulfilment === 'stock').length;
    const ages = onLot.map((v) => v.daysInStock);
    const aged = onLot.filter((v) => v.daysInStock > 60).sort((a, b) => (a.movePriority ?? 99) - (b.movePriority ?? 99) || b.daysInStock - a.daysInStock);
    const openDeals = t.deals.filter((d) => d.modelId === model && !['delivered', 'lost'].includes(d.stage)).length;
    const unitsInStock = onLot.length + transit.length;
    const dos = stock90 ? Math.round(unitsInStock / (stock90 / 90)) : 0;
    const gap = s.targetGap ?? 0;
    const priorityScore = Math.round((aged.length * 20) + Math.max(0, dos - 45) * 0.6 + Math.max(0, gap) * 6 + (aged[0]?.daysInStock || 0) * 0.2);
    const action = aged.length ? `Move ${aged[0].stockNo} (${aged[0].daysInStock} d${aged[0].bonusHeadroom ? `, $${aged[0].bonusHeadroom.toLocaleString('en-AU')} headroom` : ''})`
      : dos > 60 ? 'Feature on the configurator and in campaigns'
        : unitsInStock === 0 && (s.sales90d || 0) > 0 ? 'Sell from order bank / transfers; quote ETA'
          : gap > 0 ? 'Push to close target gap' : 'Hold';
    return {
      month, model, unitsInStock: s.unitsInStock ?? unitsInStock, sales90d: s.sales90d ?? stock90, daysOfSupply: s.daysOfSupply ?? dos, allocationNextMonth: s.allocationNextMonth ?? 0, targetGap: gap, avgDaysInStock: s.avgDaysInStock ?? (ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0), marginHeadroomAvg: s.marginHeadroomAvg ?? 0,
      erpUnitsOnLot: onLot.length, erpUnitsInTransit: transit.length, erpUnitsInbound: inbound.length, erpStockDeliveries90d: stock90, erpAllDeliveries90d: del90.length, erpDaysOfSupply: dos, agedUnits: aged.length, oldestStockNo: aged[0]?.stockNo || null, openDeals,
      priorityScore, recommendedAction: action,
    };
  }).sort((a, b) => b.priorityScore - a.priorityScore || a.model.localeCompare(b.model)).map((r, i) => ({ ...r, priorityRank: i + 1 }));
}

/** Registry used by GET /domo/export/:dataset.csv for the derived datasets. */
export const DERIVED = {
  sales_daily: salesDaily,
  stock_ageing_daily: stockAgeingDaily,
  funnel_weekly: funnelWeekly,
  configurator_events: configuratorEvents,
  dealer_signals: dealerSignals,
  deal_events: dealEvents,
};

/** RFC 4180 CSV. Arrays/objects are JSON-encoded in one cell (Domo can parse them with JSON beast modes). */
export function toCsv(rows, columns) {
  const cols = columns || [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v) => {
    if (v == null) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `${cols.join(',')}\n${rows.map((r) => cols.map((c) => cell(r[c])).join(',')).join('\n')}\n`;
}
