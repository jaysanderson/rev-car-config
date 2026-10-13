// arag.mjs — server-side Progress Agentic RAG (Nuclia) client.
//
// The KB service-account token lives only here (process env) and is sent as
// `X-NUCLIA-SERVICEACCOUNT: Bearer <token>` — exactly one auth header, per the
// demo-factory's docs/ARAG-API.md. Nothing in this module is ever returned to
// the browser verbatim: callers shape the results.
//
// Verified behaviour this client relies on (aws-ap-southeast-2-1, Oct 2026):
//   • POST {kb}/ask with X-Synchronous:true returns {answer, answer_json, status,
//     citations, retrieval_results, retrieval_best_matches, …}.
//   • answer_json_schema + citations:true → HTTP 500. So JSON-shaped asks run with
//     citations off and we derive sources from retrieval_best_matches instead.
//   • An empty / irrelevant retrieval returns status "no_context" or
//     "no_retrieval_data" with answer "Not enough data to answer this." even when
//     extra_context is supplied — treat as a soft failure.
//   • POST {kb}/find accepts filter_expression {field:{prop:"label",labelset,label}}.
//   • Resources carry extra.metadata.{model[],topic[]} (written by scripts/ingest.mjs).

const env = process.env;
const clean = (k) => String(k || '').trim().replace(/^["']+|["']+$/g, '').replace(/^Bearer\s+/i, '').trim();

export const ZONE = env.ARAG_ZONE || env.NUCLIA_ZONE || 'aws-ap-southeast-2-1';
export const KB_ID = env.ARAG_KB_ID || env.NUCLIA_KB_ID || '';
const TOKEN = clean(env.ARAG_API_KEY || env.NUCLIA_SERVICEACCOUNT);
const KB_URL = KB_ID ? `https://${ZONE}.rag.progress.cloud/api/v1/kb/${KB_ID}` : '';
const GENERATIVE_MODEL = env.ARAG_GENERATIVE_MODEL || ''; // empty → KB default model

export const configured = () => Boolean(KB_URL && TOKEN);

export class AragError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function call(path, { method = 'GET', body, timeoutMs = 20000, headers = {} } = {}) {
  if (!configured()) throw new AragError('ARAG not configured', 0);
  let res;
  try {
    res = await fetch(`${KB_URL}${path}`, {
      method,
      headers: { 'X-NUCLIA-SERVICEACCOUNT': `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new AragError(e.name === 'TimeoutError' ? `ARAG timeout after ${timeoutMs}ms` : `ARAG unreachable: ${e.message}`, 0);
  }
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  if (!res.ok) throw new AragError(`ARAG ${method} ${path.split('?')[0]} → HTTP ${res.status}`, res.status);
  return json;
}

/** Resource counters + processing backlog (for /api/health). */
export async function kbStatus() {
  const counters = await call('/counters', { timeoutMs: 5000 });
  let processing = null;
  try {
    const cat = await call('/catalog', { method: 'POST', timeoutMs: 5000, body: { query: '', page_size: 0, faceted: ['/metadata.status'] } });
    const f = (cat.fulltext && cat.fulltext.facets) || cat.facets || {};
    const st = f['/metadata.status'] || {};
    processing = (st['/metadata.status/PENDING'] || 0);
  } catch { /* counters alone are enough */ }
  return { resources: counters.resources, paragraphs: counters.paragraphs, processing };
}

/**
 * Synchronous /ask. Returns { answer, json, status, sources[] } where sources are
 * de-duplicated resources in best-match order: {resourceId,title,model[],topic[],text}.
 */
export async function ask({ query, system, extraContext = [], jsonSchema, history = [], filterExpression, timeoutMs = 25000, topK = 15 }) {
  const body = {
    query,
    top_k: topK,
    features: ['keyword', 'semantic'],
    show: ['basic', 'extra'],
    rag_strategies: [{ name: 'neighbouring_paragraphs', before: 1, after: 1 }],
    prompt: system ? { system } : undefined,
    extra_context: extraContext.length ? extraContext : undefined,
    chat_history: history.length ? history : undefined,
    citations: jsonSchema ? false : true,
    answer_json_schema: jsonSchema || undefined,
    generative_model: GENERATIVE_MODEL || undefined,
    filter_expression: filterExpression || undefined,
  };
  const j = await call('/ask', { method: 'POST', body, timeoutMs, headers: { 'X-Synchronous': 'true' } });
  const sources = sourcesFrom(j.retrieval_results, j.retrieval_best_matches, j.citations);
  return { answer: j.answer || '', json: j.answer_json || null, status: j.status || 'unknown', sources };
}

/** Semantic/hybrid /find. Returns flat paragraph hits sorted by score desc. */
export async function find({ query, topK = 12, features = ['semantic', 'keyword'], filterExpression, timeoutMs = 12000 }) {
  const j = await call('/find', {
    method: 'POST', timeoutMs,
    body: { query, top_k: topK, features, show: ['basic', 'extra'], filter_expression: filterExpression || undefined },
  });
  const hits = [];
  for (const [rid, r] of Object.entries(j.resources || {})) {
    const meta = resourceMeta(r);
    for (const f of Object.values(r.fields || {})) {
      for (const p of Object.values(f.paragraphs || {})) {
        hits.push({ resourceId: rid, title: r.title, ...meta, text: (p.text || '').trim(), score: p.score ?? 0, order: p.order ?? 0 });
      }
    }
  }
  // /find returns reranker order; keep it (order asc) and expose the score.
  return hits.sort((a, b) => a.order - b.order);
}

export const labelFilter = (labelset, label) => ({ field: { prop: 'label', labelset, label } });
export const anyLabel = (labelset, labels) => ({ field: { or: labels.map((l) => ({ prop: 'label', labelset, label: l })) } });

function resourceMeta(r) {
  const md = (r.extra && r.extra.metadata) || {};
  const cls = (r.usermetadata && r.usermetadata.classifications) || [];
  const from = (ls) => {
    const v = md[ls];
    const arr = Array.isArray(v) ? v : v ? [v] : [];
    return arr.length ? arr : cls.filter((c) => c.labelset === ls).map((c) => c.label);
  };
  return { model: from('model'), topic: from('topic') };
}

function sourcesFrom(retrieval, bestMatches, citations) {
  const resources = (retrieval && retrieval.resources) || {};
  const paraText = {};
  for (const r of Object.values(resources)) for (const f of Object.values(r.fields || {})) for (const [pid, p] of Object.entries(f.paragraphs || {})) paraText[pid] = p.text;
  const order = [
    ...Object.keys(citations || {}),
    ...((bestMatches || []).map((m) => m.id || m)),
    ...Object.keys(paraText),
  ];
  const seen = new Set(); const out = [];
  for (const pid of order) {
    const rid = String(pid).split('/')[0];
    if (seen.has(rid) || !resources[rid]) continue;
    seen.add(rid);
    out.push({ resourceId: rid, title: resources[rid].title, ...resourceMeta(resources[rid]), text: (paraText[pid] || '').trim(), cited: pid in (citations || {}) });
  }
  return out;
}
