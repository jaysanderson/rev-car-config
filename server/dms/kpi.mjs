// kpi.mjs — KPIs computed over the in-memory tables (deterministic, no ARAG).
//
// Definitions (all for one month unless noted; siteId optional):
//   unitsDelivered   deals in stage "delivered" whose deliveryDate (else closedAt) is in the month
//   gross            Σ grossProfit of those deals; avgGrossPerUnit = gross ÷ units
//   frontGross/backGross   Σ of the same deals
//   leads            leads created in the month
//   conversion       unitsDelivered ÷ leads (closing ratio, the dealer convention)
//   testDriveRate    test drives in the month (by `when`) ÷ leads
//   daysToClose      mean days from deal createdAt → delivery for the delivered deals
//   agedStockCount   on_lot/demo units with daysInStock > 60 (now, not month-bound)
//   daysOfSupply     per model: on-lot units ÷ (deliveries in the trailing 90 days ÷ 90)
//   pipeline         open deals (not delivered/lost) by stage: count, Σ driveAway
//   targetAttainment units ÷ targets.units and gross ÷ targets.grossTarget for the month
import * as db from './db.mjs';

export const AGED_DAYS = 60;
export const OPEN_STAGES = ['quote', 'negotiation', 'finance', 'approval', 'contract', 'delivery'];
const DAY = 86400000;

export const today = () => (process.env.DMS_TODAY ? new Date(`${process.env.DMS_TODAY}T12:00:00Z`) : new Date());
export const ymd = (d = today()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(d);
export const currentMonth = () => ymd().slice(0, 7);
export const deliveredAt = (d) => d.deliveryDate || d.closedAt || null;
export const isDelivered = (d) => d.stage === 'delivered';
const monthOf = (iso) => (iso ? String(iso).slice(0, 7) : null);
const round = (n, p = 0) => (Number.isFinite(n) ? Math.round(n * 10 ** p) / 10 ** p : 0);
const sum = (arr, f) => arr.reduce((n, x) => n + (Number(f(x)) || 0), 0);
const inSite = (siteId) => (r) => !siteId || r.siteId === siteId;

/** ISO week key "YYYY-Www" (UTC). */
export function weekOf(iso) {
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
  const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3);
  const y = d.getUTCFullYear(); const w1 = new Date(Date.UTC(y, 0, 4));
  const wk = 1 + Math.round(((d - w1) / DAY - 3 + ((w1.getUTCDay() + 6) % 7)) / 7);
  return `${y}-W${String(wk).padStart(2, '0')}`;
}
const prevMonth = (m) => { const [y, mm] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mm - 2, 1)); return d.toISOString().slice(0, 7); };

/** Rows subsets with an optional extra predicate (role scoping). */
function sets(siteId, where = () => true) {
  const f = (t) => db.all(t).filter(inSite(siteId)).filter((r) => where(t, r));
  return { deals: f('deals'), leads: f('leads'), drives: f('test_drives'), vehicles: f('vehicles'), targets: db.all('targets').filter(inSite(siteId)) };
}

export function daysOfSupply({ siteId, where } = {}) {
  const s = sets(siteId, where);
  const t = today().getTime();
  const sold90 = {}; const onLot = {}; const age = {}; const head = {};
  const vByStock = new Map(db.all('vehicles').map((v) => [v.stockNo, v]));
  for (const d of s.deals) {
    if (!isDelivered(d)) continue;
    const at = Date.parse(deliveredAt(d)); if (!(t - at <= 90 * DAY && at <= t)) continue;
    const m = d.modelId || vByStock.get(d.stockNo)?.model || d.order?.modelId; if (m) sold90[m] = (sold90[m] || 0) + 1;
  }
  for (const v of s.vehicles) if (['on_lot', 'demo'].includes(v.status)) { onLot[v.model] = (onLot[v.model] || 0) + 1; (age[v.model] ||= []).push(v.daysInStock || 0); (head[v.model] ||= []).push(v); }
  const models = [...new Set([...Object.keys(sold90), ...Object.keys(onLot)])].sort();
  return models.map((m) => ({
    modelId: m, onLot: onLot[m] || 0, sold90d: sold90[m] || 0,
    daysOfSupply: onLot[m] ? Math.min(180, sold90[m] ? round(onLot[m] / (sold90[m] / 90)) : 180) : 0,
    avgDaysInStock: age[m] ? round(sum(age[m], (x) => x) / age[m].length) : 0,
  })).sort((a, b) => b.daysOfSupply - a.daysOfSupply);
}

export function overview({ siteId, month = currentMonth(), where } = {}) {
  const s = sets(siteId, where);
  const m = month;
  const calc = (mm) => {
    const delivered = s.deals.filter((d) => isDelivered(d) && monthOf(deliveredAt(d)) === mm);
    const leads = s.leads.filter((l) => monthOf(l.createdAt) === mm);
    const drives = s.drives.filter((x) => monthOf(x.when) === mm);
    const gross = sum(delivered, (d) => d.grossProfit);
    return { delivered, leads, drives, gross };
  };
  const cur = calc(m); const prev = calc(prevMonth(m));
  const units = cur.delivered.length;
  const dtc = cur.delivered.map((d) => (Date.parse(deliveredAt(d)) - Date.parse(d.createdAt)) / DAY).filter((x) => x >= 0);
  const tgt = s.targets.filter((x) => x.month === m);
  const tUnits = sum(tgt, (x) => x.units) || sum(db.all('sites').filter(inSite(siteId)), (x) => x.salesTarget?.[m]);
  const tGross = sum(tgt, (x) => x.grossTarget);
  const pipeline = OPEN_STAGES.map((st) => { const ds = s.deals.filter((d) => d.stage === st); return { stage: st, count: ds.length, value: sum(ds, (d) => d.driveAway) }; });
  const aged = s.vehicles.filter((v) => ['on_lot', 'demo'].includes(v.status) && (v.daysInStock || 0) > AGED_DAYS);
  // Month-to-date pace when the month is the current one.
  const isCur = m === currentMonth();
  const dayOfMonth = Number(ymd().slice(8, 10)); const dim = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();
  return {
    siteId: siteId || null, month: m, monthToDate: isCur, asOf: ymd(),
    unitsDelivered: units,
    gross: cur.gross, frontGross: sum(cur.delivered, (d) => d.frontGross), backGross: sum(cur.delivered, (d) => d.backGross),
    avgGrossPerUnit: units ? round(cur.gross / units) : 0,
    leads: cur.leads.length,
    conversion: cur.leads.length ? round(units / cur.leads.length, 3) : 0,
    testDrives: cur.drives.length,
    testDriveRate: cur.leads.length ? round(cur.drives.length / cur.leads.length, 3) : 0,
    daysToClose: dtc.length ? round(sum(dtc, (x) => x) / dtc.length, 1) : 0,
    agedStockCount: aged.length, onLotCount: s.vehicles.filter((v) => ['on_lot', 'demo'].includes(v.status)).length,
    daysOfSupply: daysOfSupply({ siteId, where }),
    pipeline, openDeals: sum(pipeline, (p) => p.count), pipelineValue: sum(pipeline, (p) => p.value),
    lostDeals: s.deals.filter((d) => d.stage === 'lost' && monthOf(d.closedAt) === m).length,
    target: { units: tUnits, gross: tGross, unitsAttainment: tUnits ? round(units / tUnits, 3) : null, grossAttainment: tGross ? round(cur.gross / tGross, 3) : null, projectedUnits: isCur ? round((units / Math.max(1, dayOfMonth)) * dim) : units },
    previous: { month: prevMonth(m), unitsDelivered: prev.delivered.length, gross: prev.gross, leads: prev.leads.length },
  };
}

export const SERIES_METRICS = ['units', 'gross', 'avg_gross', 'leads', 'test_drives', 'conversion', 'lost', 'front_gross', 'back_gross'];
export function series({ metric = 'units', by = 'month', siteId, from, to, where } = {}) {
  if (!SERIES_METRICS.includes(metric)) return null;
  const s = sets(siteId, where);
  const key = by === 'week' ? weekOf : monthOf;
  const b = {};
  const add = (k, f, n = 1) => { if (!k) return; (b[k] ||= { units: 0, gross: 0, front: 0, back: 0, leads: 0, drives: 0, lost: 0 })[f] += n; };
  for (const d of s.deals) {
    if (isDelivered(d) && deliveredAt(d)) { const k = key(deliveredAt(d)); add(k, 'units'); add(k, 'gross', d.grossProfit || 0); add(k, 'front', d.frontGross || 0); add(k, 'back', d.backGross || 0); }
    if (d.stage === 'lost' && d.closedAt) add(key(d.closedAt), 'lost');
  }
  for (const l of s.leads) if (l.createdAt) add(key(l.createdAt), 'leads');
  for (const x of s.drives) if (x.when) add(key(x.when), 'drives');
  const val = (r) => ({ units: r.units, gross: r.gross, front_gross: r.front, back_gross: r.back, avg_gross: r.units ? round(r.gross / r.units) : 0, leads: r.leads, test_drives: r.drives, conversion: r.leads ? round(r.units / r.leads, 3) : 0, lost: r.lost })[metric];
  const lo = from ? key(from) : null; const hi = to ? key(to) : key(ymd());
  const points = Object.keys(b).sort().filter((k) => (!lo || k >= lo) && (!hi || k <= hi)).map((k) => ({ period: k, value: val(b[k]) }));
  return { metric, by, siteId: siteId || null, points };
}

export function leaderboard({ siteId, month = currentMonth(), from, to, where } = {}) {
  const s = sets(siteId, where);
  const inRange = (iso) => { if (!iso) return false; if (from || to) return (!from || iso >= from) && (!to || iso.slice(0, 10) <= to); return monthOf(iso) === month; };
  const staff = db.all('staff').filter((x) => /sales/i.test(x.role) && !/manager/i.test(x.role)).filter(inSite(siteId));
  const rows = staff.map((p) => {
    const delivered = s.deals.filter((d) => d.salespersonId === p.id && isDelivered(d) && inRange(deliveredAt(d)));
    const leads = s.leads.filter((l) => l.ownerId === p.id && inRange(l.createdAt));
    const drives = s.drives.filter((x) => x.staffId === p.id && inRange(x.when));
    const open = s.deals.filter((d) => d.salespersonId === p.id && OPEN_STAGES.includes(d.stage)).length;
    const gross = sum(delivered, (d) => d.grossProfit);
    return { staffId: p.id, name: p.name, siteId: p.siteId, avatarInitials: p.avatarInitials, units: delivered.length, gross, avgGross: delivered.length ? round(gross / delivered.length) : 0, leads: leads.length, testDrives: drives.length, conversion: leads.length ? round(delivered.length / leads.length, 3) : 0, openDeals: open };
  }).sort((a, b) => b.units - a.units || b.gross - a.gross);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return { month: from || to ? null : month, from: from || null, to: to || null, siteId: siteId || null, rows };
}

/** Named KPIs for the agent's erp.kpi tool. */
export const KPI_NAMES = ['overview', 'series', 'leaderboard', 'days_of_supply'];
export function kpi(name, params = {}) {
  switch (name) {
    case 'overview': return overview(params);
    case 'series': return series(params);
    case 'leaderboard': return leaderboard(params);
    case 'days_of_supply': return daysOfSupply(params);
    default: return null;
  }
}
