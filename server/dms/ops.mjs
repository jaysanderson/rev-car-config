// ops.mjs — DMS business operations used by the router: test-drive booking and status,
// quote creation with priced lines, ready-now bonus, approvals, stock holds/transfers,
// lead contact log, configurator decoration of leads, promotion status normalisation
// and the "why" text for move priorities.
//
// Pricing (same arithmetic as scripts/dms-seed.mjs):
//   driveAway  = vehiclePrice + onRoadCosts + accessoriesTotal − discount − readyNowBonus
//   frontGross = vehiclePrice − discount − readyNowBonus − landedCost + accessoriesGross
//   grossProfit = frontGross + backGross
//   Stock deal: vehiclePrice = unit listPrice, landedCost = unit landedCost, the unit's
//   fitted packs become priced accessory lines. Factory order: catalogue drive-away
//   estimate split into vehiclePrice + on-road costs (≈ 5.8 %), landedCost ≈ 95 %.
//   Accessory gross ≈ 40 % of retail (Genuine accessories cost ~60 %).
//   readyNowBonus ≤ the unit's bonusHeadroom (policy: incentive approval) and stock deals only.
import { randomInt } from 'node:crypto';
import * as db from './db.mjs';
import { ymd, OPEN_STAGES } from './kpi.mjs';
import { modelById, gradeOf, colourById, packById, priceOf } from '../data.mjs';

const now = () => new Date().toISOString();
const DAY = 86400000;
const round = (n, to = 10) => Math.round(n / to) * to;
const onRoadsFor = (price) => round(price * 0.058, 50);

// ── promotions: status normalised to published | unpublished | scheduled | expired ──
export function promoStatus(p, today = ymd()) {
  const end = p.endsAt ? String(p.endsAt).slice(0, 10) : p.validUntil || null;
  const start = p.startsAt ? String(p.startsAt).slice(0, 10) : null;
  if (end && end < today) return 'expired';
  const raw = String(p.status || '').toLowerCase();
  if (['draft', 'unpublished', 'paused', 'archived'].includes(raw)) return 'unpublished';
  if (start && start > today) return 'scheduled';
  if (raw === 'scheduled') return 'scheduled';
  return 'published';
}
export const promoView = (p) => ({ ...p, status: promoStatus(p) });

// ── leads: configurator decoration ───────────────────────────────────────────
let evIndex = { rows: null, map: new Map() };
async function eventsBySid() {
  let rows = [];
  try { rows = (await import('../events.mjs')).readEvents(); } catch { rows = []; }
  if (rows !== evIndex.rows) {
    const map = new Map();
    for (const e of rows) if (e.sid) { if (!map.has(e.sid)) map.set(e.sid, []); map.get(e.sid).push(e); }
    evIndex = { rows, map };
  }
  return evIndex.map;
}
function handoverFromTestDrive(l) {
  const tds = db.by('test_drives', 'leadId', l.id).sort((a, b) => String(b.when).localeCompare(String(a.when)));
  const td = tds.find((t) => t.handover) || tds[0];
  if (!td) return null;
  if (td.handover) return td.handover;
  return { testDriveId: td.id, when: td.when, stockNo: td.stockNo || null, modelId: td.modelId, gradeId: td.gradeId, questions: (td.questions || []).map((q) => ({ id: q.id, text: q.question || q.text, answer: q.answer ?? null })), incentive: td.incentive || null, outcome: td.outcome || null, status: td.status };
}
/** Lead + configurator first-party data: handover (from its test drive when missing), offersClicked[], events[]. */
export async function decorateLead(l, { full = false } = {}) {
  const out = { ...l };
  if (l.channel === 'configurator' || l.configuratorSessionId || l.customerRef) {
    if (!out.handover) out.handover = handoverFromTestDrive(l);
    const sid = l.configuratorSessionId || l.customerRef;
    const ev = sid ? (await eventsBySid()).get(sid) || [] : [];
    out.offersClicked = ev.filter((e) => e.type === 'offer_click').map((e) => ({ at: e.ts, unitId: e.data?.unitId || null, promotionId: e.data?.promotionId || null }));
    if (full) out.events = ev.map((e) => ({ at: e.ts, type: e.type, data: e.data || {} }));
    else out.eventsCount = ev.length;
  } else { out.offersClicked = []; if (full) out.events = []; }
  return out;
}

/** PATCH /leads {contact:{channel, note}} → contacts[] + lastContactAt + status contacted. */
export function contactPatch(l, contact, user) {
  const channel = ['call', 'phone', 'sms', 'email', 'whatsapp', 'meeting', 'walk-in'].includes(contact?.channel) ? contact.channel : null;
  if (!channel) return { error: 'contact.channel must be one of call, phone, sms, email, whatsapp, meeting, walk-in' };
  const at = now();
  const p = { contacts: [...(l.contacts || []), { at, channel, note: String(contact.note || '').slice(0, 1000), staffId: user.staffId }], lastContactAt: at };
  if (l.status === 'new') { p.status = 'contacted'; p.statusHistory = [...(l.statusHistory || []), { status: 'contacted', at }]; }
  return { value: p };
}

// ── test drives ──────────────────────────────────────────────────────────────
const TD_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newTdId() { for (;;) { let id = 'TD-'; for (let i = 0; i < 5; i++) id += TD_ALPHA[randomInt(TD_ALPHA.length)]; if (!db.get('test_drives', id)) return id; } }
export function createTestDrive(b, user, lead) {
  const siteId = b.siteId || lead.siteId;
  if (!db.get('sites', siteId)) return { error: 'unknown siteId' };
  const when = Date.parse(b.when);
  if (!b.when || Number.isNaN(when)) return { error: 'when must be an ISO date-time' };
  if (when < Date.now() - DAY) return { error: 'when is in the past' };
  const unit = b.stockNo ? db.get('vehicles', b.stockNo) : null;
  if (b.stockNo && !unit) return { error: 'unknown stockNo' };
  const modelId = b.modelId || unit?.model || lead.interest?.modelId;
  if (!modelById(modelId)) return { error: 'modelId is required (catalogue id)' };
  const gradeId = b.gradeId || unit?.grade || lead.interest?.gradeId || modelById(modelId).grades[0].id;
  if (!gradeOf(modelId, gradeId)) return { error: `unknown gradeId for ${modelId}` };
  const staffId = user.role === 'salesperson' ? user.staffId : b.staffId || lead.ownerId || user.staffId;
  if (staffId && !db.get('staff', staffId)) return { error: 'unknown staffId' };
  const clash = db.all('test_drives').find((t) => t.status === 'booked' && t.stockNo && t.stockNo === unit?.stockNo && Math.abs(Date.parse(t.when) - when) < 45 * 60000);
  if (clash) return { error: `${unit.stockNo} is already booked at that time (${clash.id})`, status: 409 };
  const row = db.insert('test_drives', { id: newTdId(), leadId: lead.id, customerId: lead.customerId || null, siteId, staffId, stockNo: unit?.stockNo || null, modelId, gradeId, when: new Date(when).toISOString(), status: 'booked', questions: [], incentive: null, handover: null, licenceChecked: false, createdAt: now(), createdBy: user.id });
  if (['new', 'contacted', 'qualified'].includes(lead.status)) db.patch('leads', lead.id, { status: 'test_drive_booked', updatedAt: now(), statusHistory: [...(lead.statusHistory || []), { status: 'test_drive_booked', at: now() }] });
  return { value: row };
}
export function patchTestDrive(t, b, user) {
  const p = {};
  if (b.status !== undefined) {
    if (!['booked', 'completed', 'no_show', 'cancelled'].includes(b.status)) return { error: 'status must be one of completed, no_show, cancelled (or booked to reinstate)' };
    if (b.status === 'completed' && !(b.licenceChecked ?? t.licenceChecked)) return { error: 'licenceChecked must be true before a test drive is completed (policy)' };
    p.status = b.status; p[`${b.status}At`] = now();
  }
  if (b.when !== undefined) { const w = Date.parse(b.when); if (Number.isNaN(w)) return { error: 'when must be an ISO date-time' }; p.when = new Date(w).toISOString(); if (!p.status && t.status !== 'booked') p.status = 'booked'; }
  if (b.licenceChecked !== undefined) p.licenceChecked = Boolean(b.licenceChecked);
  if (b.outcome !== undefined) p.outcome = String(b.outcome).slice(0, 500);
  if (!Object.keys(p).length) return { error: 'nothing to update' };
  p.updatedAt = now(); p.updatedBy = user.id;
  return { value: db.patch('test_drives', t.id, p) };
}

// ── deals ────────────────────────────────────────────────────────────────────
function lineForPack(id) { const a = packById(id); return a ? { id: a.id, name: a.name, price: a.price } : null; }
function totals(d) {
  const accessoriesTotal = (d.accessories || []).reduce((n, a) => n + (Number(a.price) || 0), 0);
  const accessoriesGross = round(accessoriesTotal * 0.4);
  const bonus = Number(d.readyNowBonus) || 0;
  const driveAway = (d.vehiclePrice || 0) + (d.onRoadCosts || 0) + accessoriesTotal - (d.discount || 0) - bonus;
  const frontGross = (d.vehiclePrice || 0) - (d.discount || 0) - bonus - (d.landedCost || 0) + accessoriesGross - (d.promotionCost || 0);
  return { accessoriesTotal, accessoriesGross, driveAway, frontGross, grossProfit: frontGross + (d.backGross || 0) };
}
export function createDeal(b, user, lead) {
  const at = now();
  let base;
  if (b.stockNo) {
    const v = db.get('vehicles', b.stockNo);
    if (!v) return { error: 'unknown stockNo' };
    if (!['on_lot', 'demo', 'in_transit', 'allocated'].includes(v.status)) return { error: `${v.stockNo} is ${v.status}` };
    const open = v.dealId && db.get('deals', v.dealId);
    if (open && OPEN_STAGES.includes(open.stage) && open.leadId !== lead.id) return { error: `${v.stockNo} is on open deal ${open.id}`, status: 409 };
    if (v.hold && v.hold.until > at && v.hold.leadId !== lead.id) return { error: `${v.stockNo} is held for lead ${v.hold.leadId} until ${v.hold.until}`, status: 409 };
    base = { modelId: v.model, gradeId: v.grade, colourId: v.colour, stockNo: v.stockNo, order: null, fulfilment: 'stock', vehiclePrice: v.listPrice, onRoadCosts: onRoadsFor(v.listPrice), landedCost: v.landedCost, accessories: (v.packs || []).map(lineForPack).filter(Boolean) };
  } else if (b.order && typeof b.order === 'object') {
    const { modelId, gradeId, colourId } = b.order;
    if (!modelById(modelId) || !gradeOf(modelId, gradeId)) return { error: 'order.modelId / order.gradeId must be catalogue ids' };
    if (colourId && !colourById(colourId)) return { error: 'unknown order.colourId' };
    const est = priceOf({ modelId, gradeId, colourId });
    const vehiclePrice = round(est / 1.058); const eta = Number(b.order.etaWeeks) || 10;
    base = { modelId, gradeId, colourId: colourId || null, stockNo: null, order: { modelId, gradeId, colourId: colourId || null, etaWeeks: eta }, fulfilment: 'order', vehiclePrice, onRoadCosts: est - vehiclePrice, landedCost: round(vehiclePrice * 0.95), accessories: [] };
  } else return { error: 'stockNo or order{modelId,gradeId,colourId} is required' };
  const salespersonId = user.role === 'salesperson' ? user.staffId : lead.ownerId || user.staffId;
  const d = { id: db.nextId('deals', 'D'), leadId: lead.id, customerId: lead.customerId || null, siteId: lead.siteId, salespersonId, businessManagerId: null, ...base, stage: 'quote', createdAt: at, updatedAt: at, closedAt: null, contractAt: null, promotions: [], promotionCost: 0, tradeInId: null, discount: 0, readyNowBonus: 0, bonus: 0, deposit: 0, financeAppId: null, backGross: 0, grossStatus: 'projected', deliveryDate: null, lostReason: null, stageHistory: [{ stage: 'quote', at }], events: [{ at, type: 'created', note: `Quote created${base.stockNo ? ` on ${base.stockNo}` : ' (factory order)'}`, staffId: user.staffId }] };
  Object.assign(d, totals(d));
  const row = db.insert('deals', d);
  if (base.stockNo) db.patch('vehicles', base.stockNo, { dealId: row.id });
  if (!['quoted', 'won', 'lost'].includes(lead.status)) db.patch('leads', lead.id, { status: 'quoted', updatedAt: at, statusHistory: [...(lead.statusHistory || []), { status: 'quoted', at }] });
  return { value: row };
}
/** readyNowBonus ≤ unit headroom; returns the patch with recomputed totals. */
export function bonusPatch(d, value) {
  const n = Number(value);
  if (!(n >= 0)) return { error: 'readyNowBonus must be a number ≥ 0' };
  const v = d.stockNo && db.get('vehicles', d.stockNo);
  if (!v) return { error: 'readyNowBonus applies to stock deals only (no unit on this deal)' };
  const cap = Number(v.bonusHeadroom) || 0;
  if (n > cap) return { error: `readyNowBonus $${n} exceeds the unit's approved headroom $${cap} (policy: incentive approval)`, status: 422 };
  // Delta update so seeded deals keep their own gross build-up (trade over-allowance, promotion cost…).
  const delta = n - (Number(d.readyNowBonus ?? d.bonus) || 0);
  const front = (d.frontGross || 0) - delta;
  return { value: { readyNowBonus: n, bonus: n, driveAway: (d.driveAway || 0) - delta, frontGross: front, grossProfit: front + (d.backGross || 0), updatedAt: now() } };
}
export const recalc = (d, p) => totals({ ...d, ...p });
/** Stage change patch with stageHistory + event. */
export function stagePatch(d, stage, note, user) {
  const at = now();
  const p = { stage, updatedAt: at, stageHistory: [...(d.stageHistory || []), { stage, at }], events: [...(d.events || []), { at, type: 'stage', note: note || `Stage ${d.stage} → ${stage}`, staffId: user.staffId }] };
  if (['delivered', 'lost'].includes(stage)) p.closedAt = at;
  if (stage === 'delivered' && !d.deliveryDate) p.deliveryDate = at;
  if (stage === 'contract' && !d.contractAt) p.contractAt = at;
  return p;
}
/** approval_requested → stage approval (from quote/negotiation/finance); approved → contract (managers / F&I). */
export function approvalEvent(d, type, note, user) {
  if (type === 'approval_requested') {
    if (!['quote', 'negotiation', 'finance', 'approval'].includes(d.stage)) return { error: `cannot request approval at stage ${d.stage}` };
    const p = d.stage === 'approval' ? { events: [...(d.events || [])], updatedAt: now() } : stagePatch(d, 'approval', 'Stage → approval (approval requested)', user);
    p.events.push({ at: now(), type, note: note || 'Approval requested', staffId: user.staffId });
    return { value: p };
  }
  if (type === 'approved') {
    if (!['gm', 'sales_manager', 'finance'].includes(user.role)) return { error: 'only a sales manager, general manager or business manager can approve', status: 403 };
    if (!['approval', 'finance', 'negotiation', 'quote'].includes(d.stage)) return { error: `cannot approve at stage ${d.stage}` };
    const p = stagePatch(d, 'contract', note || 'Approved', user);
    p.events.push({ at: now(), type, note: note || 'Approved', staffId: user.staffId });
    return { value: p };
  }
  return null;
}

// ── stock ────────────────────────────────────────────────────────────────────
export function hold(v, lead, user) {
  if (!['on_lot', 'demo', 'in_transit'].includes(v.status)) return { error: `${v.stockNo} is ${v.status} and cannot be held` };
  const at = now();
  if (v.hold && v.hold.until > at && v.hold.leadId !== lead.id) return { error: `${v.stockNo} is already held for lead ${v.hold.leadId} until ${v.hold.until}`, status: 409 };
  const h = { leadId: lead.id, staffId: user.staffId, at, until: new Date(Date.now() + 48 * 3600000).toISOString() };
  return { value: db.patch('vehicles', v.stockNo, { hold: h, holds: [...(v.holds || []), h] }) };
}
export function transfer(v, toSiteId, user) {
  if (!db.get('sites', toSiteId)) return { error: 'unknown toSiteId' };
  if (toSiteId === v.siteId) return { error: `${v.stockNo} is already at ${toSiteId}` };
  if (!['on_lot', 'demo', 'in_transit', 'allocated'].includes(v.status)) return { error: `${v.stockNo} is ${v.status} and cannot be transferred` };
  const t = { from: v.siteId, to: toSiteId, at: now(), staffId: user.staffId, etaDays: 2 };
  return { value: db.patch('vehicles', v.stockNo, { siteId: toSiteId, transfer: t, transfers: [...(v.transfers || []), t] }) };
}

/** Customer-safe? No: internal "why this is being pushed" text for a stock unit. */
export function whyText(v, signal) {
  const parts = [];
  if ((v.daysInStock || 0) > 60) parts.push(`aged ${v.daysInStock} days (over the 60-day line)`);
  else parts.push(`${v.daysInStock || 0} days in stock`);
  if (v.bonusHeadroom) parts.push(`$${Number(v.bonusHeadroom).toLocaleString('en-AU')} approved incentive headroom`);
  if (v.movePriority != null) parts.push(`move priority ${v.movePriority}${v.reasonCode ? ` (${String(v.reasonCode).replace(/_/g, ' ')})` : ''}`);
  if (signal) {
    if (signal.daysOfSupply > 45) parts.push(`${signal.daysOfSupply} days of supply for the model`);
    if (signal.targetGap > 0) parts.push(`model is ${signal.targetGap} short of this month's target`);
    if (signal.allocationNextMonth > 4) parts.push(`${signal.allocationNextMonth} more arriving next month`);
  }
  if (v.hold && v.hold.until > now()) parts.push(`held for lead ${v.hold.leadId} until ${v.hold.until.slice(0, 16).replace('T', ' ')}`);
  return `${parts[0][0].toUpperCase()}${parts.join('; ').slice(1)}.`;
}
