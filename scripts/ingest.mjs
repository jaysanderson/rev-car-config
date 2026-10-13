#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// ingest.mjs — load the Toyota corpus into the Harbourline Knowledge Box.
//
//   node scripts/ingest.mjs                 # upsert everything, wait for processing
//   node scripts/ingest.mjs --no-wait       # upsert only
//   node scripts/ingest.mjs --dir content   # alternative content root
//
// Inputs
//   content/kb/*.md       YAML frontmatter: title, model (model id or `all`; a list is
//                         accepted), topic (one of the `topic` labels; list accepted).
//                         slug = filename without .md. Body = text/markdown field `body`.
//   content/catalog.json  uploaded as slug `catalog`, labels model=all, topic=pricing,
//                         rendered to Markdown (one section per model) so retrieval
//                         gets clean paragraphs rather than raw JSON.
//
// Idempotent: if a resource with the slug exists it is PATCHed (update), otherwise
// created. Then polls each resource until processing finishes and reports status.
// Works on an empty content/kb directory (just the catalogue, or nothing).
//
// Auth: ARAG_API_KEY (KB service token, SOWNER) via X-NUCLIA-SERVICEACCOUNT. Values
// are never printed. Zero dependencies — Node 20+.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { kbCoords, ROOT } from './lib-env.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const CONTENT = resolve(opt('--dir', join(ROOT, 'content')));
const WAIT = !args.includes('--no-wait');

const { kbUrl, token } = kbCoords();
if (!kbUrl || !token) { console.error('  ✗ Set ARAG_KB_ID and ARAG_API_KEY (.env) — run scripts/create-kb.mjs first.'); process.exit(1); }
const H = { 'X-NUCLIA-SERVICEACCOUNT': `Bearer ${token}`, 'Content-Type': 'application/json' };

// ── minimal frontmatter parser (same as arag-demo-factory/scripts/ingest.mjs) ──
export function parseFrontmatter(src) {
  const m = src.replace(/^﻿/, '').match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: src };
  const data = {}; let key = null;
  for (const raw of m[1].split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const item = raw.match(/^\s*-\s+(.*)$/);
    if (item && key) { (data[key] = Array.isArray(data[key]) ? data[key] : []).push(unq(item[1])); continue; }
    const kv = raw.match(/^([A-Za-z0-9_]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    key = kv[1]; const v = kv[2].trim();
    if (v === '') data[key] = [];
    else if (v.startsWith('[') && v.endsWith(']')) { data[key] = v.slice(1, -1).split(',').map(unq).filter(Boolean); key = null; }
    else { data[key] = unq(v); key = null; }
  }
  return { data, body: m[2].trim() };
}
const unq = (s) => String(s).trim().replace(/^["']|["']$/g, '');
const list = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]).map(String).map((s) => s.trim()).filter(Boolean);
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 180);

function resourceBody({ title, slug, body, models, topics, extra = {} }) {
  const classifications = [
    ...list(models).map((label) => ({ labelset: 'model', label })),
    ...list(topics).map((label) => ({ labelset: 'topic', label })),
  ];
  return {
    title, slug, icon: 'text/markdown',
    usermetadata: { classifications },
    texts: { body: { body, format: 'MARKDOWN' } },
    origin: { metadata: { model: list(models).join(','), topic: list(topics).join(',') } },
    extra: { metadata: { model: list(models), topic: list(topics), ...extra } },
  };
}

// catalog.json → Markdown
function catalogMarkdown(cat) {
  const money = (n) => `$${Number(n).toLocaleString('en-AU')}`;
  const col = Object.fromEntries((cat.colours || []).map((c) => [c.id, c]));
  const int = Object.fromEntries((cat.interiors || []).map((c) => [c.id, c]));
  const out = [`# Harbourline Toyota catalogue — models, grades and drive-away pricing`, '',
    `${cat.priceNote || 'Drive-away estimates'} (${cat.currency || 'AUD'}, generated ${cat.generated || ''}).`, ''];
  for (const m of cat.models || []) {
    out.push(`## ${m.name} (model id: ${m.id})`, '',
      `${m.bodyLabel || m.body} · ${m.powertrainLabel || m.powertrain} · ${m.seats} seats · braked towing ${m.towKg ? `${m.towKg} kg` : 'not rated'} · from ${money(m.fromPrice)} drive-away.`, '',
      m.blurb || '', '', m.safety ? `Safety: ${m.safety}` : '', '',
      `Suits: ${(m.tags || []).join(', ')}.`, '');
    for (const g of m.grades || []) {
      out.push(`- **${m.name} ${g.name}** (grade id: ${g.id}) — ${money(g.price)}${g.drive ? `, ${g.drive}` : ''}${g.leather ? ', leather-accented' : ''}: ${(g.highlights || []).join('; ')}.`);
    }
    out.push('', `Colours: ${(m.colours || []).map((c) => (col[c]?.name || c) + (col[c]?.price ? ` (+${money(col[c].price)})` : '')).join(', ')}.`,
      `Interiors: ${(m.interiors || []).map((c) => (int[c]?.name || c) + (int[c]?.price ? ` (+${money(int[c].price)})` : '')).join(', ')}.`,
      `Accessory packs: ${(m.accessories || []).join(', ')}.`, '');
  }
  if (cat.accessories?.length) {
    out.push('## Accessory packs', '');
    for (const a of cat.accessories) out.push(`- **${a.name}** (${a.id}) — ${money(a.price)}: ${a.desc || ''}`);
  }
  return out.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

async function req(path, { method = 'GET', body } = {}) {
  const r = await fetch(`${kbUrl}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const text = await r.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
  return { ok: r.ok, status: r.status, json };
}

async function upsert(res) {
  const existing = await req(`/slug/${encodeURIComponent(res.slug)}?show=basic`);
  if (existing.ok && existing.json?.id) {
    const { slug, ...patch } = res;
    const r = await req(`/slug/${encodeURIComponent(slug)}`, { method: 'PATCH', body: patch });
    if (!r.ok) throw new Error(`update ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
    return { id: existing.json.id, action: 'updated' };
  }
  const r = await req('/resources', { method: 'POST', body: res });
  if (!r.ok) throw new Error(`create ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
  return { id: r.json.uuid || r.json.id, action: 'created' };
}

async function waitFor(items, timeoutMs = 10 * 60 * 1000) {
  const t0 = Date.now(); const pending = new Map(items.map((i) => [i.id, i]));
  const done = {};
  while (pending.size && Date.now() - t0 < timeoutMs) {
    for (const [id, it] of [...pending]) {
      const r = await req(`/resource/${id}?show=basic`);
      const st = r.json?.metadata?.status || 'UNKNOWN';
      if (st !== 'PENDING' && st !== 'UNKNOWN') { done[it.slug] = st; pending.delete(id); console.log(`   ${st === 'PROCESSED' ? '✓' : '!'} ${st.padEnd(9)} ${it.slug}`); }
    }
    if (pending.size) {
      process.stdout.write(`   … ${pending.size} still processing (${Math.round((Date.now() - t0) / 1000)}s)\r`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  for (const it of pending.values()) { done[it.slug] = 'TIMEOUT'; console.log(`   ! still pending ${it.slug}`); }
  return done;
}

async function main() {
  const docs = [];
  const kbDir = join(CONTENT, 'kb');
  const files = existsSync(kbDir) ? readdirSync(kbDir).filter((f) => f.endsWith('.md')).sort() : [];
  for (const f of files) {
    const { data, body } = parseFrontmatter(readFileSync(join(kbDir, f), 'utf8'));
    if (!body.trim()) { console.log(`   · skip ${f} (empty body)`); continue; }
    docs.push(resourceBody({ title: data.title || basename(f, '.md'), slug: slugify(basename(f, '.md')), body, models: data.model || 'all', topics: data.topic, extra: { file: `kb/${f}` } }));
  }
  const catPath = join(CONTENT, 'catalog.json');
  if (existsSync(catPath)) {
    const cat = JSON.parse(readFileSync(catPath, 'utf8'));
    docs.push(resourceBody({ title: 'Harbourline Toyota catalogue — models, grades, colours and drive-away pricing', slug: 'catalog', body: catalogMarkdown(cat), models: 'all', topics: 'pricing', extra: { file: 'catalog.json' } }));
  }
  console.log(`\n  Content: ${files.length} markdown file(s) in ${kbDir}${existsSync(catPath) ? ' + catalog.json' : ''}`);
  if (!docs.length) { console.log('  Nothing to ingest (content/kb is empty and there is no catalog.json). Done.\n'); return; }

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
  if (c.ok) console.log(`  KB counters: ${c.json.resources} resources, ${c.json.paragraphs} paragraphs.\n`);
  if (fail) process.exitCode = 1;
}

main().catch((e) => { console.error(`  ✗ ${e.message}`); process.exit(1); });
