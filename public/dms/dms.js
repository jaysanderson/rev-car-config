// Harbourline DMS · Sales — SPA entry: shell, hash router, auth, role-driven rail, data-layer toggle.
import { state, api, setSession, setSite, setLang, setUnauthorisedHandler, icon, esc, initials, ROLE_LABEL, siteName, empty, closeDrawer, clearCache, toast } from './core.js';

// role → which pages. gm all; sales_manager all (no Domo recompute, enforced on the page);
// salesperson own leads/deals/test drives + read-only stock & promotions; dxm; finance.
const ALL = ['gm', 'sales_manager', 'salesperson', 'dxm', 'finance'];
export const NAV = [
  { group: 'Overview' },
  { id: 'dashboard', label: 'Dashboard', ic: 'dashboard', roles: ['gm', 'sales_manager', 'salesperson'], badge: 'dm' },
  { id: 'assistant', label: 'Assistant', ic: 'assistant', roles: ALL, badge: 'ai' },
  { group: 'Sales' },
  { id: 'leads', label: 'Leads', ic: 'leads', roles: ['gm', 'sales_manager', 'salesperson', 'dxm'] },
  { id: 'test-drives', label: 'Test drives', ic: 'drive', roles: ['gm', 'sales_manager', 'salesperson'] },
  { id: 'deals', label: 'Deals', ic: 'deals', roles: ['gm', 'sales_manager', 'salesperson', 'finance'] },
  { id: 'customers', label: 'Customers', ic: 'customers', roles: ['gm', 'sales_manager', 'salesperson', 'finance'] },
  { id: 'stock', label: 'Stock', ic: 'stock', roles: ['gm', 'sales_manager', 'salesperson'], badge: 'dm' },
  { id: 'finance', label: 'Finance & trade-ins', ic: 'finance', roles: ['gm', 'sales_manager', 'finance'] },
  { group: 'Marketing' },
  { id: 'promotions', label: 'Promotions', ic: 'promotions', roles: ['gm', 'sales_manager', 'salesperson', 'dxm'] },
  { id: 'campaigns', label: 'Campaigns', ic: 'campaigns', roles: ['gm', 'sales_manager', 'dxm'] },
  { id: 'dxm', label: 'Digital experience', ic: 'dxm', roles: ['gm', 'sales_manager', 'dxm'] },
  { group: 'Back office' },
  { id: 'documents', label: 'Documents', ic: 'documents', roles: ['gm', 'sales_manager', 'dxm', 'finance'], badge: 'ai' },
  { id: 'insights', label: 'Insights · Domo', ic: 'insights', roles: ['gm', 'sales_manager'], badge: 'dm' },
  { id: 'settings', label: 'Settings & API', ic: 'settings', roles: ALL },
];
const PAGES = {
  login: () => import('./pages/login.js'),
  dashboard: () => import('./pages/dashboard.js'),
  leads: () => import('./pages/leads.js'),
  'test-drives': () => import('./pages/testdrives.js'),
  deals: () => import('./pages/deals.js'),
  customers: () => import('./pages/customers.js'),
  stock: () => import('./pages/stock.js'),
  finance: () => import('./pages/finance.js'),
  promotions: () => import('./pages/promotions.js'),
  campaigns: () => import('./pages/campaigns.js'),
  dxm: () => import('./pages/dxm.js'),
  documents: () => import('./pages/documents.js'),
  assistant: () => import('./pages/assistant.js'),
  insights: () => import('./pages/insights.js'),
  settings: () => import('./pages/settings.js'),
};
export const canSee = (id, role = state.user?.role) => { const n = NAV.find(x => x.id === id); return !n || !role || n.roles.includes(role); };
const homeFor = role => (NAV.find(n => n.id && n.roles.includes(role)) || { id: 'assistant' }).id;

const $ = s => document.querySelector(s);
const view = $('#view');

function renderShell() {
  const u = state.user;
  $('#app').classList.toggle('anon', !u);
  if (!u) return;
  $('#railnav').innerHTML = NAV.filter(n => n.group || canSee(n.id)).filter((n, i, arr) => !(n.group && (!arr[i + 1] || arr[i + 1].group)))
    .map(n => n.group ? `<div class="group">${esc(n.group)}</div>` : `<a href="#/${n.id}" data-nav="${n.id}">${icon(n.ic)}<span>${esc(n.label)}</span>${n.badge === 'ai' ? '<span class="ai" title="Progress Agentic RAG">ARAG</span>' : n.badge === 'dm' ? '<span class="dm" title="Domo">DOMO</span>' : ''}</a>`).join('');
  $('#userAv').textContent = u.avatarInitials || initials(u.name);
  $('#userName').textContent = u.name || u.email;
  $('#userRole').textContent = `${ROLE_LABEL[u.role] || u.role}${u.siteId ? ' · ' + siteName(u.siteId) : ''}`;
  const sel = $('#siteSel');
  const allSites = ['gm', 'dxm', 'finance'].includes(u.role) || !u.siteId;
  sel.disabled = !allSites;
  if (!allSites) setSite(u.siteId);
  sel.value = state.site;
  $('#userMenu').innerHTML = `<div class="hd">${esc(u.email || '')}</div><a href="#/settings">Settings & API</a><a href="/" >Customer configurator</a><button data-act="logout">Sign out</button>`;
}

function markNav(id) { document.querySelectorAll('[data-nav]').forEach(a => a.dataset.nav === id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')); }

let navSeq = 0;
async function route() {
  const seq = ++navSeq;
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, qs] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
  let page = parts[0] || '';
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  closeDrawer(); document.body.classList.remove('rail-open');
  if (!state.token || !state.user) { if (page !== 'login') { location.replace('#/login' + (page ? '?next=' + encodeURIComponent(raw) : '')); return; } }
  else if (!page || page === 'login') { location.replace('#/' + homeFor(state.user.role)); return; }
  renderShell(); markNav(page);
  const root = document.createElement('div'); root.className = 'page page-' + page;
  view.replaceChildren(root);
  if (!PAGES[page]) { root.innerHTML = empty({ ic: 'alert', title: 'Page not found', body: `There is no page at <code>#/${esc(pathPart)}</code>.`, actions: `<a class="btn sm" href="#/${homeFor(state.user?.role)}">Go to start</a>` }); return; }
  if (state.user && !canSee(page)) { root.innerHTML = empty({ ic: 'lock', title: 'Not available for your role', body: `${esc(ROLE_LABEL[state.user.role] || state.user.role)} accounts don’t use this part of the DMS. Pick a page from the rail, or sign in as the general manager to see everything.`, actions: `<a class="btn sm" href="#/${homeFor(state.user.role)}">Go to my start page</a>` }); document.title = 'Not available · Harbourline DMS'; return; }
  try {
    const mod = await PAGES[page]();
    if (seq !== navSeq) return;
    const label = (NAV.find(n => n.id === page) || {}).label || (page === 'login' ? 'Sign in' : page);
    document.title = `${label} · Harbourline DMS`;
    await mod.default(root, { params: parts.slice(1), query, page, rerender: () => route() });
    if (seq === navSeq) view.focus({ preventScroll: true });
  } catch (e) {
    console.error(e);
    if (seq === navSeq) root.innerHTML = empty({ ic: 'alert', error: true, title: 'This page failed to render', body: esc(e.message || String(e)), actions: '<button class="btn secondary sm" onclick="location.reload()">Reload</button>' });
  }
}

export function signedIn(token, user) {
  setSession(token, user); clearCache();
  if (user.siteId && !['gm', 'dxm', 'finance'].includes(user.role)) setSite(user.siteId); else setSite('');
}
export function logout() { api('/auth/logout', { method: 'POST' }); setSession(null, null); clearCache(); location.hash = '#/login'; }
setUnauthorisedHandler(() => { if (state.token) { setSession(null, null); toast('Your session ended (the server may have restarted). Sign in again.'); const cur = location.hash.replace(/^#\/?/, ''); location.hash = '#/login' + (cur && !cur.startsWith('login') ? '?next=' + encodeURIComponent(cur) : ''); } });

// ---------- band ----------
const revealBtn = $('#reveal');
let revealOn = false; try { revealOn = localStorage.getItem('dms.reveal') === '1'; } catch {}
const setReveal = on => { revealOn = on; document.body.classList.toggle('reveal', on); revealBtn.classList.toggle('on', on); revealBtn.setAttribute('aria-pressed', String(on)); try { localStorage.setItem('dms.reveal', on ? '1' : '0'); } catch {} };
revealBtn.onclick = () => setReveal(!revealOn); setReveal(revealOn);
document.querySelectorAll('#langs button').forEach(b => { b.classList.toggle('on', b.dataset.lang === state.lang); b.onclick = () => { setLang(b.dataset.lang); document.querySelectorAll('#langs button').forEach(x => x.classList.toggle('on', x === b)); toast(`AI answers in ${b.textContent}`); }; });
$('#menuBtn').onclick = () => document.body.classList.toggle('rail-open');
$('#siteSel').onchange = e => { setSite(e.target.value); route(); };
$('#userBtn').onclick = e => { e.stopPropagation(); const m = $('#userMenu'); m.classList.toggle('hide'); $('#userBtn').setAttribute('aria-expanded', String(!m.classList.contains('hide'))); };
document.addEventListener('click', e => {
  if (!e.target.closest('#userMenu,#userBtn')) $('#userMenu').classList.add('hide');
  if (e.target.closest('[data-act="logout"]')) logout();
  if (document.body.classList.contains('rail-open') && !e.target.closest('#rail,#menuBtn')) document.body.classList.remove('rail-open');
});
$('#drawerClose').onclick = closeDrawer; $('#backdrop').onclick = closeDrawer;
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDrawer(); $('#userMenu').classList.add('hide'); } });

// ---------- chart tooltips: any [data-tip] ----------
const tipEl = $('#tip');
document.addEventListener('mousemove', e => {
  const t = e.target.closest?.('[data-tip]');
  if (!t) { tipEl.classList.remove('on'); return; }
  tipEl.innerHTML = t.getAttribute('data-tip');
  const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + w > innerWidth - 8) x = e.clientX - w - 14; if (y + h > innerHeight - 8) y = e.clientY - h - 14;
  tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px'; tipEl.classList.add('on');
});

// ---------- API status in the rail foot ----------
async function health() {
  const r = await api('/health', { timeout: 8000 });
  const el = $('#apiStatus'); state.apiUp = r.ok;
  el.className = 'status ' + (r.ok ? 'ok' : 'down');
  const d = r.data || {};
  const ar = d.arag ?? d.aragConfigured; const dm = d.domo ?? d.domoMode;
  el.innerHTML = `<i></i><span>${r.ok ? `API live${ar !== undefined ? ` · ARAG ${ar === false ? 'off' : 'on'}` : ''}${dm ? ` · Domo ${esc(typeof dm === 'string' ? dm : 'on')}` : ''}` : 'API unavailable'}</span><span class="ann dms">GET /dms/api/health</span>`;
}
health(); setInterval(health, 60000);

window.addEventListener('hashchange', route);
route();
