/* Harbourline One — app shell. The HL namespace is the contract every scene builds on (docs/CONCEPT.md §6).
   Load order: app.js, i18n.js, powers.js, assistant.js, scenes/*.js, then HL.start(). */
(function () {
  'use strict';
  const HL = (window.HL = {});
  const $ = (id) => document.getElementById(id);

  // ── state ─────────────────────────────────────────────────────────────────
  const LANGS = { en: 'EN', zh: '中文', vi: 'Tiếng Việt', ar: 'العربية', hi: 'हिन्दी' };
  HL.LANGS = LANGS;
  const DEFAULT = { lang: 'en', theme: null, postcode: '2150', compare: [], journey: { viewed: [], asked: [], answers: [], watches: [], valued: null }, build: { modelId: 'rav4', gradeId: 'cruiser', colourId: 'graphite', interiorId: 'leather-black', packs: [] } };
  let state;
  try { state = Object.assign({}, DEFAULT, JSON.parse(sessionStorage.getItem('hl1-state') || '{}')); } catch { state = Object.assign({}, DEFAULT); }
  state.journey = Object.assign({}, DEFAULT.journey, state.journey || {});
  state.build = Object.assign({}, DEFAULT.build, state.build || {});
  let sid = ''; try { sid = sessionStorage.getItem('hl-sid') || ''; } catch { /* private mode */ }
  if (!sid) { sid = 's-' + Math.random().toString(36).slice(2, 10); try { sessionStorage.setItem('hl-sid', sid); } catch { /* ignore */ } }
  state.sid = sid;
  HL.state = state;
  const persist = () => { try { const { sid: _s, ...rest } = state; sessionStorage.setItem('hl1-state', JSON.stringify(rest)); } catch { /* ignore */ } };
  HL.set = (patch) => { Object.assign(state, patch); persist(); HL.bus.emit('state', state); };
  HL.journey = (patch) => { Object.assign(state.journey, patch); persist(); HL.bus.emit('journey', state.journey); };
  HL.remember = (kind, value) => { // kind: viewed | asked | answers | watches
    const list = state.journey[kind] || (state.journey[kind] = []);
    const key = JSON.stringify(value); const i = list.findIndex((x) => JSON.stringify(x) === key); if (i >= 0) list.splice(i, 1);
    list.push(value); if (list.length > 12) list.shift(); persist(); HL.bus.emit('journey', state.journey);
  };
  HL.forget = async () => { try { await HL.api('/api/used/session', { method: 'DELETE' }); } catch { /* offline */ } state.journey = JSON.parse(JSON.stringify(DEFAULT.journey)); state.compare = []; persist(); HL.bus.emit('journey', state.journey); HL.ui.toast(HL.t('toast.forgot', 'Forgotten. This device no longer remembers your visit.')); };

  // ── bus ───────────────────────────────────────────────────────────────────
  const handlers = {};
  HL.bus = { on: (ev, fn) => ((handlers[ev] = handlers[ev] || []).push(fn), () => HL.bus.off(ev, fn)), off: (ev, fn) => { handlers[ev] = (handlers[ev] || []).filter((f) => f !== fn); }, emit: (ev, data) => (handlers[ev] || []).forEach((f) => { try { f(data); } catch (e) { console.warn(`[bus ${ev}]`, e); } }) };

  // ── api ───────────────────────────────────────────────────────────────────
  class ApiError extends Error { constructor(msg, status, body) { super(msg); this.status = status; this.body = body; } }
  HL.ApiError = ApiError;
  // The page may be served from the Fly app, a local server or a claude.ai artifact; API calls go to the Fly app unless local.
  const H = location.hostname; HL.base = (H === 'localhost' || H === '127.0.0.1' || H.endsWith('.fly.dev') || H === 'harbourline.local') ? '' : 'https://harbourline-configurator.fly.dev';
  HL.online = null; // null = unknown, true/false after health
  HL.health = null;
  HL.api = async (path, { method = 'GET', body, timeoutMs = 20000, headers = {} } = {}) => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(HL.base + path, { method, headers: Object.assign({ 'x-sid': sid, 'accept': 'application/json' }, body ? { 'content-type': 'application/json' } : {}, headers), body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
      const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
      if (!r.ok) throw new ApiError(json?.error || `HTTP ${r.status}`, r.status, json);
      return json;
    } catch (e) { if (e.name === 'AbortError') throw new ApiError('timeout', 0); throw e; } finally { clearTimeout(t); }
  };
  HL.track = (type, data) => { // server-validated event types only; everything else stays local
    if (!HL.online || !['used_view', 'build_change', 'offer_view', 'offer_click'].includes(type)) return;
    try { fetch(HL.base + '/api/events', { method: 'POST', headers: { 'content-type': 'application/json', 'x-sid': sid }, body: JSON.stringify({ sid, type, data, at: new Date().toISOString() }), keepalive: true }).catch(() => {}); } catch { /* ignore */ }
  };

  // ── data ──────────────────────────────────────────────────────────────────
  HL.data = null;
  let dataPromise = null;
  const rows = (d) => (Array.isArray(d) ? d : d && Array.isArray(d.rows) ? d.rows : []);
  HL.load = () => dataPromise || (dataPromise = (async () => {
    let health = null;
    try { health = await HL.api('/api/health', { timeoutMs: 6000 }); HL.online = true; } catch { HL.online = false; }
    HL.health = health; HL.bus.emit('online', HL.online);
    let d = {};
    if (HL.online) {
      const [catalog, stock, used, promotions, offers] = await Promise.all([
        HL.api('/api/catalog').catch(() => null), HL.api('/api/stock').catch(() => null), HL.api('/api/used?pageSize=48').catch(() => null), HL.api('/api/promotions').catch(() => null), HL.api('/api/offers').catch(() => null),
      ]);
      d = { catalog, stock, used: used ? used.items : null, usedMeta: used, promotions: promotions?.promotions || promotions?.items || rows(promotions), offers: offers?.offers || rows(offers), sites: stock?._sites || null };
    }
    // The snapshot also carries what the live API does not expose directly (market bands, photo credits, calendar).
    let snap = null; try { snap = await (await fetch('data/snapshot.json')).json(); } catch { /* optional */ }
    if (snap) { d.credits = d.credits || snap.credits; d.calendar = d.calendar || snap.calendar; d.market = d.market || rows(snap.stock.used_market_prices); d.signals = d.signals || rows(snap.stock.dealer_signals); d.usedFull = d.usedFull || snap.used?.rows || []; d.usedComments = d.usedComments || snap.usedComments?.items || {}; }
    if ((!d.catalog || !d.used) && snap) {
      try {
        d.catalog = d.catalog || snap.catalog; d.sites = d.sites || snap.sites; d.credits = snap.credits; d.calendar = snap.calendar;
        d.stock = d.stock || { stock_by_site: rows(snap.stock.stock_by_site), aged_stock_actions: rows(snap.stock.aged_stock_actions), transfer_feasibility: rows(snap.stock.transfer_feasibility), inbound_pipeline: rows(snap.stock.inbound_pipeline), order_bank_eta: rows(snap.stock.order_bank_eta), refreshed_at: snap.stock.stock_by_site?.refreshed_at };
        if (!d.used) d.used = (snap.used?.rows || []).map((u) => Object.assign({ title: `${u.year} ${u.make} ${u.model}`, subtitle: `${u.grade} ${u.variantCode}`, siteName: (snap.sites.find((s) => s.id === u.siteId) || {}).name, headline: snap.usedComments?.items?.[u.stockNo]?.headline || null, youAsked: 0, watchers: 0, market: null }, u));
        d.promotions = d.promotions || snap.promotions?.promotions || []; d.offers = d.offers || [];
      } catch (e) { console.warn('[HL] snapshot unavailable', e); }
    }
    if (d.stock && !Array.isArray(d.stock.stock_by_site)) for (const k of Object.keys(d.stock)) if (d.stock[k] && d.stock[k].rows) d.stock[k] = d.stock[k].rows;
    d.sites = d.sites || (d.stock?.stock_by_site || []).reduce((a, u) => (a.some((s) => s.id === u.site) ? a : a.concat({ id: u.site, name: u.site_name })), []);
    HL.data = d; HL.bus.emit('data', d); return d;
  })());
  HL.model = (id) => (HL.data?.catalog?.models || []).find((m) => m.id === id) || null;
  HL.grade = (modelId, gradeId) => HL.model(modelId)?.grades?.find((g) => g.id === gradeId) || null;
  HL.colour = (id) => (HL.data?.catalog?.colours || []).find((c) => c.id === id) || null;
  HL.unit = (stockNo) => (HL.data?.used || []).find((u) => u.stockNo === String(stockNo || '').toUpperCase()) || null;
  HL.site = (id) => (HL.data?.sites || []).find((s) => s.id === id) || { id, name: id };
  HL.unitsOf = (modelId) => (HL.data?.stock?.stock_by_site || []).filter((u) => u.model === modelId);
  HL.img = (modelId, size = 'thumb') => (HL.online === false ? null : `${HL.base}/api/images/${modelId}${size === 'hero' ? '.jpg' : '/thumb.jpg'}`);
  HL.credit = (modelId) => { const c = (HL.data?.credits || []).find((x) => x.model === modelId); return c ? `${c.author} · ${c.license}` : 'Library image · Wikimedia Commons'; };
  HL.money = (n) => (n == null || isNaN(n) ? '—' : `$${Math.round(Number(n)).toLocaleString('en-AU')}`);
  HL.km = (n) => `${Number(n).toLocaleString('en-AU')} km`;
  HL.priceOf = (b) => { const m = HL.model(b.modelId); const g = HL.grade(b.modelId, b.gradeId) || m?.grades?.[0]; if (!m || !g) return null; const col = HL.colour(b.colourId); const ints = (HL.data.catalog.interiors || []).find((i) => i.id === b.interiorId); const packs = (b.packs || []).map((p) => (HL.data.catalog.accessories || []).find((a) => a.id === p)).filter(Boolean); return { base: g.price, colour: col?.price || 0, interior: ints?.price || 0, packs: packs.reduce((s, p) => s + p.price, 0), packList: packs, total: g.price + (col?.price || 0) + (ints?.price || 0) + packs.reduce((s, p) => s + p.price, 0) }; };

  // ── i18n ──────────────────────────────────────────────────────────────────
  HL.i18n = { en: {}, zh: {}, vi: {}, ar: {}, hi: {} };
  HL.t = (key, fallback, vars) => { let s = (HL.i18n[state.lang] && HL.i18n[state.lang][key]) || (HL.i18n.en && HL.i18n.en[key]) || fallback || key; if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v); return s; };
  HL.setLang = (code) => { if (!LANGS[code]) return; HL.set({ lang: code }); document.documentElement.lang = code; document.documentElement.dir = code === 'ar' ? 'rtl' : 'ltr'; translateChrome(); renderLang(); HL.bus.emit('lang', code); HL.rerender(); };
  function translateChrome() { document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = HL.t(el.dataset.t, el.dataset.en || (el.dataset.en = el.textContent)); }); }
  function renderLang() { const box = $('langSwitch'); if (!box) return; box.innerHTML = ''; for (const [code, label] of Object.entries(LANGS)) { const b = document.createElement('button'); b.textContent = label; b.className = code === state.lang ? 'on' : ''; b.lang = code; b.onclick = () => { if (matchMedia('(max-width:640px)').matches && code === state.lang) { HL.ui.sheet(HL.t('lang.pick', 'Language'), HL.ui.el('div', { class: 'navsheet' }, Object.entries(LANGS).map(([c, l]) => HL.ui.el('a', { href: '#', text: l, lang: c, onClick: (e) => { e.preventDefault(); HL.setLang(c); HL.ui.closeSheet(); } })))); return; } HL.setLang(code); }; box.appendChild(b); } }

  // ── router ────────────────────────────────────────────────────────────────
  const scenes = {}; let current = null; let currentName = null;
  HL.scene = (name, def) => { scenes[name] = def; };
  HL.route = () => { const h = location.hash.replace(/^#\/?/, ''); const [pathPart, qs] = h.split('?'); const parts = pathPart.split('/').filter(Boolean); const name = parts[0] || 'home'; const query = Object.fromEntries(new URLSearchParams(qs || '')); return { name, params: parts.slice(1).map(decodeURIComponent), query, hash: location.hash }; };
  HL.go = (hash) => { if (location.hash === hash) HL.rerender(); else location.hash = hash; };
  HL.rerender = () => render(true);
  function render(force) {
    const r = HL.route(); const def = scenes[r.name] || scenes.home; const root = $('scene');
    if (!def) return;
    if (current && current.unmount) { try { current.unmount(); } catch (e) { console.warn(e); } }
    root.innerHTML = ''; root.className = `scene scene-${r.name} fade-in`;
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === r.name));
    current = def; currentName = r.name;
    try { def.mount(root, r); } catch (e) { console.error(`[scene ${r.name}]`, e); root.appendChild(HL.ui.empty(`This scene hit an error: ${e.message}`)); }
    if (!force) window.scrollTo({ top: 0 });
    HL.bus.emit('route', r);
    HL.powers.refreshPins();
  }

  // ── ui helpers ────────────────────────────────────────────────────────────
  const ui = (HL.ui = {});
  ui.el = (tag, attrs, ...children) => {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v); else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v); else if (k === 'dataset') Object.assign(e.dataset, v); else e.setAttribute(k, v === true ? '' : v); }
    for (const c of children.flat(Infinity)) { if (c == null || c === false) continue; e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); }
    return e;
  };
  ui.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  ui.chip = (text, kind = '', title) => ui.el('span', { class: `chip ${kind}`, title }, kind && ['kb', 'domo', 'mem', 'mock', 'dms'].includes(kind.split(' ')[0]) ? ui.el('i') : null, text);
  ui.trace = (items = []) => ui.el('div', { class: 'trace' }, items.map((t) => ui.chip(t.label || t, t.kind || 'kb')));
  ui.skeleton = (n = 3, h = 220) => ui.el('div', { class: 'grid g3' }, Array.from({ length: n }, () => ui.el('div', { class: 'skel', style: { height: `${h}px` } })));
  ui.empty = (text, actionLabel, onClick) => ui.el('div', { class: 'empty card flat' }, ui.el('p', { text }), actionLabel ? ui.el('button', { class: 'btn secondary', style: { marginTop: '12px' }, onClick }, actionLabel) : null);
  ui.toast = (text, ms = 3200) => { const t = ui.el('div', { class: 'toast', text }); $('toasts').appendChild(t); setTimeout(() => t.remove(), ms); };
  ui.img = (src, alt, credit) => ui.el('div', { class: 'media' }, src ? ui.el('img', { src, alt, loading: 'lazy', onError: (e) => { e.target.remove(); } }) : ui.el('div', { class: 'empty', style: { paddingTop: '28%' } }, HL.t('media.pending', 'Photos being taken')), credit ? ui.el('span', { class: 'credit', text: credit }) : null);
  /** Product card. data: {kind:'model'|'unit', id, title, sub, price, priceNote, img, credit, badges:[{text,kind}], reason, trace:[], facts:[], market, href, actions:[{label,kind,onClick}], mark} */
  ui.card = (d) => {
    const href = d.href || (d.kind === 'unit' ? `#/car/u:${d.id}` : `#/car/m:${d.id}`);
    const c = ui.el('article', { class: 'pcard', dataset: { kind: d.kind, id: d.id } },
      ui.el('a', { href, 'aria-label': d.title }, ui.img(d.img, d.title, d.credit), ui.el('div', { class: 'badges' }, (d.badges || []).map((b) => ui.chip(b.text, b.kind || 'good')))),
      d.mark ? ui.el('span', { class: 'mark' }, d.mark) : null,
      ui.el('div', { class: 'body' },
        ui.el('div', null, ui.el('a', { href, class: 'title', style: { textDecoration: 'none', display: 'block' }, text: d.title }), d.sub ? ui.el('div', { class: 'sub', text: d.sub }) : null),
        d.price != null ? ui.el('div', { class: 'price num' }, HL.money(d.price), d.priceNote ? ui.el('small', { text: d.priceNote }) : null) : null,
        d.market ? ui.el('div', null, ui.chip(d.market.position === 'below' ? HL.t('card.below', '{n} below market', { n: HL.money(Math.abs(d.market.diff)) }) : d.market.position === 'above' ? HL.t('card.above', '{n} above market', { n: HL.money(d.market.diff) }) : HL.t('card.at', 'At market median'), d.market.position === 'below' ? 'good' : d.market.position === 'above' ? 'warn' : 'blue', HL.t('card.domo', 'Domo · used market prices'))) : null,
        d.reason ? ui.el('p', { class: 'reason', text: d.reason }) : null,
        d.facts?.length ? ui.el('div', { class: 'facts' }, d.facts.map((f) => ui.el('span', { text: f }))) : null,
        d.trace?.length ? ui.trace(d.trace) : null,
        d.actions?.length ? ui.el('div', { class: 'actions' }, d.actions.map((a) => ui.el('button', { class: `btn sm ${a.kind || 'secondary'}`, onClick: a.onClick }, a.label))) : null));
    return c;
  };
  /** model → card data (new car) */
  ui.modelCard = (m, extra = {}) => { const units = HL.unitsOf(m.id); const here = units.filter((u) => u.status === 'on_lot'); return ui.card(Object.assign({ kind: 'model', id: m.id, title: `Toyota ${m.name}`, sub: `${m.bodyLabel} · ${m.powertrainLabel}`, price: m.fromPrice, priceNote: HL.t('card.from', 'from, drive-away'), img: HL.img(m.id), credit: HL.credit(m.id), badges: here.length ? [{ text: HL.t('card.onlot', '{n} on the lot', { n: here.length }), kind: 'good' }] : units.length ? [{ text: HL.t('card.arriving', 'Arriving'), kind: 'blue' }] : [], facts: [`${m.seats} ${HL.t('card.seats', 'seats')}`, m.towKg ? `${HL.t('card.tows', 'tows')} ${m.towKg.toLocaleString('en-AU')} kg` : null].filter(Boolean) }, extra)); };
  /** used listing card data (from /api/used card shape) */
  ui.unitCard = (u, extra = {}) => ui.card(Object.assign({ kind: 'unit', id: u.stockNo, title: u.title || `${u.year} ${u.make} ${u.model}`, sub: `${u.grade}${u.variantCode ? ` ${u.variantCode}` : ''} · ${HL.km(u.km)} · ${u.transmission}`, price: u.price, priceNote: HL.t('card.exgov', 'excl. govt charges'), img: u.modelId ? HL.img(u.modelId) : null, credit: u.modelId ? HL.credit(u.modelId) : null, badges: [u.certified ? { text: HL.t('card.certified', 'Toyota Certified'), kind: 'good' } : null, u.status === 'held' ? { text: HL.t('card.held', 'On hold'), kind: 'warn' } : u.status === 'arriving' ? { text: HL.t('card.arrivingdays', 'Arriving in {n} days', { n: u.etaDays }), kind: 'blue' } : u.status === 'reconditioning' ? { text: HL.t('card.recon', 'In reconditioning'), kind: 'blue' } : null].filter(Boolean), reason: u.headline || null, market: u.market || null, facts: [u.siteName, u.fuel, u.drive, u.youAsked ? HL.t('card.youasked', 'You asked {n} question(s)', { n: u.youAsked }) : null].filter(Boolean), mark: u.watchers ? ui.chip(`${u.watchers} ${HL.t('card.watching', 'watching')}`, 'outline') : null }, extra));
  // sheet
  let sheetClose = null;
  ui.sheet = (title, body, actions = [], { wide } = {}) => {
    const s = $('sheet'); const scrim = $('scrim'); s.innerHTML = ''; s.style.width = wide ? 'min(920px,calc(100vw - 32px))' : '';
    const close = () => { s.classList.remove('open'); scrim.classList.remove('open'); s.setAttribute('aria-hidden', 'true'); document.removeEventListener('keydown', esc); sheetClose = null; };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    s.appendChild(ui.el('div', { class: 'sh' }, ui.el('h3', { text: title }), ui.el('button', { class: 'btn ghost sm icon', 'aria-label': 'Close', onClick: close }, '✕')));
    s.appendChild(ui.el('div', { class: 'sb' }, body));
    if (actions.length) s.appendChild(ui.el('div', { class: 'sf' }, actions.map((a) => ui.el('button', { class: `btn ${a.kind || 'secondary'}`, onClick: () => { const r = a.onClick && a.onClick(); if (r !== false) close(); } }, a.label))));
    s.classList.add('open'); scrim.classList.add('open'); s.setAttribute('aria-hidden', 'false'); scrim.onclick = close; document.addEventListener('keydown', esc); sheetClose = close;
    return close;
  };
  ui.closeSheet = () => sheetClose && sheetClose();
  ui.section = (kick, title, sub, ...children) => ui.el('section', { class: 'section' }, ui.el('div', { class: 'wrap stack' }, ui.el('div', { class: 'row between', style: { alignItems: 'flex-end' } }, ui.el('div', null, kick ? ui.el('div', { class: 'kick', text: kick }) : null, ui.el('h2', { text: title }), sub ? ui.el('p', { class: 'muted', style: { marginTop: '6px', maxWidth: '62ch' }, text: sub }) : null)), ...children));

  // ── drawers (assistant + powers), scrim sharing ───────────────────────────
  HL.drawer = (id, open) => { const d = $(id); const on = open ?? !d.classList.contains('open'); if (on) { for (const other of ['assistant', 'powers']) if (other !== id) HL.drawer(other, false); } d.classList.toggle('open', on); d.setAttribute('aria-hidden', String(!on)); document.body.classList.toggle(`${id}-open`, on); const btn = id === 'assistant' ? $('fab') : $('openPowers'); if (btn) btn.setAttribute('aria-expanded', String(on)); HL.bus.emit(`${id}:${on ? 'open' : 'close'}`); return on; };

  // ── assistant hooks (implemented in assistant.js) ─────────────────────────
  HL.assistant = { open: (prefill) => { HL.drawer('assistant', true); HL.bus.emit('assistant:prefill', prefill || ''); }, ask: (q, opts) => HL.bus.emit('assistant:ask', { question: q, ...(opts || {}) }), onAction: (fn) => HL.bus.on('assistant:action', fn), scope: null, setScope: (s) => { HL.assistant.scope = s; HL.bus.emit('assistant:scope', s); } };

  // ── powers registry + demo-mode pins (cards live in powers.js) ────────────
  const cards = new Map(); const spots = [];
  HL.powers = {
    register: (c) => { cards.set(c.id, c); },
    all: () => [...cards.values()],
    get: (id) => cards.get(id),
    open: (id) => { HL.drawer('powers', true); HL.bus.emit('powers:open', id || null); },
    demoMode: (on) => { const v = on ?? !document.body.classList.contains('demo'); document.body.classList.toggle('demo', v); $('demoMode').classList.toggle('on', v); $('demoMode').setAttribute('aria-pressed', String(v)); HL.powers.refreshPins(); if (v) ui.toast(HL.t('toast.demo', 'Demo mode: every pinned feature is powered by the knowledge layer or Domo. Click a pin.')); return v; },
    refreshPins: () => { let n = 0; document.querySelectorAll('[data-spot]').forEach((el) => { n++; let pin = el.querySelector(':scope > .pin'); if (!pin) { pin = ui.el('button', { class: `pin ${el.dataset.spotKind || ''}`, title: el.dataset.spotLabel || el.dataset.spot, onClick: (e) => { e.preventDefault(); e.stopPropagation(); HL.powers.open(el.dataset.spot); } }); el.prepend(pin); } pin.textContent = String(n); }); },
  };
  HL.spot = (el, id, label, kind) => { if (!el) return el; el.dataset.spot = id; if (label) el.dataset.spotLabel = label; if (kind) el.dataset.spotKind = kind; return el; };

  // ── start ─────────────────────────────────────────────────────────────────
  HL.start = async () => {
    // theme
    const applyTheme = () => { if (state.theme) document.documentElement.setAttribute('data-theme', state.theme); else document.documentElement.removeAttribute('data-theme'); };
    applyTheme();
    $('themeBtn').onclick = () => { const dark = document.documentElement.getAttribute('data-theme') === 'dark' || (!state.theme && matchMedia('(prefers-color-scheme: dark)').matches); HL.set({ theme: dark ? 'light' : 'dark' }); applyTheme(); };
    $('demoMode').onclick = () => HL.powers.demoMode();
    $('openPowers').onclick = () => HL.powers.open();
    $('fab').onclick = () => HL.assistant.open();
    $('forgetLink').onclick = (e) => { e.preventDefault(); HL.forget(); };
    $('menuBtn').onclick = () => ui.sheet(HL.t('nav.menu', 'Menu'), ui.el('nav', { class: 'navsheet' }, [...document.querySelectorAll('#nav a')].map((a) => ui.el('a', { href: a.getAttribute('href'), text: a.textContent, onClick: () => ui.closeSheet() }))));
    const mq = matchMedia('(max-width:1150px)'); const menuVis = () => { $('menuBtn').style.display = mq.matches ? '' : 'none'; }; mq.addEventListener('change', menuVis); menuVis();
    document.documentElement.lang = state.lang; document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
    translateChrome(); renderLang();
    window.addEventListener('hashchange', () => render(false));
    const badge = $('liveBadge'); HL.bus.on('online', (on) => { badge.className = `live hide-md ${on ? '' : 'off'}`; badge.querySelector('span').textContent = on ? HL.t('badge.live', 'LIVE · knowledge box + Domo') : HL.t('badge.off', 'OFFLINE · snapshot data'); });
    render(false); // scenes show skeletons until data arrives
    await HL.load();
    render(true);
    HL.bus.emit('ready', HL.data);
  };
})();
