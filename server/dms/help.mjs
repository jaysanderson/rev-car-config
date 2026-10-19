// help.mjs — the DMS help desk (call deflection), friendly error messages and the
// interactive onboarding programme (docs/DMS-PHASE2-SPEC.md §3).
//
// State (DMS state dir, db.stateDir(); resets on deploy like every other DMS write):
//   support_log.jsonl            one line per help answer {id, at, email, role, page, mode, question, grounded, helpful|null}
//   _friendly_errors.json        cache of agent-written error explanations by signature
//   _onboarding_programmes.json  composed programme per role (cached a day)
//   _onboarding_progress.json    progress per user email
// Seeds (content/dms/): friendly-errors.json (catalogue), onboarding-catalogue.json
// (programme per role when the agent is unavailable). Tickets are the support_tickets
// table (seeded by the coordinator, writes through db.mjs).
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../env.mjs';
import * as db from './db.mjs';
import * as auth from './auth.mjs';
import * as arag from '../arag.mjs';
import * as kb from './kb.mjs';
import * as ai from './ai.mjs';

const now = () => new Date().toISOString();
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
const rid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const stateFile = (name) => join(db.stateDir(), name);
function readState(name, fb) { try { return existsSync(stateFile(name)) ? JSON.parse(readFileSync(stateFile(name), 'utf8')) : fb; } catch { return fb; } }
function writeState(name, data) { try { mkdirSync(db.stateDir(), { recursive: true }); writeFileSync(stateFile(name), JSON.stringify(data, null, 1)); } catch (e) { if (['EACCES', 'EROFS', 'EPERM'].includes(e.code)) { db.useTmpState(); try { mkdirSync(db.stateDir(), { recursive: true }); writeFileSync(stateFile(name), JSON.stringify(data, null, 1)); } catch { /* give up */ } } } }
function appendState(name, line) { try { mkdirSync(db.stateDir(), { recursive: true }); appendFileSync(stateFile(name), `${JSON.stringify(line)}\n`); } catch (e) { if (['EACCES', 'EROFS', 'EPERM'].includes(e.code)) { db.useTmpState(); try { mkdirSync(db.stateDir(), { recursive: true }); appendFileSync(stateFile(name), `${JSON.stringify(line)}\n`); } catch { /* give up */ } } } }
const seed = (name, fb) => { try { return JSON.parse(readFileSync(join(ROOT, 'content', 'dms', name), 'utf8')); } catch { return fb; } };

// ── page context: which manual chapter a route belongs to ────────────────────
export const PAGES = {
  dashboard: { title: 'Dashboard', chapter: 'Harbourline DMS manual - dashboard', route: '#/dashboard' },
  assistant: { title: 'Assistant', chapter: 'Harbourline DMS manual - the assistant', route: '#/assistant' },
  leads: { title: 'Leads', chapter: 'Harbourline DMS manual - leads', route: '#/leads' },
  'test-drives': { title: 'Test drives', chapter: 'Harbourline DMS manual - test drives', route: '#/test-drives' },
  deals: { title: 'Deals', chapter: 'Harbourline DMS manual - deals and the pipeline', route: '#/deals' },
  customers: { title: 'Customers', chapter: 'Harbourline DMS manual - customers', route: '#/customers' },
  stock: { title: 'Stock', chapter: 'Harbourline DMS manual - stock', route: '#/stock' },
  finance: { title: 'Finance and trade-ins', chapter: 'Harbourline DMS manual - deals and the pipeline', route: '#/finance' },
  promotions: { title: 'Promotions', chapter: 'Harbourline DMS manual - promotions and campaigns', route: '#/promotions' },
  campaigns: { title: 'Campaigns', chapter: 'Harbourline DMS manual - promotions and campaigns', route: '#/campaigns' },
  dxm: { title: 'Digital experience', chapter: 'Harbourline DMS manual - digital experience', route: '#/dxm' },
  documents: { title: 'Documents', chapter: 'Harbourline DMS manual - documents', route: '#/documents' },
  insights: { title: 'Insights · Domo', chapter: 'Harbourline DMS manual - insights and Domo', route: '#/insights' },
  settings: { title: 'Settings and API', chapter: 'Harbourline DMS manual - settings, API and MCP', route: '#/settings' },
  service: { title: 'Job cards', chapter: 'Harbourline DMS manual - service and job cards', route: '#/service' },
  suppliers: { title: 'Suppliers', chapter: 'Harbourline DMS manual - suppliers', route: '#/suppliers' },
  onboarding: { title: 'Onboarding', chapter: 'Harbourline DMS manual - help and onboarding', route: '#/onboarding' },
  manual: { title: 'Manual', chapter: 'Harbourline DMS manual - getting started', route: '#/manual' },
  login: { title: 'Sign in', chapter: 'Harbourline DMS manual - getting started', route: '#/login' },
};
export const pageKey = (page) => String(page || '').replace(/^#?\/?/, '').split(/[/?]/)[0].toLowerCase() || 'dashboard';
const pageCtx = (page) => { const k = pageKey(page); const p = PAGES[k]; return p ? `The user is on the ${p.title} page (${p.route}); the relevant manual chapter is "${p.chapter}".` : `The user is on page "${k}".`; };
const suggestPages = (text) => { const t = String(text || '').toLowerCase(); return Object.entries(PAGES).filter(([k, p]) => k !== 'login' && (t.includes(k.replace('-', ' ')) || t.includes(p.title.toLowerCase()))).slice(0, 4).map(([, p]) => ({ route: p.route, title: p.title })); };

// ── help ask ─────────────────────────────────────────────────────────────────
export async function helpAsk({ question, page, lang = 'en', mode = 'software' }, user) {
  const t0 = Date.now(); const helpId = rid('help');
  let out;
  if (mode === 'business') {
    const r = await ai.agentQuery({ question, lang }, user);
    out = { helpId, mode, answer: r.answer, grounded: r.answerer === 'arag', evidence: r.evidence, followups: r.followups, kpis: r.kpis, plan: r.plan, citations: [], suggestedPages: suggestPages(question), ms: Date.now() - t0 };
  } else {
    let r;
    try { r = await ai.ask({ question, scope: 'all', context: `${pageCtx(page)} Answer as the product's help desk: name the exact page, button or field, then the steps. If the manual does not cover it, say so and offer to raise a ticket.`, lang }); }
    catch (e) { r = { answer: 'The help desk could not reach the knowledge box just now. Try again in a moment, or raise a ticket and a person will reply.', status: 'error', grounded: false, citations: [] }; }
    out = { helpId, mode, answer: r.answer, grounded: Boolean(r.grounded), status: r.status, citations: r.citations, suggestedPages: [...new Map([...suggestPages(r.answer), ...suggestPages(question)].map((p) => [p.route, p])).values()].slice(0, 4), manualChapter: PAGES[pageKey(page)]?.chapter || null, ms: Date.now() - t0 };
  }
  appendState('support_log.jsonl', { id: helpId, at: now(), email: user.email, role: user.role, page: pageKey(page), mode, question: String(question).slice(0, 300), grounded: out.grounded, helpful: null, ms: out.ms });
  return out;
}
export function readLog() {
  const p = stateFile('support_log.jsonl'); if (!existsSync(p)) return [];
  const rows = []; for (const line of readFileSync(p, 'utf8').split('\n')) { if (!line.trim()) continue; try { rows.push(JSON.parse(line)); } catch { /* torn */ } }
  // Feedback lines ({feedback:true, helpId, helpful}) fold into their answer line.
  const byId = new Map(rows.filter((r) => !r.feedback).map((r) => [r.id, r]));
  for (const f of rows.filter((r) => r.feedback)) { const a = byId.get(f.helpId); if (a) a.helpful = f.helpful; }
  return [...byId.values()];
}
export function feedback({ helpId, helpful }, user) {
  if (!helpId) return { error: 'helpId is required' };
  appendState('support_log.jsonl', { feedback: true, helpId, helpful: Boolean(helpful), at: now(), email: user.email });
  return { value: { ok: true, helpId, helpful: Boolean(helpful) } };
}
export function createTicket({ helpId, question, page }, user) {
  const q = str(question, 500); if (!q) return { error: 'question is required' };
  const row = db.insert('support_tickets', { id: db.nextId('support_tickets', 'T', 4), userEmail: user.email, role: user.role, page: pageKey(page), question: q, answerId: helpId || null, status: 'open', createdAt: now(), closedAt: null, answer: null });
  return { value: row };
}
export function deflection(days = 30, scope) {
  const cut = Date.now() - days * 86400000;
  const log = readLog().filter((r) => Date.parse(r.at) > cut && r.mode !== 'business');
  const tickets = db.all('support_tickets').filter((t) => Date.parse(t.createdAt) > cut).filter(scope || (() => true));
  const byPage = {}; const topQ = {};
  for (const r of log) { const p = byPage[r.page] ||= { page: r.page, answers: 0, helpful: 0, unhelpful: 0 }; p.answers++; if (r.helpful === true) p.helpful++; if (r.helpful === false) p.unhelpful++; const k = r.question.toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 60); topQ[k] = (topQ[k] || 0) + 1; }
  for (const t of tickets) { const p = byPage[t.page] ||= { page: t.page, answers: 0, helpful: 0, unhelpful: 0 }; p.tickets = (p.tickets || 0) + 1; }
  const helpful = log.filter((r) => r.helpful === true).length; const unhelpful = log.filter((r) => r.helpful === false).length;
  const deflected = log.length - tickets.filter((t) => t.answerId).length;
  return { days, answers: log.length, grounded: log.filter((r) => r.grounded).length, helpful, unhelpful, tickets: tickets.length, ticketsOpen: tickets.filter((t) => t.status === 'open').length, deflected: Math.max(0, deflected), deflectionRate: log.length ? Math.round((Math.max(0, deflected) / log.length) * 1000) / 10 : null, byPage: Object.values(byPage).sort((a, b) => b.answers - a.answers), topQuestions: Object.entries(topQ).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([question, n]) => ({ question, n })), byRole: Object.entries(log.reduce((a, r) => ((a[r.role] = (a[r.role] || 0) + 1), a), {})).map(([role, n]) => ({ role, n })) };
}
/** Domo dataset rows: one per help answer plus one per ticket. */
export const supportDeflectionRows = () => [...readLog().map((r) => ({ at: r.at, kind: 'answer', id: r.id, role: r.role, page: r.page, mode: r.mode, grounded: Boolean(r.grounded), helpful: r.helpful, question: r.question, ms: r.ms || null })), ...db.all('support_tickets').map((t) => ({ at: t.createdAt, kind: 'ticket', id: t.id, role: t.role, page: t.page, mode: 'software', grounded: null, helpful: null, question: t.question, ms: null, status: t.status }))].sort((a, b) => String(b.at).localeCompare(String(a.at)));

// ── friendly errors ──────────────────────────────────────────────────────────
const CATALOGUE = () => seed('friendly-errors.json', { items: [] }).items || [];
const sigOf = ({ status, method, endpoint, message, code }) => `${status}|${String(method || 'GET').toUpperCase()}|${String(endpoint || '').replace(/\/(?:[A-Z]{1,4}-\d+|\d+|[a-f0-9]{8,})(?=\/|$)/g, '/:id').split('?')[0]}|${(code || '').toLowerCase()}|${String(message || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 80)}`;
function catalogueMatch(e) {
  const items = CATALOGUE(); const msg = String(e.message || '').toLowerCase(); const ep = String(e.endpoint || '');
  const score = (it) => { let s = 0; if (it.status && Number(it.status) === Number(e.status)) s += 3; else if (it.status) return -1; if (it.match && msg.includes(it.match.toLowerCase())) s += 4; if (it.endpoint && new RegExp(it.endpoint).test(ep)) s += 2; if (it.code && it.code === e.code) s += 3; return s; };
  const best = items.map((it) => [score(it), it]).filter(([s]) => s >= 3).sort((a, b) => b[0] - a[0])[0];
  if (best) return best[1];
  const generic = items.find((it) => it.status === Number(e.status) && !it.match && !it.endpoint) || items.find((it) => it.id === 'generic');
  return generic || { id: 'generic', title: 'Something did not work', message: 'The system could not complete that action.', cause: 'The request was rejected or the server could not finish it.', nextStep: 'Try again, and if it keeps happening ask the help desk (bottom right) with the details line below.', manualRoute: '#/manual' };
}
const errCache = new Map(); let errFileLoaded = false;
function loadErrCache() { if (errFileLoaded) return; errFileLoaded = true; for (const [k, v] of Object.entries(readState('_friendly_errors.json', {}))) errCache.set(k, v); }
const ERR_SCHEMA = { name: 'friendly_error', description: 'A plain-language explanation of a software error for dealership staff', parameters: { type: 'object', properties: { title: { type: 'string', description: 'max 60 characters, no error codes' }, message: { type: 'string', description: 'one or two sentences, what happened in plain words' }, cause: { type: 'string', description: 'the most likely reason, one sentence' }, nextStep: { type: 'string', description: 'what to do now, naming the page or button from the manual' }, manualRoute: { type: 'string', description: 'the DMS hash route of the relevant page, e.g. #/deals, or empty' } }, required: ['title', 'message', 'cause', 'nextStep', 'manualRoute'] } };
const inflight = new Map();
async function composeError(e, sig) {
  if (inflight.has(sig)) return inflight.get(sig);
  const p = (async () => {
    const r = await kb.askJson({ query: `Explain this error to a dealership user and tell them what to do next: ${e.method || 'GET'} ${e.endpoint || ''} returned ${e.status} "${e.message || ''}"${e.code ? ` (code ${e.code})` : ''}. The user is a ${e.role || 'staff member'}${e.page ? ` on the ${e.page} page` : ''}.`, jsonSchema: ERR_SCHEMA, filterExpression: ai.SCOPES.all, timeoutMs: 15000, topK: 6, system: 'You are the Harbourline DMS help desk. Rewrite technical API errors as calm, specific, friendly guidance grounded in the DMS manual: name the page, button or field the user should use. Never show stack traces, status codes or JSON. Never blame the user. If the error means a permission is missing, say who can do it instead.' });
    const j = r.json;
    if (j && typeof j.message === 'string' && j.message.trim()) {
      const v = { title: String(j.title || '').slice(0, 60) || 'Something did not work', message: String(j.message).slice(0, 300), cause: String(j.cause || '').slice(0, 200), nextStep: String(j.nextStep || '').slice(0, 300), manualRoute: /^#\/[a-z-]+$/.test(j.manualRoute || '') ? j.manualRoute : null, by: 'agent', generatedAt: now() };
      errCache.set(sig, v); writeState('_friendly_errors.json', Object.fromEntries(errCache)); return v;
    }
    return null;
  })().catch((err) => { console.warn(`[dms friendly-error] ${err.message}`); return null; }).finally(() => inflight.delete(sig));
  inflight.set(sig, p); return p;
}
/** {title, message, cause, nextStep, manualRoute, by, cached, details}. Answers within ~1 s unless wait=true. */
export async function explainError(e, { wait = false } = {}) {
  loadErrCache();
  const status = Number(e.status) || 500; const sig = sigOf({ ...e, status });
  const details = `${String(e.method || 'GET').toUpperCase()} ${String(e.endpoint || '').split('?')[0]} → ${status}${e.message ? ` ${String(e.message).slice(0, 160)}` : ''}`;
  const cached = errCache.get(sig);
  if (cached) return { ...cached, cached: true, details, status };
  const cat = catalogueMatch({ ...e, status });
  const fromCat = { title: cat.title, message: cat.message, cause: cat.cause, nextStep: cat.nextStep, manualRoute: cat.manualRoute || null, by: 'catalogue', cached: false, details, status, catalogueId: cat.id };
  if (!arag.configured() || status >= 500 && status !== 502 && status !== 503 && status !== 504) return fromCat;
  const p = composeError({ ...e, status }, sig);
  if (wait) { const v = await Promise.race([p, new Promise((r) => setTimeout(() => r(null), 14000))]); return v ? { ...v, cached: false, details, status } : fromCat; }
  const v = await Promise.race([p, new Promise((r) => setTimeout(() => r(null), 900))]);
  return v ? { ...v, cached: false, details, status } : { ...fromCat, pending: true };
}
export const friendlyErrorsCatalogue = () => CATALOGUE();

// ── onboarding ───────────────────────────────────────────────────────────────
const ROLE_LABEL = { gm: 'general manager', sales_manager: 'sales manager', salesperson: 'salesperson', dxm: 'digital experience manager', finance: 'business manager (finance and insurance)', service_manager: 'service manager', technician: 'workshop technician' };
const PROG_SCHEMA = { name: 'onboarding_programme', description: 'A role-based onboarding programme for the Harbourline DMS', parameters: { type: 'object', properties: { steps: { type: 'array', items: { type: 'object', properties: { id: { type: 'string', description: 'kebab-case, unique' }, title: { type: 'string' }, why: { type: 'string', description: 'one sentence, why this matters for the role' }, route: { type: 'string', description: 'DMS hash route, e.g. #/leads' }, task: { type: 'string', description: 'one concrete thing to do, using the exact button names from the manual' }, verifyKind: { type: 'string', enum: ['query', 'manual', 'ask'] }, verifyTable: { type: 'string', description: 'for query: leads, deals, test_drives, customers, job_cards, memos, documents, support_tickets or empty' }, verifyHint: { type: 'string', description: 'what the check looks for, e.g. "a lead created by you tagged onboarding"' }, manualRef: { type: 'string', description: 'the manual chapter title' }, estimatedMinutes: { type: 'integer' } }, required: ['id', 'title', 'why', 'route', 'task', 'verifyKind', 'manualRef', 'estimatedMinutes'] } } }, required: ['steps'] } };
const VERIFY_RULES = { // what a `query` verification checks for each table, scoped to the current user
  leads: (u) => ({ table: 'leads', where: (r) => (r.ownerId === u.staffId || r.createdBy === u.id) && (Array.isArray(r.tags) ? r.tags.includes('onboarding') : /onboarding/i.test(r.notes || '')) , minCount: 1, describe: 'a lead you own with the tag "onboarding" (or the word in its notes)' }),
  customers: (u) => ({ table: 'customers', where: (r) => r.createdBy === u.id || (Array.isArray(r.tags) && r.tags.includes('onboarding')), minCount: 1, describe: 'a customer you created or tagged "onboarding"' }),
  test_drives: (u) => ({ table: 'test_drives', where: (r) => r.staffId === u.staffId || r.createdBy === u.id, minCount: 1, describe: 'a test drive booked by you' }),
  deals: (u) => ({ table: 'deals', where: (r) => (r.salespersonId === u.staffId || r.createdBy === u.id) && (r.events || []).some((e) => /onboarding/i.test(e.note || '')), minCount: 1, describe: 'a deal of yours with an event note mentioning onboarding' }),
  job_cards: (u) => ({ table: 'job_cards', where: (r) => r.createdBy === u.id || r.technicianId === u.staffId || r.advisorId === u.staffId, minCount: 1, describe: 'a job card you created or are assigned to' }),
  memos: (u) => ({ table: 'memos', where: (r) => r.byStaffId === (u.staffId || u.id), minCount: 1, describe: 'a memo written by you' }),
  documents: (u) => ({ table: 'documents', where: (r) => r.uploadedBy === u.id, minCount: 1, describe: 'a document or image you uploaded' }),
  support_tickets: (u) => ({ table: 'support_tickets', where: (r) => r.userEmail === u.email, minCount: 1, describe: 'a help ticket raised by you' }),
};
function normaliseProgramme(j, role) {
  const steps = (Array.isArray(j?.steps) ? j.steps : []).map((s, i) => ({ id: String(s.id || `step-${i + 1}`).toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40), title: String(s.title || '').slice(0, 90), why: String(s.why || '').slice(0, 240), route: /^#\/[a-z-]+/.test(s.route || '') ? s.route : '#/dashboard', task: String(s.task || '').slice(0, 300), verify: { kind: ['query', 'manual', 'ask'].includes(s.verifyKind || s.verify?.kind) ? (s.verifyKind || s.verify.kind) : 'manual', table: VERIFY_RULES[s.verifyTable || s.verify?.table] ? (s.verifyTable || s.verify.table) : null, hint: String(s.verifyHint || s.verify?.hint || '').slice(0, 200) }, manualRef: String(s.manualRef || '').slice(0, 120), estimatedMinutes: Math.max(1, Math.min(30, Number(s.estimatedMinutes) || 5)) })).filter((s) => s.title && s.task);
  for (const s of steps) if (s.verify.kind === 'query' && !s.verify.table) s.verify.kind = 'manual';
  const seen = new Set(); return steps.filter((s) => !seen.has(s.id) && seen.add(s.id)).slice(0, 12).map((s) => ({ ...s, role }));
}
export async function programme(role, { refresh = false } = {}) {
  const r = auth.CAPS[role] ? role : 'salesperson';
  const cached = readState('_onboarding_programmes.json', {})[r];
  if (cached && !refresh && Date.now() - Date.parse(cached.generatedAt) < 86400000 && cached.steps?.length >= 4) return cached;
  const cat = seed('onboarding-catalogue.json', { roles: {} }).roles?.[r] || seed('onboarding-catalogue.json', { roles: {} }).roles?.salesperson || { steps: [] };
  let out = { role: r, steps: normaliseProgramme(cat, r), composedBy: 'catalogue', generatedAt: now() };
  if (arag.configured()) {
    try {
      const resp = await kb.askJson({ query: `Design an onboarding programme of 6 to 9 steps for a new ${ROLE_LABEL[r] || r} learning the Harbourline DMS, from the manual.`, jsonSchema: PROG_SCHEMA, filterExpression: ai.SCOPES.manual, timeoutMs: 30000, topK: 14, system: `You design onboarding for dealership software from its operating manual. Each step must point at a real page (hash routes: ${Object.values(PAGES).map((p) => p.route).join(', ')}), give one concrete task using the manual's exact button names, and say how we can verify it: verifyKind "query" with verifyTable in (leads, customers, test_drives, deals, job_cards, memos, documents, support_tickets) when the task creates a record (ask the user to tag or note "onboarding"), "ask" when the task is to ask the help desk something, "manual" otherwise. Order from sign-in basics to the role's daily work. Only use features the manual describes.` });
      const steps = normaliseProgramme(resp.json, r);
      if (steps.length >= 4) out = { role: r, steps, composedBy: 'agent', generatedAt: now() };
    } catch (e) { console.warn(`[dms onboarding] ${e.message}`); }
  }
  const all = readState('_onboarding_programmes.json', {}); all[r] = out; writeState('_onboarding_programmes.json', all);
  return out;
}
const progressAll = () => readState('_onboarding_progress.json', {});
function saveProgress(email, p) { const all = progressAll(); all[email] = p; writeState('_onboarding_progress.json', all); }
export function verifyStep(step, user) {
  if (step.verify.kind === 'query') {
    const rule = VERIFY_RULES[step.verify.table]?.(user); if (!rule) return { verified: false, checked: 'no rule' };
    const n = db.all(rule.table).filter(auth.scopeFor(user, rule.table)).filter(rule.where).length;
    return { verified: n >= rule.minCount, checked: `looked for ${rule.describe}: found ${n}`, found: n };
  }
  if (step.verify.kind === 'ask') { const n = readLog().filter((r) => r.email === user.email).length; return { verified: n >= 1, checked: `help desk questions asked by you: ${n}`, found: n }; }
  return { verified: false, checked: 'self-attested step' };
}
export async function progress(user) {
  const prog = await programme(user.role);
  const p = progressAll()[user.email] || { role: user.role, startedAt: null, steps: {}, questions: 0 };
  let changed = false;
  const steps = prog.steps.map((s) => {
    const done = p.steps[s.id]; let v = null;
    if (!done && s.verify.kind !== 'manual') { v = verifyStep(s, user); if (v.verified) { p.steps[s.id] = { doneAt: now(), verifiedBy: 'live data', checked: v.checked }; changed = true; } }
    return { ...s, done: Boolean(p.steps[s.id]), doneAt: p.steps[s.id]?.doneAt || null, verifiedBy: p.steps[s.id]?.verifiedBy || null, checked: p.steps[s.id]?.checked || v?.checked || null };
  });
  if (changed || (!p.startedAt && steps.some((s) => s.done))) { p.startedAt = p.startedAt || now(); saveProgress(user.email, p); }
  const doneN = steps.filter((s) => s.done).length;
  return { role: prog.role, composedBy: prog.composedBy, generatedAt: prog.generatedAt, startedAt: p.startedAt, steps, done: doneN, total: steps.length, percent: steps.length ? Math.round((doneN / steps.length) * 100) : 0, nextStep: steps.find((s) => !s.done) || null, complete: steps.length > 0 && doneN === steps.length, questions: p.questions || 0 };
}
export async function completeStep(stepId, { how = 'manual' } = {}, user) {
  const prog = await programme(user.role); const s = prog.steps.find((x) => x.id === stepId); if (!s) return { error: 'unknown step' };
  const p = progressAll()[user.email] || { role: user.role, startedAt: now(), steps: {}, questions: 0 }; p.startedAt = p.startedAt || now();
  if (how === 'verified' || s.verify.kind !== 'manual') { const v = verifyStep(s, user); if (!v.verified && how === 'verified') { saveProgress(user.email, p); return { value: { ok: false, verified: false, checked: v.checked, hint: s.verify.hint || null } }; } if (v.verified) p.steps[s.id] = { doneAt: now(), verifiedBy: 'live data', checked: v.checked }; }
  if (!p.steps[s.id]) p.steps[s.id] = { doneAt: now(), verifiedBy: 'self-attested', checked: 'marked done by the user' };
  saveProgress(user.email, p);
  return { value: { ok: true, verified: p.steps[s.id].verifiedBy === 'live data', checked: p.steps[s.id].checked, progress: await progress(user) } };
}
export async function askStep(stepId, { question, lang = 'en' }, user) {
  const prog = await programme(user.role); const s = prog.steps.find((x) => x.id === stepId); if (!s) return { error: 'unknown step' };
  const p = progressAll()[user.email] || { role: user.role, startedAt: now(), steps: {}, questions: 0 }; p.questions = (p.questions || 0) + 1; saveProgress(user.email, p);
  const r = await ai.ask({ question, scope: 'manual', context: `Onboarding step "${s.title}" for a ${ROLE_LABEL[user.role] || user.role}: ${s.task}. Page ${s.route}. Manual chapter: ${s.manualRef}. Answer with the exact steps on that page.`, lang });
  return { value: { stepId, ...r } };
}
export function resetProgress(user) { const all = progressAll(); delete all[user.email]; writeState('_onboarding_progress.json', all); return { ok: true }; }
/** Domo dataset rows: one per user × step. */
export const onboardingRows = () => Object.entries(progressAll()).flatMap(([email, p]) => Object.entries(p.steps || {}).map(([stepId, s]) => ({ email, role: p.role, stepId, doneAt: s.doneAt, verifiedBy: s.verifiedBy, startedAt: p.startedAt, questions: p.questions || 0 })));
export const onboardingSummary = () => { const all = progressAll(); const byRole = {}; for (const p of Object.values(all)) { const r = byRole[p.role] ||= { role: p.role, users: 0, stepsDone: 0 }; r.users++; r.stepsDone += Object.keys(p.steps || {}).length; } return { users: Object.keys(all).length, byRole: Object.values(byRole) }; };
