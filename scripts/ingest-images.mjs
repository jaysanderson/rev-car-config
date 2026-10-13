#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// ingest-images.mjs — load the model photos (content/images) into the Knowledge Box.
//
//   node scripts/ingest-images.mjs              # upsert all, wait for processing
//   node scripts/ingest-images.mjs --no-wait    # upsert only
//   node scripts/ingest-images.mjs --force      # re-upload even if the JPEG is unchanged
//
// One resource per model, slug `image-<model-id>`, title "<Model name> photo":
//   files.photo   the 1600 px JPEG (content/images/<model-id>.jpg)
//   texts.body    one-paragraph description + credit/licence line (from credits.json)
//   labels        model/<model-id>, topic/images (adds `images` to the topic labelset if missing)
// Per-colour images listed in content/images/index.json (if any) get one resource each,
// slug `image-<model-id>-<colour-id>`, same labels.
//
// Idempotent: upsert by slug via scripts/ingest.mjs (PATCH if it exists, else create). A
// resource whose stored JPEG md5 matches the local file is skipped unless --force.
// Auth/env as ingest.mjs (ARAG_KB_ID / ARAG_API_KEY / ARAG_ZONE). Values are never printed.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT } from './lib-env.mjs';
import { req, upsert, waitFor } from './ingest.mjs';

const args = process.argv.slice(2);
const WAIT = !args.includes('--no-wait');
const FORCE = args.includes('--force');
const DIR = join(ROOT, 'content', 'images');

const catalog = JSON.parse(readFileSync(join(ROOT, 'content', 'catalog.json'), 'utf8'));
const credits = JSON.parse(readFileSync(join(DIR, 'credits.json'), 'utf8'));
const index = existsSync(join(DIR, 'index.json')) ? JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8')) : {};
const modelName = Object.fromEntries(catalog.models.map((m) => [m.id, m]));
const colourName = Object.fromEntries((catalog.colours || []).map((c) => [c.id, c.name]));

const creditLine = (c) => c.author
  ? `Photo: ${c.author}, ${c.license} (${c.license_url}), via Wikimedia Commons (${c.source_url}); cropped and resized.`
  : `Image source: ${c.source_url}. ${c.note || ''}`.trim();

function describe(m, c) {
  const body = m.bodyLabel || m.body;
  const para = `Exterior photograph of the Toyota ${m.name} (${body}), shown from the front three-quarter angle. ${c.generation_note || ''} ${m.blurb || ''} The photo is illustrative for the Harbourline Toyota configurator prototype and does not show Australian specification, a particular grade or the selected colour.`.replace(/ {2,}/g, ' ');
  return `${para}\n\n${creditLine(c)}\n\nImage URL in the configurator: /api/images/${m.id}.jpg (thumbnail /api/images/${m.id}/thumb.jpg).`;
}

async function ensureTopicLabel() {
  const r = await req('/labelset/topic');
  if (!r.ok) throw new Error(`labelset topic: ${r.status}`);
  const ls = r.json; const labels = (ls.labels || []).map((l) => ({ title: l.title }));
  if (labels.some((l) => l.title === 'images')) { console.log('   ✓ topic labelset already has `images`'); return; }
  const w = await req('/labelset/topic', { method: 'POST', body: { title: ls.title || 'topic', color: ls.color || '#22d3ee', multiple: ls.multiple ?? true, kind: ls.kind || ['RESOURCES'], labels: [...labels, { title: 'images' }] } });
  if (!w.ok) throw new Error(`labelset topic update: ${w.status}`);
  console.log('   ✓ added `images` to the topic labelset');
}

function resource({ slug, title, text, file, filename, model, extra }) {
  const bytes = readFileSync(file);
  const md5 = createHash('md5').update(bytes).digest('hex');
  return {
    md5,
    body: {
      title, slug, icon: 'image/jpeg',
      usermetadata: { classifications: [{ labelset: 'model', label: model }, { labelset: 'topic', label: 'images' }] },
      texts: { body: { body: text, format: 'MARKDOWN' } },
      files: { photo: { file: { filename, content_type: 'image/jpeg', payload: bytes.toString('base64'), md5 } } },
      origin: { metadata: { model, topic: 'images' } },
      extra: { metadata: { model: [model], topic: ['images'], md5, ...extra } },
    },
  };
}

async function main() {
  console.log('\n  Labelsets');
  await ensureTopicLabel();

  const items = [];
  for (const c of credits.filter((x) => !x.colour)) {
    const m = modelName[c.model];
    if (!m) { console.log(`   · skip ${c.model} (not in catalog.json)`); continue; }
    const file = join(DIR, c.file);
    if (!existsSync(file)) { console.log(`   · skip ${c.model} (missing ${c.file})`); continue; }
    items.push(resource({ slug: `image-${m.id}`, title: `${m.name} photo`, text: describe(m, c), file, filename: `${m.id}.jpg`, model: m.id,
      extra: { file: `images/${c.file}`, source_url: c.source_url, author: c.author || '', license: c.license || '' } }));
  }
  for (const [model, entry] of Object.entries(index)) {
    for (const [colour, rel] of Object.entries(entry.colours || {})) {
      const m = modelName[model]; const file = join(DIR, rel);
      if (!m || !existsSync(file)) continue;
      const c = credits.find((x) => x.model === model && x.colour === colour) || {};
      const name = colourName[colour] || colour;
      items.push(resource({ slug: `image-${model}-${colour}`, title: `${m.name} in ${name}`, text: `${m.name} in ${name}.\n\n${creditLine(c)}`,
        file, filename: `${model}-${colour}.jpg`, model, extra: { file: `images/${rel}`, colour, source_url: c.source_url || '' } }));
    }
  }
  console.log(`\n  Images: ${items.length}`);

  const results = []; let fail = 0;
  for (const [i, { md5, body }] of items.entries()) {
    const n = `${String(i + 1).padStart(3)}/${items.length}`;
    try {
      if (!FORCE) {
        const cur = await req(`/slug/${encodeURIComponent(body.slug)}?show=basic&show=extra`);
        if (cur.ok && cur.json?.id && cur.json?.extra?.metadata?.md5 === md5) {
          console.log(`   ${n} same    ${body.slug} ${cur.json.id}`);
          results.push({ id: cur.json.id, slug: body.slug, action: 'same' });
          continue;
        }
      }
      const r = await upsert(body);
      results.push({ ...r, slug: body.slug });
      console.log(`   ${n} ${r.action.padEnd(7)} ${body.slug} ${r.id}`);
    } catch (e) { fail++; console.log(`   ${n} FAIL    ${body.slug} — ${e.message}`); }
  }
  console.log(`\n  Upserted ${results.filter((r) => r.action !== 'same').length}, unchanged ${results.filter((r) => r.action === 'same').length}, failed ${fail}.`);
  const changed = results.filter((r) => r.action !== 'same');
  if (WAIT && changed.length) {
    console.log('  Waiting for ARAG processing…');
    await waitFor(changed);
  }
  console.log('\n  Resource ids');
  for (const r of results) console.log(`   ${r.slug.padEnd(28)} ${r.id}`);
  if (fail) process.exitCode = 1;
}

main().catch((e) => { console.error(`  ✗ ${e.message}`); process.exit(1); });
