// mcp-core.mjs — turns the DMS's own OpenAPI document into a fully wired MCP server.
// Mirrors maintenanceOS packages/mcp-core (openapi → toolName → inputSchema → dispatch,
// resources, prompts). Shared by the Streamable-HTTP endpoint (server/dms/mcp.mjs,
// POST /dms/mcp) and the stdio binary (scripts/dms-mcp-stdio.mjs).
//
// Tools are NOT hand-curated: one tool per OpenAPI operation, excluding
//   • DELETE operations (irreversible)
//   • POST /auth/login and /auth/logout (the agent is already authenticated)
//   • POST /documents (base64 file upload, not a sensible tool argument)
//   • operations whose 2xx response is not JSON (CSV exports, the HTML docs page)
//   • GET /openapi.json (exposed as the resource harbourline-dms://openapi instead)
// Every call dispatches to the REST API (loopback fetch or an injected client) with the
// caller's bearer token, so auth, RBAC, scoping and validation apply exactly as for REST.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

export const SERVER_NAME = 'harbourline-dms';
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const EXCLUDE = new Set(['POST /auth/login', 'POST /auth/logout', 'POST /documents', 'GET /openapi.json']);
const NON_JSON = ['text/csv', 'text/html', 'application/pdf', 'application/octet-stream'];

// ── openapi → operations ─────────────────────────────────────────────────────
export function listOperations(spec) {
  const out = [];
  for (const [path, methods] of Object.entries(spec.paths || {})) {
    for (const m of METHODS) {
      const raw = methods[m]; if (!raw) continue;
      const method = m.toUpperCase();
      if (method === 'DELETE' || EXCLUDE.has(`${method} ${path}`)) continue;
      const ok = Object.entries(raw.responses || {}).filter(([c]) => c.startsWith('2')).flatMap(([, r]) => Object.keys(r.content || {}));
      if (ok.some((ct) => NON_JSON.includes(ct))) continue;
      const params = raw.parameters || [];
      const body = raw.requestBody?.content?.['application/json']?.schema;
      out.push({ method, path, tag: raw.tags?.[0], summary: raw.summary, description: raw.description, pathParams: params.filter((p) => p.in === 'path'), queryParams: params.filter((p) => p.in === 'query' && p.name !== 'token'), bodySchema: body, bodyRequired: Boolean(raw.requestBody?.required) });
    }
  }
  return out;
}

// ── naming: <tag>_<verb>_<resource>, or <tag>_<action> for action endpoints ──
//   GET  /leads               Leads      → leads_list_leads
//   GET  /deals/{id}          Deals      → deals_get_deals
//   POST /deals/{id}/events   Deals      → deals_create_events
//   PATCH /leads/{id}         Leads      → leads_patch_leads
//   POST /promotions/compose  Promotions → promotions_compose
//   POST /documents/{id}/process         → documents_process
// An "action" is a last path segment that is a verb (ACTIONS); any other trailing
// noun is a sub-resource and gets the HTTP verb (unlike the reference's positional rule,
// so POST /deals/{id}/events reads deals_create_events).
const ACTIONS = new Set(['hold', 'transfer', 'compose', 'publish', 'unpublish', 'process', 'verify', 'summary', 'followup', 'query', 'ask', 'recompute-signals', 'login', 'logout']);
const snake = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
export function toolNameFor(method, path, tag) {
  const seg = path.split('/').filter(Boolean);
  const last = seg[seg.length - 1] || 'root';
  const tagPart = snake(tag || seg[0] || 'api');
  if (!last.startsWith('{') && ACTIONS.has(last)) return `${tagPart}_${snake(last)}`;
  const resource = seg.filter((s) => !s.startsWith('{')).pop() || 'root';
  const verb = method === 'GET' ? (last.startsWith('{') ? 'get' : 'list') : method === 'POST' ? 'create' : method === 'PUT' ? 'update' : method === 'PATCH' ? 'patch' : method.toLowerCase();
  return `${tagPart}_${verb}_${snake(resource.replace(/\.json$/, ''))}`;
}

// ── input schema: {path, query, body} ────────────────────────────────────────
function objectFromParams(params) {
  if (!params.length) return undefined;
  const properties = {}; const required = [];
  for (const p of params) { properties[p.name] = { ...(p.schema || { type: 'string' }), ...(p.description ? { description: p.description } : {}) }; if (p.required) required.push(p.name); }
  return { type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: true };
}
export function buildInputSchema(op) {
  const path = objectFromParams(op.pathParams); const query = objectFromParams(op.queryParams);
  const properties = {}; const required = [];
  if (path) { properties.path = { ...path, additionalProperties: false }; required.push('path'); }
  if (query) properties.query = { ...query, description: 'Query parameters. Lists also accept any column name as an equality filter (comma = any of).' };
  if (op.bodySchema) { properties.body = op.bodySchema; if (op.bodyRequired) required.push('body'); }
  return { type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: false };
}

/** The deterministic, de-duplicated catalogue: [{name, op}]. */
export function catalogue(spec) {
  const taken = new Set();
  return listOperations(spec).map((op) => {
    const base = toolNameFor(op.method, op.path, op.tag); let name = base; let i = 2;
    while (taken.has(name)) name = `${base}_${i++}`;
    taken.add(name);
    return { name, op };
  });
}

// ── dispatch ─────────────────────────────────────────────────────────────────
/** ApiClient: ({method, url (relative to /dms/api), body, headers}) → {status, headers, text}. */
export function fetchApiClient(apiRoot) {
  const base = apiRoot.replace(/\/$/, '');
  return async ({ method, url, body, headers }) => {
    const res = await fetch(base + url, { method, body, headers, signal: AbortSignal.timeout(90000) });
    const h = {}; res.headers.forEach((v, k) => { h[k] = v; });
    return { status: res.status, headers: h, text: await res.text() };
  };
}
function fillPath(tpl, params) {
  return tpl.replace(/\{([^}]+)\}/g, (_, n) => { const v = params?.[n]; if (v == null || v === '') throw new Error(`Missing path param: ${n}`); return encodeURIComponent(String(v)); });
}
function buildQuery(q) {
  if (!q) return '';
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null) usp.append(k, Array.isArray(v) ? v.join(',') : String(v));
  const s = usp.toString(); return s ? `?${s}` : '';
}
export async function dispatchOperation(op, args, apiClient, token) {
  let url;
  try { url = fillPath(op.path, args?.path) + buildQuery(args?.query); }
  catch (e) { return { isError: true, content: [{ type: 'text', text: e.message }] }; }
  const headers = { 'content-type': 'application/json', accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const body = op.method !== 'GET' ? JSON.stringify(args?.body ?? {}) : undefined;
  let res;
  try { res = await apiClient({ method: op.method, url, body, headers }); }
  catch (e) { return { isError: true, content: [{ type: 'text', text: `API unreachable: ${e.message}` }] }; }
  const ct = res.headers['content-type'] || '';
  const payload = ct.includes('application/json') ? res.text : JSON.stringify({ body: res.text, contentType: ct });
  if (res.status >= 200 && res.status < 300) return { content: [{ type: 'text', text: payload }] };
  return { isError: true, content: [{ type: 'text', text: `[HTTP ${res.status}] ${payload}` }] };
}

// ── resources ────────────────────────────────────────────────────────────────
export const SCHEME = 'harbourline-dms';
export const FIXED_RESOURCES = [
  { uri: `${SCHEME}://openapi`, name: 'Harbourline DMS OpenAPI spec', description: 'The OpenAPI 3.0 document of every DMS REST endpoint (the source of the tool catalogue).', mimeType: 'application/json', api: '/openapi.json' },
  { uri: `${SCHEME}://dashboard`, name: 'Sales dashboard (live KPIs)', description: 'Month-to-date units delivered, gross, conversion, test-drive rate, days to close, aged stock, days of supply, pipeline and target attainment (scoped to the caller).', mimeType: 'application/json', api: '/kpi/overview' },
  { uri: `${SCHEME}://domo/signals`, name: 'Domo dealer signals', description: 'dealer_signals per model plus derived dealer priorities and move priorities.', mimeType: 'application/json', api: '/domo/signals' },
];
export const RESOURCE_TEMPLATES = [
  { uriTemplate: `${SCHEME}://deal/{id}`, name: 'Deal detail', description: 'A deal with customer, lead, vehicle, finance application, trade-in, documents and timeline.', mimeType: 'application/json', api: '/deals/{id}' },
  { uriTemplate: `${SCHEME}://lead/{id}`, name: 'Lead detail', description: 'A lead with customer, owner, test drives, deals and the configurator booking / handover.', mimeType: 'application/json', api: '/leads/{id}' },
  { uriTemplate: `${SCHEME}://customer/{id}`, name: 'Customer detail', description: 'A customer with leads, deals, test drives, trade-ins and documents.', mimeType: 'application/json', api: '/customers/{id}' },
  { uriTemplate: `${SCHEME}://stock/{stockNo}`, name: 'Stock unit', description: 'A vehicle by stock number (or VIN) with its deal and the model\'s Domo signal.', mimeType: 'application/json', api: '/vehicles/{stockNo}' },
];
export async function readResource(uri, apiClient, token) {
  let api = FIXED_RESOURCES.find((r) => r.uri === uri)?.api;
  if (!api) {
    for (const t of RESOURCE_TEMPLATES) {
      const re = new RegExp(`^${t.uriTemplate.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/, '([^/]+)')}$`);
      const m = re.exec(uri);
      if (m) { api = t.api.replace(/\{[^}]+\}/, encodeURIComponent(decodeURIComponent(m[1]))); break; }
    }
  }
  if (!api) throw new Error(`Unknown resource URI: ${uri}`);
  const res = await apiClient({ method: 'GET', url: api, headers: token ? { authorization: `Bearer ${token}`, accept: 'application/json' } : { accept: 'application/json' } });
  if (res.status >= 400) throw new Error(`Resource read failed (${res.status}): ${res.text.slice(0, 300)}`);
  return { uri, mimeType: 'application/json', text: res.text };
}

// ── prompts ──────────────────────────────────────────────────────────────────
export const PROMPTS = [
  {
    name: 'triage-lead', description: 'Assess a lead (configurator first-party data, history, score) and recommend the next action and a follow-up draft.',
    arguments: [{ name: 'leadId', description: 'Lead id, e.g. L-105208.', required: true }],
    render: ({ leadId }) => [`Triage lead \`${leadId}\`.`, '',
      `1. Read \`${SCHEME}://lead/${leadId}\` (finder answers, viewed cars, booking, handover, status history).`,
      '2. If a customer is linked, read the customer resource; check stock for the model of interest with `stock_list_vehicles` (query model=<modelId>, status=on_lot).',
      '3. Classify the lead (hot / warm / cold) with the evidence, and recommend ONE next action (call, SMS, book a test drive, quote, reassign).',
      '4. Draft the follow-up with `leads_followup` (channel sms or email). Do not change the lead status without confirmation; propose the exact `leads_patch_leads` call instead.'].join('\n'),
  },
  {
    name: 'prep-test-drive', description: 'Prepare the salesperson for a booked test drive from the configurator handover sheet.',
    arguments: [{ name: 'bookingId', description: 'Test-drive / booking id, e.g. TD-7K2QX.', required: true }],
    render: ({ bookingId }) => [`Prepare for test drive \`${bookingId}\`.`, '',
      `1. Call \`test_drives_get_test_drives\` with path.id = ${bookingId} for the handover (questions, answers, incentive, unit).`,
      '2. Read the linked lead resource and the stock unit resource (if a stock number is set): age, headroom, packs fitted.',
      '3. Use `assistant_ask` (scope policy) for anything about test-drive, licence or incentive rules.',
      '4. Output a one-page prep sheet: who is coming, what they care about (from their answers), the car to have ready, talking points, the incentive and its conditions, and two questions to ask.'].join('\n'),
  },
  {
    name: 'daily-sales-briefing', description: 'Morning briefing: month-to-date vs target, pipeline, stuck deals, aged stock, new configurator leads.',
    arguments: [{ name: 'siteId', description: 'Optional site id (par, hor, pen, liv); all sites when omitted.', required: false }],
    render: ({ siteId }) => [`Produce today's sales briefing${siteId ? ` for site ${siteId}` : ' for the dealer group'}.`, '',
      `- \`${SCHEME}://dashboard\` or \`kpi_list_overview\`${siteId ? ` (query.siteId=${siteId})` : ''} for units, gross, conversion and target attainment`,
      `- \`kpi_list_leaderboard\` for who is ahead and behind`,
      `- \`deals_list_deals\` (query.status=finance,approval,contract${siteId ? `, siteId=${siteId}` : ''}) and \`assistant_query\` "which deals are stuck" for stalled deals`,
      `- \`stock_list_vehicles\` (query.aged=1) and \`${SCHEME}://domo/signals\` for aged stock and move priorities`,
      '- `leads_list_leads` (query.channel=configurator, status=new) for fresh configurator leads',
      '', 'Output 6-10 bullets ordered by priority with deal / lead / stock numbers and a concrete action and owner for each.'].join('\n'),
  },
  {
    name: 'stuck-deals-review', description: 'Find deals stuck past the stage limits and propose the unblocking action for each.',
    arguments: [{ name: 'siteId', description: 'Optional site id (par, hor, pen, liv).', required: false }],
    render: ({ siteId }) => [`Review stuck deals${siteId ? ` at site ${siteId}` : ''}.`, '',
      '1. Stage limits (DMS manual): quote 7, negotiation 5, finance 5, approval 2, contract 3, delivery 10 days.',
      `2. Ask \`assistant_query\`: "Which deals are stuck${siteId ? ` at ${siteId}` : ''} and why?" and/or list \`deals_list_deals\` per open stage.`,
      `3. For each stuck deal read \`${SCHEME}://deal/{id}\` and call \`deals_summary\` for the next best action and risks.`,
      '4. Output a table: deal, stage, days in stage, blocker, next action, owner. Propose (do not execute) a `deals_create_events` note for each.'].join('\n'),
  },
  {
    name: 'compose-promotions-review', description: 'Recompose promotions from Domo targets with ARAG and review them before publishing.',
    arguments: [],
    render: () => ['Review this week\'s promotions.', '',
      `1. Read \`${SCHEME}://domo/signals\` (days of supply, target gaps, aged units, headroom).`,
      '2. Call `promotions_compose` to recompose promotions (Domo targets → ARAG copy, validated against the catalogue).',
      '3. For each draft check: the value is within headroom and policy (`assistant_ask` scope policy, incentive approval), the copy never mentions age, margin or targets, and the dates are sensible.',
      '4. Recommend publish / hold for each with a reason. Only call `promotions_publish` after the user confirms.'].join('\n'),
  },
];

// ── server ───────────────────────────────────────────────────────────────────
/** Build a low-level MCP Server wired to the catalogue, resources and prompts. */
export function createServer({ spec, apiClient, bearerToken, version = '1.0.0' }) {
  const server = new Server({ name: SERVER_NAME, version }, { capabilities: { tools: {}, resources: { subscribe: false, listChanged: false }, prompts: { listChanged: false } } });
  const tools = catalogue(spec);
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(({ name, op }) => ({ name, description: [op.summary, op.description].filter(Boolean).join(' — ') || `${op.method} ${op.path}`, inputSchema: buildInputSchema(op) })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const t = tools.find((x) => x.name === req.params.name);
    if (!t) return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }] };
    return dispatchOperation(t.op, req.params.arguments || {}, apiClient, bearerToken);
  });
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: FIXED_RESOURCES.map(({ api, ...r }) => r) }));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: RESOURCE_TEMPLATES.map(({ api, ...r }) => r) }));
  server.setRequestHandler(ReadResourceRequestSchema, async (req) => ({ contents: [await readResource(req.params.uri, apiClient, bearerToken)] }));
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: PROMPTS.map(({ render, ...p }) => p) }));
  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    const p = PROMPTS.find((x) => x.name === req.params.name);
    if (!p) throw new Error(`Unknown prompt: ${req.params.name}`);
    for (const a of p.arguments) if (a.required && !req.params.arguments?.[a.name]) throw new Error(`Missing argument: ${a.name}`);
    return { description: p.description, messages: [{ role: 'user', content: { type: 'text', text: p.render(req.params.arguments || {}) } }] };
  });
  return { server, tools };
}
