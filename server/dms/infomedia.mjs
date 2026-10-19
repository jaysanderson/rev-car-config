// infomedia.mjs — the simulated Infomedia data pack (docs/DMS-PHASE2-SPEC.md §6) and
// the ARAG functions over it.
//
// Files (content/dms/infomedia/, written by scripts/dms-seed-service.mjs; every loader
// tolerates a missing file):
//   service_menus.json  {menus:[{id, modelId, make, model, yearFrom, yearTo, intervalKm, intervalMonths, title, operations[{code,desc,hours}], parts[{partNo,desc,qty,rrp}], labourHours, notes}]}
//   parts_prices.json   {parts:[{partNo, desc, supersedes, rrp, dealerPrice, fits[modelId], category}]}
//   labour_rates.json   {rates:[{siteId, rate, effectiveFrom}], gst}
//   campaigns.json      {campaigns:[{id, title, kind, make, models[], vinFrom, vinTo, yearFrom, yearTo, remedy, hours, partsRrp, openedAt}]}
//
// quote(): deterministic (menu hours × the site's labour rate + parts RRP + GST, valid
// 14 days). The customer-facing text is written by the agent from the menu resource
// (topic/infomedia + the model label) with the computed lines as extra context; every
// dollar figure in the text must appear in the computed quote, else the scripted text
// is used. ask(): cited answer over topic/infomedia.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../env.mjs';
import * as db from './db.mjs';
import * as arag from '../arag.mjs';
import * as kb from './kb.mjs';

const DIR = join(ROOT, 'content', 'dms', 'infomedia');
const FILES = { menus: 'service_menus.json', parts: 'parts_prices.json', rates: 'labour_rates.json', campaigns: 'campaigns.json' };
const cache = new Map();
function file(name) {
  const p = join(DIR, FILES[name]);
  if (!existsSync(p)) return null;
  const m = statSync(p).mtimeMs; const c = cache.get(name);
  if (c && c.m === m) return c.data;
  try { const data = JSON.parse(readFileSync(p, 'utf8')); cache.set(name, { m, data }); return data; } catch { return c ? c.data : null; }
}
export const menus = () => file('menus')?.menus || [];
export const parts = () => file('parts')?.parts || [];
export const campaigns = () => file('campaigns')?.campaigns || [];
export const GST = () => (file('rates')?.gst ?? 0.1);
export const loaded = () => Boolean(file('menus'));
export function labourRate(siteId) {
  const rates = (file('rates')?.rates || []).filter((r) => !siteId || r.siteId === siteId || r.siteId === '*').sort((a, b) => String(b.effectiveFrom || '').localeCompare(String(a.effectiveFrom || '')));
  return rates[0]?.rate ?? 185;
}
const money = (n) => `$${Math.round(Number(n)).toLocaleString('en-AU')}`;
const r2 = (n) => Math.round(n * 100) / 100;

export function packSummary() {
  const ms = menus(); const byModel = {};
  for (const m of ms) { const k = m.modelId || m.model; byModel[k] = (byModel[k] || 0) + 1; }
  const newest = [file('menus'), file('parts'), file('rates'), file('campaigns')].map((f) => f?.refreshedAt || f?.generatedAt).filter(Boolean).sort().pop() || null;
  return {
    loaded: loaded(), source: 'Simulated Infomedia data pack (Superservice Menus + Microcat EPC shape); not Infomedia data', refreshedAt: newest,
    menus: ms.length, modelsCovered: Object.keys(byModel).length, menusByModel: byModel, intervals: [...new Set(ms.map((m) => m.intervalKm))].sort((a, b) => a - b),
    parts: parts().length, labourRates: (file('rates')?.rates || []), gst: GST(), campaigns: campaigns().length,
    kbResources: Object.keys(kbIndex().infomedia || {}).length,
  };
}

// ── menus and quotes ─────────────────────────────────────────────────────────
export const modelKey = (v) => String(v || '').toLowerCase().trim().replace(/\s+/g, '-');
export function menusFor({ model, interval, year } = {}) {
  const mk = modelKey(model);
  return menus().filter((m) => (!mk || m.modelId === mk || modelKey(m.model) === mk) && (!interval || Number(m.intervalKm) === Number(interval)) && (!year || ((!m.yearFrom || year >= m.yearFrom) && (!m.yearTo || year <= m.yearTo))))
    .sort((a, b) => a.intervalKm - b.intervalKm);
}
export const menuById = (id) => menus().find((m) => m.id === id) || null;
/** The lines a menu produces at a site's labour rate (also used by job cards). */
export function menuLines(menu, siteId) {
  const rate = labourRate(siteId); const lines = [];
  for (const op of menu.operations || []) lines.push({ type: 'labour', code: op.code, desc: op.desc, qty: 1, hours: op.hours, unitPrice: rate, total: r2(op.hours * rate), source: 'menu', menuId: menu.id });
  for (const p of menu.parts || []) lines.push({ type: 'part', code: p.partNo, desc: p.desc, qty: p.qty, hours: null, unitPrice: p.rrp, total: r2(p.qty * p.rrp), source: 'menu', menuId: menu.id });
  return lines;
}
function vehicleFromVin(vin) {
  if (!vin) return null;
  const jc = db.all('job_cards').find((c) => c.vehicle?.vin === vin);
  if (jc) return { ...jc.vehicle, from: `job card ${jc.id}` };
  const v = db.get('vehicles', vin);
  if (v) return { vin, make: 'Toyota', model: v.model, modelId: v.model, year: v.arrivedAt ? Number(String(v.arrivedAt).slice(0, 4)) : null, from: `stock unit ${v.stockNo}` };
  return null;
}
/** Deterministic quote. Returns null when no menu matches. */
export function computeQuote({ vin, model, year, km, interval, extras = [], siteId = 'par' } = {}) {
  const veh = vehicleFromVin(vin) || (model ? { vin: vin || null, make: 'Toyota', model, modelId: modelKey(model), year: year || null, km: km || null } : null);
  if (!veh) return null;
  const candidates = menusFor({ model: veh.modelId || veh.model, year: veh.year || year });
  if (!candidates.length) return null;
  let menu = interval ? candidates.find((m) => Number(m.intervalKm) === Number(interval)) : null;
  if (!menu) { const k = Number(km ?? veh.km ?? 0); menu = candidates.find((m) => m.intervalKm >= k) || candidates[candidates.length - 1]; }
  const lines = menuLines(menu, siteId);
  for (const id of extras || []) { const x = menuById(id); if (x && x.id !== menu.id) lines.push(...menuLines(x, siteId).map((l) => ({ ...l, extra: true }))); }
  const labour = r2(lines.filter((l) => l.type === 'labour').reduce((s, l) => s + l.total, 0));
  const partsTotal = r2(lines.filter((l) => l.type === 'part').reduce((s, l) => s + l.total, 0));
  const subtotal = r2(labour + partsTotal); const gst = r2(subtotal * GST()); const total = r2(subtotal + gst);
  const open = campaignsFor({ vin: veh.vin, model: veh.modelId || veh.model, year: veh.year });
  return {
    vehicle: veh, menu: { id: menu.id, title: menu.title, intervalKm: menu.intervalKm, intervalMonths: menu.intervalMonths, notes: menu.notes || null, operations: menu.operations, parts: menu.parts },
    siteId, labourRate: labourRate(siteId), lines, labourTotal: labour, partsTotal, subtotal, gst, total,
    validUntil: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10), campaignsOpen: open,
    source: 'Simulated Infomedia data pack: menu operations, labour times and parts RRP from the pack; labour rate from the site; GST 10%',
  };
}
export function scriptedQuoteText(q) {
  const v = q.vehicle; const who = `${v.year ? `${v.year} ` : ''}${v.make || 'Toyota'} ${v.model}`;
  const ops = (q.menu.operations || []).map((o) => o.desc.toLowerCase()).slice(0, 5).join(', ');
  return `${q.menu.title} for your ${who}: ${ops}. Labour ${money(q.labourTotal)} at ${money(q.labourRate)} per hour, parts ${money(q.partsTotal)}, GST ${money(q.gst)}. Total ${money(q.total)}, valid until ${q.validUntil}.${q.campaignsOpen.length ? ` We will also carry out ${q.campaignsOpen.length} open campaign${q.campaignsOpen.length > 1 ? 's' : ''} at no charge: ${q.campaignsOpen.map((c) => c.title).join('; ')}.` : ''}`;
}
const QUOTE_SCHEMA = { name: 'service_quote_text', description: 'Customer-ready quote text', parameters: { type: 'object', properties: { text: { type: 'string', description: '60 to 120 words, plain prose, Australian English, no bullet points, mentions what is done, labour, parts, GST and the total exactly as given' } }, required: ['text'] } };
const figures = (q) => new Set([q.labourTotal, q.partsTotal, q.subtotal, q.gst, q.total, q.labourRate, q.menu.intervalKm, q.menu.intervalMonths, ...q.lines.map((l) => l.total), ...q.lines.map((l) => l.unitPrice), ...q.lines.map((l) => l.hours).filter((h) => h != null), ...q.lines.map((l) => l.qty), q.vehicle.year, q.vehicle.km].filter((n) => n != null).map((n) => String(Math.round(Number(n)))));
export function textFiguresOk(text, q) {
  const allowed = figures(q); for (const n of ['1', '2', '3', '4', '5', '6', '10', '12', '14', '24']) allowed.add(n);
  for (const raw of String(text).replace(/\d{4}-\d{2}-\d{2}/g, '').match(/\$?\d[\d,]*(?:\.\d+)?/g) || []) {
    const n = raw.replace(/[$,]/g, ''); const i = String(Math.round(Number(n)));
    if (!allowed.has(i) && !allowed.has(n)) return false;
  }
  return true;
}
export async function quote(opts) {
  const t0 = Date.now(); const q = computeQuote(opts);
  if (!q) return null;
  let text = scriptedQuoteText(q); let composedBy = 'scripted'; let citations = []; let status = 'not_configured';
  if (arag.configured() && opts.lang !== 'none') {
    try {
      const rid = kbIndex().infomedia?.[`menus-${q.vehicle.modelId || modelKey(q.vehicle.model)}`] || null;
      const r = await arag.ask({
        query: `Write the customer quote text for the ${q.menu.title} on a ${q.vehicle.year || ''} ${q.vehicle.make || 'Toyota'} ${q.vehicle.model}.`,
        system: 'You write service quotes for Harbourline Toyota customers. Use ONLY the QUOTE LINES in the context for figures; never invent prices, hours or parts. Say what the service includes, the labour and parts totals, GST and the total, and that the quote is valid for 14 days. Australian English, friendly and plain.',
        extraContext: [`QUOTE LINES:\n${q.lines.map((l) => `${l.type}: ${l.desc} ${l.hours ? `${l.hours} h × ${money(l.unitPrice)}` : `${l.qty} × ${money(l.unitPrice)}`} = ${money(l.total)}`).join('\n')}\nLabour ${money(q.labourTotal)}; parts ${money(q.partsTotal)}; subtotal ${money(q.subtotal)}; GST ${money(q.gst)}; TOTAL ${money(q.total)}; valid until ${q.validUntil}.${q.campaignsOpen.length ? ` Open campaigns to do at no charge: ${q.campaignsOpen.map((c) => c.title).join('; ')}.` : ''}`],
        jsonSchema: QUOTE_SCHEMA, filterExpression: { field: { or: [...(rid ? [{ prop: 'resource', id: rid }] : []), { prop: 'label', labelset: 'topic', label: 'infomedia' }] } }, timeoutMs: 20000, topK: 6,
      });
      status = r.status; citations = r.sources.slice(0, 4).map((s) => ({ resourceId: s.resourceId, title: s.title }));
      if (r.json?.text && textFiguresOk(r.json.text, q)) { text = r.json.text.trim(); composedBy = 'agent'; }
      else if (r.json?.text) composedBy = 'scripted (agent text rejected: a figure was not in the quote)';
    } catch (e) { console.warn(`[infomedia quote] ${e.message}`); }
  }
  return { ...q, text, composedBy, citations, status, ms: Date.now() - t0 };
}

// ── campaigns and parts ──────────────────────────────────────────────────────
export function campaignsFor({ vin, model, year } = {}) {
  const mk = modelKey(model);
  return campaigns().filter((c) => (!mk || !c.models?.length || c.models.includes(mk)) && (!year || ((!c.yearFrom || year >= c.yearFrom) && (!c.yearTo || year <= c.yearTo))) && (!vin || !c.vinFrom || !c.vinTo || (vin >= c.vinFrom && vin <= c.vinTo)))
    .map((c) => ({ id: c.id, title: c.title, kind: c.kind, remedy: c.remedy, hours: c.hours, partsRrp: c.partsRrp, openedAt: c.openedAt }));
}
export function partsSearch(q, model) {
  const mk = modelKey(model); const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  return parts().filter((p) => (!mk || !p.fits?.length || p.fits.includes(mk)) && (!words.length || words.every((w) => `${p.partNo} ${p.desc} ${p.category || ''}`.toLowerCase().includes(w)))).slice(0, 40);
}

// ── ask over the pack ────────────────────────────────────────────────────────
export async function ask({ question, lang = 'en', model }) {
  const t0 = Date.now();
  if (!arag.configured()) return { answer: 'The knowledge base is not configured on this server.', status: 'not_configured', citations: [], ms: 0 };
  const mk = modelKey(model);
  const r = await arag.ask({
    query: question, system: `You answer dealership service staff from the Infomedia data pack resources (service menus, parts prices, labour rates, campaigns). Quote intervals, hours, part numbers and prices exactly. If the pack does not cover it, say so. ${lang !== 'en' ? `Answer in ${lang}.` : 'Australian English.'}`,
    extraContext: [`Labour rates by site: ${(file('rates')?.rates || []).map((r) => `${r.siteId} ${money(r.rate)}/h`).join(', ')}; GST ${Math.round(GST() * 100)}%.`],
    filterExpression: { field: { and: [{ prop: 'label', labelset: 'topic', label: 'infomedia' }, ...(mk ? [{ prop: 'label', labelset: 'model', label: mk }] : [])] } }, timeoutMs: 25000, topK: 10,
  });
  return { answer: r.answer, status: r.status, grounded: !['no_context', 'no_retrieval_data'].includes(r.status), citations: r.sources.slice(0, 5).map((s) => ({ resourceId: s.resourceId, title: s.title, text: (s.text || '').slice(0, 300) })), ms: Date.now() - t0 };
}

// ── kb index (shared with service.mjs) ───────────────────────────────────────
const INDEX = join(ROOT, 'content', 'dms', 'kb-index-phase2.json');
let idxCache = { m: 0, data: null };
export function kbIndex() {
  if (!existsSync(INDEX)) return idxCache.data && idxCache.m === -1 ? idxCache.data : { jobCards: {}, suppliers: {}, customers: {}, infomedia: {} };
  const m = statSync(INDEX).mtimeMs;
  if (idxCache.data && idxCache.m === m) return idxCache.data;
  try { idxCache = { m, data: JSON.parse(readFileSync(INDEX, 'utf8')) }; } catch { idxCache = { m, data: { jobCards: {}, suppliers: {}, customers: {}, infomedia: {} } }; }
  return idxCache.data;
}
export const kbIndexPath = INDEX;
export const money$ = money;
