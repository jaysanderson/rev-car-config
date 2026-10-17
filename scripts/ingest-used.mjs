#!/usr/bin/env node
// ingest-used.mjs — every pre-owned listing becomes a resource in the knowledge box.
//
//   node scripts/ingest-used.mjs             # upsert all units + the two used policy docs, wait
//   node scripts/ingest-used.mjs --no-wait
//   node scripts/ingest-used.mjs --only U-33002
//
// Per unit (slug used-u33002): title "2024 Toyota RAV4 GX hybrid AWD, 40,446 km, Urban
// Rock (U-33002)", labels model/<modelId> (Toyota) + topic/used, origin.metadata with
// the scalar fields (price, km, year, site, status, certified…), text fields `listing`
// and `provenance` (Markdown, from server/used-data.mjs), a `photo` file field (the
// 640 px library thumbnail) and a `video` link field when the record has one.
// Writes content/used/kb-index.json {stockNo: resourceId} for the server's
// resource-scoped /ask. Adds the `used` label to the topic labelset if missing.
// Also upserts content/kb/used-*.md. Secrets are never printed. Node 20+, no deps.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { kbCoords, ROOT } from './lib-env.mjs';
import { parseFrontmatter } from './ingest.mjs';

const args = process.argv.slice(2);
const WAIT = !args.includes('--no-wait');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1]?.toUpperCase() : null;
const { kbUrl, token } = kbCoords();
if (!kbUrl || !token) { console.error('  ✗ Set ARAG_KB_ID and ARAG_API_KEY (.env)'); process.exit(1); }
const H = { 'X-NUCLIA-SERVICEACCOUNT': `Bearer ${token}`, 'Content-Type': 'application/json' };
process.env.ARAG_KB_ID ||= kbCoords().kbId;
const D = await import('../server/used-data.mjs');

async function req(path, { method = 'GET', body, timeoutMs = 60000 } = {}) {
  const r = await fetch(`${kbUrl}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs) });
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

// 1. topic labelset: add `used`
{
  const ls = await req('/labelset/topic');
  const labels = (ls.json?.labels || []).map((l) => l.title);
  if (!labels.includes('used')) {
    const r = await req('/labelset/topic', { method: 'POST', body: { ...ls.json, labels: [...(ls.json?.labels || []), { title: 'used' }] } });
    console.log(`${r.ok ? '✓' : '✗'} topic labelset: added "used" [${r.status}]`);
  } else console.log('✓ topic labelset already has "used"');
}

// 2. units
const index = existsSync(join(ROOT, 'content/used/kb-index.json')) ? JSON.parse(readFileSync(join(ROOT, 'content/used/kb-index.json'), 'utf8')) : {};
const items = [];
for (const u of D.units()) {
  if (ONLY && u.stockNo !== ONLY) continue;
  const slug = `used-${u.stockNo.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  const meta = { stockNo: u.stockNo, make: u.make, model: u.model, modelId: u.modelId || '', year: u.year, grade: u.grade, body: u.body, fuel: u.fuel, drive: u.drive, transmission: u.transmission, km: u.km, price: u.price, certified: u.certified, status: u.status, siteId: u.siteId, colour: u.colour, seats: u.seats, towKg: u.towKg, owners: u.owners };
  const res = {
    title: D.longTitle(u), slug, icon: 'text/markdown',
    summary: D.commentsFor(u).body,
    usermetadata: { classifications: [...(u.modelId ? [{ labelset: 'model', label: u.modelId }] : []), { labelset: 'topic', label: 'used' }] },
    texts: { listing: { body: D.listingText(u), format: 'MARKDOWN' }, provenance: { body: D.provenanceText(u), format: 'MARKDOWN' } },
    origin: { metadata: Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, String(v)])), source_id: 'harbourline-used', url: `https://harbourline-configurator.fly.dev/used/#/car/${u.stockNo}` },
    extra: { metadata: { model: u.modelId ? [u.modelId] : [], topic: ['used'], ...meta } },
  };
  if (u.photo && u.modelId) {
    const p = join(ROOT, 'content/images/thumb', `${u.modelId}.jpg`);
    if (existsSync(p)) res.files = { photo: { file: { filename: `${u.stockNo}-${u.modelId}.jpg`, content_type: 'image/jpeg', payload: readFileSync(p).toString('base64') } } };
  }
  if (u.video?.url) res.links = { video: { uri: u.video.url, title: u.video.title || 'Walkaround video' } };
  try {
    const r = await upsert(res);
    index[u.stockNo] = r.id; items.push({ id: r.id, slug });
    console.log(`   ${r.action === 'created' ? '+' : '~'} ${slug.padEnd(12)} ${r.id} ${res.files ? '(photo)' : ''}`);
  } catch (e) { console.log(`   ✗ ${slug}: ${e.message}`); }
}
writeFileSync(join(ROOT, 'content/used/kb-index.json'), JSON.stringify(index, null, 1) + '\n');
console.log(`✓ content/used/kb-index.json (${Object.keys(index).length} resources)`);

// 3. policy docs
if (!ONLY) for (const f of ['used-certified-program.md', 'used-buying-guide.md']) {
  const { data, body } = parseFrontmatter(readFileSync(join(ROOT, 'content/kb', f), 'utf8'));
  const list = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]).map(String);
  const models = list(data.model); const topics = list(data.topic);
  const res = { title: data.title, slug: f.replace(/\.md$/, ''), icon: 'text/markdown', usermetadata: { classifications: [...models.map((label) => ({ labelset: 'model', label })), ...topics.map((label) => ({ labelset: 'topic', label }))] }, texts: { body: { body, format: 'MARKDOWN' } }, origin: { metadata: { model: models.join(','), topic: topics.join(',') } }, extra: { metadata: { model: models, topic: topics } } };
  try { const r = await upsert(res); items.push({ id: r.id, slug: res.slug }); console.log(`   ${r.action === 'created' ? '+' : '~'} ${res.slug} ${r.id}`); } catch (e) { console.log(`   ✗ ${res.slug}: ${e.message}`); }
}

// 4. wait for processing
if (WAIT && items.length) {
  const t0 = Date.now(); const pending = new Map(items.map((i) => [i.id, i])); const result = {};
  while (pending.size && Date.now() - t0 < 15 * 60000) {
    for (const [id, it] of [...pending]) {
      const r = await req(`/resource/${id}?show=basic`, { timeoutMs: 15000 }).catch(() => ({ json: null }));
      const st = r.json?.metadata?.status || 'UNKNOWN';
      if (st !== 'PENDING' && st !== 'UNKNOWN') { result[st] = (result[st] || 0) + 1; pending.delete(id); }
    }
    if (pending.size) { process.stdout.write(`   … ${pending.size} still processing (${Math.round((Date.now() - t0) / 1000)}s)   \r`); await new Promise((r) => setTimeout(r, 6000)); }
  }
  console.log(`\n✓ processing: ${JSON.stringify(result)}${pending.size ? `, ${pending.size} still pending after ${Math.round((Date.now() - t0) / 1000)}s` : ''}`);
}
