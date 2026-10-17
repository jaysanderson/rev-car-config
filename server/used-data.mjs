// used-data.mjs — pre-owned stock for Harbourline Used: loading, cards, text
// renderings for the agent, scripted dealer comments, market position, similarity,
// the per-session memory (questions, watches, match answers) and the used report.
//
// Files
//   content/used/stock.json                  36 units (scripts/used-seed.mjs)
//   content/used/kb-index.json               {stockNo: resourceId} written by scripts/ingest-used.mjs
//   content/domo/used_market_prices.json     Domo stand-in: asking-price bands
//   dealer state (state.mjs):
//     used_comments.generated.json           agent-written comments per unit (seed in content/dealer)
//     used_sessions.jsonl                    {ts, sid, kind: ask|match, stockNo, q, a, lang | answers}
//     used_watches.json                      [{id, sid, stockNo|criteria, createdAt}] (seed has demo watchers)
//     used_holds.json                        [{stockNo, ref, until, sid}]
//     used_enquiries.json                    [{ref, kind, stockNo, leadId, sid, at}]
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './env.mjs';
import { readDealer, dealerPath, appendDealerLines, updateDealer } from './state.mjs';

const USED_DIR = join(ROOT, 'content', 'used');
const SITES = JSON.parse(readFileSync(join(ROOT, 'content', 'dms', 'data', 'sites.json'), 'utf8')).map((s) => ({ id: s.id, name: s.name, address: s.address, phone: s.phone, distanceKm: s.distanceKm, transferRun: s.transferRun }));
export const sites = () => SITES;
export const siteName = (id) => SITES.find((s) => s.id === id)?.name || id;

const cache = new Map();
function readJson(p, fallback) {
  if (!existsSync(p)) return fallback;
  const m = statSync(p).mtimeMs; const c = cache.get(p);
  if (c && c.mtime === m) return c.data;
  try { const data = JSON.parse(readFileSync(p, 'utf8')); cache.set(p, { mtime: m, data }); return data; } catch { return c ? c.data : fallback; }
}
export const stockFile = () => readJson(join(USED_DIR, 'stock.json'), { generated: null, priceNote: '', rows: [] });
export const units = () => stockFile().rows;
export const priceNote = () => stockFile().priceNote;
export const unitById = (id) => units().find((u) => u.stockNo === String(id || '').toUpperCase());
export const kbIndex = () => readJson(join(USED_DIR, 'kb-index.json'), {});
export const resourceIdOf = (stockNo) => kbIndex()[stockNo] || null;
export const market = () => readJson(join(ROOT, 'content', 'domo', 'used_market_prices.json'), { refreshed_at: null, rows: [] });
export const fmt = (n) => `$${Number(n).toLocaleString('en-AU')}`;
export const fmtKm = (n) => `${Number(n).toLocaleString('en-AU')} km`;

// ── holds (reserve) and status ───────────────────────────────────────────────
export const holds = () => (readDealer('used_holds.json', []) || []).filter((h) => new Date(h.until) > new Date());
export function effectiveStatus(u) { return u.status === 'on_lot' && holds().some((h) => h.stockNo === u.stockNo) ? 'held' : u.status; }

// ── cards ────────────────────────────────────────────────────────────────────
export const title = (u) => `${u.year} ${u.make} ${u.model}`;
export const longTitle = (u) => `${u.year} ${u.make} ${u.model} ${u.grade}${u.fuel === 'Hybrid' ? ' hybrid' : u.fuel === 'Electric' ? ' electric' : ''}${/AWD|4x4/.test(u.drive) ? ` ${u.drive}` : ''}, ${fmtKm(u.km)}, ${u.colour} (${u.stockNo})`;
export function card(u, { youAsked = 0, watchers = 0, headline = null } = {}) {
  return {
    stockNo: u.stockNo, title: title(u), subtitle: `${u.grade} ${u.variantCode}`.trim(), make: u.make, model: u.model, modelId: u.modelId, year: u.year, grade: u.grade, variantCode: u.variantCode,
    body: u.body, bodyLabel: u.bodyLabel, colour: u.colour, km: u.km, transmission: u.transmission, fuel: u.fuel, drive: u.drive, seats: u.seats,
    price: u.price, was: u.was, certified: u.certified, demo: u.demo, status: effectiveStatus(u), etaDays: u.etaDays, siteId: u.siteId, siteName: siteName(u.siteId), daysInStock: u.daysInStock,
    photo: u.photo, headline: headline ?? commentsFor(u).headline, youAsked, watchers, market: (() => { const m = marketFor(u); return m ? { position: m.position, diff: m.diff, median: m.median } : null; })(),
  };
}

// ── market position ──────────────────────────────────────────────────────────
export function marketFor(u) {
  const rows = market().rows.filter((r) => r.make === u.make && r.model === u.model && u.year >= r.yearFrom && u.year <= r.yearTo);
  const row = rows.find((r) => (r.grades || []).includes(u.grade)) || rows[0];
  if (!row) return null;
  const diff = u.price - row.median; const pct = diff / row.median;
  return { median: row.median, low: row.low, high: row.high, sample: row.sample, diff, position: pct < -0.025 ? 'below' : pct > 0.025 ? 'above' : 'at', refreshedAt: market().refreshed_at, source: 'Domo · used_market_prices (stand-in)' };
}

// ── similarity ───────────────────────────────────────────────────────────────
const BODY_NEAR = { 'suv-small': ['suv-mid'], 'suv-mid': ['suv-small', 'suv-large'], 'suv-large': ['suv-mid', 'ute'], ute: ['suv-large'], sedan: ['hatch'], hatch: ['sedan', 'suv-small'], coupe: ['hatch'] };
export function similarTo(u, n = 4, exclude = new Set()) {
  return units().filter((x) => x.stockNo !== u.stockNo && !exclude.has(x.stockNo) && !['sold'].includes(x.status))
    .map((x) => { let s = 0; if (x.model === u.model) s += 5; if (x.body === u.body) s += 3; else if ((BODY_NEAR[u.body] || []).includes(x.body)) s += 1; if (x.fuel === u.fuel) s += 1; if (x.seats === u.seats) s += 1; s -= Math.min(3, Math.abs(x.price - u.price) / 10000); s -= Math.min(2, Math.abs(x.year - u.year) / 2); return [s, x]; })
    .sort((a, b) => b[0] - a[0]).slice(0, n).map(([, x]) => x);
}

// ── text renderings for the agent / knowledge box ────────────────────────────
export function listingText(u) {
  const w = u.warranty;
  return [
    `# ${longTitle(u)}`, '',
    `${u.year} ${u.make} ${u.model} ${u.grade} (${u.variantCode}), ${u.bodyLabel.toLowerCase()}, ${u.engine}, ${u.fuel.toLowerCase()}, ${u.transmission.toLowerCase()}, ${u.drive}, ${u.seats} seats, braked towing ${u.towKg ? `${u.towKg} kg` : 'not rated'}. Odometer ${fmtKm(u.km)}. Colour ${u.colour}, interior ${u.interior}.`,
    `Price ${fmt(u.price)} excluding government charges${u.was ? ` (was ${fmt(u.was)})` : ''}. Stock number ${u.stockNo}, at Harbourline Toyota ${siteName(u.siteId)}${u.status === 'arriving' ? `, arriving in about ${u.etaDays} days` : u.status === 'reconditioning' ? ', in reconditioning (viewable by appointment)' : ''}.`,
    u.certified ? 'Toyota Certified Pre-Owned: 120-point inspection, 12-month Toyota Certified warranty, 24/7 roadside assistance and a 7-day exchange promise.' : u.make === 'Toyota' ? 'Not Toyota Certified (outside the programme age or kilometre limits, or not a Toyota-serviced car).' : 'Non-Toyota trade-in, sold with a 90-point Harbourline inspection.',
    `Warranty: ${w.type}${w.until ? ` until ${w.until}` : ''}${w.kmLimit ? ` or ${fmtKm(w.kmLimit)}` : ''}${w.note ? `, ${w.note}` : ''}${w.roadside ? '; includes roadside assistance' : ''}.`,
    `Features: ${u.features.join(', ')}.`,
    `Ownership: ${u.owners} previous owner${u.owners > 1 ? 's' : ''}, first registered ${u.firstRegistered}, compliance ${u.compliance}, registration to ${u.regoExpiry}, ${u.keys} key${u.keys > 1 ? 's' : ''}, ${u.books ? 'service books present' : 'no service books'}. Acquired via ${u.acquiredVia}${u.demo ? ' (Harbourline demonstrator)' : ''}.`,
  ].join('\n');
}
export function provenanceText(u) {
  const i = u.inspection; const p = u.ppsr;
  return [
    `# Provenance for ${u.stockNo} (${title(u)} ${u.grade})`, '',
    '## Service history', ...u.serviceHistory.map((s) => `- ${s.date} at ${fmtKm(s.km)}: ${s.work} (${s.by})`),
    `Next service due at ${fmtKm(u.nextServiceDue.km)} or by ${u.nextServiceDue.date}.`, '',
    `## Inspection (${i.points}-point, ${i.date}, by ${i.inspector}): ${i.passed ? 'passed' : 'failed'}`,
    ...i.items.map((it) => `- ${it.area}: ${it.note} (${it.action})`),
    `Tyres ${i.tyresMm.front} mm front, ${i.tyresMm.rear} mm rear. Brakes ${i.brakesPct.front}% front, ${i.brakesPct.rear}% rear remaining.`, '',
    `## PPSR check ${p.checkedAt} (${p.certificate})`, `Encumbrance: ${p.encumbrance ? 'yes' : 'none'}. Written-off register: ${p.writtenOff ? 'listed' : 'not listed'}. Stolen: ${p.stolen ? 'yes' : 'no'}.`, '',
    '## Reconditioning by Harbourline', ...(u.reconditioning.length ? u.reconditioning.map((r) => `- ${r.item}: ${fmt(r.cost)}`) : ['- None required']),
    u.tradeInId ? `\nTraded in to Harbourline (appraisal ${u.tradeInId}).` : '',
  ].join('\n');
}
export const unitContext = (u) => `${listingText(u)}\n\n${provenanceText(u)}`;
/** One line per unit for the general assistant. */
export function rangeSummary(filter = () => true) {
  return ['Harbourline Used stock (prices exclude government charges):', ...units().filter(filter).map((u) => `- ${u.stockNo}: ${u.year} ${u.make} ${u.model} ${u.grade}, ${u.fuel}, ${u.drive}, ${fmtKm(u.km)}, ${fmt(u.price)}, ${u.colour}, ${siteName(u.siteId)}, ${effectiveStatus(u)}${u.certified ? ', Toyota Certified' : ''}${u.seats === 7 ? ', 7 seats' : ''}${u.towKg >= 2500 ? `, tows ${u.towKg} kg` : ''}`)].join('\n');
}

// ── dealer comments: cached agent output or scripted composition ─────────────
export const commentsStore = () => readDealer('used_comments.generated.json', { generatedAt: null, model: null, items: {} }) || { items: {} };
export function commentsFor(u) {
  const c = commentsStore().items?.[u.stockNo];
  return c ? { ...c, by: 'agent' } : { ...scriptedComments(u), by: 'scripted' };
}
export function scriptedComments(u) {
  const i = u.inspection; const svc = u.serviceHistory;
  const toyotaServiced = svc.filter((s) => /Toyota/.test(s.by)).length;
  const highlights = [
    `${fmtKm(u.km)} with ${svc.length} logged service${svc.length > 1 ? 's' : ''}${toyotaServiced === svc.length ? ', all at Toyota dealers' : toyotaServiced ? `, ${toyotaServiced} at Toyota dealers` : ''}`,
    u.certified ? `Toyota Certified: ${i.points}-point inspection passed on ${i.date}, 12-month warranty and roadside` : `${i.points}-point inspection passed on ${i.date}`,
    `${u.owners} owner${u.owners > 1 ? 's' : ''}, ${u.keys} key${u.keys > 1 ? 's' : ''}, ${u.books ? 'books' : 'no books'}, PPSR clear`,
    ...(u.warranty.note ? [u.warranty.note.replace(/^plus /, 'Plus ')] : []),
  ];
  const honest = i.items.filter((it) => it.action === 'noted').map((it) => it.note).concat(u.tyresMm?.front < 4 ? ['Front tyres will need replacing within the year'] : []);
  const repaired = i.items.filter((it) => it.action !== 'noted');
  const body = [
    `${u.year} ${u.make} ${u.model} ${u.grade} in ${u.colour} with ${u.interior.toLowerCase()} interior, ${u.engine}, ${u.transmission.toLowerCase()}, ${u.drive}.`,
    `It has ${fmtKm(u.km)} and ${svc.length} logged services, the latest a ${svc[svc.length - 1].work.toLowerCase()} on ${svc[svc.length - 1].date}.`,
    repaired.length ? `During reconditioning we ${repaired.map((it) => it.note.charAt(0).toLowerCase() + it.note.slice(1)).join(', ')}.` : 'It needed no reconditioning beyond the pre-delivery service.',
    honest.length ? `Worth knowing: ${honest.join('; ').toLowerCase()}.` : '',
    `Standard kit includes ${u.features.slice(0, 4).join(', ')}.`,
    `${fmt(u.price)} excluding government charges at Harbourline Toyota ${siteName(u.siteId)}.`,
  ].filter(Boolean).join(' ');
  return { headline: `${u.certified ? 'Toyota Certified, ' : ''}${u.owners === 1 ? 'one owner' : `${u.owners} owners`}, ${fmtKm(u.km)}, ${svc.length} logged services`, body, highlights, honest, sources: ['listing', 'provenance'], generatedAt: null };
}
/** Agent comments may only state what the record states: reject invented numbers or sales puff. */
export function validateComments(u, c) {
  if (!c || typeof c.headline !== 'string' || typeof c.body !== 'string' || !c.headline.trim() || c.body.trim().length < 80) return 'missing fields';
  if (c.body.length > 1200 || c.headline.length > 120) return 'too long';
  const text = `${c.headline} ${c.body} ${(c.highlights || []).join(' ')} ${(c.honest || []).join(' ')}`;
  if (/\b(immaculate|perfect|flawless|guarantee|best price|cheapest|accident[- ]free|no accidents|finance approved|must sell|won'?t last)\b/i.test(text)) return 'puffery';
  const allowed = new Set(JSON.stringify(u).match(/\d[\d,]*\d|\d/g)?.map((n) => n.replace(/,/g, '')) || []);
  for (const y of [u.year - 1, u.year + 1, u.year + 2, u.year + 3, u.year + 4, u.year + 5]) allowed.add(String(y));
  for (const n of ['1', '2', '3', '4', '5', '7', '12', '24', '90', '120', '160']) allowed.add(n);
  const nums = text.replace(/\d{4}-\d{2}-\d{2}/g, '').match(/\d[\d,]*\.?\d*/g) || [];
  for (const raw of nums) { const n = raw.replace(/,/g, '').replace(/\.0+$/, ''); if (!allowed.has(n) && !allowed.has(n.split('.')[0])) return `unsupported figure ${raw}`; }
  if (!(c.highlights || []).length) return 'no highlights';
  return null;
}

// ── per-session memory ───────────────────────────────────────────────────────
const KEEP_MS = 30 * 86400000;
let sessCache = { path: null, mtime: 0, size: 0, rows: [] };
export function sessionRows() {
  const p = dealerPath('used_sessions.jsonl');
  if (!existsSync(p)) return [];
  const st = statSync(p);
  if (sessCache.path === p && sessCache.mtime === st.mtimeMs && sessCache.size === st.size) return sessCache.rows;
  const rows = []; const cut = Date.now() - KEEP_MS;
  for (const line of readFileSync(p, 'utf8').split('\n')) { if (!line.trim()) continue; try { const r = JSON.parse(line); if (r && r.sid && Date.parse(r.ts) > cut) rows.push(r); } catch { /* torn line */ } }
  sessCache = { path: p, mtime: st.mtimeMs, size: st.size, rows };
  return rows;
}
export function rememberAsk(sid, stockNo, q, a, lang) {
  if (!sid) return;
  appendDealerLines('used_sessions.jsonl', [JSON.stringify({ ts: new Date().toISOString(), sid, kind: 'ask', stockNo: stockNo || null, q: String(q).slice(0, 300), a: String(a).slice(0, 600), lang: lang || 'en' })]);
}
export function rememberMatch(sid, answers) {
  if (!sid) return;
  appendDealerLines('used_sessions.jsonl', [JSON.stringify({ ts: new Date().toISOString(), sid, kind: 'match', answers })]);
}
export const questionsFor = (sid, stockNo) => sessionRows().filter((r) => r.sid === sid && r.kind === 'ask' && (stockNo ? r.stockNo === stockNo : true)).map((r) => ({ stockNo: r.stockNo, q: r.q, a: r.a, at: r.ts, lang: r.lang }));
export function questionCounts(sid) {
  const by = {}; const recent = [];
  for (const r of sessionRows()) if (r.sid === sid && r.kind === 'ask' && r.stockNo) { by[r.stockNo] = (by[r.stockNo] || 0) + 1; recent.push({ stockNo: r.stockNo, q: r.q, at: r.ts }); }
  return { byStock: by, recent: recent.slice(-10).reverse() };
}
export const lastMatch = (sid) => sessionRows().filter((r) => r.sid === sid && r.kind === 'match').pop()?.answers || null;
/** Rewrite the sessions file without this sid (the "forget me" button). */
export async function forgetSession(sid) {
  const rows = sessionRows().filter((r) => r.sid !== sid);
  const { writeFileSync } = await import('node:fs');
  const p = dealerPath('used_sessions.jsonl');
  try { writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '')); } catch (e) { console.warn(`[used] forget: ${e.message}`); }
  await updateDealer('used_watches.json', (w) => (w || []).filter((x) => x.sid !== sid), []);
}

// ── watches ──────────────────────────────────────────────────────────────────
export const watches = () => readDealer('used_watches.json', []) || [];
export const watchersOf = (stockNo) => watches().filter((w) => w.stockNo === stockNo).length;
export function criteriaMatches(c, u) {
  if (!c) return false;
  if (c.model && u.model.toLowerCase() !== String(c.model).toLowerCase() && u.modelId !== c.model) return false;
  if (c.body && u.body !== c.body && u.bodyLabel.toLowerCase() !== String(c.body).toLowerCase()) return false;
  if (c.fuel && u.fuel.toLowerCase() !== String(c.fuel).toLowerCase()) return false;
  if (c.priceMax && u.price > c.priceMax) return false;
  if (c.kmMax && u.km > c.kmMax) return false;
  if (c.seats && u.seats < c.seats) return false;
  return true;
}
export async function addWatch(sid, { stockNo = null, criteria = null }) {
  const id = `W-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const w = { id, sid, stockNo, criteria, createdAt: new Date().toISOString() };
  await updateDealer('used_watches.json', (list) => { const l = (list || []).filter((x) => !(x.sid === sid && x.stockNo && x.stockNo === stockNo)); l.push(w); return l; }, []);
  return w;
}

// ── enquiries ────────────────────────────────────────────────────────────────
export const enquiries = () => readDealer('used_enquiries.json', []) || [];
export async function addEnquiry(e) { await updateDealer('used_enquiries.json', (l) => [...(l || []), e], []); return e; }
export async function addHold(h) { await updateDealer('used_holds.json', (l) => [...(l || []).filter((x) => new Date(x.until) > new Date()), h], []); return h; }
