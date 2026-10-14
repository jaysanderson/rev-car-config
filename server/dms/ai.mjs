// ai.mjs — the DMS's Progress Agentic RAG features (server-side only; tokens never
// leave the server).
//
//   ask()          POST /ask            manual / policy scopes via topic label filters
//                                       (topic/document is always excluded)
//   agentQuery()   POST /agent/query    live-ERP retrieval agent, two-step loop:
//                    1. /ask + answer_json_schema → a plan of ≤ 4 tool calls from
//                       {erp.search, erp.kpi, erp.get}, given the schema summary
//                    2. the server runs them against db.mjs (role-scoped)
//                    3. /ask + extra_context(results) + answer_json_schema →
//                       {answer, evidence[{table,id,why}], followups[]}
//                  Evidence is validated against the rows actually returned. When the
//                  plan step fails, a deterministic keyword planner is used instead
//                  (planner:"fallback"). No KB context agent calls back into the API.
//   dealSummary()  POST /deals/:id/summary
//   leadFollowup() POST /leads/:id/followup   (only promotions that exist; ids validated)
//   processDocument() POST /documents/:id/process (upload → wait → per-kind extraction)
//   search()       GET /search          KB /find (manual, policy, document) + ERP text
//   status()       GET /arag/status
import * as arag from '../arag.mjs';
import * as kb from './kb.mjs';
import * as db from './db.mjs';
import { scopeFor, forcedSite } from './auth.mjs';
import { kpi, KPI_NAMES, ymd, currentMonth, OPEN_STAGES } from './kpi.mjs';
import { promoStatus } from './ops.mjs';

const DAY = 86400000;
export const LANGS = { en: 'English', es: 'Spanish', zh: 'Simplified Chinese', ar: 'Arabic', hi: 'Hindi', vi: 'Vietnamese', ko: 'Korean', ja: 'Japanese', it: 'Italian', el: 'Greek', fr: 'French', de: 'German', pt: 'Portuguese', tl: 'Tagalog', id: 'Indonesian' };
export const langOf = (v) => (typeof v === 'string' && LANGS[v.toLowerCase()] ? v.toLowerCase() : 'en');
const langLine = (lang) => `Write every user-facing string in ${LANGS[lang]}${lang === 'en' ? ' (Australian English)' : ''}. Keep ids, numbers and dollar amounts unchanged.`;
const SOFT_FAIL = new Set(['no_context', 'no_retrieval_data']);
// Models for the ERP agent's two /ask steps (empty → the KB default). Benchmarked 14 Oct:
// every model costs ≥ ~5 s per /ask (platform floor); the KB default is as fast as any.
const PLAN_MODEL = process.env.DMS_AGENT_PLAN_MODEL || '';
const ANSWER_MODEL = process.env.DMS_AGENT_ANSWER_MODEL || '';

// ── scopes ───────────────────────────────────────────────────────────────────
const topic = (label) => ({ prop: 'label', labelset: 'topic', label });
const NOT_DOC = { not: topic('document') };
export const SCOPES = {
  manual: { field: { and: [topic('manual'), NOT_DOC] } },
  policy: { field: { and: [topic('policy'), NOT_DOC] } },
  all: { field: { and: [{ or: [topic('manual'), topic('policy')] }, NOT_DOC] } },
};
const sourcesOut = (s) => s.slice(0, 6).map((x) => ({ resourceId: x.resourceId, title: x.title, topic: x.topic || [], text: (x.text || '').slice(0, 400), cited: Boolean(x.cited) }));

// ── /ask ─────────────────────────────────────────────────────────────────────
const ASK_SYSTEM = (lang) => `You are the Harbourline Toyota DMS assistant for dealership sales staff (Harbourline Toyota: Parramatta, Hornsby, Penrith, Liverpool).
Answer only from the retrieved Harbourline DMS operating manual and dealer policies. Be concise and practical: a direct answer, then the steps or the rule, citing the policy or manual section by name.
If the documents do not cover the question, say so plainly and suggest who to ask (sales manager or business manager). Never invent a policy, a threshold or an approval limit.
${langLine(lang)}`;
export async function ask({ question, scope = 'all', context, lang = 'en' }) {
  const t0 = Date.now();
  const sc = SCOPES[scope] ? scope : 'all';
  if (!arag.configured()) return { answer: 'The knowledge base is not configured on this server.', status: 'not_configured', scope: sc, lang, citations: [], ms: 0 };
  const r = await arag.ask({ query: question, system: ASK_SYSTEM(lang), extraContext: context ? [`Context from the screen the user is on:\n${String(context).slice(0, 4000)}`] : [], filterExpression: SCOPES[sc], timeoutMs: 30000, topK: 12 });
  return { answer: r.answer, status: r.status, grounded: !SOFT_FAIL.has(r.status), scope: sc, lang, citations: sourcesOut(r.sources), ms: Date.now() - t0 };
}

// ── ERP tools (shared by the agent loop) ─────────────────────────────────────
const SITE_NAMES = () => Object.fromEntries(db.all('sites').map((s) => [String(s.name).toLowerCase(), s.id]));
// When the deal entered its current stage: stageHistory (seed) else the last event.
const lastEventAt = (d) => { const h = (d.stageHistory || []).filter((x) => x.stage === d.stage).pop(); return h?.at || (d.events || []).reduce((m, e) => (e.at && e.at > m ? e.at : m), d.createdAt || ''); };
// Calendar days in Sydney (how dealers count "days in stage"): local date of the event → today.
const sydDate = (iso) => (/[+-]\d\d:\d\d$/.test(String(iso)) ? String(iso).slice(0, 10) : new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date(iso)));
const days = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? Math.round((Date.parse(ymd()) - Date.parse(sydDate(iso))) / DAY) : null);
// "Stuck" thresholds per stage, from the DMS manual (deals and the pipeline stages).
export const STUCK_DAYS = { quote: 7, negotiation: 5, finance: 5, approval: 2, contract: 3, delivery: 10 };
const VIRTUAL = {
  deals: (d) => ({ daysInStage: days(lastEventAt(d)), stuck: STUCK_DAYS[d.stage] != null && days(lastEventAt(d)) > STUCK_DAYS[d.stage], daysOpen: OPEN_STAGES.includes(d.stage) ? days(d.createdAt) : null, model: d.modelId || db.get('vehicles', d.stockNo)?.model || d.order?.modelId || null }),
  leads: (l) => ({ daysSinceUpdate: days(l.updatedAt || l.createdAt), ageDays: days(l.createdAt) }),
  finance_apps: (f) => ({ siteId: db.get('deals', f.dealId)?.siteId || null, daysPending: ['submitted', 'conditional'].includes(f.status) ? days(f.submittedAt) : null }),
  trade_ins: (t) => ({ siteId: db.get('deals', t.dealId)?.siteId || null }),
  documents: (x) => ({ siteId: db.get('deals', x.dealId)?.siteId || null }),
  test_drives: (t) => ({ daysUntil: t.when ? Math.ceil((Date.parse(t.when) - Date.now()) / DAY) : null }),
};
export const VIRTUAL_DOC = 'deals.daysInStage (days since the deal entered its current stage), deals.stuck (true when daysInStage exceeds the stage limit: quote 7, negotiation 5, finance 5, approval 2, contract 3, delivery 10), deals.daysOpen, deals.model; leads.daysSinceUpdate, leads.ageDays; finance_apps.siteId, finance_apps.daysPending; trade_ins.siteId; documents.siteId; test_drives.daysUntil';
const view = (table, r) => (VIRTUAL[table] ? { ...r, ...VIRTUAL[table](r) } : r);
/** Deal row + daysInStage, stuck, daysOpen, model (for lists and detail). */
export const dealView = (d) => view('deals', d);
// Compact rows for prompts (drop bulky arrays).
function compact(table, r) {
  const o = { ...r };
  delete o._key;
  if (o.events) o.events = o.events.slice(-2).map((e) => ({ at: String(e.at).slice(0, 10), type: e.type, note: String(e.note || '').slice(0, 140) }));
  delete o.stageHistory; delete o.statusHistory;
  for (const [k, v] of Object.entries(o)) if (v == null || v === '' || (Array.isArray(v) && !v.length)) delete o[k];
  for (const k of ['handover', 'questions', 'finderAnswers', 'viewed', 'extracted', 'documents', 'accessories', 'promotions', 'order', 'expected']) if (o[k] && JSON.stringify(o[k]).length > 200) o[k] = `[${Array.isArray(o[k]) ? o[k].length : 'object'}]`;
  if (typeof o.notes === 'string') o.notes = o.notes.slice(0, 160);
  return o;
}
function normFilters(table, filters, user) {
  const sites = SITE_NAMES();
  const ME = /^(current_?user|me|self|my|mine|\$?user|<?staffid>?|current)$/i;
  return (Array.isArray(filters) ? filters : []).slice(0, 8).filter((f) => f && typeof f.field === 'string').map((f) => {
    let value = f.value;
    if (typeof value === 'string' && ME.test(value.trim()) && user?.staffId) value = user.staffId;
    if (f.field === 'siteId' && typeof value === 'string') value = value.split(',').map((v) => sites[v.trim().toLowerCase()] || v.trim().toLowerCase()).join(',');
    if (['model', 'modelId', 'interest.modelId'].includes(f.field) && typeof value === 'string') value = value.toLowerCase().replace(/\s+/g, '-');
    if (['stage', 'status', 'channel', 'source', 'kind'].includes(f.field) && typeof value === 'string') value = value.toLowerCase().replace(/\s+/g, '_');
    return { field: f.field, op: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'exists'].includes(f.op) ? f.op : 'eq', value };
  });
}
/** Run one tool call for `user`. Returns {tool, args, total, rows|data, error?}. */
export function runTool(call, user) {
  const tool = call.tool;
  try {
    if (tool === 'erp.search') {
      const table = call.table;
      if (!db.TABLES[table]) return { tool, args: call, error: `unknown table ${table}` };
      const sc = scopeFor(user, table);
      const filters = normFilters(table, call.filters, user);
      const base = db.all(table).filter(sc).map((r) => view(table, r));
      const limit = Math.max(1, Math.min(25, Number(call.limit) || 10));
      const r = db.list(table, { rows: base, filters, sort: call.sort || undefined, pageSize: limit, q: call.q });
      return { tool, args: { table, filters, sort: call.sort || null, limit }, total: r.total, rows: r.items.map((x) => compact(table, x)), table };
    }
    if (tool === 'erp.get') {
      const table = call.table; const r = db.get(table, call.id);
      if (!r || !scopeFor(user, table)(r)) return { tool, args: { table, id: call.id }, total: 0, rows: [], table };
      return { tool, args: { table, id: call.id }, total: 1, rows: [compact(table, view(table, r))], table };
    }
    if (tool === 'erp.kpi') {
      const name = KPI_NAMES.includes(call.name) ? call.name : 'overview';
      const site = forcedSite(user) || (call.siteId ? SITE_NAMES()[String(call.siteId).toLowerCase()] || call.siteId : undefined);
      const params = { siteId: site, month: call.month || undefined, metric: call.metric || undefined, by: call.by || undefined, from: call.from || undefined, to: call.to || undefined };
      const data = kpi(name, params);
      return { tool, args: { name, ...params }, data };
    }
    return { tool, args: call, error: `unknown tool ${tool}` };
  } catch (e) { return { tool, args: call, error: e.message }; }
}

function schemaSummary() {
  const sites = db.all('sites').map((s) => `${s.id}=${s.name}`).join(', ');
  return [`ERP SCHEMA (Harbourline DMS; today is ${ymd()}; current month ${currentMonth()}; money AUD; dates ISO).`,
    `Sites: ${sites}. Use site ids in filters.`,
    ...Object.entries(db.TABLES).map(([t, m]) => `- ${t} (${db.all(t).length} rows; key ${m.key === '_key' ? 'siteId|month' : m.key}): ${m.cols}`),
    `Virtual fields usable in erp.search filters: ${VIRTUAL_DOC}.`,
    `Open deal stages: ${OPEN_STAGES.join(', ')}. Aged stock = vehicles with status on_lot or demo and daysInStock > 60 (no upper bound).`,
    `KPIs for erp.kpi (name): overview {siteId, month} → units delivered, gross, conversion, test-drive rate, days to close, aged stock, days of supply, pipeline, target attainment; series {metric: units|gross|avg_gross|leads|test_drives|conversion|lost, by: month|week, siteId}; leaderboard {siteId, month}; days_of_supply {siteId}.`,
  ].join('\n');
}

const OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'exists'];
const PLAN_SCHEMA = () => ({
  name: 'erp_plan', description: 'Up to 4 ERP tool calls that retrieve the rows needed to answer the question',
  parameters: {
    type: 'object',
    properties: {
      intent: { type: 'string', description: 'One sentence: what the user wants' },
      calls: {
        type: 'array', description: 'At most 4 tool calls',
        items: {
          type: 'object',
          properties: {
            tool: { type: 'string', enum: ['erp.search', 'erp.kpi', 'erp.get'] },
            table: { type: 'string', enum: Object.keys(db.TABLES), description: 'erp.search / erp.get: table' },
            filters: { type: 'array', description: 'erp.search: AND-ed filters', items: { type: 'object', properties: { field: { type: 'string' }, op: { type: 'string', enum: OPS }, value: { type: 'string' } }, required: ['field', 'op', 'value'] } },
            sort: { type: 'string', description: 'erp.search: field or -field (descending)' },
            limit: { type: 'integer', description: 'erp.search: max rows (≤ 25)' },
            id: { type: 'string', description: 'erp.get: primary key' },
            name: { type: 'string', enum: KPI_NAMES, description: 'erp.kpi: KPI name' },
            siteId: { type: 'string' }, month: { type: 'string', description: 'YYYY-MM' }, metric: { type: 'string' }, by: { type: 'string' },
          },
          required: ['tool'],
        },
      },
    },
    required: ['calls'],
  },
});
const ANSWER_SCHEMA = {
  name: 'erp_answer', description: 'Answer grounded in the ERP rows',
  parameters: {
    type: 'object',
    properties: {
      answer: { type: 'string', description: 'Plain answer, 1-5 sentences, quoting ids, names, counts and amounts from the rows' },
      evidence: { type: 'array', items: { type: 'object', properties: { table: { type: 'string' }, id: { type: 'string' }, why: { type: 'string' } }, required: ['table', 'id', 'why'] } },
      followups: { type: 'array', items: { type: 'string' }, description: 'Up to 3 useful next questions' },
    },
    required: ['answer', 'evidence', 'followups'],
  },
};

/** Deterministic keyword planner (fallback when the plan step fails). */
export function fallbackPlan(question) {
  const q = question.toLowerCase();
  const sites = SITE_NAMES(); const filters = [];
  for (const [name, id] of Object.entries(sites)) if (q.includes(name)) filters.push({ field: 'siteId', op: 'eq', value: id });
  const n = /(?:more than|over|>\s*|at least|older than)\s*(\d+)\s*day/.exec(q)?.[1];
  let table = 'deals';
  if (/test.?drive/.test(q)) table = 'test_drives';
  else if (/lead/.test(q)) table = 'leads';
  else if (/aged|stock|vehicle|on the lot|days of supply|unit/.test(q) && !/deal/.test(q)) table = 'vehicles';
  else if (/finance app|lender|approval/.test(q) && !/deal/.test(q)) table = 'finance_apps';
  else if (/trade/.test(q)) table = 'trade_ins';
  else if (/customer/.test(q)) table = 'customers';
  else if (/campaign/.test(q)) table = 'campaigns';
  if (/leaderboard|top sales|best sales|who sold/.test(q)) return { intent: 'leaderboard', calls: [{ tool: 'erp.kpi', name: 'leaderboard' }] };
  if (/gross|units delivered|conversion|target|kpi|how many .* (sold|delivered)/.test(q) && table === 'deals' && !/stuck|which deal/.test(q)) return { intent: 'kpi', calls: [{ tool: 'erp.kpi', name: 'overview', siteId: filters[0]?.value }] };
  if (table === 'deals') {
    const stage = OPEN_STAGES.concat(['delivered', 'lost']).find((s) => q.includes(s));
    if (stage) filters.push({ field: 'stage', op: 'eq', value: stage });
    else if (/open|stuck|pipeline/.test(q)) filters.push({ field: 'stage', op: 'in', value: OPEN_STAGES.join(',') });
    if (n) filters.push({ field: 'daysInStage', op: 'gt', value: n });
    return { intent: 'deals', calls: [{ tool: 'erp.search', table, filters, sort: '-daysInStage', limit: 15 }] };
  }
  if (table === 'vehicles') {
    filters.push({ field: 'status', op: 'in', value: 'on_lot,demo' });
    filters.push({ field: 'daysInStock', op: 'gt', value: n || '60' });
    return { intent: 'stock', calls: [{ tool: 'erp.search', table, filters, sort: '-daysInStock', limit: 15 }] };
  }
  if (table === 'leads' && n) filters.push({ field: 'daysSinceUpdate', op: 'gt', value: n });
  if (table === 'leads' && /configurator/.test(q)) filters.push({ field: 'channel', op: 'eq', value: 'configurator' });
  if (table === 'leads' && /new|uncontacted/.test(q)) filters.push({ field: 'status', op: 'eq', value: 'new' });
  return { intent: table, calls: [{ tool: 'erp.search', table, filters, limit: 15 }] };
}

async function askWithFallbackFilter(opts) {
  // /ask returns no_context when retrieval is empty even with extra_context: retry unfiltered.
  let r = await kb.askJson({ ...opts, filterExpression: SCOPES.all });
  if (SOFT_FAIL.has(r.status) || !r.json) r = await kb.askJson(opts);
  return r;
}

export async function agentQuery({ question, lang = 'en' }, user) {
  const t0 = Date.now(); const ms = {};
  let plan = null; let planner = 'arag';
  if (arag.configured()) {
    try {
      const r = await askWithFallbackFilter({
        query: question, jsonSchema: PLAN_SCHEMA(), timeoutMs: 10000, topK: 1, features: ['keyword', 'semantic'], model: PLAN_MODEL || undefined,
        system: `You plan read-only queries against the Harbourline dealership ERP. Return at most 4 tool calls that fetch exactly the rows or KPIs needed to answer the user's question. Prefer one precise erp.search with filters over many calls. Use the ERP SCHEMA in the context; for "stuck"/"waiting" questions on deals filter stage and daysInStage (or stuck=true); for ageing stock use vehicles.daysInStock with status on_lot. Do not answer the question.`,
        extraContext: [schemaSummary(), `CURRENT USER: ${user.name} (${user.role}${user.staffId ? `, staff id ${user.staffId}` : ''}${forcedSite(user) ? `, site ${user.siteId} only` : ''}). "My"/"mine" means leads.ownerId, deals.salespersonId or test_drives.staffId = ${user.staffId || 'n/a'}.`],
      });
      if (r.json && Array.isArray(r.json.calls) && r.json.calls.length) plan = r.json;
    } catch (e) { console.warn(`[dms agent] plan: ${e.message}`); }
  }
  if (!plan) { plan = fallbackPlan(question); planner = 'fallback'; }
  ms.plan = Date.now() - t0;
  const calls = plan.calls.slice(0, 4);
  const t1 = Date.now();
  const results = calls.map((c) => runTool(c, user));
  ms.tools = Date.now() - t1;

  const returned = new Map(); // "table|id" → row
  for (const r of results) for (const row of r.rows || []) { const key = row[db.TABLES[r.table].key === '_key' ? 'siteId' : db.TABLES[r.table].key]; returned.set(`${r.table}|${key}`, row); }
  // Answer context: ≤ 15 rows per call (the totals are exact), ≤ 12k chars overall.
  const resultText = results.map((r, i) => `RESULT ${i + 1} ${r.tool} ${JSON.stringify(r.args)} → ${r.error ? `error: ${r.error}` : r.rows ? `${r.total} matching row(s), showing ${Math.min(15, r.rows.length)}:\n${r.rows.slice(0, 15).map((x) => JSON.stringify(x)).join('\n')}` : JSON.stringify(r.data).slice(0, 5000)}`).join('\n\n').slice(0, 12000);

  let out = null; let answerer = 'arag';
  const t2 = Date.now();
  if (arag.configured()) {
    try {
      const r = await askWithFallbackFilter({
        query: question, jsonSchema: ANSWER_SCHEMA, timeoutMs: 11000, topK: 1, features: ['keyword', 'semantic'], model: ANSWER_MODEL || undefined,
        system: `You are the Harbourline DMS ERP agent. Answer the user's question using ONLY the ERP tool results in the context (live data as of ${ymd()}). Quote record ids (D-…, L-…, HL-…), staff and customer names, counts and amounts exactly. If the results are empty, say no records match and suggest how to widen the search. List in evidence the specific rows you relied on (table + id + why), at most 10; for a KPI result use table "kpi" and id = the KPI name. ${langLine(lang)}`,
        extraContext: [`USER ROLE: ${user.role}${forcedSite(user) ? ` (site ${user.siteId} only)` : ''}`, resultText],
      });
      if (r.json && typeof r.json.answer === 'string') out = r.json;
    } catch (e) { console.warn(`[dms agent] answer: ${e.message}`); }
  }
  ms.answer = Date.now() - t2;
  if (!out) {
    answerer = 'fallback';
    const first = results.find((r) => r.rows);
    out = {
      answer: first ? `${first.total} ${first.table.replace('_', ' ')} record(s) match${first.total > first.rows.length ? `; showing the first ${first.rows.length}` : ''}.` : results[0]?.data ? 'Here are the KPI figures.' : 'No records match.',
      evidence: (first?.rows || []).slice(0, 10).map((row) => ({ table: first.table, id: String(row[db.TABLES[first.table].key] ?? row.id), why: 'matched the filters' })),
      followups: [],
    };
  }
  for (const r of results) if (r.data) returned.set(`kpi|${r.args.name}`, null);
  const evidence = (Array.isArray(out.evidence) ? out.evidence : []).filter((e) => e && returned.has(`${e.table}|${e.id}`)).slice(0, 10).map((e) => ({ table: e.table, id: String(e.id), why: String(e.why || '').slice(0, 200), row: returned.get(`${e.table}|${e.id}`) }));
  if (!evidence.length) {
    const first = results.find((r) => r.rows?.length);
    if (first) for (const row of first.rows.slice(0, 5)) evidence.push({ table: first.table, id: String(row[db.TABLES[first.table].key] ?? row.id), why: 'returned by the ERP query', row });
  }
  const kpis = results.filter((r) => r.data).map((r) => ({ name: r.args.name, params: r.args, data: r.data }));
  if (!evidence.length) for (const k of kpis) evidence.push({ table: 'kpi', id: k.name, why: 'KPI computed for this question', row: null });
  return {
    question, lang, answer: out.answer, evidence, followups: (out.followups || []).slice(0, 3), kpis,
    plan: { intent: plan.intent || null, calls: results.map((r) => ({ tool: r.tool, args: r.args, total: r.total ?? null, error: r.error || null })) },
    path: 'two-step /ask loop (plan → server-side tools → grounded answer)', planner, answerer, ms: { ...ms, total: Date.now() - t0 },
  };
}

// ── deal summary ─────────────────────────────────────────────────────────────
const SUMMARY_SCHEMA = {
  name: 'deal_summary', description: 'Grounded deal summary with next best action and risks',
  parameters: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: '2-4 sentences: who, what vehicle, stage, money, what is outstanding' },
      nextBestAction: { type: 'object', properties: { action: { type: 'string' }, owner: { type: 'string', description: 'role or name' }, due: { type: 'string', description: 'when, e.g. today, within 48 hours' }, why: { type: 'string' } }, required: ['action', 'owner', 'due', 'why'] },
      risks: { type: 'array', items: { type: 'object', properties: { risk: { type: 'string' }, severity: { type: 'string', enum: ['low', 'medium', 'high'] }, mitigation: { type: 'string' } }, required: ['risk', 'severity', 'mitigation'] } },
      policyRefs: { type: 'array', items: { type: 'string' }, description: 'Names of the policies or manual sections relied on' },
    },
    required: ['summary', 'nextBestAction', 'risks'],
  },
};
export function dealContext(d) {
  const lead = db.get('leads', d.leadId); const cust = db.get('customers', d.customerId); const sp = db.get('staff', d.salespersonId);
  const veh = db.get('vehicles', d.stockNo); const fin = db.get('finance_apps', d.financeAppId) || db.by('finance_apps', 'dealId', d.id)[0];
  const ti = db.get('trade_ins', d.tradeInId) || db.by('trade_ins', 'dealId', d.id)[0]; const docs = db.by('documents', 'dealId', d.id);
  return { deal: d, lead, customer: cust, salesperson: sp ? { id: sp.id, name: sp.name } : null, vehicle: veh, financeApp: fin, tradeIn: ti, documents: docs.map((x) => ({ id: x.id, kind: x.kind, status: x.status, fileName: x.fileName })), daysInStage: days(lastEventAt(d)), today: ymd() };
}
function fallbackSummary(ctx) {
  const d = ctx.deal; const name = ctx.customer ? `${ctx.customer.firstName} ${ctx.customer.lastName}` : 'the customer';
  const veh = ctx.vehicle ? `${ctx.vehicle.model} ${ctx.vehicle.grade || ''} (${ctx.vehicle.stockNo})` : d.order ? `a factory order (${d.order.modelId})` : 'a vehicle';
  const NEXT = { quote: 'Follow up the quote and book a test drive or appraisal', negotiation: 'Agree price and present finance options', finance: 'Chase the lender decision and collect outstanding documents', approval: 'Confirm approval conditions with the business manager', contract: 'Get the contract signed by both parties', delivery: 'Confirm the delivery date, pre-delivery and handover', delivered: 'Book the 7-day follow-up call and first service reminder', lost: 'Record the lost reason and schedule a 90-day check-in' };
  const risks = [];
  if (ctx.daysInStage > 5 && OPEN_STAGES.includes(d.stage)) risks.push({ risk: `No activity for ${ctx.daysInStage} days in ${d.stage}`, severity: ctx.daysInStage > 10 ? 'high' : 'medium', mitigation: 'Call the customer today and log the outcome' });
  if (ctx.financeApp && ['declined', 'conditional'].includes(ctx.financeApp.status)) risks.push({ risk: `Finance ${ctx.financeApp.status} with ${ctx.financeApp.lender}`, severity: 'high', mitigation: 'Business manager to review alternatives' });
  if ((d.frontGross || 0) < 1000) risks.push({ risk: 'Thin front gross', severity: 'medium', mitigation: 'Sales manager to approve any further discount' });
  return { summary: `${name} is buying ${veh} at stage ${d.stage}, drive-away $${(d.driveAway || 0).toLocaleString('en-AU')}, gross $${(d.grossProfit || 0).toLocaleString('en-AU')}.`, nextBestAction: { action: NEXT[d.stage] || 'Review the deal', owner: d.stage === 'finance' || d.stage === 'approval' ? 'Business manager' : 'Salesperson', due: 'within 48 hours', why: `The deal is in ${d.stage}${ctx.daysInStage != null ? ` (${ctx.daysInStage} days since the last event)` : ''}.` }, risks, policyRefs: [] };
}
export async function dealSummary(d, { lang = 'en' } = {}) {
  const t0 = Date.now(); const ctx = dealContext(d);
  let out = null; let sources = []; let status = 'not_configured';
  if (arag.configured()) {
    try {
      const r = await arag.ask({
        query: `Deal in ${d.stage} stage: dealership policy and process for the next step, ${d.stage === 'finance' || d.stage === 'approval' ? 'finance approvals, ' : ''}discount approval, trade-in, documents and delivery`,
        system: `You are the Harbourline DMS deal coach. Using the deal data in the context and the dealer policies and manual retrieved, write a grounded summary, the single next best action and the main risks. Only cite policies that were retrieved; never invent thresholds. ${langLine(lang)}`,
        extraContext: [`DEAL DATA (as of ${ymd()}):\n${JSON.stringify(ctx).slice(0, 12000)}`], jsonSchema: SUMMARY_SCHEMA, filterExpression: SCOPES.all, timeoutMs: 25000, topK: 10,
      });
      status = r.status; sources = sourcesOut(r.sources);
      if (r.json && r.json.summary) out = r.json;
    } catch (e) { console.warn(`[dms summary] ${e.message}`); status = 'error'; }
  }
  const generatedBy = out ? 'arag' : 'fallback';
  return { dealId: d.id, lang, ...(out || fallbackSummary(ctx)), sources, status, generatedBy, ms: Date.now() - t0 };
}

// ── lead follow-up ───────────────────────────────────────────────────────────
const FOLLOWUP_SCHEMA = {
  name: 'lead_followup', description: 'Follow-up message to a sales lead',
  parameters: {
    type: 'object',
    properties: {
      subject: { type: 'string', description: 'Email subject (empty for SMS)' },
      body: { type: 'string' },
      promotionIds: { type: 'array', items: { type: 'string' }, description: 'Ids of the promotions mentioned (only from the list given)' },
      cta: { type: 'string', description: 'The one call to action' },
    },
    required: ['body', 'promotionIds', 'cta'],
  },
};
export function promotionsForLead(lead, configuratorPromos = []) {
  const model = lead.interest?.modelId; const t = ymd();
  const live = (p) => (p.composedBy || p.short ? true : promoStatus(p) === 'published') && (!p.endsAt || String(p.endsAt).slice(0, 10) >= t) && (!p.validUntil || p.validUntil >= t);
  const fits = (p) => { const a = p.appliesTo || {}; const ms = Array.isArray(a) ? a : a.models; return !model || !ms || !ms.length || ms.includes(model); };
  const seen = new Set(); const out = [];
  for (const p of [...configuratorPromos, ...db.all('promotions')]) if (p && p.id && !seen.has(p.id) && live(p) && fits(p)) { seen.add(p.id); out.push({ id: p.id, title: p.title, kind: p.kind, value: p.value ?? null, desc: p.desc || p.description || null, validUntil: p.validUntil || p.endsAt || null }); }
  return out.slice(0, 8);
}
export async function leadFollowup(lead, { tone = 'friendly', channel = 'email', lang = 'en', configuratorPromos = [] } = {}) {
  const t0 = Date.now();
  const ch = channel === 'sms' ? 'sms' : 'email';
  const tn = ['friendly', 'professional', 'urgent', 'warm', 'concise', 'brief'].includes(tone) ? tone : 'friendly';
  const cust = db.get('customers', lead.customerId); const owner = db.get('staff', lead.ownerId); const site = db.get('sites', lead.siteId);
  const promos = promotionsForLead(lead, configuratorPromos);
  const ctx = {
    lead: { id: lead.id, status: lead.status, channel: lead.channel, source: lead.source, createdAt: lead.createdAt, interest: lead.interest, finderAnswers: lead.finderAnswers, viewed: lead.viewed, bookingId: lead.bookingId, handover: lead.handover ? { incentive: lead.handover.incentive, answers: lead.handover.answers, whenLabel: lead.handover.whenLabel } : null },
    customer: cust ? { firstName: cust.firstName, suburb: cust.suburb } : null, salesperson: owner?.name || null, site: site ? { name: site.name, phone: site.phone } : null,
  };
  let out = null; let sources = []; let status = 'not_configured'; const warnings = [];
  if (arag.configured()) {
    try {
      const r = await arag.ask({
        query: `Follow-up ${ch} for a customer interested in ${lead.interest?.modelId || 'a Toyota'}: lead follow-up policy, contact rules and tone`,
        system: `You draft a ${tn} follow-up ${ch === 'sms' ? 'SMS (max 300 characters, no subject)' : 'email (subject + 80-150 word body)'} from the salesperson to this lead, grounded in the lead's configurator data. Mention at most one promotion and ONLY from the PROMOTIONS list (quote it exactly; never invent an offer, price or date); if the list is empty, mention no promotion. Follow the dealer's contact policy. Sign off with the salesperson's name and site. ${langLine(lang)}`,
        extraContext: [`LEAD DATA:\n${JSON.stringify(ctx)}`, `PROMOTIONS (the only ones that exist):\n${promos.length ? promos.map((p) => `- [${p.id}] ${p.title}${p.value ? ` (value $${p.value})` : ''}${p.desc ? `: ${p.desc}` : ''}${p.validUntil ? ` Valid until ${String(p.validUntil).slice(0, 10)}.` : ''}`).join('\n') : '(none)'}`],
        jsonSchema: FOLLOWUP_SCHEMA, filterExpression: SCOPES.all, timeoutMs: 25000, topK: 8,
      });
      status = r.status; sources = sourcesOut(r.sources);
      if (r.json && r.json.body) out = r.json;
    } catch (e) { console.warn(`[dms followup] ${e.message}`); status = 'error'; }
  }
  const byArag = Boolean(out);
  if (!out) {
    const name = cust?.firstName || 'there'; const model = lead.interest?.modelId || 'Toyota';
    out = { subject: ch === 'email' ? `Your ${model} at Harbourline Toyota` : '', body: `Hi ${name}, thanks for your interest in the ${model}. I'd love to help you take the next step: a test drive or a quote that suits you. Reply or call ${site?.phone || 'us'} any time. ${owner?.name || 'The Harbourline team'}, Harbourline Toyota ${site?.name || ''}`.trim(), promotionIds: [], cta: 'Book a test drive' };
  }
  const known = new Set(promos.map((p) => p.id));
  const ids = (out.promotionIds || []).filter((id) => { if (known.has(id)) return true; warnings.push(`dropped unknown promotion id ${id}`); return false; });
  let body = String(out.body || '');
  if (ch === 'sms' && body.length > 320) { body = `${body.slice(0, 317)}…`; warnings.push('SMS truncated to 320 characters'); }
  return { leadId: lead.id, channel: ch, tone: tn, lang, subject: ch === 'email' ? out.subject || '' : null, body, cta: out.cta || '', promotionIds: ids, promotionsOffered: promos, warnings, sources, status, generatedBy: byArag ? 'arag' : 'fallback', ms: Date.now() - t0 };
}

// ── documents ────────────────────────────────────────────────────────────────
const F = (name, type, description, required = false) => ({ name, type, description, required });
export const DOC_FIELDS = {
  // Field names match the seed's documents.extracted (scripts/dms-seed.mjs) so seeded and processed documents share one shape.
  contract: [F('dealNo', 'string', 'Deal number, e.g. D-10482', true), F('contractDate', 'string', 'Contract date YYYY-MM-DD', true), F('customerName', 'string', 'Buyer full name', true), F('vin', 'string', '17-character VIN', true), F('stockNo', 'string', 'Stock number HL-####'), F('vehicle', 'string', 'Year, model and grade'), F('vehiclePrice', 'number', 'Vehicle price AUD'), F('accessoriesTotal', 'number', 'Accessories total AUD'), F('discount', 'number', 'Discount AUD'), F('tradeInAllowance', 'number', 'Trade-in allowance AUD'), F('driveAway', 'number', 'Total drive-away price AUD', true), F('deposit', 'number', 'Deposit paid AUD'), F('amountFinanced', 'number', 'Amount financed AUD'), F('lender', 'string', 'Finance lender'), F('deliveryDate', 'string', 'Delivery date YYYY-MM-DD'), F('buyerSigned', 'boolean', 'Buyer signature present', true), F('dealerSigned', 'boolean', 'Dealer signature present', true)],
  trade_in_form: [F('appraisalNo', 'string', 'Appraisal number'), F('dealNo', 'string', 'Related deal number'), F('rego', 'string', 'Registration plate', true), F('state', 'string', 'Registration state'), F('vin', 'string', 'VIN', true), F('make', 'string', 'Make', true), F('model', 'string', 'Model', true), F('year', 'number', 'Year of manufacture'), F('km', 'number', 'Odometer reading km', true), F('condition', 'string', 'Condition summary', true), F('owner', 'string', 'Registered owner name', true), F('valuation', 'number', 'Appraised / offered value AUD', true), F('ownerSigned', 'boolean', 'Owner signature present')],
  supplier_invoice: [F('supplier', 'string', 'Supplier name', true), F('abn', 'string', 'Supplier ABN (11 digits)', true), F('invoiceNo', 'string', 'Invoice number', true), F('invoiceDate', 'string', 'Invoice date YYYY-MM-DD', true), F('dueDate', 'string', 'Due date YYYY-MM-DD'), F('purchaseOrder', 'string', 'Purchase order number'), F('stockNo', 'string', 'Stock number HL-#### if printed'), F('vin', 'string', 'VIN if printed'), F('lines', 'array', 'Line items', true), F('subtotal', 'number', 'Subtotal ex GST AUD'), F('gst', 'number', 'GST AUD', true), F('total', 'number', 'Total inc GST AUD', true)],
  licence: [F('name', 'string', 'Full name', true), F('licenceNo', 'string', 'Licence number', true), F('class', 'string', 'Licence class'), F('state', 'string', 'Issuing state'), F('expiry', 'string', 'Expiry YYYY-MM-DD', true), F('dateOfBirth', 'string', 'YYYY-MM-DD'), F('suburb', 'string', 'Suburb')],
  insurance: [F('insurer', 'string', 'Insurer', true), F('policyNo', 'string', 'Policy number', true), F('insured', 'string', 'Insured name', true), F('vehicle', 'string', 'Vehicle description'), F('vin', 'string', 'Vehicle VIN'), F('rego', 'string', 'Registration'), F('startDate', 'string', 'Start YYYY-MM-DD', true), F('endDate', 'string', 'End YYYY-MM-DD'), F('sumInsured', 'number', 'Sum insured AUD'), F('premium', 'number', 'Premium AUD')],
};
export const DOC_KINDS = Object.keys(DOC_FIELDS);
function docSchema(kind) {
  const props = {};
  for (const f of DOC_FIELDS[kind]) {
    const value = f.type === 'array'
      ? { type: 'array', description: f.description, items: { type: 'object', properties: { description: { type: 'string' }, qty: { type: 'number' }, unitPrice: { type: 'number' }, amount: { type: 'number' } }, required: ['description', 'amount'] } }
      : { type: f.type, description: f.description };
    props[f.name] = { type: 'object', properties: { value, confidence: { type: 'number', description: '0-1: 1 when the value is printed clearly in the document, lower when inferred or unclear, 0 when absent' } }, required: ['value', 'confidence'] };
  }
  return { name: `extract_${kind}`, description: `Fields extracted from a ${kind.replace(/_/g, ' ')} document`, parameters: { type: 'object', properties: props, required: DOC_FIELDS[kind].filter((f) => f.required).map((f) => f.name) } };
}
const normTxt = (s) => String(s ?? '').toLowerCase().replace(/[\s,$]/g, '');
const amountIn = (text, n) => { const t = text.replace(/,/g, ''); return t.includes(String(n)) || t.includes(Number(n).toFixed(2)); };
/** Compare extracted values with the ERP (where the ERP has a counterpart). */
function crossCheck(doc, kind, ex) {
  const issues = [];
  const deal = db.get('deals', doc.dealId || ex.dealNo);
  const veh = deal ? db.get('vehicles', deal.stockNo) : null; const cust = db.get('customers', doc.customerId || deal?.customerId);
  const ti = deal ? (db.get('trade_ins', deal.tradeInId) || db.by('trade_ins', 'dealId', deal.id)[0]) : null;
  const neq = (field, erp, cmp = (a, b) => normTxt(a) === normTxt(b)) => { if (ex[field] != null && ex[field] !== '' && erp != null && !cmp(ex[field], erp)) issues.push({ field, reason: 'does not match the ERP', extracted: ex[field], erp }); };
  if (kind === 'contract') {
    if (doc.dealId) neq('dealNo', doc.dealId);
    if (veh) neq('vin', veh.vin);
    if (cust) neq('customerName', `${cust.firstName} ${cust.lastName}`);
    if (deal) neq('driveAway', deal.driveAway, (a, b) => Math.abs(Number(a) - Number(b)) < 1);
    for (const s of ['buyerSigned', 'dealerSigned']) if (ex[s] === false) issues.push({ field: s, reason: 'signature missing' });
  }
  if (kind === 'trade_in_form' && ti) { neq('rego', ti.rego); neq('km', ti.km, (a, b) => Math.abs(Number(a) - Number(b)) <= 100); neq('year', ti.year, (a, b) => Number(a) === Number(b)); }
  if (kind === 'trade_in_form' && ex.ownerSigned === false) issues.push({ field: 'ownerSigned', reason: 'signature missing' });
  if (kind === 'supplier_invoice') {
    if (ex.total != null && ex.gst != null && Math.abs(Number(ex.total) / 11 - Number(ex.gst)) > 1) issues.push({ field: 'gst', reason: 'GST is not 1/11 of the total', extracted: ex.gst, expected: Math.round(Number(ex.total) / 11 * 100) / 100 });
    if (Array.isArray(ex.lines) && ex.lines.length && ex.subtotal != null) { const s = ex.lines.reduce((n, l) => n + (Number(l.amount) || 0), 0); if (Math.abs(s - Number(ex.subtotal)) > 1 && Math.abs(s - Number(ex.total)) > 1) issues.push({ field: 'lines', reason: 'line amounts do not add up to the subtotal or total', extracted: s, expected: ex.subtotal }); }
    if (ex.abn && String(ex.abn).replace(/\D/g, '').length !== 11) issues.push({ field: 'abn', reason: 'ABN is not 11 digits', extracted: ex.abn });
  }
  if (kind === 'licence' && ex.expiry && String(ex.expiry) < ymd()) issues.push({ field: 'expiry', reason: 'licence has expired', extracted: ex.expiry });
  if (kind === 'insurance' && veh) neq('vin', veh.vin);
  return issues;
}
/** Run extraction for an uploaded/processed resource. */
export async function extract(doc, rid) {
  const kind = doc.kind;
  const r = await kb.askJson({
    query: `Extract the fields of this ${kind.replace(/_/g, ' ')} document`, jsonSchema: docSchema(kind),
    filterExpression: { field: { prop: 'resource', id: rid } }, ragStrategies: [{ name: 'full_resource' }], timeoutMs: 30000,
    system: 'Extract values exactly as printed in the document. Dates as YYYY-MM-DD, money as plain numbers without $ or commas. If a field is absent, return an empty string (or 0 / false) with confidence 0. Signatures: true only when a signature or signed mark is present.',
  });
  const text = await kb.extractedText(rid);
  const extracted = {}; const confidence = {}; const verifyFields = [];
  for (const f of DOC_FIELDS[kind]) {
    const cell = r.json?.[f.name];
    let v = cell && typeof cell === 'object' && 'value' in cell ? cell.value : cell;
    let c = cell && typeof cell === 'object' && typeof cell.confidence === 'number' ? Math.max(0, Math.min(1, cell.confidence)) : (v != null && v !== '' ? 0.6 : 0);
    if (v === '' || (f.type === 'number' && (v === 0 || v == null) && c === 0)) v = null;
    // Grounding check against the document's extracted text.
    if (v != null && text && f.type !== 'boolean' && f.type !== 'array') {
      const found = f.type === 'number' ? amountIn(text, v) : normTxt(text).includes(normTxt(v));
      c = found ? Math.max(c, 0.9) : Math.min(c, 0.6);
    }
    extracted[f.name] = v; confidence[f.name] = Math.round(c * 100) / 100;
    if (v == null && f.required) verifyFields.push({ field: f.name, reason: 'required field not found' });
    else if (v != null && c < 0.85) verifyFields.push({ field: f.name, reason: `low confidence (${confidence[f.name]})`, extracted: v });
  }
  if (kind === 'contract') extracted.signaturesPresent = { customer: extracted.buyerSigned ?? null, dealer: extracted.dealerSigned ?? null };
  for (const i of crossCheck(doc, kind, extracted)) if (!verifyFields.some((x) => x.field === i.field && x.reason === i.reason)) verifyFields.push(i);
  return { extracted, confidence, verifyFields, status: r.status, textChars: text.length };
}

// ── search ───────────────────────────────────────────────────────────────────
const ERP_SEARCH = [['customers', (r) => `${r.firstName} ${r.lastName}`, (r) => [r.email, r.phone, r.suburb, r.notes].filter(Boolean).join(' · ')],
  ['leads', (r) => `${r.id} · ${r.interest?.modelId || ''} · ${r.status}`, (r) => `${r.channel || ''} ${r.source || ''}`],
  ['deals', (r) => `${r.id} · ${r.stage}`, (r) => (r.events || []).slice(-1).map((e) => e.note).join(' ')],
  ['vehicles', (r) => `${r.stockNo} · ${r.model} ${r.grade || ''}`, (r) => `${r.status} · ${r.siteId} · ${r.vin}`],
  ['documents', (r) => `${r.id} · ${r.fileName}`, (r) => `${r.kind} · ${r.status}`]];
export async function search(q, user, { limit = 30 } = {}) {
  const t0 = Date.now();
  const erp = [];
  for (const [table, title, snip] of ERP_SEARCH) {
    if (!user.caps.includes(`${table}.read`)) continue;
    const sc = scopeFor(user, table);
    const hits = db.list(table, { q, where: sc, pageSize: 8, sort: db.TABLES[table].date ? `-${db.TABLES[table].date}` : undefined }).items;
    for (const r of hits) erp.push({ source: 'erp', label: table, table, id: String(r[db.TABLES[table].key]), title: title(r), snippet: snip(r).slice(0, 240) });
  }
  let kbHits = []; let kbError = null;
  if (arag.configured()) {
    try {
      const hits = await arag.find({ query: q, topK: 15, filterExpression: { field: { or: [topic('manual'), topic('policy'), topic('document')] } } });
      const seen = new Set();
      kbHits = hits.filter((h) => h.text && !seen.has(h.resourceId) && seen.add(h.resourceId)).map((h) => ({ source: 'kb', label: (h.topic || []).find((t) => ['manual', 'policy', 'document'].includes(t)) || (h.topic || [])[0] || 'kb', resourceId: h.resourceId, title: h.title, snippet: h.text.slice(0, 300), score: Math.round((h.score || 0) * 1e4) / 1e4 }));
    } catch (e) { kbError = e.message; }
  }
  const merged = []; for (let i = 0; merged.length < limit && (i < kbHits.length || i < erp.length); i++) { if (kbHits[i]) merged.push(kbHits[i]); if (erp[i] && merged.length < limit) merged.push(erp[i]); }
  return { q, items: merged, kb: kbHits.length, erp: erp.length, ...(kbError ? { kbError: 'knowledge search unavailable' } : {}), ms: Date.now() - t0 };
}

// ── status ───────────────────────────────────────────────────────────────────
export async function status() {
  let counts = null; let error = null;
  if (arag.configured()) { try { counts = await kb.topicCounts(); } catch (e) { error = e.message; } }
  return {
    configured: arag.configured(), kbId: arag.KB_ID || null, zone: arag.ZONE,
    resources: counts?.resources ?? null, paragraphs: counts?.paragraphs ?? null, byTopic: counts?.byTopic || {},
    dms: { manual: counts?.byTopic?.manual || 0, policy: counts?.byTopic?.policy || 0, document: counts?.byTopic?.document || 0 },
    scopes: { manual: 'label topic/manual (excl. topic/document)', policy: 'label topic/policy (excl. topic/document)', all: 'topic/manual OR topic/policy (excl. topic/document)', search: 'topic/manual OR topic/policy OR topic/document' },
    agents: {
      erpAgent: { id: null, kind: 'server-side two-step /ask loop (server/dms/ai.mjs)', tools: ['erp.search(table, filters, limit)', 'erp.kpi(name, params)', 'erp.get(table, id)'], maxToolCalls: 4, note: 'No KB context agent calls back into the DMS API (lead decision); the plan and answer steps are /ask calls with answer_json_schema.' },
      retrievalAgent: { id: process.env.ARAG_AGENT_ID || null, name: 'harbourline-stock-agent', usedBy: 'configurator (ARAG dashboard / widget); not used by the DMS' },
    },
    mcp: { url: kb.MCP_URL, pattern: kb.MCP_PATTERN, note: 'Connect Claude / Cursor to this KB over MCP with a KB service-account key (not issued by this app).' },
    ...(error ? { error: 'knowledge box unreachable' } : {}),
  };
}
