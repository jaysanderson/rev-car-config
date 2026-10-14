// dxm.mjs — the configurator → DMS bridge and the digital-experience views.
//
// leadFromBooking(booking) turns a configurator test-drive booking
// (content/dealer/bookings.json record, see server/testdrive.mjs) into a DMS lead with
// customerId null, channel "configurator", customerRef = the configurator session id
// (or the booking id when there is none), finder answers, viewed cars, the handover
// and a matching test_drives row (id = bookingId). Idempotent: a second call for the
// same booking refreshes the lead / test drive instead of duplicating them.
// A customer record is only created later, when PATCH /leads/:id captures a name/email.
//
// reconcile() runs at startup and whenever bookings.json changes (checked lazily on
// DMS requests), so bookings made while the DMS was down still become leads, and the
// configurator does not have to call the hook (it may: import { leadFromBooking }
// from './dms/index.mjs').
import { readDealer } from '../state.mjs';
import * as db from './db.mjs';
import { configuratorReport } from './domo.mjs';

const OPEN = new Set(['quote', 'negotiation', 'finance', 'approval', 'contract', 'delivery']);
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const bookings = () => readDealer('bookings.json', { bookings: [] }).bookings || [];

function ownerFor(siteId, key) {
  const sp = db.all('staff').filter((s) => s.siteId === siteId && /sales/i.test(s.role) && !/manager/i.test(s.role));
  return sp.length ? sp[hash(key) % sp.length].id : null;
}
function handoverOf(b) {
  return b.handover || {
    questions: b.questions || [], answers: b.answers || null, prep: b.prep || null, incentive: b.incentive || null,
    build: b.build || null, whenLabel: b.whenLabel || null, transferFrom: b.transferFrom || null, lang: b.lang || 'en',
  };
}
const scoreOf = (b) => Math.min(98, 62 + (b.finderAnswers?.length || 0) * 4 + (b.unitId ? 8 : 0) + (b.build ? 6 : 0) + (b.answers ? 6 : 0));

/** Create or refresh the lead + test drive for a configurator booking. Returns the lead. */
export function leadFromBooking(b) {
  if (!b || !b.bookingId) return null;
  const site = b.site || b.siteId || 'par';
  const existing = db.by('leads', 'bookingId', b.bookingId)[0];
  const sid = b.sid || b.sessionId || b.configuratorSessionId || null;
  const interest = { modelId: b.modelId || b.build?.modelId || null, gradeId: b.gradeId || b.build?.gradeId || null, colourId: b.build?.colourId || null, stockNo: b.unitId || null };
  const handover = handoverOf(b);
  const status = b.status === 'cancelled' ? 'lost' : 'test_drive_booked';
  let lead;
  if (existing) {
    const p = { handover, updatedAt: new Date().toISOString() };
    if (JSON.stringify(existing.handover) !== JSON.stringify(handover)) lead = db.patch('leads', existing.id, p); else lead = existing;
  } else {
    const ownerId = ownerFor(site, b.bookingId);
    lead = db.insert('leads', {
      id: db.nextId('leads', 'L'), customerId: null, customerRef: sid || b.bookingId, siteId: site, ownerId,
      source: 'web-configurator', channel: 'configurator', status, createdAt: b.createdAt || new Date().toISOString(), updatedAt: b.createdAt || new Date().toISOString(),
      interest, configuratorSessionId: sid, finderAnswers: b.finderAnswers || [], viewed: b.viewed || [], bookingId: b.bookingId, handover,
      lostReason: status === 'lost' ? 'Booking cancelled' : null, score: scoreOf(b),
    });
  }
  const td = db.get('test_drives', b.bookingId);
  const tdRow = {
    leadId: lead.id, customerId: lead.customerId || null, siteId: site, staffId: lead.ownerId, stockNo: b.unitId || null,
    modelId: interest.modelId, gradeId: interest.gradeId, when: b.when, status: b.status === 'cancelled' ? 'cancelled' : (td?.status || 'booked'),
    questions: (b.questions || []).map((q) => ({ id: q.id, question: q.text || q.question, answer: (b.answers || []).find((a) => a.questionId === q.id || a.id === q.id)?.label || (b.answers || []).find((a) => a.questionId === q.id || a.id === q.id)?.value || null })),
    incentive: b.incentive || null, handover,
  };
  if (!td) db.insert('test_drives', { id: b.bookingId, ...tdRow });
  else if (JSON.stringify(td.handover) !== JSON.stringify(handover)) db.patch('test_drives', b.bookingId, tdRow);
  return lead;
}

let lastBookings = null; let lastVersion = -1;
/** Leads for bookings that have none (cheap no-op when nothing changed). */
export function reconcile() {
  const list = bookings();
  if (list === lastBookings && lastVersion === db.dataVersion()) return 0;
  lastBookings = list; lastVersion = db.dataVersion();
  let n = 0;
  for (const b of list) {
    const before = db.by('leads', 'bookingId', b.bookingId)[0]?.handover;
    try { const l = leadFromBooking(b); if (l && JSON.stringify(before) !== JSON.stringify(l.handover)) n++; } catch (e) { console.warn(`[dms] booking ${b.bookingId}: ${e.message}`); }
  }
  if (n) console.log(`[dms] reconciled ${n} configurator booking(s) into leads`);
  return n;
}

export async function overview() {
  reconcile();
  const bs = bookings();
  const by = (arr, f) => arr.reduce((o, x) => { const k = f(x); if (k) o[k] = (o[k] || 0) + 1; return o; }, {});
  const cfgLeads = db.all('leads').filter((l) => l.channel === 'configurator');
  const won = cfgLeads.filter((l) => l.status === 'won').length;
  const campaigns = db.all('campaigns').map((c) => ({
    id: c.id, name: c.name, channel: c.channel, startsAt: c.startsAt, endsAt: c.endsAt, sent: c.sent || 0, opened: c.opened || 0, clicked: c.clicked || 0, leads: c.leads || 0, budget: c.budget || 0,
    openRate: c.sent ? Math.round((c.opened / c.sent) * 1000) / 1000 : 0, clickRate: c.sent ? Math.round((c.clicked / c.sent) * 1000) / 1000 : 0,
    costPerLead: c.leads ? Math.round(c.budget / c.leads) : null, promotionIds: c.promotionIds || [],
  })).sort((a, b) => String(b.startsAt).localeCompare(String(a.startsAt)));
  const deals = db.all('deals');
  const promotionExposure = db.all('promotions').map((p) => {
    const used = deals.filter((d) => (d.promotions || []).some((x) => x.id === p.id));
    return { id: p.id, title: p.title, kind: p.kind, status: p.status, campaigns: campaigns.filter((c) => c.promotionIds.includes(p.id)).map((c) => c.id), dealsUsing: used.length, delivered: used.filter((d) => d.stage === 'delivered').length, open: used.filter((d) => OPEN.has(d.stage)).length, valueGiven: used.reduce((n, d) => n + ((d.promotions || []).find((x) => x.id === p.id)?.value || 0), 0) };
  }).sort((a, b) => b.dealsUsing - a.dealsUsing);
  return {
    configurator: await configuratorReport(30),
    bookings: { total: bs.length, bySite: by(bs, (b) => b.site), byModel: by(bs, (b) => b.modelId), answered: bs.filter((b) => b.answers).length, recent: bs.slice(-10).reverse().map(bookingRow) },
    configuratorLeads: { total: cfgLeads.length, won, open: cfgLeads.filter((l) => !['won', 'lost'].includes(l.status)).length, conversion: cfgLeads.length ? Math.round((won / cfgLeads.length) * 1000) / 1000 : 0, byStatus: by(cfgLeads, (l) => l.status) },
    campaigns, promotionExposure,
  };
}
function bookingRow(b) {
  const lead = db.by('leads', 'bookingId', b.bookingId)[0];
  return { bookingId: b.bookingId, leadId: lead?.id || null, ownerId: lead?.ownerId || null, siteId: b.site, when: b.when, whenLabel: b.whenLabel, createdAt: b.createdAt, status: b.status, modelId: b.modelId, gradeId: b.gradeId, unitId: b.unitId, answered: Boolean(b.answers), incentive: b.incentive ? { title: b.incentive.title } : null };
}
/** Handover sheets: configurator bookings + seeded test drives carrying a handover. */
export function handovers({ siteId, where = () => true } = {}) {
  reconcile();
  const out = new Map();
  for (const t of db.all('test_drives')) {
    if (!t.handover || !where(t)) continue;
    if (siteId && t.siteId !== siteId) continue;
    const lead = db.get('leads', t.leadId);
    out.set(t.id, { id: t.id, bookingId: lead?.bookingId || (String(t.id).startsWith('TD-') ? t.id : null), leadId: t.leadId, siteId: t.siteId, staffId: t.staffId, when: t.when, status: t.status, modelId: t.modelId, gradeId: t.gradeId, stockNo: t.stockNo || null, channel: lead?.channel || null, handover: t.handover });
  }
  return [...out.values()].sort((a, b) => String(b.when).localeCompare(String(a.when)));
}
