#!/usr/bin/env node
// used-comments.mjs — have the agent write the dealer comments for every pre-owned
// listing, validate them against the record, cache them and push each one back to the
// listing's resource summary in the knowledge box.
//
//   node scripts/used-comments.mjs                 # all units without agent comments
//   node scripts/used-comments.mjs --force         # rewrite all
//   node scripts/used-comments.mjs --only U-33002
//   node scripts/used-comments.mjs --no-push       # do not PATCH resource summaries
//
// Output: content/dealer/used_comments.generated.json (seed copy; the server reads it
// through state.mjs and can regenerate single units via POST /api/used/comments/refresh).
// Each /ask takes ~5–10 s; runs 3 at a time. Secrets are never printed.
import { kbCoords } from './lib-env.mjs';
const args = process.argv.slice(2);
const FORCE = args.includes('--force'); const PUSH = !args.includes('--no-push');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1]?.toUpperCase() : null;
const env = kbCoords(); for (const [k, v] of Object.entries({ ARAG_KB_ID: env.kbId, ARAG_API_KEY: env.token, ARAG_ZONE: env.zone })) process.env[k] ||= v;
const D = await import('../server/used-data.mjs');
const { generateComments } = await import('../server/used.mjs');
const { updateDealer } = await import('../server/state.mjs');
const arag = await import('../server/arag.mjs');
if (!arag.configured()) { console.error('✗ ARAG not configured (.env)'); process.exit(1); }

const have = D.commentsStore().items || {};
const todo = D.units().filter((u) => (ONLY ? u.stockNo === ONLY : FORCE || !have[u.stockNo]));
console.log(`${todo.length} unit(s) to write${PUSH ? ', pushing summaries to the knowledge box' : ''}`);
const items = {}; const failed = [];
let i = 0;
async function worker() {
  while (i < todo.length) {
    const u = todo[i++]; const t0 = Date.now();
    try {
      let r = await generateComments(u);
      if (!r.ok && r.reason !== 'not configured') r = await generateComments(u); // one retry: the model occasionally slips a figure
      if (r.ok) { items[u.stockNo] = r.comments; console.log(`   ✓ ${u.stockNo} ${D.title(u)} ${u.grade} (${Math.round((Date.now() - t0) / 1000)}s) "${r.comments.headline}"`); }
      else { failed.push({ stockNo: u.stockNo, reason: r.reason }); console.log(`   ✗ ${u.stockNo}: ${r.reason}`); }
    } catch (e) { failed.push({ stockNo: u.stockNo, reason: e.message }); console.log(`   ✗ ${u.stockNo}: ${e.message}`); }
  }
}
await Promise.all([worker(), worker(), worker()]);
if (Object.keys(items).length) {
  await updateDealer('used_comments.generated.json', (cur) => ({ generatedAt: new Date().toISOString(), model: process.env.ARAG_GENERATIVE_MODEL || 'kb default', items: { ...(cur?.items || {}), ...items } }), { items: {} });
  console.log(`✓ cached ${Object.keys(items).length} comment set(s) in content/dealer/used_comments.generated.json`);
}
if (PUSH && Object.keys(items).length) {
  const H = { 'X-NUCLIA-SERVICEACCOUNT': `Bearer ${env.token}`, 'Content-Type': 'application/json' };
  let n = 0;
  for (const [stockNo, c] of Object.entries(items)) {
    const rid = D.resourceIdOf(stockNo); if (!rid) continue;
    const r = await fetch(`${env.kbUrl}/resource/${rid}`, { method: 'PATCH', headers: H, body: JSON.stringify({ summary: `${c.headline}. ${c.body}`, texts: { comments: { body: `# Dealer comments (written by the Harbourline agent on ${c.generatedAt.slice(0, 10)})\n\n**${c.headline}**\n\n${c.body}\n\nHighlights: ${c.highlights.join('; ')}.${c.honest.length ? `\n\nWorth knowing: ${c.honest.join('; ')}.` : ''}`, format: 'MARKDOWN' } } }), signal: AbortSignal.timeout(30000) }).catch((e) => ({ ok: false, status: e.message }));
    if (r.ok) n++; else console.log(`   ! summary push ${stockNo} → ${r.status}`);
  }
  console.log(`✓ pushed ${n} summaries/comment fields to the knowledge box`);
}
if (failed.length) console.log(`! ${failed.length} failed: ${failed.map((f) => `${f.stockNo} (${f.reason})`).join(', ')}`);
