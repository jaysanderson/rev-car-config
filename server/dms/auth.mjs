// auth.mjs — prototype auth for the DMS: demo users, in-memory bearer tokens,
// capability matrix and row scoping.
//
// Permission matrix (lead decision, 14 Oct):
//   gm             everything, all sites
//   sales_manager  own site, everything except domo.recompute
//   salesperson    own site, only own leads / deals / test drives (ownerId /
//                  salespersonId / staffId); reads stock and promotions; no publish
//   dxm            dxm, promotions (incl. compose/publish), campaigns, documents,
//                  leads read-all, assistant (+ reference reads: sites, staff, stock, KPIs, Domo catalogue)
//   finance        deals, finance apps, trade-ins, documents, assistant (+ reference reads)
// The manual/policy assistant scopes are open to every role.
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as db from './db.mjs';

export const PASSWORD = 'demo1234';
export const DEMO_USERS = [
  { email: 'gm@harbourline.demo', role: 'gm', siteId: null, title: 'General manager', name: 'General Manager' },
  { email: 'sm.par@harbourline.demo', role: 'sales_manager', siteId: 'par', title: 'Sales manager, Parramatta', name: 'Sales Manager' },
  { email: 'sales1@harbourline.demo', role: 'salesperson', siteId: 'par', title: 'Salesperson, Parramatta', name: 'Salesperson' },
  { email: 'marketing@harbourline.demo', role: 'dxm', siteId: null, title: 'Digital experience manager', name: 'Digital Experience Manager' },
  { email: 'finance@harbourline.demo', role: 'finance', siteId: null, title: 'Business manager, F&I', name: 'Business Manager' },
];

const ALL = ['test_drives.write', 'vehicles.hold', 'vehicles.transfer', 'leads.read', 'leads.write', 'deals.read', 'deals.write', 'test_drives.read', 'customers.read', 'customers.write', 'vehicles.read',
  'promotions.read', 'promotions.compose', 'promotions.publish', 'campaigns.read', 'trade_ins.read', 'finance_apps.read', 'documents.read', 'documents.write',
  'staff.read', 'sites.read', 'kpi.read', 'domo.read', 'domo.recompute', 'dxm.read', 'assistant', 'search', 'arag.read'];
const REF = ['sites.read', 'staff.read', 'vehicles.read', 'kpi.read', 'domo.read', 'search', 'arag.read', 'assistant'];
export const CAPS = {
  gm: new Set(ALL),
  sales_manager: new Set(ALL.filter((c) => c !== 'domo.recompute')),
  salesperson: new Set(['test_drives.write', 'vehicles.hold', 'leads.read', 'leads.write', 'deals.read', 'deals.write', 'test_drives.read', 'customers.read', 'customers.write', 'promotions.read',
    'trade_ins.read', 'finance_apps.read', 'documents.read', 'documents.write', ...REF.filter((c) => c !== 'domo.read')]),
  dxm: new Set(['dxm.read', 'promotions.read', 'promotions.compose', 'promotions.publish', 'campaigns.read', 'documents.read', 'documents.write', 'leads.read', 'customers.read', 'test_drives.read', ...REF]),
  finance: new Set(['deals.read', 'deals.write', 'finance_apps.read', 'trade_ins.read', 'documents.read', 'documents.write', 'customers.read', ...REF]),
};
const SITE_SCOPED = new Set(['sales_manager', 'salesperson']);

/** Resolve the demo user to a staff record (by email, else by role + site). */
function staffFor(u) {
  const byEmail = db.by('staff', 'email', u.email)[0];
  if (byEmail) return byEmail;
  const staff = db.all('staff');
  return staff.find((s) => s.role === u.role && (!u.siteId || s.siteId === u.siteId))
    || (u.role === 'salesperson' ? staff.find((s) => /sales/i.test(s.role) && !/manager/i.test(s.role) && s.siteId === u.siteId) : null) || null;
}
export function publicUser(u) {
  const s = staffFor(u);
  return { id: s?.id || `U-${u.role}`, name: s?.name || u.name, role: u.role, siteId: u.siteId, title: u.title, email: u.email, staffId: s?.id || null, caps: [...CAPS[u.role]] };
}

const tokens = new Map(); // token → {email, exp}
const TTL = 12 * 3600 * 1000;
const eq = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

export function login(email, password) {
  const u = DEMO_USERS.find((x) => x.email === String(email || '').trim().toLowerCase());
  if (!u || !eq(password || '', PASSWORD)) return null;
  const token = randomBytes(24).toString('hex');
  tokens.set(token, { email: u.email, exp: Date.now() + TTL });
  if (tokens.size > 5000) for (const [k, v] of tokens) if (v.exp < Date.now()) tokens.delete(k);
  return { token, user: publicUser(u), expiresAt: new Date(Date.now() + TTL).toISOString() };
}
export function logout(token) { tokens.delete(token); }

export function userFromToken(token) {
  if (typeof token !== 'string' || !token) return null;
  if (token.startsWith(PAT_PREFIX)) return patUser(token);
  const t = tokens.get(token);
  if (!t || t.exp < Date.now()) { if (t) tokens.delete(token); return null; }
  return publicUser(DEMO_USERS.find((x) => x.email === t.email));
}
// ── personal access tokens (for MCP clients, Domo connectors, scripts) ───────
// Raw value hdms_<48 hex> is shown once; only its SHA-256 is stored, in
// <DMS state dir>/_tokens.json (content/dms/data, or the tmp fallback).
export const PAT_PREFIX = 'hdms_';
const sha = (s) => createHash('sha256').update(s).digest('hex');
let pats = null;
const patFile = () => join(db.stateDir(), '_tokens.json');
function loadPats() { if (pats) return pats; try { pats = existsSync(patFile()) ? JSON.parse(readFileSync(patFile(), 'utf8')).tokens || [] : []; } catch { pats = []; } return pats; }
function savePats() {
  const write = () => { mkdirSync(db.stateDir(), { recursive: true }); const tmp = `${patFile()}.${process.pid}.tmp`; writeFileSync(tmp, `${JSON.stringify({ tokens: pats }, null, 2)}\n`, { mode: 0o600 }); renameSync(tmp, patFile()); };
  try { write(); } catch (e) { if (!['EACCES', 'EROFS', 'EPERM'].includes(e.code)) throw e; db.useTmpState(); write(); }
}
const patPublic = ({ hash, ...p }) => p;
export function createPat(user, { name, expiresInDays }) {
  loadPats();
  const raw = `${PAT_PREFIX}${randomBytes(24).toString('hex')}`;
  const days = Number(expiresInDays);
  const rec = { id: `pat_${randomBytes(6).toString('hex')}`, name: String(name).slice(0, 80), email: user.email, role: user.role, prefix: raw.slice(0, 11), createdAt: new Date().toISOString(), expiresAt: days > 0 ? new Date(Date.now() + Math.min(days, 3650) * 86400000).toISOString() : null, lastUsedAt: null, hash: sha(raw) };
  pats.push(rec); savePats();
  return { ...patPublic(rec), token: raw };
}
export const listPats = (user) => loadPats().filter((p) => p.email === user.email).map(patPublic);
export function deletePat(user, id) {
  loadPats(); const i = pats.findIndex((p) => p.id === id && (p.email === user.email || user.role === 'gm'));
  if (i < 0) return false; pats.splice(i, 1); savePats(); return true;
}
let lastPatSave = 0;
function patUser(raw) {
  const h = sha(raw); const p = loadPats().find((x) => x.hash.length === h.length && timingSafeEqual(Buffer.from(x.hash), Buffer.from(h)));
  if (!p || (p.expiresAt && p.expiresAt < new Date().toISOString())) return null;
  const u = DEMO_USERS.find((x) => x.email === p.email); if (!u) return null;
  p.lastUsedAt = new Date().toISOString();
  if (Date.now() - lastPatSave > 60000) { lastPatSave = Date.now(); try { savePats(); } catch { /* best effort */ } }
  return { ...publicUser(u), tokenType: 'pat', tokenId: p.id };
}

/** Bearer token from Authorization; `?token=` accepted only where allowQuery (CSV links). */
export function requireAuth({ allowQuery = false } = {}) {
  return (req, res, next) => {
    const h = req.get('authorization') || '';
    let token = /^Bearer\s+(.+)$/i.exec(h)?.[1]?.trim();
    if (!token && allowQuery && typeof req.query.token === 'string') token = req.query.token;
    const user = token && userFromToken(token);
    if (!user) return res.status(401).json({ error: 'authentication required' });
    req.user = user; req.token = token;
    next();
  };
}
export const can = (user, cap) => Boolean(user && CAPS[user.role]?.has(cap));
export const requireCap = (cap) => (req, res, next) => (can(req.user, cap) ? next() : res.status(403).json({ error: `forbidden: role ${req.user?.role} lacks ${cap}` }));

// ── row scoping ──────────────────────────────────────────────────────────────
const dealOk = (user, dealId) => { const d = db.get('deals', dealId); return d ? scopeFor(user, 'deals')(d) : false; };
/** Predicate restricting rows of `table` to what `user` may see. */
export function scopeFor(user, table) {
  if (!user || !SITE_SCOPED.has(user.role)) return () => true;
  const site = user.siteId; const me = user.staffId; const own = user.role === 'salesperson';
  switch (table) {
    case 'leads': return (r) => r.siteId === site && (!own || r.ownerId === me);
    case 'deals': return (r) => r.siteId === site && (!own || r.salespersonId === me);
    case 'test_drives': return (r) => r.siteId === site && (!own || r.staffId === me || db.get('leads', r.leadId)?.ownerId === me);
    case 'trade_ins': case 'finance_apps': return (r) => dealOk(user, r.dealId);
    case 'documents': return (r) => (r.dealId ? dealOk(user, r.dealId) : r.customerId ? customerOk(user, r.customerId) : !own);
    case 'customers': return (r) => customerOk(user, r.id);
    case 'vehicles': return () => true; // stock is visible group-wide (transfers)
    case 'targets': return (r) => r.siteId === site;
    default: return () => true;
  }
}
function customerOk(user, id) {
  return db.by('leads', 'customerId', id).some(scopeFor(user, 'leads')) || db.by('deals', 'customerId', id).some(scopeFor(user, 'deals'))
    || (user.role === 'sales_manager' && db.get('customers', id)?.siteId === user.siteId);
}
/** Site filter forced for site-scoped roles (null = any). */
export const forcedSite = (user) => (SITE_SCOPED.has(user?.role) ? user.siteId : null);
