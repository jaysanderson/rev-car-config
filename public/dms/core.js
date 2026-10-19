// Harbourline DMS · core: state, API client, formatting, icons, shared UI states.
// The SPA talks to /dms/api only. Every call resolves (never throws) to {ok,status,data,error}.

export const API = '/dms/api';
const SS = (() => { try { return window.sessionStorage; } catch { return null; } })();
const LS = (() => { try { return window.localStorage; } catch { return null; } })();
const sget = (s, k) => { try { return s ? s.getItem(k) : null; } catch { return null; } };
const sset = (s, k, v) => { try { if (!s) return; v == null ? s.removeItem(k) : s.setItem(k, v); } catch {} };

export const state = {
  token: sget(SS, 'dms.token'),
  user: JSON.parse(sget(SS, 'dms.user') || 'null'),
  site: sget(SS, 'dms.site') || '',
  lang: sget(LS, 'dms.lang') || 'en',
  apiUp: null,
};
export function setSession(token, user) {
  state.token = token; state.user = user;
  sset(SS, 'dms.token', token); sset(SS, 'dms.user', user ? JSON.stringify(user) : null);
}
export function setSite(s) { state.site = s || ''; sset(SS, 'dms.site', state.site || null); }
export function setLang(l) { state.lang = l; sset(LS, 'dms.lang', l); }

export const SITES = { par: 'Parramatta', hor: 'Hornsby', pen: 'Penrith', liv: 'Liverpool' };
export const siteName = id => SITES[id] || id || '—';
export const ROLE_LABEL = { gm: 'General manager', sales_manager: 'Sales manager', salesperson: 'Salesperson', dxm: 'Digital experience manager', finance: 'Business manager, F&I' };
export const MODEL_LABEL = { rav4: 'RAV4', kluger: 'Kluger', prado: 'LandCruiser Prado', 'landcruiser-300': 'LandCruiser 300', hilux: 'HiLux', corolla: 'Corolla', 'corolla-cross': 'Corolla Cross', camry: 'Camry', 'yaris-cross': 'Yaris Cross', yaris: 'Yaris', bz4x: 'bZ4X', c_hr: 'C-HR', 'c-hr': 'C-HR', fortuner: 'Fortuner', granvia: 'Granvia', hiace: 'HiAce', '86': 'GR86', gr86: 'GR86', supra: 'GR Supra' };
export const modelName = id => MODEL_LABEL[id] || (id ? String(id).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—');

let onUnauthorised = () => {};
export function setUnauthorisedHandler(fn) { onUnauthorised = fn; }

export async function api(path, { method = 'GET', body, query, timeout = 90000, quiet = false } = {}) {
  let url = API + path;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    const s = qs.toString(); if (s) url += (url.includes('?') ? '&' : '?') + s;
  }
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: ctl.signal });
    let data = null; const ct = r.headers.get('content-type') || '';
    if (ct.includes('json')) { try { data = await r.json(); } catch { data = null; } }
    else { const txt = await r.text(); data = txt; if (!r.ok || ct.includes('html')) data = null; }
    if (r.status === 401 && !path.startsWith('/auth/login')) { onUnauthorised(); }
    if (!r.ok) {
      const res = { ok: false, status: r.status, data, error: (data && (data.error || data.message)) || r.statusText || 'request failed' };
      // Friendly error (phase 2): ask the agent to explain the failure in plain language, grounded in the manual.
      if (!quiet) res.friendly = await explainError({ status: r.status, endpoint: path, method, message: res.error, code: data && data.code });
      return res;
    }
    // A JSON route that answers HTML (SPA fallback) means the API is not mounted yet.
    if (data === null && method === 'GET' && !ct.includes('json')) return { ok: false, status: 503, data: null, error: 'DMS API not mounted' };
    return { ok: true, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: e.name === 'AbortError' ? 'timed out' : 'network error' };
  } finally { clearTimeout(t); }
}


// ---------- friendly errors (Progress Agentic RAG explains API failures) ----------
const explainCache = new Map(); const recentErrors = new Map(); let explainAvailable = true;
const FALLBACK_FRIENDLY = {
  401: { title: 'Please sign in again', message: 'Your session has ended, so the DMS cannot tell who you are.', nextStep: 'Sign in with your demo account and retry.' },
  403: { title: 'Not available for your role', message: 'This action needs a permission your role does not have.', nextStep: 'Ask a general manager, or sign in as one for the demo.' },
  404: { title: 'That record is not here', message: 'The DMS has nothing at this address. It may have been removed, or the id is mistyped.', nextStep: 'Check the id, or search with Cmd+K.' },
  409: { title: 'Someone got there first', message: 'The record changed or is held by another action.', nextStep: 'Refresh and try again.' },
  429: { title: 'The assistant is busy', message: 'Too many AI requests in a short time.', nextStep: 'Wait a few seconds and try again.' },
  500: { title: 'Something went wrong on the server', message: 'The DMS hit an unexpected problem. Nothing is wrong with your data.', nextStep: 'Try again; if it repeats, raise a ticket from Help.' },
  502: { title: 'The AI service did not answer', message: 'The knowledge box or agent did not respond in time.', nextStep: 'Try again in a moment.' },
  504: { title: 'That took too long', message: 'The request timed out while a longer job (such as document processing) was still running.', nextStep: 'Call the same action again to pick up the result.' },
};
/** Explain an API failure in plain language. Always resolves (never throws); falls back to the catalogue. */
export async function explainError({ status, endpoint, method = 'GET', message = '', code } = {}) {
  const page = location.hash.replace(/^#\/?/, '').split('?')[0].split('/')[0] || 'dashboard';
  const pattern = String(endpoint || '').replace(/\/[A-Z]{1,4}-\d+/g, '/:id').replace(/\/\d+/g, '/:n').split('?')[0];
  const key = `${status}|${method}|${pattern}|${String(message).slice(0, 80)}`;
  const base = FALLBACK_FRIENDLY[status] || (status === 0 ? { title: 'Cannot reach the DMS', message: 'The network request failed before the server answered.', nextStep: 'Check your connection, then try again.' } : { title: 'Something went wrong', message: `The request returned ${status}: ${message || 'error'}.`, nextStep: 'Try again, or raise a ticket from Help.' });
  const fallback = { ...base, cause: message || null, manualRoute: null, by: 'catalogue', cached: false, status, endpoint: pattern, method };
  if (explainCache.has(key)) return { ...explainCache.get(key), cached: true };
  if (!explainAvailable || pattern.startsWith('/errors/explain') || (status === 401 && pattern.startsWith('/auth/login')) || !state.token) return fallback;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 1200);
  try {
    const r = await fetch(`${API}/errors/explain`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'Bearer ' + state.token }, body: JSON.stringify({ status, endpoint: pattern, method, message: String(message || '').slice(0, 300), code: code || null, page, role: state.user?.role || null }), signal: ctl.signal });
    if (r.status === 404) { explainAvailable = false; return fallback; }
    if (!r.ok) return fallback;
    const d = await r.json();
    const out = { title: d.title || fallback.title, message: d.message || fallback.message, cause: d.cause || null, nextStep: d.nextStep || fallback.nextStep, manualRoute: d.manualRoute || null, by: d.by || 'agent', cached: Boolean(d.cached), status, endpoint: pattern, method };
    explainCache.set(key, out); return out;
  } catch { return fallback; } finally { clearTimeout(t); }
}
/** Show a friendly error toast once per 10 s for the same failure. */
export function friendlyToast(res) {
  const f = res && res.friendly; if (!f) return;
  const key = `${f.status}|${f.method}|${f.endpoint}`; const now = Date.now();
  if (now - (recentErrors.get(key) || 0) < 10000) return; recentErrors.set(key, now);
  const el = document.createElement('div'); el.className = 'toast toast-friendly';
  el.innerHTML = `<div class="tf-t">${esc(f.title)}</div><div class="tf-m">${esc(f.message)}</div>${f.nextStep ? `<div class="tf-n"><b>What to do:</b> ${esc(f.nextStep)}</div>` : ''}<div class="tf-a"><button type="button" data-more>Tell me more</button>${f.manualRoute ? `<a href="${esc(f.manualRoute)}">Manual</a>` : ''}<span class="tf-by">${f.by === 'agent' ? 'explained by Progress Agentic RAG' : 'catalogue'}</span><button type="button" data-close aria-label="Dismiss">✕</button></div><details class="tf-d"><summary>Details</summary><code>HTTP ${esc(String(f.status))} ${esc(f.method)} ${esc(API + f.endpoint)}${f.cause ? ' · ' + esc(f.cause) : ''}</code></details>`;
  document.getElementById('toasts').appendChild(el);
  const kill = setTimeout(() => el.remove(), 9000);
  el.querySelector('[data-close]').onclick = () => { clearTimeout(kill); el.remove(); };
  el.querySelector('[data-more]').onclick = () => { clearTimeout(kill); el.remove(); window.hlHelp?.open({ question: `I got the error "${f.title}" (${f.message}). What should I do?`, context: `HTTP ${f.status} ${f.method} ${f.endpoint}` }); };
  el.addEventListener('mouseenter', () => clearTimeout(kill));
}

// list responses: {items,total,page,pageSize} per spec; tolerate bare arrays and {rows}
export function items(d) {
  if (!d) return [];
  if (Array.isArray(d)) return d;
  for (const k of ['items', 'rows', 'data', 'results', 'datasets', 'signals', 'list']) if (Array.isArray(d[k])) return d[k];
  return [];
}
export const total = d => (d && typeof d.total === 'number') ? d.total : items(d).length;
export function pick(o, ...keys) {
  if (!o) return undefined;
  for (const k of keys) {
    const v = k.includes('.') ? k.split('.').reduce((a, p) => (a == null ? a : a[p]), o) : o[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

// ---------- formatting ----------
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('en-AU');
export const num = (n, d = 0) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-AU', { maximumFractionDigits: d, minimumFractionDigits: d });
export const money = n => (n == null || isNaN(n)) ? '—' : (n < 0 ? '−$' : '$') + nf.format(Math.round(Math.abs(n)));
export const kmoney = n => { if (n == null || isNaN(n)) return '—'; const a = Math.abs(n); const s = n < 0 ? '−$' : '$'; return a >= 1e6 ? s + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'm' : a >= 1e4 ? s + Math.round(a / 1e3) + 'k' : a >= 1e3 ? s + (a / 1e3).toFixed(1) + 'k' : s + Math.round(a); };
export const pct = (n, d = 0) => (n == null || isNaN(n)) ? '—' : (n <= 1.0001 && n >= -1.0001 && !Number.isInteger(n) ? (n * 100).toFixed(d) : Number(n).toFixed(d)) + '%';
export function date(s, opts = { day: 'numeric', month: 'short', year: 'numeric' }) { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? esc(s) : d.toLocaleDateString('en-AU', opts); }
export function dateTime(s) { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? esc(s) : d.toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); }
export function ago(s) {
  if (!s) return '—'; const d = new Date(s); if (isNaN(d)) return esc(s);
  const days = Math.round((Date.now() - d) / 864e5);
  if (days < 0) return 'in ' + (-days) + 'd'; if (days === 0) return 'today'; if (days === 1) return 'yesterday'; if (days < 45) return days + 'd ago'; if (days < 400) return Math.round(days / 30) + ' mo ago'; return (days / 365).toFixed(1) + ' y ago';
}
export const initials = n => String(n || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
export const cap = s => String(s || '').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
export const custName = c => c ? ([c.firstName, c.lastName].filter(Boolean).join(' ') || c.name || c.email || c.id) : '';

// ---------- status chips ----------
const TONE = {
  new: 'info', contacted: 'neutral', qualified: '', test_drive_booked: 'info', quoted: 'warn', won: 'good', lost: 'bad',
  booked: 'info', completed: 'good', no_show: 'bad', cancelled: 'neutral',
  quote: 'neutral', negotiation: '', finance: 'info', approval: 'warn', contract: 'warn', delivery: 'good', delivered: 'good',
  on_lot: 'good', in_transit: 'info', sold: 'neutral', demo: 'warn', allocated: '', ordered: 'neutral',
  submitted: 'info', approved: 'good', conditional: 'warn', declined: 'bad', settled: 'good',
  uploaded: 'neutral', processing: 'info', extracted: 'warn', verified: 'good',
  active: 'good', published: 'good', draft: 'neutral', scheduled: 'info', ended: 'neutral', expired: 'neutral', live: 'good',
};
export const statusChip = s => s ? `<span class="chip ${TONE[s] ?? ''}">${esc(cap(s))}</span>` : '';

// ---------- provenance tags ----------
export const tagArag = (label = 'Progress Agentic RAG') => `<span class="tag arag" title="Powered by Progress Agentic RAG"><i></i>${esc(label)}</span>`;
export const tagDomo = (label = 'Domo') => `<span class="tag domo" title="Fed by a Domo dataset"><i></i>${esc(label)}</span>`;
// data-layer annotation (hidden until the band toggle is on)
export const ann = (text, kind = 'dms') => `<span class="ann ${kind}">${esc(text)}</span>`;

// ---------- icons (20×20, stroke) ----------
const P = {
  dashboard: '<rect x="3" y="3" width="6" height="8" rx="1.5"/><rect x="11" y="3" width="6" height="5" rx="1.5"/><rect x="11" y="10" width="6" height="7" rx="1.5"/><rect x="3" y="13" width="6" height="4" rx="1.5"/>',
  leads: '<path d="M3 4h14l-5 6.5V16l-4-2v-3.5z"/>',
  drive: '<circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="2"/><path d="M10 3v5M4 12.5l4.2-1.6M16 12.5l-4.2-1.6"/>',
  deals: '<rect x="3" y="4" width="4" height="12" rx="1"/><rect x="8" y="4" width="4" height="8" rx="1"/><rect x="13" y="4" width="4" height="10" rx="1"/>',
  stock: '<path d="M3 13.5V11l2-4h10l2 4v2.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><circle cx="6.5" cy="14.5" r="1.5"/><circle cx="13.5" cy="14.5" r="1.5"/><path d="M3 11h14"/>',
  customers: '<circle cx="8" cy="7" r="3"/><path d="M2.5 16.5c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5"/><path d="M13 4.2a3 3 0 0 1 0 5.6M15 12.3c1.3.6 2.2 1.9 2.5 4.2"/>',
  finance: '<rect x="2.5" y="5" width="15" height="10" rx="2"/><path d="M2.5 8.5h15M5.5 12h3"/>',
  promotions: '<path d="M3 8.5v3l9 4V4.5z"/><path d="M12 7.5a2.5 2.5 0 0 1 0 5"/><path d="M5.5 12.5l1 4h2l-.8-3.4"/>',
  campaigns: '<path d="M3 5h14v10H3z"/><path d="m3 5 7 6 7-6"/>',
  dxm: '<rect x="2.5" y="3.5" width="15" height="10" rx="1.5"/><path d="M7 17h6M10 13.5V17"/><path d="m8.5 7 2.5 1.5-2.5 1.5z"/>',
  documents: '<path d="M5 2.5h6.5L15 6v11.5H5z"/><path d="M11.5 2.5V6H15M7.5 10h5M7.5 13h5"/>',
  assistant: '<path d="M10 2.5l1.6 4.4 4.4 1.6-4.4 1.6L10 14.5l-1.6-4.4L4 8.5l4.4-1.6z"/><path d="M15.5 13.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  insights: '<ellipse cx="10" cy="5" rx="6" ry="2.5"/><path d="M4 5v10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V5M4 10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5"/>',
  settings: '<circle cx="10" cy="10" r="2.5"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>',
  search: '<circle cx="9" cy="9" r="5.5"/><path d="m13.5 13.5 4 4"/>',
  upload: '<path d="M10 13V3.5M6 7.5l4-4 4 4"/><path d="M3.5 13v3.5h13V13"/>',
  plug: '<path d="M7 2.5v4M13 2.5v4M5 6.5h10v3a5 5 0 0 1-10 0z"/><path d="M10 14.5v3"/>',
  lock: '<rect x="4" y="9" width="12" height="8.5" rx="1.5"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>',
  alert: '<path d="M10 3 2.5 16.5h15z"/><path d="M10 8v4M10 14.2v.3"/>',
  check: '<path d="m4 10.5 4 4 8-9"/>',
  arrow: '<path d="M4 10h12M11 5l5 5-5 5"/>',
  bolt: '<path d="M11 2.5 4.5 11H10l-1 6.5 6.5-8.5H10z"/>',
  inbox: '<path d="M3 11.5 5 4h10l2 7.5V16H3z"/><path d="M3 11.5h4l1 2h4l1-2h4"/>',
  copy: '<rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M13 7V4.5A1.5 1.5 0 0 0 11.5 3h-7A1.5 1.5 0 0 0 3 4.5v7A1.5 1.5 0 0 0 4.5 13H7"/>',
  external: '<path d="M8 4h8v8M16 4 5 15"/>',
  doc: '<path d="M5 2.5h6.5L15 6v11.5H5z"/><path d="M11.5 2.5V6H15"/>',
  user: '<circle cx="10" cy="7" r="3.2"/><path d="M3.5 17c.8-3.3 3.4-5 6.5-5s5.7 1.7 6.5 5"/>',
  refresh: '<path d="M16 10a6 6 0 1 1-1.8-4.3"/><path d="M16 3.5V7h-3.5"/>',
};
export const icon = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

// ---------- page chrome ----------
export function pagehead({ title, sub = '', crumbs = null, actions = '', tags = '' }) {
  const cr = crumbs ? `<nav class="crumb" aria-label="Breadcrumb">${crumbs.map(([t, h]) => h ? `<span><a href="${h}">${esc(t)}</a></span>` : `<span>${esc(t)}</span>`).join('')}</nav>` : '';
  return `<header class="pagehead">${cr}<div class="row"><div><h1>${esc(title)} ${tags}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div><div class="actions">${actions}</div></div></header>`;
}
export const loading = (rows = 6) => `<div class="loading" aria-busy="true">${Array.from({ length: rows }, (_, i) => `<div class="skel" style="width:${92 - (i * 13) % 40}%"></div>`).join('')}</div>`;

export function empty({ title = 'Nothing here yet', body = '', ic = 'inbox', actions = '', inline = false, error = false } = {}) {
  return `<div class="emptystate${inline ? ' inline' : ''}${error ? ' error' : ''}"><div class="ib">${icon(ic)}</div><h3>${esc(title)}</h3>${body ? `<p>${body}</p>` : ''}${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;
}
// One designed state per failure class; never a blank panel.
export function failState(res, { what = 'this data', endpoint = '', inline = false } = {}) {
  const ep = endpoint ? ` <code>${esc(endpoint)}</code>` : '';
  const f = res && res.friendly;
  if (f && res.status !== 503 && res.status !== 0 && res.status !== 502)
    return empty({ ic: res.status === 403 ? 'lock' : 'alert', error: res.status !== 403, title: f.title, body: `${esc(f.message)}${f.nextStep ? ` <b>What to do:</b> ${esc(f.nextStep)}` : ''}<br><span class="subtle" style="font-size:.74rem">${f.by === 'agent' ? 'Explained by Progress Agentic RAG' : 'From the error catalogue'} · HTTP ${esc(String(res.status))}${ep}</span>`, actions: `<button class="btn secondary sm" data-retry>Try again</button><button class="btn ghost sm" onclick="window.hlHelp&&window.hlHelp.open({question:'I got the error \u201c${esc(f.title).replace(/'/g, '')}\u201d while loading ${esc(what).replace(/'/g, '')}. What should I do?'})">Tell me more</button>${f.manualRoute ? `<a class="btn ghost sm" href="${esc(f.manualRoute)}">Manual</a>` : ''}`, inline });
  if (res.status === 403) return empty({ ic: 'lock', title: 'Not available for your role', body: `Your role (${esc(ROLE_LABEL[state.user?.role] || state.user?.role || 'unknown')}) cannot see ${esc(what)}. Ask a general manager if you need access.`, inline });
  if (res.status === 404) return empty({ ic: 'alert', error: true, title: 'Not found', body: `The DMS API has no ${esc(what)} here${ep}. It may have been removed, or this route is not built yet.`, inline });
  if (res.status === 503 || res.status === 0 || res.status === 502)
    return empty({ ic: 'plug', error: true, title: res.status === 0 ? 'Cannot reach the DMS API' : 'DMS API is not available yet', body: `The back office could not load ${esc(what)}${ep}. The API at <code>/dms/api</code> is starting, offline or not deployed in this build. Nothing is wrong with your data.`, actions: `<button class="btn secondary sm" data-retry>Try again</button>`, inline });
  return empty({ ic: 'alert', error: true, title: 'Something went wrong', body: `${esc(what)}${ep} returned ${res.status}: ${esc(res.error || 'error')}.`, actions: `<button class="btn secondary sm" data-retry>Try again</button>`, inline });
}

export function toast(msg) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
  document.getElementById('toasts').appendChild(el); setTimeout(() => el.remove(), 3200);
}
export const spinBtn = (btn, on, label) => { if (!btn) return; if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin"></span>${esc(label || 'Working…')}`; } else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; } };
export const thinking = (text = 'Progress Agentic RAG is retrieving and reasoning…') => `<div class="thinking"><span class="dots"><i></i><i></i><i></i></span>${esc(text)}</div>`;

// drawer
export function openDrawer(title, html, sub = '') {
  document.getElementById('drawerTitle').textContent = title;
  document.getElementById('drawerSub').textContent = sub;
  document.getElementById('drawerBody').innerHTML = html;
  document.body.classList.add('drawer-open'); document.getElementById('drawer').setAttribute('aria-hidden', 'false');
  return document.getElementById('drawerBody');
}
export function closeDrawer() { document.body.classList.remove('drawer-open'); document.getElementById('drawer').setAttribute('aria-hidden', 'true'); }

// Markdown-lite for AI answers: paragraphs, bullets, **bold**, [n] citation markers
export function prose(text) {
  if (!text) return '';
  const lines = String(text).replace(/\r/g, '').split('\n');
  let out = '', list = null;
  const inl = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[(\d{1,2})\]/g, '<sup class="mk">[$1]</sup>');
  for (const ln of lines) {
    const m = ln.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
    if (m) { if (!list) { out += '<ul>'; list = true; } out += `<li>${inl(m[1])}</li>`; continue; }
    if (list) { out += '</ul>'; list = null; }
    if (ln.trim()) out += `<p>${inl(ln.replace(/^#+\s*/, ''))}</p>`;
  }
  if (list) out += '</ul>';
  return out;
}
// citations: tolerate [{title,url,resourceId,source,snippet}] or strings
export function citations(list) {
  const arr = Array.isArray(list) ? list : [];
  if (!arr.length) return '';
  return `<div class="cites">${arr.slice(0, 12).map((c, i) => {
    if (typeof c === 'string') return `<span class="cite" title="${esc(c)}">[${i + 1}] ${esc(c)}</span>`;
    const t = pick(c, 'title', 'name', 'label', 'source', 'resourceId', 'id') || 'Source';
    const sn = pick(c, 'snippet', 'text', 'excerpt') || '';
    const u = pick(c, 'url', 'href');
    const inner = `[${pick(c, 'n', 'index') || i + 1}] ${esc(t)}`;
    return u ? `<a class="cite" href="${esc(u)}" target="_blank" rel="noopener" title="${esc(sn)}">${inner}</a>` : `<span class="cite" title="${esc(sn)}">${inner}</span>`;
  }).join('')}</div>`;
}

// ---------- tables ----------
// cols: [{key,label,num?,render?(row),sort?}] ; rows: array ; href(row)
export function table(cols, rows, { href, compact = false, sort, empty: emptyHtml } = {}) {
  if (!rows.length) return emptyHtml || empty({ title: 'No matching records', body: 'Try a different filter or site.', inline: true });
  const th = cols.map(c => {
    const s = sort && c.sort ? (sort.key === c.sort ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none') : null;
    const lab = esc(c.label);
    return `<th class="${c.num ? 'num' : ''}" ${s ? `aria-sort="${s}"` : ''}>${s ? `<button data-sort="${c.sort}">${lab}</button>` : lab}</th>`;
  }).join('');
  const tr = rows.map(r => `<tr ${href ? `data-href="${esc(href(r))}" tabindex="0"` : ''}>${cols.map(c => `<td class="${c.num ? 'num' : ''}">${c.render ? c.render(r) : esc(r[c.key] ?? '—')}</td>`).join('')}</tr>`).join('');
  return `<div class="datatable${compact ? ' compact' : ''}"><div class="scroll"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div></div>`;
}
export function bindRows(root) {
  root.querySelectorAll('tr[data-href]').forEach(tr => {
    tr.addEventListener('click', e => { if (e.target.closest('a,button')) return; location.hash = tr.dataset.href; });
    tr.addEventListener('keydown', e => { if (e.key === 'Enter') location.hash = tr.dataset.href; });
  });
}
export function pager(res, page, pageSize, onGo) {
  const t = total(res); const pages = Math.max(1, Math.ceil(t / pageSize));
  const el = document.createElement('div'); el.className = 'pager';
  el.innerHTML = `<span>${num(t)} records · page ${page} of ${pages}</span><button class="btn ghost sm" ${page <= 1 ? 'disabled' : ''} data-p="${page - 1}">Previous</button><button class="btn ghost sm" ${page >= pages ? 'disabled' : ''} data-p="${page + 1}">Next</button>`;
  el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => onGo(+b.dataset.p));
  return el;
}

// small reusable lookups, cached per session
const cache = new Map();
export async function cached(path, ttl = 60000) {
  const c = cache.get(path); if (c && Date.now() - c.t < ttl) return c.r;
  const r = await api(path, { query: path.includes('?') ? undefined : { pageSize: 500 } });
  if (r.ok) cache.set(path, { t: Date.now(), r }); return r;
}
export function clearCache() { cache.clear(); }
export async function staffMap() { const r = await cached('/staff'); const m = {}; for (const s of items(r.data)) m[s.id] = s; return m; }

export function bindRetry(root, fn) { root.querySelectorAll('[data-retry]').forEach(b => b.onclick = fn); }
export function copy(text) { navigator.clipboard?.writeText(text).then(() => toast('Copied'), () => toast('Copy failed')); }
export const LANGS = { en: 'English', zh: '中文', vi: 'Tiếng Việt' };

// Download a CSV export with the bearer header (keeps the token out of URLs).
export async function downloadCsv(dataset, query = {}) {
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v)).toString();
  try {
    const r = await fetch(`${API}/domo/export/${encodeURIComponent(dataset)}.csv${qs ? '?' + qs : ''}`, { headers: { Authorization: 'Bearer ' + state.token } });
    if (!r.ok) { toast(r.status === 403 ? 'Your role can’t export Domo datasets' : `Export failed (${r.status})`); return; }
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a'); a.href = url; a.download = `${dataset}.csv`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000); toast(`${dataset}.csv downloaded`);
  } catch { toast('Export failed: network error'); }
}
export async function fetchCsv(dataset, query = {}) {
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v)).toString();
  try {
    const r = await fetch(`${API}/domo/export/${encodeURIComponent(dataset)}.csv${qs ? '?' + qs : ''}`, { headers: { Authorization: 'Bearer ' + state.token } });
    if (!r.ok) return { ok: false, status: r.status, rows: [] };
    const text = await r.text(); const lines = text.trim().split(/\r?\n/); const head = lines.shift().split(',');
    return { ok: true, status: 200, rows: lines.map(l => { const c = l.split(','); return Object.fromEntries(head.map((h, i) => [h, c[i] !== '' && !isNaN(c[i]) ? Number(c[i]) : c[i]])); }) };
  } catch { return { ok: false, status: 0, rows: [] }; }
}
// A form in the drawer; resolves with the submitted values or null.
export function drawerForm(title, fieldsHtml, { submit = 'Save', sub = '', note = '' } = {}) {
  return new Promise(resolve => {
    const body = openDrawer(title, `<form class="stack" style="gap:12px" id="dform">${note ? `<p class="muted" style="font-size:.84rem">${note}</p>` : ''}${fieldsHtml}<div class="err" id="dferr"></div><div class="row"><button class="btn" type="submit">${esc(submit)}</button><button class="btn ghost" type="button" id="dfcancel">Cancel</button></div></form>`, sub);
    const f = body.querySelector('#dform');
    let done = false; const fin = v => { if (done) return; done = true; obs.disconnect(); resolve(v); };
    f.onsubmit = e => { e.preventDefault(); fin({ values: Object.fromEntries(new FormData(f).entries()), form: f, err: m => { f.querySelector('#dferr').textContent = m; }, close: closeDrawer }); };
    body.querySelector('#dfcancel').onclick = () => { closeDrawer(); fin(null); };
    const obs = new MutationObserver(() => { if (!document.body.classList.contains('drawer-open')) fin(null); });
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  });
}
// A designed message for an action this build's API does not offer yet.
export function notInBuild(action, endpoint) { toast(`${action}: not available in this build (${endpoint} is not in the API yet)`); }
