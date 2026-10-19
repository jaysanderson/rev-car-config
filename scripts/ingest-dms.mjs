#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// ingest-dms.mjs — load the Harbourline DMS back-office knowledge (content/dms-kb)
// into the same Knowledge Box as the configurator corpus.
//
//   node scripts/ingest-dms.mjs              # upsert everything, wait for processing
//   node scripts/ingest-dms.mjs --no-wait    # upsert only
//
// Inputs
//   content/dms-kb/*.md   YAML frontmatter: title, model (`all`), topic (`manual` | `policy`).
//                         slug = `dms-` + filename without .md. Body = text/markdown field `body`.
// Labels
//   model/all + topic/<manual|policy>. Ensures the `topic` labelset contains `manual`,
//   `policy` and `document` (document = PDFs the DMS uploads at demo time via
//   POST /dms/api/documents/:id/process; this script does NOT ingest content/dms/samples).
//
// Idempotent: reuses upsert/waitFor/req from scripts/ingest.mjs (PATCH by slug if it
// exists, else create). Auth/env as ingest.mjs (ARAG_KB_ID / ARAG_API_KEY / ARAG_ZONE).
// Secret values are never printed. Zero dependencies — Node 20+.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { ROOT } from './lib-env.mjs';
import { req, upsert, waitFor, parseFrontmatter } from './ingest.mjs';

const args = process.argv.slice(2);
const WAIT = !args.includes('--no-wait');
const DIR = join(ROOT, 'content', 'dms-kb');
const DMS_TOPICS = ['manual', 'policy', 'document', 'help', 'jobcard', 'supplier', 'customer', 'infomedia'];

const list = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]).map(String).map((s) => s.trim()).filter(Boolean);
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 180);

async function ensureTopicLabels() {
  const r = await req('/labelset/topic');
  if (!r.ok) throw new Error(`labelset topic: ${r.status}`);
  const ls = r.json; const labels = (ls.labels || []).map((l) => ({ title: l.title }));
  const missing = DMS_TOPICS.filter((t) => !labels.some((l) => l.title === t));
  if (!missing.length) { console.log(`   ✓ topic labelset already has ${DMS_TOPICS.join(', ')}`); return; }
  const w = await req('/labelset/topic', { method: 'POST', body: { title: ls.title || 'topic', color: ls.color || '#22d3ee', multiple: ls.multiple ?? true, kind: ls.kind || ['RESOURCES'], labels: [...labels, ...missing.map((title) => ({ title }))] } });
  if (!w.ok) throw new Error(`labelset topic update: ${w.status}`);
  console.log(`   ✓ added ${missing.join(', ')} to the topic labelset`);
}

function resourceBody({ title, slug, body, models, topics, file }) {
  return {
    title, slug, icon: 'text/markdown',
    usermetadata: { classifications: [
      ...list(models).map((label) => ({ labelset: 'model', label })),
      ...list(topics).map((label) => ({ labelset: 'topic', label })),
    ] },
    texts: { body: { body, format: 'MARKDOWN' } },
    origin: { metadata: { model: list(models).join(','), topic: list(topics).join(','), app: 'dms' } },
    extra: { metadata: { model: list(models), topic: list(topics), app: 'dms', file } },
  };
}

async function topicCount(topic) {
  // /find with a label filter; count distinct resources (page through up to 200).
  const r = await req('/find', { method: 'POST', body: { query: '', filters: [`/classification.labels/topic/${topic}`], top_k: 200, features: ['keyword'], show: ['basic'] } });
  return r.ok ? Object.keys(r.json?.resources || {}).length : null;
}

async function main() {
  const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.md')).sort() : [];
  console.log(`\n  DMS content: ${files.length} markdown file(s) in ${DIR}`);
  if (!files.length) { console.log('  Nothing to ingest. Done.\n'); return; }

  console.log('  Labelset');
  await ensureTopicLabels();

  const docs = [];
  for (const f of files) {
    const { data, body } = parseFrontmatter(readFileSync(join(DIR, f), 'utf8'));
    const topics = list(data.topic);
    if (!body.trim()) { console.log(`   · skip ${f} (empty body)`); continue; }
    if (!topics.length || topics.some((t) => !['manual', 'policy'].includes(t))) { console.log(`   · skip ${f} (topic must be manual or policy)`); continue; }
    docs.push(resourceBody({ title: data.title || basename(f, '.md'), slug: `dms-${slugify(basename(f, '.md'))}`, body, models: data.model || 'all', topics, file: `dms-kb/${f}` }));
  }

  const results = []; let fail = 0;
  for (const [i, d] of docs.entries()) {
    try {
      const r = await upsert(d);
      results.push({ ...r, slug: d.slug });
      console.log(`   ${String(i + 1).padStart(3)}/${docs.length} ${r.action.padEnd(7)} ${d.slug}`);
    } catch (e) { fail++; console.log(`   ${String(i + 1).padStart(3)}/${docs.length} FAIL    ${d.slug} — ${e.message}`); }
  }
  console.log(`\n  Upserted ${results.length}, failed ${fail}.`);
  if (WAIT && results.length) {
    console.log('  Waiting for ARAG processing (chunking, embeddings, entities)…');
    const st = await waitFor(results);
    const counts = Object.values(st).reduce((a, s) => ((a[s] = (a[s] || 0) + 1), a), {});
    console.log(`\n  Processing: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  }
  const c = await req('/counters');
  if (c.ok) console.log(`  KB counters: ${c.json.resources} resources, ${c.json.paragraphs} paragraphs.`);
  const byTopic = {};
  for (const t of DMS_TOPICS) byTopic[t] = await topicCount(t);
  console.log(`  By topic (label filter): ${Object.entries(byTopic).map(([k, v]) => `${k} ${v ?? '?'}`).join(', ')}\n`);
  if (fail) process.exitCode = 1;
}

main().catch((e) => { console.error(`  ✗ ${e.message}`); process.exit(1); });
