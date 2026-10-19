#!/usr/bin/env node
// ingest-dms-phase2.mjs — phase 2 knowledge for the DMS (docs/DMS-PHASE2-SPEC.md §2).
//
//   node scripts/ingest-dms-phase2.mjs                 # manual/policy/FAQ chapters + Infomedia + suppliers + recent job cards + customers with memos
//   node scripts/ingest-dms-phase2.mjs --only=infomedia|suppliers|jobcards|customers|docs
//   node scripts/ingest-dms-phase2.mjs --days=90 --max=250   # job-card window and cap
//
// Docs go through scripts/ingest-dms.mjs (adds the topic labels manual, policy, document, help,
// jobcard, supplier, customer, infomedia). Entities reuse server/dms/service.mjs syncEntity, so the
// resource a script writes is identical to the one a memo or photo upload re-syncs; it writes
// content/dms/kb-index-phase2.json. Infomedia: one resource per model (menus), one per part
// category, one for campaigns and one for labour rates, each with model labels. Secrets are never printed.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { kbCoords, ROOT } from './lib-env.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.find((a) => a.startsWith(`--${n}=`)) || '').split('=')[1] ?? d;
const ONLY = opt('only', ''); const DAYS = Number(opt('days', 90)); const MAX = Number(opt('max', 250));
const want = (k) => !ONLY || ONLY === k;
const c = kbCoords(); for (const [k, v] of Object.entries({ ARAG_KB_ID: c.kbId, ARAG_API_KEY: c.token, ARAG_ZONE: c.zone })) process.env[k] ||= v;
if (!c.kbUrl || !c.token) { console.error('✗ ARAG_KB_ID and ARAG_API_KEY must be set (.env)'); process.exit(1); }

if (want('docs')) { console.log('→ manual, policy and FAQ chapters'); const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'ingest-dms.mjs'), '--no-wait'], { stdio: 'inherit', env: process.env }); if (r.status) process.exit(r.status); }

const svc = await import('../server/dms/service.mjs');
const infomedia = await import('../server/dms/infomedia.mjs');
const db = await import('../server/dms/db.mjs');
const kb = await import('../server/dms/kb.mjs');
db.load();
const pool = async (items, n, fn) => { let i = 0; const out = []; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const it = items[i++]; try { out.push(await fn(it)); } catch (e) { console.log(`   ✗ ${e.message.slice(0, 120)}`); } } })); return out; };
const money = (n) => `$${Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

if (want('infomedia')) {
  console.log('→ Infomedia pack (simulated)');
  const menus = infomedia.menus(); const parts = infomedia.parts(); const campaigns = infomedia.campaigns();
  const rates = infomedia.packSummary().labourRates || [];
  const idx = {};
  const models = [...new Set(menus.map((m) => m.modelId))];
  for (const mid of models) {
    const ms = menus.filter((m) => m.modelId === mid); const first = ms[0];
    const text = [`# Service menus: ${first.make} ${first.model} (simulated Infomedia Superservice Menus pack)`, '', `Schedule: every ${first.intervalMonths ? '' : ''}interval below; years ${first.yearFrom} to ${first.yearTo}. Prices exclude labour: multiply hours by the site labour rate (Parramatta $189, Hornsby $185, Penrith $179, Liverpool $182 per hour) and add 10% GST.`, '',
      ...ms.map((m) => [`## ${m.title} (menu ${m.id})`, `Labour ${m.labourHours} h. Operations: ${m.operations.map((o) => `${o.desc} (${o.hours} h)`).join('; ')}.`, `Parts: ${m.parts.length ? m.parts.map((p) => `${p.desc} x${p.qty} (part ${p.partNo}, RRP ${money(p.rrp)})`).join('; ') : 'none'}.`, m.notes.length ? `Notes: ${m.notes.join(' ')}` : ''].filter(Boolean).join('\n'))].join('\n\n');
    const r = await kb.upsertResource({ slug: `dms-infomedia-menus-${mid}`, title: `Infomedia service menus: ${first.make} ${first.model}`, labels: [['topic', 'infomedia'], ...(menus.find((m) => m.modelId === mid && m.make === 'Toyota') ? [['model', mid]] : [])], metadata: { pack: 'simulated', modelId: mid }, texts: { menus: text } });
    idx[`menus-${mid}`] = r.id; process.stdout.write('.');
  }
  const cats = [...new Set(parts.map((p) => p.category))];
  for (const cat of cats) {
    const ps = parts.filter((p) => p.category === cat);
    const r = await kb.upsertResource({ slug: `dms-infomedia-parts-${cat}`, title: `Infomedia parts price file: ${cat}`, labels: [['topic', 'infomedia']], metadata: { pack: 'simulated', category: cat }, texts: { parts: [`# Parts price file: ${cat} (simulated Microcat EPC pricing)`, '', ...ps.map((p) => `- ${p.partNo}: ${p.desc}. RRP ${money(p.rrp)}, dealer price ${money(p.dealerPrice)}. Fits: ${p.fits.join(', ')}.${p.supersedes ? ` Supersedes ${p.supersedes}.` : ''}`)].join('\n') } });
    idx[`parts-${cat}`] = r.id; process.stdout.write('.');
  }
  const r1 = await kb.upsertResource({ slug: 'dms-infomedia-campaigns', title: 'Infomedia campaigns and recalls', labels: [['topic', 'infomedia']], metadata: { pack: 'simulated' }, texts: { campaigns: ['# Campaigns and recalls (simulated Infomedia campaign feed)', '', ...campaigns.map((c2) => `## ${c2.id}: ${c2.title} (${c2.kind}, ${c2.status})\nModels: ${c2.models.join(', ')}; years ${c2.yearFrom} to ${c2.yearTo}; VIN prefix ${c2.vinFrom} to ${c2.vinTo}. Remedy: ${c2.remedy} Labour ${c2.hours} h; parts RRP ${money(c2.partsRrp)}. Opened ${c2.openedAt}.`)].join('\n\n') } });
  idx.campaigns = r1.id;
  const r2 = await kb.upsertResource({ slug: 'dms-infomedia-what-it-is', title: 'What the Infomedia data pack is and how Harbourline uses it', labels: [['topic', 'infomedia']], metadata: { pack: 'simulated' }, texts: { about: 'Infomedia supplies aftersales data to automakers and dealers: Microcat EPC (electronic parts catalogue with part numbers, prices, supersessions and fitment by VIN) and Superservice Menus (VIN-specific service and repair menus with labour times, parts and menu prices, plus service-plan pricing). Dealers connect them to the DMS through the DMSi module so menus and parts transfer into job cards. At Harbourline the pack is simulated: a quote is menu hours multiplied by the site labour rate, plus parts at RRP, plus 10 percent GST, valid for 14 days. Campaigns and recalls come from the same feed.' } });
  idx.about = r2.id;
  const fs = await import('node:fs'); const f = infomedia.kbIndexPath; const cur = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  fs.writeFileSync(f, JSON.stringify({ jobCards: {}, suppliers: {}, customers: {}, ...cur, infomedia: { ...(cur.infomedia || {}), ...idx } }, null, 1) + '\n');
  console.log(`\n   ✓ ${Object.keys(idx).length} Infomedia resources`);
}
if (want('suppliers')) { console.log('→ suppliers'); const r = await pool(db.all('suppliers'), 3, (s) => svc.syncEntity('supplier', s.id)); console.log(`   ✓ ${r.filter((x) => x.ok).length}/${db.all('suppliers').length}`); }
if (want('jobcards')) {
  const cut = Date.now() - DAYS * 86400000;
  const pick = db.all('job_cards').filter((c2) => svc.OPEN_STATUSES.includes(c2.status) || Date.parse(c2.bookedAt) > cut).sort((a, b) => String(b.bookedAt).localeCompare(String(a.bookedAt))).slice(0, MAX);
  console.log(`→ job cards (${pick.length}: open or booked in the last ${DAYS} days, newest first)`);
  const r = await pool(pick, 3, async (c2) => { const x = await svc.syncEntity('job_card', c2.id); process.stdout.write(x.ok ? '.' : 'x'); return x; });
  console.log(`\n   ✓ ${r.filter((x) => x.ok).length}/${pick.length}`);
}
if (want('customers')) {
  const ids = [...new Set(db.all('memos').filter((m) => m.entity === 'customer').map((m) => m.entityId))].slice(0, 120);
  console.log(`→ customers with memos (${ids.length})`);
  const r = await pool(ids, 3, async (id) => { const x = await svc.syncEntity('customer', id); process.stdout.write(x.ok ? '.' : 'x'); return x; });
  console.log(`\n   ✓ ${r.filter((x) => x.ok).length}/${ids.length}`);
}
console.log('done. Resources process in the background (a few minutes); answers ground once they are PROCESSED.');
