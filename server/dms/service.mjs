// service.mjs — job cards, memos, suppliers and the customer additions of DMS phase 2
// (docs/DMS-PHASE2-SPEC.md §3), plus their knowledge-box resources and the ask functions.
//
// Knowledge box: one resource per job card (slug dms-jc-<id>, label topic/jobcard +
// model/<modelId>) with text fields `card` and `memos` and the card's images/documents
// attached as file fields; suppliers (topic/supplier) and customers (topic/customer)
// the same way. Resource ids live in content/dms/kb-index-phase2.json (written by the
// coordinator's ingest script and by sync-kb here). ask-one is scoped to the resource
// plus the policies and manual; ask-all retrieves over the topic and gets a structured
// summary of the filtered rows as extra context.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { ROOT } from '../env.mjs';
import * as db from './db.mjs';
import * as auth from './auth.mjs';
import * as arag from '../arag.mjs';
import * as kb from './kb.mjs';
import * as docs from './documents.mjs';
import * as infomedia from './infomedia.mjs';

const DAY = 86400000;
const now = () => new Date().toISOString();
const ymd = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(d);
const money = (n) => `$${Math.round(Number(n || 0)).toLocaleString('en-AU')}`;
const r2 = (n) => Math.round(n * 100) / 100;
const days = (iso) => (iso ? Math.max(0, Math.round((Date.now() - Date.parse(iso)) / DAY)) : null);
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
const SOFT_FAIL = new Set(['no_context', 'no_retrieval_data']);
const topic = (label) => ({ prop: 'label', labelset: 'topic', label });

export const JC_STATUSES = ['booked', 'checked_in', 'in_progress', 'awaiting_parts', 'awaiting_approval', 'completed', 'invoiced', 'collected', 'cancelled'];
export const OPEN_STATUSES = ['booked', 'checked_in', 'in_progress', 'awaiting_parts', 'awaiting_approval', 'completed', 'invoiced'];
export const MEMO_KINDS = ['customer_note', 'tech_note', 'advisor_note', 'parts_note', 'quality', 'call', 'credit', 'sla'];
export const LINE_TYPES = ['labour', 'part', 'sublet', 'menu'];
export const ATTACH_KINDS = ['image', 'inspection_report', 'supplier_invoice', 'contract', 'other'];
const ENTITY_TABLE = { job_card: 'job_cards', customer: 'customers', supplier: 'suppliers' };
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg']);

// ── kb index ─────────────────────────────────────────────────────────────────
const INDEX = infomedia.kbIndexPath;
export const kbIndex = () => infomedia.kbIndex();
function writeIndex(section, key, rid) {
  const idx = { jobCards: {}, suppliers: {}, customers: {}, infomedia: {}, ...kbIndex() };
  (idx[section] ||= {})[key] = rid;
  try { mkdirSync(join(ROOT, 'content', 'dms'), { recursive: true }); writeFileSync(INDEX, JSON.stringify(idx, null, 1) + '\n'); } catch (e) { console.warn(`[dms service] kb-index not written: ${e.message}`); }
}

// ── job cards ────────────────────────────────────────────────────────────────
export function recalc(c) {
  const lines = c.lines || [];
  const labour = r2(lines.filter((l) => l.type === 'labour' || (l.type === 'menu' && l.hours)).reduce((s, l) => s + (l.total || 0), 0));
  const partsTotal = r2(lines.filter((l) => l.type === 'part').reduce((s, l) => s + (l.total || 0), 0));
  const sublet = r2(lines.filter((l) => l.type === 'sublet').reduce((s, l) => s + (l.total || 0), 0));
  return { laborHours: r2(lines.reduce((s, l) => s + (l.hours || 0), 0)), labourTotal: labour, partsTotal, subletTotal: sublet, total: r2(labour + partsTotal + sublet) };
}
export function cardView(c) {
  const memos = db.by('memos', 'entityId', c.id).filter((m) => m.entity === 'job_card');
  const attachments = db.by('documents', 'jobCardId', c.id);
  const promisedOverdue = Boolean(c.promisedAt && OPEN_STATUSES.includes(c.status) && !['completed', 'invoiced'].includes(c.status) && Date.parse(c.promisedAt) < Date.now());
  return { ...c, ...recalc(c), memoCount: memos.length, imageCount: attachments.filter((d) => d.kind === 'image').length, documentCount: attachments.filter((d) => d.kind !== 'image').length, daysOpen: OPEN_STATUSES.includes(c.status) ? days(c.checkedInAt || c.bookedAt) : null, promisedOverdue, open: OPEN_STATUSES.includes(c.status), vehicleLabel: `${c.vehicle?.year || ''} ${c.vehicle?.make || ''} ${c.vehicle?.model || ''}`.trim(), kbResourceId: kbIndex().jobCards?.[c.id] || null };
}
const staffPub = (id) => { const s = db.get('staff', id); return s ? { id: s.id, name: s.name, role: s.role, siteId: s.siteId } : null; };
export const memosOf = (entity, entityId) => db.by('memos', 'entityId', entityId).filter((m) => m.entity === entity).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(b.at).localeCompare(String(a.at))).map((m) => ({ ...m, by: staffPub(m.byStaffId) }));
export const attachmentsOf = (field, id) => db.by('documents', field, id).map((d) => ({ ...docs.pubDoc(d), isImage: d.kind === 'image' || IMAGE_TYPES.has(d.contentType), fileUrl: `/dms/api/documents/${d.id}/file` })).sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)));
export function cardDetail(c) {
  const v = cardView(c);
  return {
    ...v, customer: db.get('customers', c.customerId) || null, advisor: staffPub(c.advisorId), technician: staffPub(c.technicianId), site: db.get('sites', c.siteId) ? { id: c.siteId, name: db.get('sites', c.siteId).name } : null,
    memos: memosOf('job_card', c.id), documents: attachmentsOf('jobCardId', c.id),
    vehicleHistory: c.vehicle?.vin ? db.all('job_cards').filter((x) => x.id !== c.id && x.vehicle?.vin === c.vehicle.vin).sort((a, b) => String(b.bookedAt).localeCompare(String(a.bookedAt))).slice(0, 8).map((x) => ({ id: x.id, bookedAt: x.bookedAt, status: x.status, km: x.vehicle?.km, summary: (x.customerRequests || [])[0] || (x.lines || [])[0]?.desc || '', total: recalc(x).total })) : [],
    campaignsOpen: infomedia.campaignsFor({ vin: c.vehicle?.vin, model: c.vehicle?.modelId || c.vehicle?.model, year: c.vehicle?.year }),
  };
}
export function board(siteId, scope) {
  const cols = ['booked', 'checked_in', 'in_progress', 'awaiting_parts', 'awaiting_approval', 'completed', 'invoiced'];
  const rows = db.all('job_cards').filter(scope).filter((c) => (!siteId || c.siteId === siteId) && cols.includes(c.status));
  return { siteId: siteId || null, asOf: now(), columns: cols.map((status) => ({ status, cards: rows.filter((c) => c.status === status).sort((a, b) => String(a.promisedAt || a.bookedAt).localeCompare(String(b.promisedAt || b.bookedAt))).map(cardView) })) };
}
export function validateVehicle(v) {
  if (!v || typeof v !== 'object') return { error: 'vehicle is required' };
  const out = { vin: str(v.vin, 20) || null, rego: str(v.rego, 10) || null, make: str(v.make, 40) || 'Toyota', model: str(v.model, 40), modelId: str(v.modelId, 30) || infomedia.modelKey(v.model), year: Number(v.year) || null, km: Number(v.km) || null };
  if (!out.model) return { error: 'vehicle.model is required' };
  return { value: out };
}
export function createCard(b, user) {
  const veh = validateVehicle(b.vehicle); if (veh.error) return { error: veh.error };
  if (b.customerId && !db.get('customers', b.customerId)) return { error: 'unknown customerId' };
  const siteId = auth.forcedSite(user) || str(b.siteId, 10) || 'par';
  if (!db.get('sites', siteId)) return { error: 'unknown siteId' };
  const advisorId = str(b.advisorId, 20) || (user.staffId && /service|advisor/.test(user.role) ? user.staffId : db.all('staff').find((s) => s.role === 'service_advisor' && s.siteId === siteId)?.id) || user.staffId || null;
  const t = now();
  const row = {
    id: db.nextId('job_cards', 'JC'), siteId, customerId: b.customerId || null, vehicle: veh.value, advisorId, technicianId: str(b.technicianId, 20) || null, status: 'booked',
    bookedAt: t, promisedAt: str(b.promisedAt, 30) || new Date(Date.now() + DAY).toISOString(), checkedInAt: null, completedAt: null, collectedAt: null,
    customerRequests: (Array.isArray(b.customerRequests) ? b.customerRequests : []).map((x) => str(String(x), 300)).filter(Boolean).slice(0, 10), findings: [], recallsOpen: infomedia.campaignsFor({ vin: veh.value.vin, model: veh.value.modelId, year: veh.value.year }).map((c) => ({ campaign: c.id, title: c.title })),
    lines: [], loanCar: Boolean(b.loanCar), waiting: Boolean(b.waiting), infomediaMenuId: null, statusHistory: [{ status: 'booked', at: t }], createdAt: t, updatedAt: t, createdBy: user.id,
  };
  Object.assign(row, recalc(row));
  return { value: db.insert('job_cards', row) };
}
export function patchCard(c, b, user) {
  const p = { updatedAt: now() };
  if (b.status !== undefined) {
    if (!JC_STATUSES.includes(b.status)) return { error: `status must be one of ${JC_STATUSES.join(', ')}` };
    if (b.status !== c.status) {
      p.status = b.status; p.statusHistory = [...(c.statusHistory || []), { status: b.status, at: p.updatedAt, by: user.id }];
      if (b.status === 'checked_in' && !c.checkedInAt) p.checkedInAt = p.updatedAt;
      if (b.status === 'completed' && !c.completedAt) p.completedAt = p.updatedAt;
      if (b.status === 'collected') p.collectedAt = p.updatedAt;
    }
  }
  if (b.technicianId !== undefined) { if (b.technicianId && !db.get('staff', b.technicianId)) return { error: 'unknown technicianId' }; p.technicianId = b.technicianId || null; }
  if (b.advisorId !== undefined) { if (b.advisorId && !db.get('staff', b.advisorId)) return { error: 'unknown advisorId' }; p.advisorId = b.advisorId || null; }
  if (b.promisedAt !== undefined) { const d = Date.parse(b.promisedAt); if (Number.isNaN(d)) return { error: 'promisedAt must be an ISO date-time' }; p.promisedAt = new Date(d).toISOString(); }
  if (b.findings !== undefined) { if (!Array.isArray(b.findings)) return { error: 'findings must be an array of strings' }; p.findings = b.findings.map((x) => str(String(x), 300)).filter(Boolean).slice(0, 20); }
  if (b.customerRequests !== undefined) { if (!Array.isArray(b.customerRequests)) return { error: 'customerRequests must be an array of strings' }; p.customerRequests = b.customerRequests.map((x) => str(String(x), 300)).filter(Boolean).slice(0, 10); }
  if (b.lines !== undefined) { if (!Array.isArray(b.lines)) return { error: 'lines must be an array' }; const ls = b.lines.map(normLine).filter(Boolean); p.lines = ls; Object.assign(p, recalc({ lines: ls })); }
  for (const k of ['loanCar', 'waiting']) if (b[k] !== undefined) p[k] = Boolean(b[k]);
  if (b.vehicle !== undefined) { const v = validateVehicle({ ...c.vehicle, ...b.vehicle }); if (v.error) return { error: v.error }; p.vehicle = v.value; }
  return { value: db.patch('job_cards', c.id, p) };
}
let lineSeq = 0;
function normLine(l) {
  if (!l || typeof l !== 'object') return null;
  const type = LINE_TYPES.includes(l.type) ? l.type : 'labour';
  const qty = Number(l.qty) || 1; const hours = l.hours == null ? null : Number(l.hours) || 0; const unitPrice = Number(l.unitPrice) || 0;
  const total = l.total != null && Number.isFinite(Number(l.total)) ? r2(Number(l.total)) : r2(type === 'labour' ? (hours || 0) * unitPrice : qty * unitPrice);
  return { id: l.id || `LN-${Date.now().toString(36)}${(++lineSeq).toString(36)}`, type, code: str(l.code, 40) || null, desc: str(l.desc, 200) || (type === 'labour' ? 'Labour' : 'Line'), qty, hours, unitPrice, total, source: ['menu', 'epc', 'manual', 'sublet'].includes(l.source) ? l.source : 'manual', menuId: l.menuId || null, approved: l.approved !== false, extra: Boolean(l.extra) };
}
export function addLines(c, b) {
  let add = [];
  if (b.menuId) {
    const menu = infomedia.menuById(b.menuId); if (!menu) return { error: 'unknown menuId' };
    add = infomedia.menuLines(menu, c.siteId).map(normLine);
    const p = { lines: [...(c.lines || []), ...add], infomediaMenuId: menu.id, updatedAt: now() }; Object.assign(p, recalc(p));
    return { value: db.patch('job_cards', c.id, p), added: add.length, menu: { id: menu.id, title: menu.title } };
  }
  const l = normLine(b); if (!l) return { error: 'a line needs type, desc and unitPrice (or menuId)' };
  const p = { lines: [...(c.lines || []), l], updatedAt: now() }; Object.assign(p, recalc(p));
  return { value: db.patch('job_cards', c.id, p), added: 1 };
}

// ── memos ────────────────────────────────────────────────────────────────────
export function addMemo(entity, entityId, b, user) {
  const kind = MEMO_KINDS.includes(b.kind) ? b.kind : 'advisor_note';
  const text = str(b.text, 2000); if (!text) return { error: 'text is required' };
  const row = db.insert('memos', { id: db.nextId('memos', 'M'), entity, entityId, at: now(), byStaffId: user.staffId || user.id, byName: user.name, kind, text, pinned: Boolean(b.pinned) });
  if (ENTITY_TABLE[entity] === 'job_cards') db.patch('job_cards', entityId, { updatedAt: now() });
  scheduleSync(entity, entityId);
  return { value: { ...row, by: staffPub(row.byStaffId) || { id: user.id, name: user.name } } };
}
export function patchMemo(m, b) {
  const p = {}; if (b.pinned !== undefined) p.pinned = Boolean(b.pinned); if (b.text !== undefined) { const t = str(b.text, 2000); if (!t) return { error: 'text cannot be empty' }; p.text = t; p.editedAt = now(); }
  const row = db.patch('memos', m.id, p); scheduleSync(m.entity, m.entityId); return { value: row };
}
export const memoVisible = (user) => (m) => { const t = ENTITY_TABLE[m.entity]; const row = t && db.get(t, m.entityId); return row ? auth.scopeFor(user, t)(row) : false; };

// ── attachments (images and documents on cards, suppliers, customers) ────────
let UPLOADS = process.env.DMS_UPLOAD_DIR || join(ROOT, 'content', 'dms', 'uploads');
const TYPES = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.txt': 'text/plain' };
function saveFile(id, name, buf) {
  const write = (dir) => { mkdirSync(dir, { recursive: true }); const p = join(dir, `${id}-${name}`); writeFileSync(p, buf); return p; };
  try { return write(UPLOADS); } catch (e) { if (!['EACCES', 'EROFS', 'EPERM'].includes(e.code)) throw e; UPLOADS = join(tmpdir(), 'harbourline-dms', 'uploads'); return write(UPLOADS); }
}
export function attach(link, b, user) {
  if (!b || typeof b !== 'object') return { error: 'JSON body required' };
  const fileName = basename(String(b.fileName || '')).replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 120); if (!fileName) return { error: 'fileName is required' };
  const ext = extname(fileName).toLowerCase(); const contentType = b.contentType || TYPES[ext];
  if (!Object.values(TYPES).includes(contentType)) return { error: 'only PDF, PNG, JPEG or text files are accepted' };
  if (typeof b.contentBase64 !== 'string' || !b.contentBase64) return { error: 'contentBase64 is required' };
  const buf = Buffer.from(b.contentBase64.replace(/^data:[^,]*,/, ''), 'base64'); if (!buf.length) return { error: 'contentBase64 is empty or invalid' };
  if (buf.length > docs.MAX_BYTES) return { error: `file larger than ${docs.MAX_BYTES / 1048576} MB`, status: 413 };
  const kind = ATTACH_KINDS.includes(b.kind) ? b.kind : IMAGE_TYPES.has(contentType) ? 'image' : 'other';
  if (kind === 'image' && !IMAGE_TYPES.has(contentType)) return { error: 'an image must be PNG or JPEG' };
  const id = db.nextId('documents', 'DOC', 4);
  const p = saveFile(id, fileName, buf);
  const row = db.insert('documents', { id, kind, dealId: null, customerId: link.customerId || null, jobCardId: link.jobCardId || null, supplierId: link.supplierId || null, fileName, contentType, bytes: buf.length, caption: str(b.caption, 200) || null, uploadedAt: now(), uploadedBy: user?.id || null, status: 'uploaded', extracted: {}, aragResourceId: null, filePath: p.startsWith(ROOT) ? p.slice(ROOT.length + 1) : p });
  if (link.jobCardId) { db.patch('job_cards', link.jobCardId, { updatedAt: now() }); scheduleSync('job_card', link.jobCardId); }
  if (link.supplierId) scheduleSync('supplier', link.supplierId);
  if (link.customerId && !link.jobCardId) scheduleSync('customer', link.customerId);
  return { value: { ...docs.pubDoc(row), isImage: kind === 'image', fileUrl: `/dms/api/documents/${row.id}/file` } };
}

// ── text renderings for the knowledge box and the agent ──────────────────────
export function cardText(c) {
  const v = c.vehicle || {}; const t = recalc(c); const cust = db.get('customers', c.customerId); const adv = db.get('staff', c.advisorId); const tech = db.get('staff', c.technicianId);
  return [
    `# Job card ${c.id}: ${v.year || ''} ${v.make || ''} ${v.model || ''} ${v.rego ? `(${v.rego})` : ''}`.replace(/\s+/g, ' '), '',
    `Site ${db.get('sites', c.siteId)?.name || c.siteId}. Status ${c.status.replace(/_/g, ' ')}. Booked ${String(c.bookedAt).slice(0, 10)}${c.checkedInAt ? `, checked in ${String(c.checkedInAt).slice(0, 10)}` : ''}${c.promisedAt ? `, promised ${String(c.promisedAt).slice(0, 16).replace('T', ' ')}` : ''}${c.completedAt ? `, completed ${String(c.completedAt).slice(0, 10)}` : ''}${c.collectedAt ? `, collected ${String(c.collectedAt).slice(0, 10)}` : ''}.`,
    `Customer ${cust ? `${cust.firstName} ${cust.lastName}${cust.phone ? ` (${cust.phone})` : ''}` : 'not linked'}. Advisor ${adv?.name || 'unassigned'}. Technician ${tech?.name || 'unassigned'}. ${c.waiting ? 'Customer is waiting. ' : ''}${c.loanCar ? 'Loan car provided. ' : ''}`,
    `Vehicle: VIN ${v.vin || 'n/a'}, ${v.km ? `${Number(v.km).toLocaleString('en-AU')} km` : 'odometer not recorded'}.`, '',
    '## Customer requests', ...(c.customerRequests?.length ? c.customerRequests.map((r) => `- ${r}`) : ['- (none recorded)']), '',
    '## Findings', ...(c.findings?.length ? c.findings.map((r) => `- ${r}`) : ['- (none yet)']), '',
    '## Lines', ...((c.lines || []).length ? c.lines.map((l) => `- ${l.type}: ${l.desc}${l.code ? ` [${l.code}]` : ''} ${l.hours ? `${l.hours} h × ${money(l.unitPrice)}` : `${l.qty} × ${money(l.unitPrice)}`} = ${money(l.total)}${l.approved === false ? ' (awaiting approval)' : ''}${l.source === 'menu' ? ' (Infomedia menu)' : ''}`) : ['- (no lines yet)']),
    `Labour ${money(t.labourTotal)} (${t.laborHours} h), parts ${money(t.partsTotal)}${t.subletTotal ? `, sublet ${money(t.subletTotal)}` : ''}, total ${money(t.total)} ex GST.`, '',
    c.recallsOpen?.length ? `## Open campaigns\n${c.recallsOpen.map((r) => `- ${r.title} (${r.campaign})`).join('\n')}` : '',
  ].filter((l) => l !== undefined).join('\n');
}
export function memosText(entity, id) {
  const ms = db.by('memos', 'entityId', id).filter((m) => m.entity === entity).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return [`# Memos for ${id}`, '', ...(ms.length ? ms.map((m) => `- ${String(m.at).slice(0, 16).replace('T', ' ')} · ${m.kind.replace(/_/g, ' ')} · ${db.get('staff', m.byStaffId)?.name || m.byName || m.byStaffId}${m.pinned ? ' · PINNED' : ''}: ${m.text}`) : ['- (no memos)'])].join('\n');
}
export function supplierText(s) {
  const invoices = db.by('documents', 'supplierId', s.id).filter((d) => d.kind === 'supplier_invoice');
  return [`# Supplier ${s.id}: ${s.name}`, '', `Category ${s.category}. ABN ${s.abn || 'n/a'}. Terms ${s.terms || 'n/a'}. Status ${s.status}. Rating ${s.rating ?? 'n/a'}/5. Spend last 12 months ${money(s.spend12m)}. Open invoices ${s.openInvoices ?? 0}.`, `Contact ${s.contact?.name || ''} ${s.contact?.email || ''} ${s.contact?.phone || ''}. ${s.address || ''}`, '', '## Invoices on file', ...(invoices.length ? invoices.map((d) => `- ${d.fileName} (${d.status})${d.extracted?.total ? ` total ${money(d.extracted.total)}` : ''}`) : ['- (none)']), '', s.notes ? `Notes: ${s.notes}` : ''].join('\n');
}
export function customerText(c) {
  const deals = db.by('deals', 'customerId', c.id); const cards = db.by('job_cards', 'customerId', c.id);
  return [`# Customer ${c.id}: ${c.firstName} ${c.lastName}`, '', `${c.company ? `${c.company}. ` : ''}${c.suburb || ''} ${c.postcode || ''}. Source ${c.source}. Customer since ${String(c.createdAt).slice(0, 10)}. Units purchased ${c.unitsPurchased ?? deals.filter((d) => d.stage === 'delivered').length}. Tags ${(c.tags || []).join(', ') || 'none'}.`, c.notes ? `Notes: ${c.notes}` : '', '', '## Deals', ...(deals.length ? deals.slice(0, 10).map((d) => `- ${d.id} ${d.modelId || ''} ${d.stage} ${String(d.createdAt).slice(0, 10)} ${money(d.driveAway)}`) : ['- (none)']), '', '## Service history', ...(cards.length ? cards.slice(0, 15).map((j) => `- ${j.id} ${String(j.bookedAt).slice(0, 10)} ${j.vehicle?.year || ''} ${j.vehicle?.model || ''} ${j.status} ${money(recalc(j).total)}`) : ['- (none)'])].join('\n');
}
function fileField(d) {
  const p = docs.fileFor(d); if (!p) return null;
  try { return { filename: d.fileName || basename(p), contentType: d.contentType || TYPES[extname(p).toLowerCase()] || 'application/octet-stream', base64: readFileSync(p).toString('base64') }; } catch { return null; }
}

// ── knowledge-box sync ───────────────────────────────────────────────────────
const SYNC = { job_card: { table: 'job_cards', section: 'jobCards', slug: (id) => `dms-jc-${String(id).toLowerCase()}`, topic: 'jobcard' }, supplier: { table: 'suppliers', section: 'suppliers', slug: (id) => `dms-sup-${String(id).toLowerCase()}`, topic: 'supplier' }, customer: { table: 'customers', section: 'customers', slug: (id) => `dms-cust-${String(id).toLowerCase()}`, topic: 'customer' } };
export async function syncEntity(entity, id, { withFiles = true } = {}) {
  const cfg = SYNC[entity]; const row = cfg && db.get(cfg.table, id);
  if (!row) return { ok: false, reason: 'unknown entity' };
  if (!arag.configured()) return { ok: false, reason: 'not configured' };
  const t0 = Date.now();
  let title, texts, labels, metadata, files = {};
  if (entity === 'job_card') {
    const v = row.vehicle || {};
    title = `Job card ${row.id}: ${v.year || ''} ${v.make || ''} ${v.model || ''} ${v.rego || ''} (${row.status.replace(/_/g, ' ')})`.replace(/\s+/g, ' ');
    texts = { card: cardText(row), memos: memosText('job_card', row.id) };
    labels = [['topic', 'jobcard'], ...(v.modelId ? [['model', v.modelId]] : [])];
    metadata = { dmsId: row.id, siteId: row.siteId, status: row.status, vin: v.vin || '', rego: v.rego || '', model: v.modelId || v.model || '', year: v.year || '', bookedAt: row.bookedAt, customerId: row.customerId || '' };
    if (withFiles) for (const d of db.by('documents', 'jobCardId', row.id).slice(0, 8)) { const f = fileField(d); if (f) files[`f_${String(d.id).toLowerCase().replace(/[^a-z0-9]/g, '')}`] = f; }
  } else if (entity === 'supplier') {
    title = `Supplier ${row.id}: ${row.name} (${row.category})`;
    texts = { supplier: supplierText(row), memos: memosText('supplier', row.id) }; labels = [['topic', 'supplier']]; metadata = { dmsId: row.id, category: row.category, status: row.status, abn: row.abn || '' };
    if (withFiles) for (const d of db.by('documents', 'supplierId', row.id).slice(0, 6)) { const f = fileField(d); if (f) files[`f_${String(d.id).toLowerCase().replace(/[^a-z0-9]/g, '')}`] = f; }
  } else {
    title = `Customer ${row.id}: ${row.firstName} ${row.lastName}`;
    texts = { customer: customerText(row), memos: memosText('customer', row.id) }; labels = [['topic', 'customer']]; metadata = { dmsId: row.id, siteId: row.siteId || '', source: row.source || '' };
    if (withFiles) for (const d of db.by('documents', 'customerId', row.id).filter((d) => !d.dealId && !d.jobCardId).slice(0, 6)) { const f = fileField(d); if (f) files[`f_${String(d.id).toLowerCase().replace(/[^a-z0-9]/g, '')}`] = f; }
  }
  const r = await kb.upsertResource({ slug: cfg.slug(row.id), title, labels, metadata, texts, files });
  writeIndex(cfg.section, row.id, r.id);
  return { ok: true, resourceId: r.id, created: r.created, files: Object.keys(files).length, ms: Date.now() - t0 };
}
const pending = new Map();
/** Debounced background re-sync after a memo or attachment (never blocks the request). */
export function scheduleSync(entity, id) {
  if (!arag.configured() || process.env.DMS_KB_SYNC === 'off') return;
  const key = `${entity}|${id}`; clearTimeout(pending.get(key));
  pending.set(key, setTimeout(() => { pending.delete(key); syncEntity(entity, id).catch((e) => console.warn(`[dms sync ${key}] ${e.message}`)); }, 4000).unref());
}

// ── ask one ──────────────────────────────────────────────────────────────────
const sourcesOut = (s) => s.slice(0, 5).map((x) => ({ resourceId: x.resourceId, title: x.title, topic: x.topic || [], text: (x.text || '').slice(0, 300), cited: Boolean(x.cited) }));
async function askScoped({ question, lang, system, context, rid, topics, modelId, timeoutMs = 25000 }) {
  const parts = [...(rid ? [{ prop: 'resource', id: rid }] : []), ...topics.map(topic), ...(modelId ? [{ prop: 'label', labelset: 'model', label: modelId }] : [])];
  const r = await arag.ask({ query: question, system, extraContext: context, filterExpression: parts.length ? { field: { or: parts } } : undefined, timeoutMs, topK: 10 });
  const trace = [{ kind: 'kb', label: `Knowledge box: ${r.sources.length} source(s)${rid ? ' including this record\'s own resource' : ''}` }, { kind: 'dms', label: 'Live record passed to the agent as context' }];
  return { answer: r.answer, status: r.status, grounded: !SOFT_FAIL.has(r.status), citations: sourcesOut(r.sources), trace };
}
const langLine = (lang) => (lang && lang !== 'en' ? ` Answer in the language code ${lang}.` : ' Australian English.');
export async function askCard(c, { question, lang = 'en' }) {
  const t0 = Date.now(); const memos = memosOf('job_card', c.id);
  if (!arag.configured()) return { answer: scriptedCardAnswer(c, question), status: 'not_configured', citations: [], trace: [{ kind: 'dms', label: 'Knowledge box not configured; answered from the record' }], memosUsed: memos.length, by: 'scripted', ms: 0 };
  try {
    const r = await askScoped({ question, lang, rid: kbIndex().jobCards?.[c.id] || null, topics: ['policy', 'manual'], modelId: c.vehicle?.modelId || null, context: [`JOB CARD (live):\n${cardText(c)}`, memosText('job_card', c.id), `Attachments: ${db.by('documents', 'jobCardId', c.id).map((d) => `${d.kind} ${d.fileName}${d.caption ? ` (${d.caption})` : ''}`).join('; ') || 'none'}. Today ${ymd()}.`],
      system: `You are the Harbourline Toyota service assistant. Answer about THIS job card only, from the JOB CARD, its MEMOS and attachments in the context and the retrieved workshop policies. Quote dates, kilometres, amounts and memo authors exactly. If something is not recorded, say so and name who to ask (service advisor or technician). Keep it under 120 words.${langLine(lang)}` });
    if (r.grounded && r.answer) return { ...r, memosUsed: memos.length, by: 'agent', ms: Date.now() - t0 };
    return { answer: scriptedCardAnswer(c, question), status: r.status, citations: r.citations, trace: [...r.trace, { kind: 'dms', label: 'No grounded answer; scripted from the record' }], memosUsed: memos.length, by: 'scripted', ms: Date.now() - t0 };
  } catch (e) { console.warn(`[dms askCard] ${e.message}`); return { answer: scriptedCardAnswer(c, question), status: 'error', citations: [], trace: [{ kind: 'dms', label: 'Knowledge box unavailable; answered from the record' }], memosUsed: memos.length, by: 'scripted', ms: Date.now() - t0 }; }
}
function scriptedCardAnswer(c, q) {
  const s = String(q || '').toLowerCase(); const t = recalc(c); const memos = memosOf('job_card', c.id);
  if (/find|found|technician|fault|diagnos/.test(s)) return c.findings?.length ? `Findings on ${c.id}: ${c.findings.join('; ')}.` : `No findings have been recorded on ${c.id} yet${memos.length ? `; the latest memo says: "${memos[0].text}"` : ''}.`;
  if (/wait|customer here|loan/.test(s)) return `${c.waiting ? 'The customer is waiting at the dealership.' : 'The customer is not waiting.'} ${c.loanCar ? 'A loan car was provided.' : 'No loan car.'} Promised ${String(c.promisedAt || '').slice(0, 16).replace('T', ' ')}.`;
  if (/outstanding|before collection|left|remaining|next/.test(s)) return `${c.id} is ${c.status.replace(/_/g, ' ')}. ${(c.lines || []).filter((l) => l.approved === false).length ? `${(c.lines || []).filter((l) => l.approved === false).length} line(s) await customer approval. ` : ''}${c.recallsOpen?.length ? `Open campaigns: ${c.recallsOpen.map((r) => r.title).join('; ')}. ` : ''}Total so far ${money(t.total)} ex GST.`;
  if (/cost|price|total|quote|how much/.test(s)) return `Labour ${money(t.labourTotal)} (${t.laborHours} h), parts ${money(t.partsTotal)}, total ${money(t.total)} ex GST across ${(c.lines || []).length} line(s).`;
  if (/memo|note|said|history/.test(s)) return memos.length ? `${memos.length} memo(s). Latest: ${memos[0].kind.replace(/_/g, ' ')} by ${memos[0].by?.name || memos[0].byStaffId}: "${memos[0].text}"` : 'No memos on this card.';
  return `${c.id}: ${c.vehicle?.year || ''} ${c.vehicle?.make || ''} ${c.vehicle?.model || ''}, ${c.status.replace(/_/g, ' ')}, ${(c.customerRequests || []).length} request(s), ${c.findings?.length || 0} finding(s), ${(c.lines || []).length} line(s), total ${money(t.total)} ex GST, ${memos.length} memo(s).`;
}
export async function askSupplier(s, { question, lang = 'en' }) {
  const t0 = Date.now();
  const fallback = () => ({ answer: `${s.name} (${s.category}): ${s.status}, terms ${s.terms || 'n/a'}, rating ${s.rating ?? 'n/a'}/5, spend ${money(s.spend12m)} in 12 months, ${s.openInvoices ?? 0} open invoice(s), ${memosOf('supplier', s.id).length} memo(s).`, by: 'scripted' });
  if (!arag.configured()) return { ...fallback(), status: 'not_configured', citations: [], trace: [{ kind: 'dms', label: 'Knowledge box not configured; answered from the record' }], ms: 0 };
  try {
    const r = await askScoped({ question, lang, rid: kbIndex().suppliers?.[s.id] || null, topics: ['policy', 'manual'], context: [`SUPPLIER (live):\n${supplierText(s)}`, memosText('supplier', s.id), `Today ${ymd()}.`], system: `You are the Harbourline Toyota purchasing assistant. Answer about THIS supplier only from the record, memos, invoices and the retrieved policies (supplier terms, approvals). Quote amounts, dates and memo authors exactly. Under 120 words.${langLine(lang)}` });
    return r.grounded && r.answer ? { ...r, by: 'agent', ms: Date.now() - t0 } : { ...fallback(), status: r.status, citations: r.citations, trace: r.trace, ms: Date.now() - t0 };
  } catch (e) { console.warn(`[dms askSupplier] ${e.message}`); return { ...fallback(), status: 'error', citations: [], trace: [{ kind: 'dms', label: 'Knowledge box unavailable' }], ms: Date.now() - t0 }; }
}
export async function askCustomer(c, { question, lang = 'en' }) {
  const t0 = Date.now();
  const fallback = () => ({ answer: `${c.firstName} ${c.lastName}: ${db.by('deals', 'customerId', c.id).length} deal(s), ${db.by('job_cards', 'customerId', c.id).length} job card(s), ${memosOf('customer', c.id).length} memo(s), ${db.by('documents', 'customerId', c.id).length} document(s). Source ${c.source}.`, by: 'scripted' });
  if (!arag.configured()) return { ...fallback(), status: 'not_configured', citations: [], trace: [{ kind: 'dms', label: 'Knowledge box not configured; answered from the record' }], ms: 0 };
  try {
    const r = await askScoped({ question, lang, rid: kbIndex().customers?.[c.id] || null, topics: ['policy', 'manual'], context: [`CUSTOMER (live):\n${customerText(c)}`, memosText('customer', c.id), `Today ${ymd()}.`], system: `You are the Harbourline Toyota customer assistant for staff. Answer about THIS customer only from the record, memos, deals, service history and the retrieved policies (privacy, lead response). Never speculate about the person. Under 120 words.${langLine(lang)}` });
    return r.grounded && r.answer ? { ...r, by: 'agent', ms: Date.now() - t0 } : { ...fallback(), status: r.status, citations: r.citations, trace: r.trace, ms: Date.now() - t0 };
  } catch (e) { console.warn(`[dms askCustomer] ${e.message}`); return { ...fallback(), status: 'error', citations: [], trace: [{ kind: 'dms', label: 'Knowledge box unavailable' }], ms: Date.now() - t0 }; }
}

// ── ask all ──────────────────────────────────────────────────────────────────
function cardLine(c) { const t = recalc(c); const v = c.vehicle || {}; return `${c.id} | ${db.get('sites', c.siteId)?.name || c.siteId} | ${c.status} | ${v.year || ''} ${v.model || ''} ${v.rego || ''} | booked ${String(c.bookedAt).slice(0, 10)} | promised ${String(c.promisedAt || '').slice(0, 16).replace('T', ' ')}${c.promisedAt && OPEN_STATUSES.includes(c.status) && Date.parse(c.promisedAt) < Date.now() ? ' (OVERDUE)' : ''} | tech ${db.get('staff', c.technicianId)?.name || '-'} | ${(c.customerRequests || [])[0] || ''} | findings: ${(c.findings || []).join('; ') || '-'} | total ${money(t.total)} | ${c.waiting ? 'waiting' : ''}${c.loanCar ? ' loan car' : ''} | memos ${db.by('memos', 'entityId', c.id).length}`; }
function cardsSummary(rows) {
  const by = (f) => Object.entries(rows.reduce((a, c) => ((a[f(c)] = (a[f(c)] || 0) + 1), a), {})).map(([k, n]) => `${k} ${n}`).join(', ');
  const open = rows.filter((c) => OPEN_STATUSES.includes(c.status)); const overdue = open.filter((c) => c.promisedAt && Date.parse(c.promisedAt) < Date.now() && !['completed', 'invoiced'].includes(c.status));
  const parts = rows.filter((c) => c.status === 'awaiting_parts'); const approval = rows.filter((c) => c.status === 'awaiting_approval');
  return `SUMMARY (as of ${ymd()}): ${rows.length} job cards in scope; by status: ${by((c) => c.status)}; by site: ${by((c) => c.siteId)}. Open ${open.length}; overdue promised time ${overdue.length} (${overdue.slice(0, 10).map((c) => c.id).join(', ')}); awaiting parts ${parts.length} (${parts.slice(0, 10).map((c) => `${c.id} ${days(c.statusHistory?.filter((h) => h.status === 'awaiting_parts').pop()?.at || c.updatedAt)}d`).join(', ')}); awaiting approval ${approval.length}; customers waiting ${rows.filter((c) => c.waiting && OPEN_STATUSES.includes(c.status)).length}; open campaigns on cards ${rows.filter((c) => c.recallsOpen?.length).length}.`;
}
export async function askCards({ question, lang = 'en', filters = {} }, user) {
  const t0 = Date.now(); const sc = auth.scopeFor(user, 'job_cards');
  let rows = db.all('job_cards').filter(sc);
  if (filters.siteId) rows = rows.filter((c) => c.siteId === filters.siteId);
  if (filters.status) rows = rows.filter((c) => String(filters.status).split(',').includes(c.status));
  if (filters.from) rows = rows.filter((c) => c.bookedAt >= filters.from);
  if (filters.to) rows = rows.filter((c) => String(c.bookedAt).slice(0, 10) <= filters.to);
  const q = String(question).toLowerCase();
  // Rank the cards most likely relevant to the question first (open cards, question words), ≤ 30 lines in the context.
  const words = q.split(/\W+/).filter((w) => w.length > 3);
  const ranked = [...rows].sort((a, b) => score(b) - score(a)); function score(c) { let s = OPEN_STATUSES.includes(c.status) ? 5 : 0; const txt = cardLine(c).toLowerCase(); for (const w of words) if (txt.includes(w)) s += 2; if (c.promisedAt && Date.parse(c.promisedAt) < Date.now() && OPEN_STATUSES.includes(c.status)) s += 1; return s; }
  const context = [cardsSummary(rows), `CARDS (${Math.min(30, ranked.length)} of ${rows.length}, most relevant first):\n${ranked.slice(0, 30).map(cardLine).join('\n')}`];
  const evidenceFrom = (text) => [...new Set((String(text).match(/JC-\d{4,6}/g) || []))].filter((id) => rows.some((c) => c.id === id)).slice(0, 12).map((id) => ({ id, why: 'named in the answer', status: db.get('job_cards', id)?.status }));
  if (!arag.configured()) { const a = scriptedCardsAnswer(q, rows); return { answer: a, status: 'not_configured', citations: [], trace: [{ kind: 'dms', label: `${rows.length} cards summarised; knowledge box not configured` }], cardsConsidered: rows.length, evidence: evidenceFrom(a), by: 'scripted', ms: Date.now() - t0 }; }
  try {
    const r = await arag.ask({ query: question, system: `You are the Harbourline Toyota workshop assistant. Answer from the SUMMARY and CARDS in the context (live data as of ${ymd()}) and the retrieved job-card resources and workshop policies. Name job card ids (JC-…) for every card you mention. Give counts exactly as in the summary. If nothing matches, say so. Under 160 words.${langLine(lang)}`, extraContext: context, filterExpression: { field: { or: [topic('jobcard'), topic('policy')] } }, timeoutMs: 28000, topK: 12 });
    const grounded = !SOFT_FAIL.has(r.status) && r.answer;
    const answer = grounded ? r.answer : scriptedCardsAnswer(q, rows);
    return { answer, status: r.status, citations: sourcesOut(r.sources), trace: [{ kind: 'kb', label: `Knowledge box: ${r.sources.length} job-card and policy source(s)` }, { kind: 'dms', label: `${rows.length} cards summarised, ${Math.min(30, ranked.length)} passed as context` }], cardsConsidered: rows.length, evidence: evidenceFrom(answer).length ? evidenceFrom(answer) : r.sources.filter((s) => /^Job card (JC-\d+)/.test(s.title || '')).slice(0, 8).map((s) => ({ id: /JC-\d+/.exec(s.title)[0], why: 'retrieved', status: db.get('job_cards', /JC-\d+/.exec(s.title)[0])?.status })), by: grounded ? 'agent' : 'scripted', ms: Date.now() - t0 };
  } catch (e) { console.warn(`[dms askCards] ${e.message}`); const a = scriptedCardsAnswer(q, rows); return { answer: a, status: 'error', citations: [], trace: [{ kind: 'dms', label: 'Knowledge box unavailable; scripted from the summary' }], cardsConsidered: rows.length, evidence: evidenceFrom(a), by: 'scripted', ms: Date.now() - t0 }; }
}
function scriptedCardsAnswer(q, rows) {
  const open = rows.filter((c) => OPEN_STATUSES.includes(c.status));
  if (/part/.test(q)) { const p = rows.filter((c) => c.status === 'awaiting_parts'); return p.length ? `${p.length} card(s) are waiting on parts: ${p.slice(0, 8).map((c) => `${c.id} (${c.vehicle?.model || ''}, ${days(c.updatedAt)} days)`).join(', ')}.` : 'No cards are waiting on parts.'; }
  if (/overdue|late|promis/.test(q)) { const o = open.filter((c) => c.promisedAt && Date.parse(c.promisedAt) < Date.now()); return o.length ? `${o.length} open card(s) are past their promised time: ${o.slice(0, 8).map((c) => `${c.id} (${c.vehicle?.model || ''})`).join(', ')}.` : 'No open card is past its promised time.'; }
  if (/approv/.test(q)) { const a = rows.filter((c) => c.status === 'awaiting_approval'); return a.length ? `${a.length} card(s) await customer approval: ${a.slice(0, 8).map((c) => c.id).join(', ')}.` : 'No cards await approval.'; }
  if (/wait/.test(q)) { const w = open.filter((c) => c.waiting); return w.length ? `${w.length} customer(s) are waiting: ${w.map((c) => c.id).join(', ')}.` : 'No customers are waiting.'; }
  return `${rows.length} job cards in scope, ${open.length} open. By status: ${Object.entries(rows.reduce((a, c) => ((a[c.status] = (a[c.status] || 0) + 1), a), {})).map(([k, n]) => `${k.replace(/_/g, ' ')} ${n}`).join(', ')}.`;
}
export async function askSuppliers({ question, lang = 'en' }) {
  const t0 = Date.now(); const rows = db.all('suppliers');
  const lines = rows.map((s) => `${s.id} | ${s.name} | ${s.category} | ${s.status} | terms ${s.terms || '-'} | rating ${s.rating ?? '-'} | spend12m ${money(s.spend12m)} | open invoices ${s.openInvoices ?? 0} | memos ${db.by('memos', 'entityId', s.id).length}`);
  const scripted = () => `${rows.length} suppliers: ${rows.slice(0, 10).map((s) => `${s.name} (${s.category}, ${money(s.spend12m)})`).join('; ')}.`;
  if (!arag.configured()) return { answer: scripted(), status: 'not_configured', citations: [], trace: [], suppliersConsidered: rows.length, by: 'scripted', ms: 0 };
  try {
    const r = await arag.ask({ query: question, system: `You are the Harbourline Toyota purchasing assistant. Answer from the SUPPLIERS list in the context and the retrieved supplier resources, invoices and policies. Name supplier ids and names. Under 150 words.${langLine(lang)}`, extraContext: [`SUPPLIERS (${rows.length}):\n${lines.join('\n')}`], filterExpression: { field: { or: [topic('supplier'), topic('policy'), topic('document')] } }, timeoutMs: 28000, topK: 12 });
    const grounded = !SOFT_FAIL.has(r.status) && r.answer;
    return { answer: grounded ? r.answer : scripted(), status: r.status, citations: sourcesOut(r.sources), trace: [{ kind: 'kb', label: `Knowledge box: ${r.sources.length} source(s)` }, { kind: 'dms', label: `${rows.length} suppliers passed as context` }], suppliersConsidered: rows.length, by: grounded ? 'agent' : 'scripted', ms: Date.now() - t0 };
  } catch (e) { return { answer: scripted(), status: 'error', citations: [], trace: [{ kind: 'dms', label: 'Knowledge box unavailable' }], suppliersConsidered: rows.length, by: 'scripted', ms: Date.now() - t0 }; }
}
export async function askCustomers({ question, lang = 'en' }, user) {
  const t0 = Date.now(); const sc = auth.scopeFor(user, 'customers');
  const q = String(question).toLowerCase(); const words = q.split(/\W+/).filter((w) => w.length > 3);
  const withExtras = db.all('customers').filter(sc).map((c) => ({ c, memos: db.by('memos', 'entityId', c.id).filter((m) => m.entity === 'customer'), cards: db.by('job_cards', 'customerId', c.id), docs: db.by('documents', 'customerId', c.id) }));
  const ranked = withExtras.map((x) => ({ ...x, s: (x.memos.length ? 3 : 0) + (x.cards.length ? 1 : 0) + words.filter((w) => `${x.c.firstName} ${x.c.lastName} ${x.c.suburb} ${x.memos.map((m) => m.text).join(' ')}`.toLowerCase().includes(w)).length * 3 })).sort((a, b) => b.s - a.s).slice(0, 25);
  const lines = ranked.map(({ c, memos, cards, docs: d }) => `${c.id} | ${c.firstName} ${c.lastName} | ${c.suburb || ''} | since ${String(c.createdAt).slice(0, 10)} | deals ${db.by('deals', 'customerId', c.id).length} | job cards ${cards.length} | memos ${memos.length}${memos[0] ? ` (latest: ${memos[0].text.slice(0, 90)})` : ''} | docs ${d.length}`);
  const scripted = () => `${withExtras.length} customers in scope; ${withExtras.filter((x) => x.memos.length).length} with memos, ${withExtras.filter((x) => x.cards.length).length} with service history.`;
  if (!arag.configured()) return { answer: scripted(), status: 'not_configured', citations: [], trace: [], customersConsidered: withExtras.length, by: 'scripted', ms: 0 };
  try {
    const r = await arag.ask({ query: question, system: `You are the Harbourline Toyota customer assistant for staff. Answer from the CUSTOMERS list in the context and the retrieved customer resources, memos and policies (privacy first). Name customer ids. Under 150 words.${langLine(lang)}`, extraContext: [`CUSTOMERS (${ranked.length} most relevant of ${withExtras.length}):\n${lines.join('\n')}`], filterExpression: { field: { or: [topic('customer'), topic('policy')] } }, timeoutMs: 28000, topK: 12 });
    const grounded = !SOFT_FAIL.has(r.status) && r.answer;
    return { answer: grounded ? r.answer : scripted(), status: r.status, citations: sourcesOut(r.sources), trace: [{ kind: 'kb', label: `Knowledge box: ${r.sources.length} source(s)` }, { kind: 'dms', label: `${withExtras.length} customers in scope, ${ranked.length} passed as context` }], customersConsidered: withExtras.length, by: grounded ? 'agent' : 'scripted', ms: Date.now() - t0 };
  } catch (e) { return { answer: scripted(), status: 'error', citations: [], trace: [{ kind: 'dms', label: 'Knowledge box unavailable' }], customersConsidered: withExtras.length, by: 'scripted', ms: Date.now() - t0 }; }
}

// ── handover note ────────────────────────────────────────────────────────────
const NOTE_SCHEMA = { name: 'handover_note', description: 'Customer handover note for a completed or in-progress job card', parameters: { type: 'object', properties: { headline: { type: 'string' }, done: { type: 'array', items: { type: 'string' } }, found: { type: 'array', items: { type: 'string' } }, next: { type: 'array', items: { type: 'string' } }, note: { type: 'string', description: '40-90 words for the customer, plain and friendly' } }, required: ['headline', 'done', 'found', 'next', 'note'] } };
export async function handoverNote(c, { lang = 'en' } = {}) {
  const t0 = Date.now(); const t = recalc(c);
  const scripted = { headline: `${c.vehicle?.year || ''} ${c.vehicle?.make || ''} ${c.vehicle?.model || ''}: ${c.status.replace(/_/g, ' ')}`.trim(), done: (c.lines || []).filter((l) => l.type !== 'part').map((l) => l.desc).slice(0, 8), found: (c.findings || []).slice(0, 6), next: [...(c.lines || []).filter((l) => l.approved === false).map((l) => `Approve: ${l.desc} (${money(l.total)})`), ...(c.recallsOpen || []).map((r) => `Campaign: ${r.title}`)].slice(0, 6), note: `Thanks for bringing your ${c.vehicle?.model || 'car'} in. We completed ${(c.lines || []).filter((l) => l.type !== 'part').length} item(s) for ${money(t.total)} plus GST.${c.findings?.length ? ` We noted: ${c.findings[0]}.` : ''} Call ${db.get('sites', c.siteId)?.phone || 'us'} with any questions.`, by: 'scripted', citations: [] };
  if (!arag.configured()) return { ...scripted, ms: 0 };
  try {
    const r = await arag.ask({ query: `Write the customer handover note for job card ${c.id}.`, system: `You write handover notes for Harbourline Toyota service customers. Use ONLY the JOB CARD and MEMOS in the context; never invent work, figures or findings. Plain, friendly Australian English.${langLine(lang)}`, extraContext: [cardText(c), memosText('job_card', c.id)], jsonSchema: NOTE_SCHEMA, filterExpression: { field: { or: [topic('policy'), topic('manual')] } }, timeoutMs: 25000, topK: 6 });
    const j = r.json; if (j && typeof j.note === 'string' && j.note.trim()) return { headline: String(j.headline || scripted.headline).slice(0, 120), done: (j.done || []).map(String).slice(0, 8), found: (j.found || []).map(String).slice(0, 6), next: (j.next || []).map(String).slice(0, 6), note: j.note.trim().slice(0, 900), by: 'agent', citations: sourcesOut(r.sources), status: r.status, ms: Date.now() - t0 };
    return { ...scripted, status: r.status, ms: Date.now() - t0 };
  } catch (e) { console.warn(`[dms handover] ${e.message}`); return { ...scripted, status: 'error', ms: Date.now() - t0 }; }
}

// ── suppliers ────────────────────────────────────────────────────────────────
export const SUPPLIER_CATEGORIES = ['parts', 'accessories', 'tyres', 'tint-protection', 'sublet', 'consumables', 'towing'];
export function supplierView(s) { const invoices = db.by('documents', 'supplierId', s.id).filter((d) => d.kind === 'supplier_invoice'); return { ...s, memoCount: db.by('memos', 'entityId', s.id).filter((m) => m.entity === 'supplier').length, documentCount: db.by('documents', 'supplierId', s.id).length, invoiceCount: invoices.length, kbResourceId: kbIndex().suppliers?.[s.id] || null }; }
export function supplierDetail(s) {
  const all = attachmentsOf('supplierId', s.id);
  return { ...supplierView(s), memos: memosOf('supplier', s.id), documents: all.filter((d) => d.kind !== 'supplier_invoice'), invoices: all.filter((d) => d.kind === 'supplier_invoice').map((d) => ({ ...d, total: d.extracted?.total ?? null, invoiceNo: d.extracted?.invoiceNo ?? null, dueDate: d.extracted?.dueDate ?? null })), jobCardsUsing: db.all('job_cards').filter((c) => (c.lines || []).some((l) => l.supplierId === s.id)).slice(0, 10).map((c) => ({ id: c.id, status: c.status })) };
}
export function supplierFrom(b, existing) {
  const v = {};
  if (b.name !== undefined) v.name = str(b.name, 120); if (b.abn !== undefined) v.abn = str(b.abn, 20) || null; if (b.category !== undefined) { if (!SUPPLIER_CATEGORIES.includes(b.category)) return { error: `category must be one of ${SUPPLIER_CATEGORIES.join(', ')}` }; v.category = b.category; }
  if (b.contact !== undefined) v.contact = { name: str(b.contact?.name, 80) || null, email: str(b.contact?.email, 120) || null, phone: str(b.contact?.phone, 40) || null };
  if (b.address !== undefined) v.address = str(b.address, 200) || null; if (b.terms !== undefined) v.terms = str(b.terms, 40) || null;
  if (b.rating !== undefined) { const r = Number(b.rating); if (!(r >= 1 && r <= 5)) return { error: 'rating must be 1 to 5' }; v.rating = r; }
  if (b.status !== undefined) { if (!['active', 'on_hold'].includes(b.status)) return { error: 'status must be active or on_hold' }; v.status = b.status; }
  if (b.notes !== undefined) v.notes = str(b.notes, 2000) || '';
  if (!existing && !v.name) return { error: 'name is required' }; if (!existing && !v.category) return { error: 'category is required' };
  return { value: existing ? v : { id: db.nextId('suppliers', 'SUP', 3), status: 'active', rating: 3, terms: '30 days', spend12m: 0, openInvoices: 0, createdAt: now(), ...v } };
}
export const customerExtras = (c) => ({ memos: memosOf('customer', c.id), attachments: attachmentsOf('customerId', c.id).filter((d) => !d.dealId && !d.jobCardId), jobCards: db.by('job_cards', 'customerId', c.id).sort((a, b) => String(b.bookedAt).localeCompare(String(a.bookedAt))).map(cardView), kbResourceId: kbIndex().customers?.[c.id] || null });

// ── Domo datasets ────────────────────────────────────────────────────────────
export function serviceDaily() {
  const rows = new Map();
  const row = (date, siteId) => { const k = `${date}|${siteId}`; if (!rows.has(k)) rows.set(k, { date, siteId, cardsOpened: 0, cardsCompleted: 0, cardsCollected: 0, labourHours: 0, labourRevenue: 0, partsRevenue: 0, subletRevenue: 0, revenue: 0, loanCars: 0, waiting: 0, memos: 0 }); return rows.get(k); };
  for (const c of db.all('job_cards')) {
    row(String(c.bookedAt).slice(0, 10), c.siteId).cardsOpened++;
    if (c.loanCar) row(String(c.bookedAt).slice(0, 10), c.siteId).loanCars++; if (c.waiting) row(String(c.bookedAt).slice(0, 10), c.siteId).waiting++;
    if (c.completedAt) { const r = row(String(c.completedAt).slice(0, 10), c.siteId); const t = recalc(c); r.cardsCompleted++; r.labourHours = r2(r.labourHours + t.laborHours); r.labourRevenue = r2(r.labourRevenue + t.labourTotal); r.partsRevenue = r2(r.partsRevenue + t.partsTotal); r.subletRevenue = r2(r.subletRevenue + t.subletTotal); r.revenue = r2(r.revenue + t.total); }
    if (c.collectedAt) row(String(c.collectedAt).slice(0, 10), c.siteId).cardsCollected++;
  }
  for (const m of db.all('memos')) if (m.entity === 'job_card') { const c = db.get('job_cards', m.entityId); if (c) row(String(m.at).slice(0, 10), c.siteId).memos++; }
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date) || a.siteId.localeCompare(b.siteId));
}
export const jobCardLines = () => db.all('job_cards').flatMap((c) => (c.lines || []).map((l) => ({ jobCardId: c.id, siteId: c.siteId, lineId: l.id, type: l.type, code: l.code, desc: l.desc, qty: l.qty, hours: l.hours, unitPrice: l.unitPrice, total: l.total, source: l.source, menuId: l.menuId, approved: l.approved !== false, bookedAt: c.bookedAt, status: c.status })));
