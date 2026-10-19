// Home: SmartCenter-style tile screen over the sunrise scene. Tiles are live counts from the DMS API,
// filtered by what the signed-in role may open. Sticky note carries today's onboarding tip.
import { api, state, total, esc, ROLE_LABEL } from '../core.js';
import { canSee } from '../dms.js';

// [group, id, label, colour, route, page (for canSee), request {path, query}, sub label]
const TILES = [
  ['System', 'dash', 'Dashboard', 'blue', '#/dashboard', 'dashboard', null, 'Analytics'],
  ['System', 'tickets', 'Help tickets', 'orange', '#/settings', 'settings', { path: '/help/tickets', query: { status: 'open', pageSize: 1 }, cap: ['gm', 'sales_manager', 'service_manager', 'dxm'] }, 'New'],
  ['Sales', 'leads', 'New leads', 'blue', '#/leads?status=new', 'leads', { path: '/leads', query: { status: 'new', pageSize: 1 } }, 'New'],
  ['Sales', 'stuck', 'Stuck deals', 'red', '#/deals?stuck=1', 'deals', { path: '/deals', query: { stuck: '1', pageSize: 1 } }, 'Stuck'],
  ['Sales', 'td', 'Test drives booked', 'teal', '#/test-drives', 'test-drives', { path: '/test-drives', query: { status: 'booked', pageSize: 1 } }, 'Booked'],
  ['Service', 'jobs', 'Open job cards', 'green', '#/job-cards', 'job-cards', { path: '/job-cards', query: { open: '1', pageSize: 1 } }, 'Open'],
  ['Service', 'parts', 'Awaiting parts', 'purple', '#/job-cards?status=awaiting_parts', 'job-cards', { path: '/job-cards', query: { status: 'awaiting_parts', pageSize: 1 } }, 'Waiting'],
  ['Service', 'suppliers', 'Suppliers', 'slate', '#/suppliers', 'suppliers', { path: '/suppliers', query: { pageSize: 1 } }, 'Active'],
  ['Stock', 'aged', 'Aged stock (60+ days)', 'orange', '#/stock?aged=1', 'stock', { path: '/vehicles', query: { aged: '1', pageSize: 1 } }, 'Aged'],
  ['Stock', 'docs', 'Documents to process', 'teal', '#/documents', 'documents', { path: '/documents', query: { status: 'uploaded', pageSize: 1 } }, 'Waiting'],
  ['Insights', 'insights', 'Domo signals', 'blue', '#/insights', 'insights', null, 'Domo'],
  ['Help', 'manual', 'User manual', 'slate', '#/manual', 'manual', null, 'Read'],
  ['Help', 'onboarding', 'Onboarding', 'green', '#/onboarding', 'onboarding', null, 'Start'],
];
const TIPS = ['Press Cmd+K to search customers, cars, deals, job cards and the manual in one box.', 'Open the Help bubble (H) and ask in plain English. Answers cite the manual chapter.', 'Ask across job cards: "which cards are waiting on parts for more than two days?"', 'Switch the Data layer on to see the endpoint or dataset behind every number.'];

export default async function home(root) {
  const u = state.user; const role = u?.role;
  const visible = TILES.filter(t => canSee(t[5], role));
  const groups = [...new Set(visible.map(t => t[0]))];
  const tip = TIPS[new Date().getDate() % TIPS.length];
  root.innerHTML = `<div class="homegrid">
    <section class="tilegroup"><h2>Sticky Notes</h2><div class="tiles"><a class="tile green note" href="#/onboarding" id="stk"><span class="ham">≡</span><span class="ttl">Welcome to Harbourline DMS!</span><span class="body" id="stkBody">${esc(tip)}</span><span class="lbl">Sticky Note · ${esc(ROLE_LABEL[role] || role || '')}</span></a></div></section>
    ${groups.map(g => `<section class="tilegroup"><h2>${esc(g)}</h2><div class="tiles">${visible.filter(t => t[0] === g).map(t => `<a class="tile ${t[3]}" href="${esc(t[4])}" data-tile="${t[1]}"><span class="ham">≡</span><span class="count"><b>${t[6] ? '…' : '→'}</b><small>${esc(t[7])}</small></span><span class="lbl">${esc(t[2])}</span><i class="flag" hidden></i></a>`).join('')}</div></section>`).join('')}
  </div><div class="homefoot">Powered by Progress Agentic RAG and Domo · prototype for Revolution Software · synthetic data</div>`;
  visible.forEach(async t => {
    const req = t[6]; if (!req || (req.cap && !req.cap.includes(role))) { if (req) root.querySelector(`[data-tile="${t[1]}"]`)?.remove(); return; }
    const r = await api(req.path, { query: req.query, quiet: true });
    const el = root.querySelector(`[data-tile="${t[1]}"]`); if (!el) return;
    if (!r.ok) { el.querySelector('b').textContent = '–'; return; }
    const n = total(r.data); el.querySelector('b').textContent = n.toLocaleString('en-AU');
    el.querySelector('.flag').hidden = !(n > 0 && ['tickets', 'leads', 'stuck', 'parts', 'aged'].includes(t[1]));
  });
  api('/onboarding/progress', { quiet: true }).then(r => { const n = r.ok && r.data?.nextStep; const t = n && (typeof n === 'string' ? n : n.title); if (t) root.querySelector('#stkBody').textContent = `Next step: ${t}. Click to continue your onboarding.`; });
}
