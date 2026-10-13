#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// provision.mjs — everything on the ARAG side AFTER the Knowledge Box exists.
// Idempotent: safe to re-run.
//
//   node scripts/create-kb.mjs --title harbourline-toyota-configurator --slug harbourline-toyota-configurator
//                                   (vendored from arag-demo-factory; KB + SOWNER service token)
//   node scripts/provision.mjs      (this file)
//
// What it does
//   1. Labelsets on the KB: `model` (Toyota model ids + `all`) and `topic`.
//   2. Saved search configurations (grounded-hybrid / semantic-broad), same shapes
//      as arag-demo-factory/scripts/create-retrieval.mjs.
//   3. A Retrieval Agent ("harbourline-stock-agent", a mode:"agent" KB) wired as:
//        drivers:   nucliadb  → this KB (the Toyota corpus)
//        context:   ask       → the KB driver            (knowledge)
//                   http      → GET {PUBLIC_URL}/api/stock?q=<question>
//                               (REST context agent = "Domo through the agent")
//        generation: summarize, with a grounded dealership prompt
//        rules:      grounding + language rules
//      The agent is created once (ARAG_AGENT_ID written to .env) and a SOWNER
//      service token is minted for it (ARAG_AGENT_KEY). VERIFIED: the agent-config
//      API on the dp host accepts that agent-scoped service token via
//      X-NUCLIA-SERVICEACCOUNT — no PAT needed. The account NUA key is REFUSED
//      there ("NuaKeyUser cannot access context of type NucliaArag").
//
// Reads .env: NUCLIA_NUA_KEY, NUCLIA_ACCOUNT, ARAG_ZONE|NUCLIA_ZONE, ARAG_KB_ID,
// ARAG_API_KEY. Never prints secret values. Zero dependencies, Node 20+.
// ─────────────────────────────────────────────────────────────────────────────
import { readEnv, writeEnvVars, clean, kbCoords } from './lib-env.mjs';

const PUBLIC_URL = process.env.PUBLIC_URL || 'https://harbourline-configurator.fly.dev';

export const MODEL_LABELS = ['yaris-cross', 'corolla', 'corolla-cross', 'c-hr', 'camry', 'rav4', 'kluger', 'prado',
  'landcruiser-300', 'fortuner', 'hilux', 'bz4x', 'gr-yaris', 'gr-corolla', 'gr86', 'all'];
export const TOPIC_LABELS = ['specs', 'grades', 'towing', 'accessories', 'pricing', 'warranty', 'service', 'finance',
  'safety', 'dealer-policy', 'dates'];

const env = readEnv();
const { zone, kbId, token, kbUrl } = kbCoords(env);
if (!kbId || !token) { console.error('  ✗ ARAG_KB_ID / ARAG_API_KEY missing — run scripts/create-kb.mjs first.'); process.exit(1); }
const KBH = { 'X-NUCLIA-SERVICEACCOUNT': `Bearer ${token}`, 'Content-Type': 'application/json' };
const ZONE_API = `https://${zone}.rag.progress.cloud/api/v1`;
const DP_API = `https://${zone}.dp.progress.cloud/api/v1`;

async function call(url, { method = 'GET', headers, body } = {}) {
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { ok: res.ok, status: res.status, json };
}

// ── 1. labelsets ─────────────────────────────────────────────────────────────
async function labelsets() {
  console.log('\n  Labelsets');
  for (const [id, labels, color] of [['model', MODEL_LABELS, '#e2001a'], ['topic', TOPIC_LABELS, '#22d3ee']]) {
    const r = await call(`${kbUrl}/labelset/${id}`, {
      method: 'POST', headers: KBH,
      body: { title: id, color, multiple: true, kind: ['RESOURCES'], labels: labels.map((title) => ({ title })) },
    });
    console.log(`   ${r.ok ? '✓' : '✗'} ${id.padEnd(6)} ${labels.length} labels [${r.status}]`);
  }
}

// ── 2. search configurations (dp host, SOWNER) ───────────────────────────────
async function searchConfigs() {
  console.log('\n  Search configurations');
  const dp = kbUrl.replace('.rag.progress.cloud', '.dp.progress.cloud');
  for (const c of [
    { name: 'grounded-hybrid', kind: 'find', config: { features: ['keyword', 'semantic'], reranker: 'predict' } },
    { name: 'semantic-broad', kind: 'find', config: { features: ['semantic'], reranker: 'predict' } },
  ]) {
    let r = await call(`${dp}/search_configurations/${c.name}`, { method: 'POST', headers: KBH, body: { kind: c.kind, config: c.config } });
    if (r.status === 409) r = await call(`${dp}/search_configurations/${c.name}`, { method: 'PATCH', headers: KBH, body: { kind: c.kind, config: c.config } });
    console.log(`   ${r.ok ? '✓' : '✗'} ${c.name} [${r.status}]`);
  }
}

// ── 3. retrieval agent ───────────────────────────────────────────────────────
const SUMMARIZE_PROMPT = `You are the Harbourline Toyota (Parramatta, NSW) product consultant.
Answer ONLY from the retrieved context: the Toyota knowledge base (specs, grades, towing, pricing, warranty, service, finance, dealer policy) and the live stock feed from the dealership's DMS / Domo (units, sites, ages, incentives, inbound ETAs).
- Reply in the language of the user's question.
- Quote unit ids (e.g. HL-2231), sites and day counts exactly as they appear in the stock feed; never invent a unit, price or date.
- Prices are drive-away estimates unless the source says otherwise; say so.
- If the context does not cover something, say you will confirm with the sales team rather than guessing.
- Be concise and consultative: 2-5 sentences, then one suggested next step.`;

async function agent() {
  console.log('\n  Retrieval agent');
  let agentId = env.ARAG_AGENT_ID;
  let agentKey = clean(env.ARAG_AGENT_KEY);
  const NUA = { Authorization: `Bearer ${clean(env.NUCLIA_NUA_KEY)}`, 'Content-Type': 'application/json' };
  if (!agentId) {
    const r = await call(`${ZONE_API}/account/${env.NUCLIA_ACCOUNT}/kbs`, {
      method: 'POST', headers: NUA,
      body: { title: 'harbourline-stock-agent', slug: 'harbourline-stock-agent', zone, mode: 'agent' },
    });
    if (!r.ok) { console.log(`   ✗ agent create [${r.status}]`); return; }
    agentId = r.json.id; writeEnvVars({ ARAG_AGENT_ID: agentId });
    console.log(`   ✓ agent created ${agentId}`);
  }
  if (!agentKey) {
    const sa = await call(`${ZONE_API}/account/${env.NUCLIA_ACCOUNT}/kb/${agentId}/service_accounts`, { method: 'POST', headers: NUA, body: { title: 'harbourline-agent-owner', role: 'SOWNER' } });
    const k = sa.ok && await call(`${ZONE_API}/account/${env.NUCLIA_ACCOUNT}/kb/${agentId}/service_account/${sa.json.id}/keys`, { method: 'POST', headers: NUA, body: { expires: Math.floor(Date.now() / 1000) + 1080 * 86400 } });
    agentKey = k && k.ok && (k.json.token || k.json.key);
    if (!agentKey) { console.log('   ✗ could not mint agent service token'); return; }
    writeEnvVars({ ARAG_AGENT_KEY: agentKey });
    console.log('   ✓ agent service token minted (written to .env)');
  }
  const A = `${DP_API}/agent/${agentId}`;
  const AH = { 'X-NUCLIA-SERVICEACCOUNT': `Bearer ${agentKey}`, 'Content-Type': 'application/json' };

  // driver: the Toyota KB
  const drivers = (await call(`${A}/drivers`, { headers: AH })).json || [];
  const kbDriver = drivers.map((d) => d.config || d).find((d) => d.identifier === 'harbourline-kb');
  const driverBody = {
    identifier: 'harbourline-kb', name: 'Harbourline Toyota knowledge', provider: 'nucliadb',
    config: {
      url: `https://${zone}.rag.progress.cloud/api`, manager: `https://${zone}.dp.progress.cloud/api`,
      kbid: kbId, key: token,
      description: 'Toyota Australia model knowledge for the Harbourline dealership: specs, grades, towing, accessories, pricing, warranty, service, finance, safety, dealer policy and key dates.',
    },
  };
  let r = kbDriver
    ? await call(`${A}/driver/${kbDriver.id}`, { method: 'PATCH', headers: AH, body: { ...driverBody, id: kbDriver.id } })
    : await call(`${A}/drivers`, { method: 'POST', headers: AH, body: driverBody });
  console.log(`   ${r.ok ? '✓' : '✗'} driver nucliadb → KB [${r.status}]${r.ok ? '' : ' ' + JSON.stringify(r.json).slice(0, 200)}`);

  // context agents
  const ctx = (await call(`${A}/context`, { headers: AH })).json || [];
  const upsertCtx = async (title, body) => {
    const existing = ctx.find((c) => c.title === title || (c.module === body.module && body.module === 'http'));
    let res;
    if (existing) res = await call(`${A}/context/${existing.id}`, { method: 'PATCH', headers: AH, body: { ...existing, ...body, title } });
    else {
      res = await call(`${A}/context`, { method: 'POST', headers: AH, body: { ...body, title } });
      if (res.ok && res.json.id) {
        const full = (await call(`${A}/context/${res.json.id}`, { headers: AH })).json;
        if (full && typeof full === 'object') await call(`${A}/context/${res.json.id}`, { method: 'PATCH', headers: AH, body: { ...full, ...body, title } });
      }
    }
    console.log(`   ${res.ok ? '✓' : '✗'} context ${body.module.padEnd(5)} "${title}" [${res.status}]${res.ok ? '' : ' ' + JSON.stringify(res.json).slice(0, 200)}`);
  };
  // ai_parameter_search off: its LLM-chosen graph filters produced invalid fuzzy matches ("RA") in testing.
  await upsertCtx('Toyota knowledge base', { module: 'ask', sources: ['harbourline-kb'], ai_parameter_search: false, top_k: 15 });
  await upsertCtx('Domo stock feed (Harbourline DMS)', {
    module: 'http', method: 'GET', url: `${PUBLIC_URL}/api/stock`, question_query_param: 'q', timeout: 15,
  });

  // generation
  const gen = (await call(`${A}/generation`, { headers: AH })).json || [];
  const g = gen.find((x) => x.module === 'summarize');
  r = g
    ? await call(`${A}/generation/${g.id}`, { method: 'PATCH', headers: AH, body: { ...g, system_prompt: SUMMARIZE_PROMPT } })
    : await call(`${A}/generation`, { method: 'POST', headers: AH, body: { module: 'summarize', system_prompt: SUMMARIZE_PROMPT } });
  console.log(`   ${r.ok ? '✓' : '✗'} generation summarize [${r.status}]${r.ok ? '' : ' ' + JSON.stringify(r.json).slice(0, 200)}`);

  r = await call(`${A}/rules`, { method: 'POST', headers: AH, body: { rules: [
    'Answer in the language the customer used.',
    'Only state stock facts (unit ids, sites, ages, incentives, ETAs) that appear in the Domo stock feed context.',
    'Never invent prices, dates or availability; offer to confirm with the sales team instead.',
  ] } });
  console.log(`   ${r.ok ? '✓' : '✗'} rules [${r.status}]`);
  console.log(`\n   Agent dashboard: https://rag.progress.cloud/ (Retrieval agents → harbourline-stock-agent)`);
}

const only = process.argv[2];
if (!only || only === 'labelsets') await labelsets();
if (!only || only === 'search') await searchConfigs();
if (!only || only === 'agent') await agent();
console.log('');
