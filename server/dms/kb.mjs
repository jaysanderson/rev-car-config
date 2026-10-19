// kb.mjs — the extra Progress Agentic RAG calls the DMS needs on top of
// server/arag.mjs (which stays untouched): file upload as a resource, processing
// status, extracted text, /ask with rag_strategies, label facet counts.
//
// Verified against the KB (aws-ap-southeast-2-1, 14 Oct 2026):
//   • POST /resources with files.{id}.file.{filename, content_type, payload:base64}
//     creates a file resource; it reaches metadata.status PROCESSED in ~6-15 s.
//   • POST /resource/{rid}/ask → HTTP 500 with rag_strategies full_resource and
//     no_retrieval_data without it, so extraction uses POST /ask with
//     filter_expression {field:{prop:"resource", id}} + rag_strategies full_resource
//     (+ answer_json_schema) — ~5 s, exact field values.
//   • POST /catalog with faceted ["/classification.labels/topic"] gives counts per label.
// Token stays server-side (X-NUCLIA-SERVICEACCOUNT); nothing here is returned verbatim.
import * as arag from '../arag.mjs';

const clean = (k) => String(k || '').trim().replace(/^["']+|["']+$/g, '').replace(/^Bearer\s+/i, '').trim();
const TOKEN = clean(process.env.ARAG_API_KEY || process.env.NUCLIA_SERVICEACCOUNT);
const KB_URL = arag.KB_ID ? `https://${arag.ZONE}.rag.progress.cloud/api/v1/kb/${arag.KB_ID}` : '';
export const MCP_URL = arag.KB_ID ? `https://${arag.ZONE}.rag.progress.cloud/api/v1/kb/${arag.KB_ID}/mcp` : null;
export const MCP_PATTERN = 'https://<zone>.rag.progress.cloud/api/v1/kb/<kbid>/mcp';

async function call(path, { method = 'GET', body, timeoutMs = 20000, headers = {} } = {}) {
  if (!arag.configured()) throw new arag.AragError('ARAG not configured', 0);
  let res;
  try {
    res = await fetch(`${KB_URL}${path}`, { method, headers: { 'X-NUCLIA-SERVICEACCOUNT': `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) { throw new arag.AragError(e.name === 'TimeoutError' ? `ARAG timeout after ${timeoutMs}ms` : `ARAG unreachable: ${e.message}`, 0); }
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  if (!res.ok) throw new arag.AragError(`ARAG ${method} ${path.split('?')[0]} → HTTP ${res.status}`, res.status);
  return json;
}

/** Create (or find by slug) a file resource. Returns {id, created}. */
export async function uploadFile({ slug, title, fileName, contentType, base64, labels = [], metadata = {} }) {
  try { const ex = await call(`/slug/${encodeURIComponent(slug)}?show=basic`, { timeoutMs: 8000 }); if (ex?.id) return { id: ex.id, created: false }; } catch (e) { if (e.status && e.status !== 404) throw e; }
  const j = await call('/resources', {
    method: 'POST', timeoutMs: 30000,
    body: {
      title, slug, icon: contentType,
      usermetadata: { classifications: labels.map(([labelset, label]) => ({ labelset, label })) },
      origin: { metadata: Object.fromEntries(Object.entries(metadata).map(([k, v]) => [k, String(v)])) },
      extra: { metadata: { topic: labels.filter(([ls]) => ls === 'topic').map(([, l]) => l), ...metadata } },
      files: { file: { file: { filename: fileName, content_type: contentType, payload: base64 } } },
    },
  });
  return { id: j.uuid || j.id, created: true };
}
/**
 * Upsert a resource by slug with text fields, labels, metadata and optional files
 * ({fieldId: {filename, contentType, base64}}). Returns {id, created}.
 */
export async function upsertResource({ slug, title, summary, labels = [], metadata = {}, texts = {}, files = {} }) {
  const body = {
    title, icon: 'text/markdown', ...(summary ? { summary } : {}),
    usermetadata: { classifications: labels.map(([labelset, label]) => ({ labelset, label })) },
    origin: { metadata: Object.fromEntries(Object.entries(metadata).map(([k, v]) => [k, String(v ?? '')])) },
    extra: { metadata: { topic: labels.filter(([ls]) => ls === 'topic').map(([, l]) => l), model: labels.filter(([ls]) => ls === 'model').map(([, l]) => l), ...metadata } },
    texts: Object.fromEntries(Object.entries(texts).map(([k, v]) => [k, { body: String(v), format: 'MARKDOWN' }])),
  };
  const fileFields = Object.entries(files).filter(([, f]) => f && f.base64);
  if (fileFields.length) body.files = Object.fromEntries(fileFields.map(([k, f]) => [k, { file: { filename: f.filename, content_type: f.contentType, payload: f.base64 } }]));
  let existing = null;
  try { existing = await call(`/slug/${encodeURIComponent(slug)}?show=basic`, { timeoutMs: 8000 }); } catch (e) { if (e.status && e.status !== 404) throw e; }
  if (existing?.id) { await call(`/slug/${encodeURIComponent(slug)}`, { method: 'PATCH', timeoutMs: 40000, body }); return { id: existing.id, created: false }; }
  const j = await call('/resources', { method: 'POST', timeoutMs: 40000, body: { slug, ...body } });
  return { id: j.uuid || j.id, created: true };
}
export async function resourceStatus(id) {
  const j = await call(`/resource/${id}?show=basic`, { timeoutMs: 8000 });
  return j?.metadata?.status || 'UNKNOWN';
}
/** {status, created (ISO, UTC)} of a resource, or null when it does not exist. */
export async function resourceInfo(id) {
  try { const j = await call(`/resource/${id}?show=basic`, { timeoutMs: 8000 }); return { status: j?.metadata?.status || 'UNKNOWN', created: j?.created ? `${String(j.created).replace(/Z?$/, '')}Z` : null }; }
  catch (e) { if (e.status === 404) return null; throw e; }
}
/** Poll until not PENDING or the deadline. Returns the final status ("PENDING" on timeout). */
export async function waitProcessed(id, deadlineMs = 35000) {
  const t0 = Date.now(); let st = 'PENDING';
  while (Date.now() - t0 < deadlineMs) {
    try { st = await resourceStatus(id); } catch { st = 'UNKNOWN'; }
    if (st !== 'PENDING' && st !== 'UNKNOWN') return st;
    await new Promise((r) => setTimeout(r, 2500));
  }
  return st === 'UNKNOWN' ? 'PENDING' : st;
}
/** Extracted text of a resource's file field (for verifying extracted values). */
export async function extractedText(id) {
  try {
    const j = await call(`/resource/${id}?show=extracted&extracted=text`, { timeoutMs: 10000 });
    const parts = [];
    for (const group of Object.values(j?.data || {})) for (const f of Object.values(group || {})) { const t = f?.extracted?.text?.text; if (t) parts.push(t); }
    return parts.join('\n');
  } catch { return ''; }
}
export async function deleteResource(id) { await call(`/resource/${id}`, { method: 'DELETE' }); }

/** /ask returning the raw answer_json (with rag_strategies / filters). */
export async function askJson({ query, jsonSchema, filterExpression, ragStrategies, system, extraContext, timeoutMs = 30000, topK = 20, model, features = ['keyword', 'semantic'] }) {
  const j = await call('/ask', {
    method: 'POST', timeoutMs, headers: { 'X-Synchronous': 'true' },
    body: {
      query, top_k: topK, features, citations: false, answer_json_schema: jsonSchema,
      filter_expression: filterExpression || undefined, rag_strategies: ragStrategies || undefined,
      prompt: system ? { system } : undefined, extra_context: extraContext?.length ? extraContext : undefined,
      generative_model: model || process.env.ARAG_GENERATIVE_MODEL || undefined,
    },
  });
  return { json: j.answer_json || null, status: j.status || 'unknown', answer: j.answer || '' };
}

let countCache = { at: 0, data: null };
/** Resource counts by topic label + total (cached 60 s). */
export async function topicCounts() {
  if (countCache.data && Date.now() - countCache.at < 60000) return countCache.data;
  const [cat, counters] = await Promise.all([
    call('/catalog', { method: 'POST', timeoutMs: 8000, body: { query: '', page_size: 0, faceted: ['/classification.labels/topic'] } }),
    call('/counters', { timeoutMs: 8000 }).catch(() => null),
  ]);
  const f = ((cat.fulltext && cat.fulltext.facets) || cat.facets || {})['/classification.labels/topic'] || {};
  const byTopic = Object.fromEntries(Object.entries(f).map(([k, v]) => [k.split('/').pop(), v]).sort((a, b) => b[1] - a[1]));
  countCache = { at: Date.now(), data: { resources: counters?.resources ?? null, paragraphs: counters?.paragraphs ?? null, byTopic } };
  return countCache.data;
}
