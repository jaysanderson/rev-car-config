// Harbourline DMS · Sales — SPA entry: shell, hash router, auth, role-driven rail, data-layer toggle.
import { state, api, setSession, setSite, setLang, setUnauthorisedHandler, icon, esc, initials, ROLE_LABEL, siteName, empty, closeDrawer, clearCache, toast } from './core.js';
import { initHelp } from './help.js';
import { initPalette } from './palette.js';

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
  { id: 'customers', label: 'Customers', ic: 'customers', roles: ['gm', 'sales_manager', 'salesperson', 'finance', 'service_manager', 'technician'] },
  { id: 'stock', label: 'Stock', ic: 'stock', roles: ['gm', 'sales_manager', 'salesperson'], badge: 'dm' },
  { id: 'finance', label: 'Finance & trade-ins', ic: 'finance', roles: ['gm', 'sales_manager', 'finance'] },
  { group: 'Service' },
  { id: 'job-cards', label: 'Job cards', ic: 'stock', roles: ['gm', 'sales_manager', 'service_manager', 'technician'], badge: 'ai' },
  { id: 'suppliers', label: 'Suppliers', ic: 'inbox', roles: ['gm', 'sales_manager', 'service_manager', 'finance'], badge: 'ai' },
  { group: 'Marketing' },
  { id: 'promotions', label: 'Promotions', ic: 'promotions', roles: ['gm', 'sales_manager', 'salesperson', 'dxm'] },
  { id: 'campaigns', label: 'Campaigns', ic: 'campaigns', roles: ['gm', 'sales_manager', 'dxm'] },
  { id: 'dxm', label: 'Digital experience', ic: 'dxm', roles: ['gm', 'sales_manager', 'dxm'] },
  { group: 'Back office' },
  { id: 'documents', label: 'Documents', ic: 'documents', roles: ['gm', 'sales_manager', 'dxm', 'finance', 'service_manager'], badge: 'ai' },
  { id: 'insights', label: 'Insights · Domo', ic: 'insights', roles: ['gm', 'sales_manager'], badge: 'dm' },
  { id: 'settings', label: 'Settings & API', ic: 'settings', roles: ALL },
  { group: 'Help' },
  { id: 'manual', label: 'Manual', ic: 'documents', roles: ALL, badge: 'ai' },
  { id: 'onboarding', label: 'Onboarding', ic: 'assistant', roles: ALL, badge: 'ai' },
];
const PAGES = {
  home: () => import('./pages/home.js'),
  login: () => import('./pages/login.js'),
  dashboard: () => import('./pages/dashboard.js'),
  leads: () => import('./pages/leads.js'),
  'test-drives': () => import('./pages/testdrives.js'),
  deals: () => import('./pages/deals.js'),
  customers: () => import('./pages/customers.js'),
  'job-cards': () => import('./pages/service.js'),
  suppliers: () => import('./pages/suppliers.js'),
  stock: () => import('./pages/stock.js'),
  finance: () => import('./pages/finance.js'),
  promotions: () => import('./pages/promotions.js'),
  campaigns: () => import('./pages/campaigns.js'),
  dxm: () => import('./pages/dxm.js'),
  documents: () => import('./pages/documents.js'),
  assistant: () => import('./pages/assistant.js'),
  insights: () => import('./pages/insights.js'),
  settings: () => import('./pages/settings.js'),
  manual: () => import('./pages/manual.js'),
  onboarding: () => import('./pages/onboarding.js'),
};
export const canSee = (id, role = state.user?.role) => { const n = NAV.find(x => x.id === id); return !n || !role || n.roles.includes(role); };
const homeFor = () => 'home';

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

let navSeq = 0; let curRoute = { page: '', params: [], raw: '' };
async function route() {
  const seq = ++navSeq;
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, qs] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
  let page = parts[0] || '';
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  closeDrawer(); document.body.classList.remove('rail-open'); view.querySelector('.page')?._optOff?.();
  if (!state.token || !state.user) { if (page !== 'login') { location.replace('#/login' + (page ? '?next=' + encodeURIComponent(raw) : '')); return; } }
  else if (!page || page === 'login') { location.replace('#/' + homeFor(state.user.role)); return; }
  renderShell(); markNav(page);
  document.body.classList.toggle('is-home', page === 'home'); document.body.classList.toggle('is-login', page === 'login'); document.body.classList.toggle('is-anon', !state.user);
  curRoute = { page, params: parts.slice(1), raw };
  if (state.user) { try { initHelp(); initPalette(); } catch (e) { console.warn('help/palette init', e); } }
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
    if (seq === navSeq) { view.focus({ preventScroll: true }); afterRender(root, page, parts.slice(1), label, raw); }
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


// ---------- SmartCenter chrome: open-screen tabs, Options tree, action bar, hotkeys ----------
const TABKEY = 'dms.tabs.v1'; const MAXTABS = 8;
let tabs = []; try { tabs = JSON.parse(sessionStorage.getItem(TABKEY) || '[]'); } catch {}
const saveTabs = () => { try { sessionStorage.setItem(TABKEY, JSON.stringify(tabs)); } catch {} };
const TAB_ICON = Object.fromEntries(NAV.filter(n => n.id).map(n => [n.id, n.ic]));
function tabKey(page, params) { return page === 'home' ? 'home' : [page, ...params].join('/'); }
function renderTabs(activeKey) {
  const el = $('#tabsList'); if (!el) return;
  const homeTab = `<a class="tab home ${activeKey === 'home' ? 'on' : ''}" href="#/home">Home</a>`;
  el.innerHTML = homeTab + tabs.map(t => `<a class="tab ${t.key === activeKey ? 'on' : ''}" href="#/${t.raw}" data-key="${esc(t.key)}">${t.ic ? icon(t.ic) : ''}<span>${esc(t.title)}${t.count != null ? ` (${esc(t.count)})` : ''}</span><button class="x" data-close="${esc(t.key)}" aria-label="Close ${esc(t.title)}"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="6.5"/><path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8"/></svg></button></a>`).join('');
}
function openTab(page, params, title, raw) {
  if (page === 'home' || page === 'login') { renderTabs(page === 'home' ? 'home' : ''); return; }
  const key = tabKey(page, params); let t = tabs.find(x => x.key === key);
  if (!t) { t = { key, raw: raw.split('?')[0], title, ic: TAB_ICON[page] || null, count: null }; tabs.push(t); if (tabs.length > MAXTABS) tabs.shift(); }
  else t.raw = raw.split('?')[0] + (raw.includes('?') && !params.length ? '?' + raw.split('?')[1] : '');
  saveTabs(); renderTabs(key); return t;
}
window.dmsTab = { set({ count, title } = {}) { const t = tabs.find(x => x.key === tabKey(curRoute.page, curRoute.params)); if (!t) return; if (count !== undefined) t.count = count; if (title) t.title = title; saveTabs(); renderTabs(t.key); } };
document.addEventListener('click', e => {
  const c = e.target.closest('[data-close]'); if (!c) return;
  e.preventDefault(); e.stopPropagation();
  const key = c.dataset.close; const i = tabs.findIndex(t => t.key === key); if (i < 0) return;
  const wasActive = tabKey(curRoute.page, curRoute.params) === key; tabs.splice(i, 1); saveTabs();
  if (wasActive) location.hash = tabs.length ? '#/' + tabs[Math.max(0, i - 1)].raw : '#/home'; else renderTabs(tabKey(curRoute.page, curRoute.params));
});
function autoCount(root, page, params) {
  if (params.length || page === 'home') return;
  const read = () => { const c = root.querySelector('.filterbar .count, .pager .count, [data-count]'); const m = c && /([\d,]+)/.exec(c.textContent || ''); if (m) window.dmsTab.set({ count: m[1] }); return Boolean(m); };
  if (!read()) { let n = 0; const iv = setInterval(() => { if (read() || ++n > 12 || tabKey(curRoute.page, curRoute.params) !== tabKey(page, params)) clearInterval(iv); }, 500); }
}
const DETAIL_PAGES = new Set(['job-cards', 'customers', 'deals', 'suppliers', 'leads', 'stock', 'test-drives', 'documents']);
function buildOptions(root, page, params, label) {
  if (!params.length || !DETAIL_PAGES.has(page) || root.querySelector('.options')) return;
  const cards = [...root.querySelectorAll(':scope > section.card, :scope > .card, :scope > .split > section.card, :scope > .split > div > section.card, :scope > .stack > section.card, :scope > div > section.card')].filter(c => c.querySelector(':scope > .chead h3, :scope > h3'));
  if (cards.length < 2) return;
  const opts = cards.map((c, i) => { const h = c.querySelector(':scope > .chead h3, :scope > h3'); c.id = c.id || `opt-${i}`; c.classList.add('opt-target'); return { id: c.id, text: h.textContent.replace(/\s*\(?\d+\)?\s*$/, '').trim() || `Section ${i + 1}` }; }).filter((o, i, a) => o.text && a.findIndex(x => x.text === o.text) === i).slice(0, 14);
  const aside = document.createElement('aside'); aside.className = 'options'; aside.setAttribute('aria-label', 'Options');
  aside.innerHTML = `<div class="otitle">Options</div><a class="oitem hd" href="#/${esc(page)}">‹ ${esc(label)}</a><div class="ogroup">${esc(params[0])}</div>` + opts.map((o, i) => `<button class="oitem ${i === 0 ? 'on' : ''}" data-target="${esc(o.id)}">${esc(o.text)}</button>`).join('');
  root.classList.add('has-options'); root.prepend(aside);
  const items = [...aside.querySelectorAll('[data-target]')];
  const mark = id => items.forEach(b => b.classList.toggle('on', b.dataset.target === id));
  items.forEach(b => b.onclick = () => { const t = document.getElementById(b.dataset.target); if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'start' }); mark(b.dataset.target); } });
  const onScroll = () => { let cur = items[0]?.dataset.target; for (const b of items) { const t = document.getElementById(b.dataset.target); if (t && t.getBoundingClientRect().top < 140) cur = b.dataset.target; } mark(cur); };
  window.addEventListener('scroll', onScroll, { passive: true }); root._optOff = () => window.removeEventListener('scroll', onScroll);
}
function afterRender(root, page, params, label, raw) {
  const t = openTab(page, params, params.length ? `${label} ${params[0]}` : label, raw);
  try { buildOptions(root, page, params, label); } catch (e) { console.warn('options', e); }
  autoCount(root, page, params); updateActionBar();
}
const NEW_RE = /^\s*\+?\s*(New|Add|Create|Book|Upload|Raise)\b/i;
function pageNewButton() { return [...document.querySelectorAll('#view .pagehead .actions .btn, #view .pagehead .actions button')].find(b => NEW_RE.test(b.textContent || '') && !b.disabled) || null; }
function drawerSubmit() { const d = document.getElementById('drawer'); if (!d || d.getAttribute('aria-hidden') === 'true') return null; return d.querySelector('button[type=submit], form .btn:not(.ghost):not(.secondary)'); }
function updateActionBar() {
  const nb = pageNewButton(); const abNew = $('#abNew'), abSave = $('#abSave');
  if (nb) { abNew.hidden = false; abNew.querySelector('span').textContent = `${(nb.textContent || 'New').replace(/^\s*\+\s*/, '').trim()} (N)`; } else abNew.hidden = true;
  const ds = drawerSubmit(); abSave.hidden = !ds; $('#ibNew').style.display = nb ? '' : 'none';
}
new MutationObserver(() => updateActionBar()).observe(document.body, { attributes: true, attributeFilter: ['class'] });
const typing = () => { const a = document.activeElement; return a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable); };
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || typing()) return;
  const k = e.key.toLowerCase();
  if (k === 'n') { const b = pageNewButton(); if (b) { e.preventDefault(); b.click(); } }
  else if (k === 's') { const b = drawerSubmit(); if (b) { e.preventDefault(); b.click(); } }
  else if (k === 'r') { e.preventDefault(); route(); }
  else if (k === 'h') { e.preventDefault(); window.hlHelp?.open?.({}); }
});
$('#abNew').onclick = () => pageNewButton()?.click(); $('#ibNew').onclick = () => pageNewButton()?.click();
$('#abSave').onclick = () => drawerSubmit()?.click();
$('#abRefresh').onclick = $('#ibRefresh').onclick = () => route();
$('#ibHelp').onclick = () => window.hlHelp?.open?.({});
$('#ibNote').onclick = () => { location.hash = '#/home'; };
$('#ibFull').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); };

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
