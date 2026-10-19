// Harbourline DMS · command palette (Cmd+K / Ctrl+K): AI search across the whole system.
// GET /search?q= returns groups {entities, knowledge, actions} (phase 2) or the older {items:[{source:'kb'|'erp',…}]}.
import { api, esc, icon, ann } from './core.js';

const ROUTES = { leads: (id) => `#/leads/${enc(id)}`, deals: (id) => `#/deals/${enc(id)}`, customers: (id) => `#/customers/${enc(id)}`, vehicles: (id) => `#/stock?unit=${enc(id)}`, test_drives: () => '#/test-drives', documents: (id) => `#/documents?doc=${enc(id)}`, job_cards: (id) => `#/job-cards/${enc(id)}`, suppliers: (id) => `#/suppliers/${enc(id)}`, staff: () => '#/settings', campaigns: () => '#/campaigns', promotions: () => '#/promotions', finance_apps: () => '#/finance', trade_ins: () => '#/finance', memos: (id, r) => (r.jobCardId ? `#/job-cards/${enc(r.jobCardId)}` : r.supplierId ? `#/suppliers/${enc(r.supplierId)}` : r.customerId ? `#/customers/${enc(r.customerId)}` : '#/customers') };
const enc = encodeURIComponent;
const ACTIONS = [
  { title: 'Go to Dashboard', route: '#/dashboard', words: 'dashboard home kpi' }, { title: 'Go to Leads', route: '#/leads', words: 'leads enquiries' }, { title: 'Go to Deals', route: '#/deals', words: 'deals pipeline' },
  { title: 'Go to Customers', route: '#/customers', words: 'customers people' }, { title: 'Go to Stock', route: '#/stock', words: 'stock vehicles units' }, { title: 'Go to Test drives', route: '#/test-drives', words: 'test drives bookings' },
  { title: 'Go to Job cards', route: '#/job-cards', words: 'service job cards workshop repair orders' }, { title: 'Go to Suppliers', route: '#/suppliers', words: 'suppliers vendors invoices' },
  { title: 'Go to Documents', route: '#/documents', words: 'documents contracts upload' }, { title: 'Go to Promotions', route: '#/promotions', words: 'promotions offers' }, { title: 'Go to Campaigns', route: '#/campaigns', words: 'campaigns marketing' },
  { title: 'Open the manual', route: '#/manual', words: 'manual help how to guide' }, { title: 'Start onboarding', route: '#/onboarding', words: 'onboarding training new user' }, { title: 'Ask the assistant', route: '#/assistant', words: 'assistant ask question ai' },
  { title: 'Settings & API', route: '#/settings', words: 'settings api token mcp' }, { title: 'Insights · Domo', route: '#/insights', words: 'insights domo datasets export' },
];
let built = false, open = false, sel = 0, results = [], timer = null, lastQ = '';
const $ = (s) => document.querySelector(s);

function build() {
  if (built) return; built = true;
  const el = document.createElement('div'); el.id = 'pal'; el.className = 'pal'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<div class="pal-scrim" id="palScrim"></div><div class="pal-box" role="dialog" aria-label="Search the DMS"><div class="pal-in">${icon('search')}<input id="palQ" placeholder="Search customers, deals, stock, job cards, suppliers, the manual…" autocomplete="off" aria-label="Search"><kbd>esc</kbd></div><div class="pal-list" id="palList" role="listbox"></div><div class="pal-foot"><span>↑↓ to move · Enter to open · AI search over records and knowledge</span>${ann('GET /dms/api/search?q=', 'kb')}</div></div>`;
  document.body.appendChild(el);
  $('#palScrim').onclick = () => toggle(false);
  const q = $('#palQ');
  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => search(q.value), 250); });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); } else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[sel]); } else if (e.key === 'Escape') toggle(false);
  });
  document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); toggle(); } });
}
function toggle(force) {
  build(); open = force ?? !open;
  const el = $('#pal'); el.classList.toggle('open', open); el.setAttribute('aria-hidden', String(!open));
  if (open) { const q = $('#palQ'); q.value = lastQ; render(); setTimeout(() => { q.focus(); q.select(); }, 30); if (!lastQ) search(''); }
}
function move(d) { if (!results.length) return; sel = (sel + d + results.length) % results.length; render(); const a = $('#palList .on'); a && a.scrollIntoView({ block: 'nearest' }); }
function go(r) { if (!r) return; toggle(false); if (r.route) location.hash = r.route; }
function normalise(d, q) {
  const out = [];
  if (d && (d.entities || d.knowledge || d.actions)) {
    for (const e of d.entities || []) out.push({ group: 'Records', title: e.title, sub: e.snippet || e.sub || e.table, route: e.route || (ROUTES[e.table] ? ROUTES[e.table](e.id, e) : null), kind: e.table });
    for (const k of d.knowledge || []) out.push({ group: 'Knowledge', title: k.title, sub: k.snippet, route: k.route || knowledgeRoute(k), kind: k.label || k.kind || 'kb', ai: true });
    for (const a of d.actions || []) out.push({ group: 'Actions', title: a.title, sub: a.sub || a.route, route: a.route });
  } else {
    for (const it of (d && d.items) || []) {
      if (it.source === 'erp') out.push({ group: 'Records', title: it.title, sub: it.snippet || it.table, route: ROUTES[it.table] ? ROUTES[it.table](it.id, it) : null, kind: it.table });
      else out.push({ group: 'Knowledge', title: it.title, sub: it.snippet, route: knowledgeRoute(it), kind: it.label || 'kb', ai: true });
    }
  }
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  for (const a of ACTIONS) if (!words.length || words.every((w) => a.words.includes(w) || a.title.toLowerCase().includes(w))) out.push({ group: 'Actions', title: a.title, sub: a.route, route: a.route });
  return out;
}
function knowledgeRoute(k) {
  const t = `${k.slug || ''} ${k.title || ''}`.toLowerCase();
  const m = t.match(/manual[-\s]+([a-z0-9-]+)/); if (m) return `#/manual/${m[1]}`;
  if ((k.label || k.kind || '') === 'document' && k.documentId) return `#/documents?doc=${enc(k.documentId)}`;
  if (/jobcard|job card|JC-\d+/i.test(t)) { const j = t.match(/jc-\d+/i); return j ? `#/job-cards/${j[0].toUpperCase()}` : '#/job-cards'; }
  if ((k.label || '') === 'supplier') return '#/suppliers';
  return `#/assistant?mode=manual&q=${enc(k.title || '')}`;
}
async function search(q) {
  lastQ = q; sel = 0;
  if (!q.trim()) { results = normalise(null, ''); render(); return; }
  $('#palList').innerHTML = `<div class="pal-empty">Searching…</div>`;
  const r = await api('/search', { query: { q }, timeout: 20000 });
  if (lastQ !== q) return;
  results = r.ok ? normalise(r.data, q) : normalise(null, q);
  if (!r.ok) results.unshift({ group: 'Search', title: r.friendly?.title || 'Search unavailable', sub: r.friendly?.message || r.error, route: null });
  render();
}
function render() {
  const list = $('#palList'); if (!list) return;
  if (!results.length) { list.innerHTML = `<div class="pal-empty">No matches. Try a name, an id (D-10482, HL-2231, JC-20481) or a question for the manual.</div>`; return; }
  let group = ''; let html = '';
  results.forEach((r, i) => {
    if (r.group !== group) { group = r.group; html += `<div class="pal-group">${esc(group)}</div>`; }
    html += `<button class="pal-item ${i === sel ? 'on' : ''}" role="option" aria-selected="${i === sel}" data-i="${i}"><span class="pal-ic">${icon(r.group === 'Actions' ? 'arrow' : r.ai ? 'assistant' : 'search')}</span><span class="pal-t"><b>${esc(r.title || '')}</b>${r.sub ? `<span>${esc(String(r.sub).slice(0, 140))}</span>` : ''}</span>${r.kind ? `<span class="chip ${r.ai ? 'kb' : 'dms'}">${esc(r.kind)}</span>` : ''}</button>`;
  });
  list.innerHTML = html;
  list.querySelectorAll('.pal-item').forEach((b) => { b.onclick = () => go(results[Number(b.dataset.i)]); b.onmousemove = () => { sel = Number(b.dataset.i); list.querySelectorAll('.pal-item').forEach((x) => x.classList.toggle('on', x === b)); }; });
}
export function initPalette() {
  build();
  const trig = document.getElementById('palTrigger'); if (trig && !trig.dataset.bound) { trig.dataset.bound = '1'; trig.onclick = () => toggle(true); }
}
window.hlPalette = { open: () => toggle(true) };
