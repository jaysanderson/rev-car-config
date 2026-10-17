/* Harbourline One — rich search (#/browse). Owner: Agent A. New models + pre-owned units in one result set. */
(function () {
  'use strict';
  const ui = HL.ui; const el = ui.el; const t = HL.t;
  const CSS = `
  .br-top{padding:28px 0 8px}
  .br-top h1{font-size:clamp(1.6rem,3.4vw,2.4rem)}
  .br-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px;font-size:.92rem;color:var(--muted)}
  .br-head b{color:var(--ink)}
  .br-qchip{display:inline-flex;align-items:center;gap:8px;padding:6px 8px 6px 14px;border-radius:999px;background:var(--ink);color:var(--canvas);font-weight:600;font-size:.9rem}
  .br-qchip button{width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,.15);color:inherit;display:grid;place-items:center;font-size:.8rem}
  .br-layout{display:grid;gap:28px;grid-template-columns:260px minmax(0,1fr);padding:16px 0 48px}
  @media (max-width:900px){.br-layout{grid-template-columns:minmax(0,1fr)}.br-rail{display:none}}
  .br-rail{position:sticky;top:calc(var(--band-h) + var(--head-h) + 16px);align-self:start;display:grid;gap:18px;max-height:calc(100vh - var(--band-h) - var(--head-h) - 32px);overflow:auto;padding-right:4px;scrollbar-width:thin}
  .br-f{display:grid;gap:8px}
  .br-f .lbl{font-size:.78rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);display:flex;justify-content:space-between}
  .br-f .lbl span{font-weight:500;letter-spacing:0;text-transform:none;color:var(--ink-2)}
  .br-opts{display:flex;flex-wrap:wrap;gap:6px}
  .br-opt{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:999px;border:1px solid var(--line);background:var(--paper);font-size:.84rem;color:var(--ink-2)}
  .br-opt:hover{border-color:var(--ink)} .br-opt.on{background:var(--ink);color:var(--canvas);border-color:var(--ink)}
  .br-opt small{color:inherit;opacity:.6}
  .br-range{width:100%;accent-color:var(--red)}
  .br-tools{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:16px}
  .br-mob{display:none}
  @media (max-width:900px){.br-mob{display:inline-flex}}
  .br-grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr))}
  .br-tray{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:65;display:flex;align-items:center;gap:12px;padding:10px 12px 10px 18px;border-radius:999px;background:var(--paper);border:1px solid var(--line);box-shadow:var(--shadow-lg);max-width:calc(100vw - 32px)}
  .br-tray .n{font-weight:700}
  .br-tray .x{color:var(--muted)}
  body.assistant-open .br-tray{display:none}
  .br-cmp{width:100%;border-collapse:collapse;font-size:.9rem}
  .br-cmp th,.br-cmp td{padding:10px 8px;border-bottom:1px solid var(--hair);text-align:left;vertical-align:top}
  .br-cmp th{font-weight:600;color:var(--muted);font-size:.8rem;width:140px}
  .br-cmp td b{font-family:var(--display)}
  .br-watch{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:28px;padding:18px 20px;border-radius:var(--r-lg);background:var(--canvas-2)}
  `;
  const style = () => { if (!document.getElementById('br-css')) document.head.appendChild(el('style', { id: 'br-css', text: CSS })); };

  const BODIES = { 'suv-small': 'Small SUV', 'suv-mid': 'Mid-size SUV', 'suv-large': 'Large SUV', ute: 'Ute', sedan: 'Sedan', hatch: 'Hatch', coupe: 'Coupe' };
  const FUELS = ['Hybrid', 'Petrol', 'Diesel', 'Electric'];
  const fuelOfModel = (m) => (m.powertrain === 'hybrid' ? 'Hybrid' : m.powertrain === 'ev' || m.powertrain === 'electric' ? 'Electric' : m.powertrain === 'diesel' ? 'Diesel' : 'Petrol');
  const USED_HINT = /\b(used|pre-?owned|second ?hand|km|kilomet|owner|certified|demo|ex-?demo|cheap|budget|under \$?[1-4]\d)\b/i;

  // ── state from query ──────────────────────────────────────────────────────
  function readQuery(q) { return { q: q.q || '', type: ['new', 'used'].includes(q.type) ? q.type : 'all', body: q.body || '', fuel: q.fuel || '', priceMax: Number(q.priceMax) || 0, kmMax: Number(q.kmMax) || 0, certified: q.certified === '1', sort: ['price-asc', 'price-desc', 'latest'].includes(q.sort) ? q.sort : 'relevant' }; }
  function writeQuery(f) { const p = new URLSearchParams(); for (const [k, v] of Object.entries(f)) if (v && !(k === 'type' && v === 'all') && !(k === 'sort' && v === 'relevant')) p.set(k, k === 'certified' ? '1' : v); const s = p.toString(); HL.go(`#/browse${s ? `?${s}` : ''}`); }

  // ── data fetch ────────────────────────────────────────────────────────────
  async function fetchUsed(f) {
    if (HL.online) {
      const p = new URLSearchParams({ pageSize: '48' }); if (f.q) p.set('q', f.q); if (f.body) p.set('body', f.body); if (f.fuel) p.set('fuel', f.fuel); if (f.priceMax) p.set('priceMax', String(f.priceMax)); if (f.kmMax) p.set('kmMax', String(f.kmMax)); if (f.certified) p.set('certified', '1'); p.set('sort', f.sort === 'latest' ? 'latest' : f.sort);
      try { const r = await HL.api(`/api/used?${p}`, { timeoutMs: 15000 }); if (r && Array.isArray(r.items)) return r; } catch { /* fall through to local */ }
    }
    const words = f.q.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const items = (HL.data?.used || []).filter((u) => (!f.body || u.body === f.body) && (!f.fuel || u.fuel === f.fuel) && (!f.priceMax || u.price <= f.priceMax) && (!f.kmMax || u.km <= f.kmMax) && (!f.certified || u.certified) && (!words.length || words.some((w) => `${u.title} ${u.grade} ${u.fuel} ${u.body} ${u.colour}`.toLowerCase().includes(w))));
    return { total: items.length, tookMs: 1, semantic: false, items, offline: true };
  }
  async function fetchFind(q) { if (!HL.online || !q) return []; try { const r = await HL.api(`/api/find?q=${encodeURIComponent(q)}`, { timeoutMs: 15000 }); return Array.isArray(r) ? r : []; } catch { return []; } }
  function newModels(f, hits) {
    let models = (HL.data?.catalog?.models || []).filter((m) => (!f.body || m.body === f.body) && (!f.fuel || fuelOfModel(m) === f.fuel) && (!f.priceMax || m.fromPrice <= f.priceMax) && !f.certified && !f.kmMax);
    const reason = {}; const order = [];
    for (const h of hits) { if (h.modelId && HL.model(h.modelId)) { if (!reason[h.modelId]) { reason[h.modelId] = h; order.push(h.modelId); } } }
    if (f.q) {
      const words = f.q.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      const kw = models.filter((m) => words.some((w) => `${m.name} ${m.bodyLabel} ${m.powertrainLabel} ${(m.tags || []).join(' ')} ${m.blurb}`.toLowerCase().includes(w)));
      models = order.length ? models.filter((m) => order.includes(m.id) || kw.includes(m)) : kw;
      models.sort((a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99));
    }
    if (f.sort === 'price-asc') models.sort((a, b) => a.fromPrice - b.fromPrice); if (f.sort === 'price-desc') models.sort((a, b) => b.fromPrice - a.fromPrice);
    return models.map((m) => ({ m, hit: reason[m.id] || null }));
  }

  // ── compare ───────────────────────────────────────────────────────────────
  const cmpKey = (kind, id) => `${kind}:${id}`;
  function toggleCompare(kind, id) {
    const key = cmpKey(kind, id); const list = HL.state.compare.slice();
    const i = list.indexOf(key); if (i >= 0) list.splice(i, 1); else { if (list.length >= 3) { ui.toast(t('browse.cmp.max', 'Compare holds three cars. Remove one first.')); return; } list.push(key); }
    HL.set({ compare: list });
  }
  function compareRows() {
    const cols = HL.state.compare.map((k) => { const [kind, id] = k.split(':'); if (kind === 'm') { const m = HL.model(id); if (!m) return null; const here = HL.unitsOf(id).filter((u) => u.status === 'on_lot').length; return { key: k, title: `Toyota ${m.name}`, sub: t('browse.cmp.new', 'New · from {p}', { p: HL.money(m.fromPrice) }), href: `#/car/m:${id}`, price: HL.money(m.fromPrice), body: m.bodyLabel, seats: m.seats, fuel: m.powertrainLabel, tow: m.towKg ? `${m.towKg.toLocaleString('en-AU')} kg` : t('browse.cmp.norate', 'not rated'), age: t('browse.cmp.newcar', 'New'), avail: here ? t('browse.cmp.onlot', '{n} on the lot', { n: here }) : t('browse.cmp.order', 'Factory order') }; }
      const u = HL.unit(id); if (!u) return null; return { key: k, title: u.title, sub: `${u.grade} · ${HL.km(u.km)}`, href: `#/car/u:${id}`, price: `${HL.money(u.price)} ${t('card.exgov', 'excl. govt charges')}`, body: u.bodyLabel, seats: u.seats, fuel: u.fuel, tow: '—', age: `${u.year} · ${HL.km(u.km)}`, avail: `${u.siteName} · ${u.status.replace('_', ' ')}` }; }).filter(Boolean);
    return cols;
  }
  function openCompare() {
    const cols = compareRows(); if (cols.length < 2) return;
    const row = (label, f) => el('tr', null, el('th', { text: label }), ...cols.map((c) => el('td', null, f(c))));
    const table = el('table', { class: 'br-cmp' }, el('thead', null, el('tr', null, el('th'), ...cols.map((c) => el('td', null, el('b', { text: c.title }), el('div', { class: 'small muted', text: c.sub }))))),
      el('tbody', null, row(t('browse.cmp.price', 'Price'), (c) => c.price), row(t('browse.cmp.body', 'Body'), (c) => c.body), row(t('browse.cmp.seats', 'Seats'), (c) => String(c.seats)), row(t('browse.cmp.fuel', 'Powertrain'), (c) => c.fuel), row(t('browse.cmp.tow', 'Braked towing'), (c) => c.tow), row(t('browse.cmp.age', 'Age and kilometres'), (c) => c.age), row(t('browse.cmp.avail', 'Availability'), (c) => c.avail),
        row('', (c) => el('div', { class: 'row' }, el('a', { class: 'btn sm secondary', href: c.href, onClick: () => ui.closeSheet() }, t('browse.cmp.open', 'Open')), el('button', { class: 'btn sm ghost', onClick: () => { toggleCompare(...c.key.split(':')); ui.closeSheet(); renderTray(); if (HL.state.compare.length >= 2) openCompare(); } }, t('browse.cmp.remove', 'Remove'))))));
    ui.sheet(t('browse.cmp.title', 'Compare'), HL.spot(el('div', { class: 'stack' }, el('div', { style: { overflowX: 'auto' } }, table), el('div', { class: 'row' }, ui.chip(t('browse.cmp.src', 'Catalogue · Domo stock · unit records'), 'dms'), el('button', { class: 'btn sm ghost', onClick: () => HL.assistant.ask(t('browse.cmp.ask', 'Compare these for me: {list}. Which suits a family that tows a boat?', { list: cols.map((c) => c.title).join(', ') })) }, t('browse.cmp.askai', 'Ask the assistant to compare')))), 'product', t('browse.spot.cmp', 'Compare: catalogue facts + live stock + unit records')), [], { wide: true });
  }
  let tray = null;
  function renderTray() {
    if (tray) { tray.remove(); tray = null; }
    const n = HL.state.compare.length; if (n < 1 || HL.route().name !== 'browse') return;
    tray = el('div', { class: 'br-tray' }, el('span', { class: 'n', text: t('browse.tray', '{n} to compare', { n }) }), n < 2 ? el('span', { class: 'x small', text: t('browse.tray.more', 'add one more') }) : el('button', { class: 'btn sm primary', onClick: openCompare }, t('browse.tray.open', 'Compare')), el('button', { class: 'btn sm ghost', onClick: () => { HL.set({ compare: [] }); renderTray(); draw(); } }, t('browse.tray.clear', 'Clear')));
    document.body.appendChild(tray);
  }

  // ── rail ──────────────────────────────────────────────────────────────────
  function rail(f, facets) {
    const opt = (label, on, onClick, count) => el('button', { class: `br-opt ${on ? 'on' : ''}`, onClick }, label, count != null ? el('small', { text: ` ${count}` }) : null);
    const group = (label, right, body) => el('div', { class: 'br-f' }, el('div', { class: 'lbl' }, label, right ? el('span', { text: right }) : null), body);
    const priceVals = [30000, 45000, 65000, 90000, 130000];
    const kmVals = [20000, 40000, 60000, 80000, 120000];
    const priceIdx = f.priceMax ? Math.max(0, priceVals.indexOf(f.priceMax)) : priceVals.length; const kmIdx = f.kmMax ? Math.max(0, kmVals.indexOf(f.kmMax)) : kmVals.length;
    return el('aside', { class: 'br-rail', 'aria-label': t('browse.filters', 'Filters') },
      group(t('browse.f.type', 'Show'), null, el('div', { class: 'br-opts' }, opt(t('browse.f.all', 'All'), f.type === 'all', () => writeQuery({ ...f, type: 'all' })), opt(t('browse.f.new', 'New'), f.type === 'new', () => writeQuery({ ...f, type: 'new', kmMax: 0, certified: false })), opt(t('browse.f.used', 'Pre-owned'), f.type === 'used', () => writeQuery({ ...f, type: 'used' })))),
      group(t('browse.f.body', 'Body'), null, el('div', { class: 'br-opts' }, ...Object.entries(BODIES).map(([id, label]) => opt(label, f.body === id, () => writeQuery({ ...f, body: f.body === id ? '' : id }), facets.body[id])))),
      group(t('browse.f.fuel', 'Powertrain'), null, el('div', { class: 'br-opts' }, ...FUELS.map((x) => opt(x, f.fuel === x, () => writeQuery({ ...f, fuel: f.fuel === x ? '' : x }), facets.fuel[x])))),
      group(t('browse.f.price', 'Price up to'), f.priceMax ? HL.money(f.priceMax) : t('browse.f.any', 'Any'), el('input', { class: 'br-range', type: 'range', min: 0, max: priceVals.length, step: 1, value: priceIdx, 'aria-label': t('browse.f.price', 'Price up to'), onChange: (e) => writeQuery({ ...f, priceMax: Number(e.target.value) >= priceVals.length ? 0 : priceVals[Number(e.target.value)] }) })),
      f.type !== 'new' ? group(t('browse.f.km', 'Kilometres up to'), f.kmMax ? HL.km(f.kmMax) : t('browse.f.any', 'Any'), el('input', { class: 'br-range', type: 'range', min: 0, max: kmVals.length, step: 1, value: kmIdx, 'aria-label': t('browse.f.km', 'Kilometres up to'), onChange: (e) => writeQuery({ ...f, kmMax: Number(e.target.value) >= kmVals.length ? 0 : kmVals[Number(e.target.value)] }) })) : null,
      f.type !== 'new' ? el('label', { class: `switch ${f.certified ? 'on' : ''}` }, el('i'), el('input', { type: 'checkbox', class: 'sr-only', checked: f.certified, onChange: () => writeQuery({ ...f, certified: !f.certified }) }), t('browse.f.certified', 'Only Toyota Certified pre-owned')) : null,
      (f.body || f.fuel || f.priceMax || f.kmMax || f.certified) ? el('button', { class: 'btn ghost sm', onClick: () => writeQuery({ q: f.q, type: f.type, sort: f.sort }) }, t('browse.f.clear', 'Clear filters')) : null);
  }

  // ── scene ─────────────────────────────────────────────────────────────────
  let root = null; let seq = 0; let offs = []; let lastF = null;
  async function draw() {
    if (!root) return; const my = ++seq;
    const f = readQuery(HL.route().query); lastF = f;
    if (f.q) HL.remember('asked', { q: f.q });
    root.innerHTML = '';
    const head = el('div', { class: 'br-head' }, el('span', { class: 'skel', style: { width: '260px', height: '18px', display: 'inline-block' } }));
    root.appendChild(el('div', { class: 'wrap br-top' }, el('div', { class: 'kick', text: t('browse.kick', 'Browse') }), el('h1', { text: f.q ? t('browse.h1.q', 'Results for your words') : t('browse.h1', 'Everything on our four lots, new and pre-owned') }), head));
    const layout = el('div', { class: 'wrap br-layout' }); root.appendChild(layout);
    const main = el('div', null, ui.skeleton(6, 320)); layout.appendChild(el('div', { class: 'skel', style: { height: '320px' } })); layout.appendChild(main);
    if (!HL.data) { await new Promise((r) => { const off = HL.bus.on('data', () => { off(); r(); }); }); }
    const [used, hits] = await Promise.all([f.type === 'new' ? { items: [], total: 0, tookMs: 0, semantic: false } : fetchUsed(f), f.type === 'used' ? [] : fetchFind(f.q)]);
    if (my !== seq) return;
    const models = f.type === 'used' ? [] : newModels(f, hits);
    const usedItems = used.items || [];
    // facets from the result set
    const facets = { body: {}, fuel: {} };
    for (const { m } of models) { facets.body[m.body] = (facets.body[m.body] || 0) + 1; facets.fuel[fuelOfModel(m)] = (facets.fuel[fuelOfModel(m)] || 0) + 1; }
    for (const u of usedItems) { facets.body[u.body] = (facets.body[u.body] || 0) + 1; facets.fuel[u.fuel] = (facets.fuel[u.fuel] || 0) + 1; }
    // interleave
    const cards = []; const cmp = new Set(HL.state.compare);
    const newCards = models.map(({ m, hit }) => ui.modelCard(m, { reason: hit ? trim(hit.text) : undefined, trace: hit ? [{ label: hit.title, kind: 'kb' }] : [], actions: [{ label: cmp.has(cmpKey('m', m.id)) ? t('browse.cmp.added', 'In compare') : t('browse.cmp.add', 'Compare'), kind: cmp.has(cmpKey('m', m.id)) ? 'primary' : 'secondary', onClick: () => { toggleCompare('m', m.id); renderTray(); draw(); } }, { label: t('browse.open', 'Open'), kind: 'secondary', onClick: () => HL.go(`#/car/m:${m.id}`) }] }));
    const usedCards = usedItems.map((u) => ui.unitCard(u, { trace: used.semantic ? [{ label: t('browse.semantic.chip', 'Semantic match · ARAG /find'), kind: 'kb' }] : [], actions: [{ label: cmp.has(cmpKey('u', u.stockNo)) ? t('browse.cmp.added', 'In compare') : t('browse.cmp.add', 'Compare'), kind: cmp.has(cmpKey('u', u.stockNo)) ? 'primary' : 'secondary', onClick: () => { toggleCompare('u', u.stockNo); renderTray(); draw(); } }, { label: t('browse.open', 'Open'), kind: 'secondary', onClick: () => HL.go(`#/car/u:${u.stockNo}`) }] }));
    if (f.q) { const usedFirst = USED_HINT.test(f.q); const a = usedFirst ? usedCards : newCards; const b = usedFirst ? newCards : usedCards; const n = Math.max(a.length, b.length); for (let i = 0; i < n; i++) { if (a[i]) cards.push(a[i]); if (b[i]) cards.push(b[i]); } }
    else if (f.sort === 'price-asc' || f.sort === 'price-desc') { const all = [...models.map(({ m }) => ({ p: m.fromPrice, c: newCards[models.findIndex((x) => x.m === m)] })), ...usedItems.map((u, i) => ({ p: u.price, c: usedCards[i] }))].sort((x, y) => (f.sort === 'price-asc' ? x.p - y.p : y.p - x.p)); cards.push(...all.map((x) => x.c)); }
    else cards.push(...newCards, ...usedCards);
    const total = cards.length; const ms = (used.tookMs || 0) + (hits.length ? 1 : 0);
    head.innerHTML = '';
    head.append(el('span', null, el('b', { class: 'num', text: String(total) }), ' ', t('browse.head.results', 'results across new and pre-owned'), used.tookMs != null ? ` ${t('browse.head.in', 'in')} ` : '', used.tookMs != null ? el('b', { class: 'num', text: `${ms} ms` }) : ''),
      f.q ? el('span', { class: 'br-qchip' }, `“${f.q}”`, el('button', { 'aria-label': t('browse.head.clearq', 'Clear search'), onClick: () => writeQuery({ ...f, q: '' }) }, '✕')) : null,
      f.q ? (used.semantic || hits.length ? ui.chip(t('browse.head.semantic', 'semantic match · ARAG /find'), 'kb') : ui.chip(used.offline ? t('browse.head.offline', 'text match (offline)') : t('browse.head.keyword', 'keyword match'), 'outline')) : null,
      HL.spot(el('span'), 'search', t('browse.spot.search', 'Natural-language retrieval over cars and documents in one call'))); // anchor for the pin
    head.dataset.spot = 'search'; head.dataset.spotLabel = t('browse.spot.search', 'Natural-language retrieval over cars and documents in one call');
    layout.innerHTML = ''; layout.appendChild(rail(f, facets)); layout.appendChild(main); main.innerHTML = '';
    const sortPills = el('div', { class: 'pills', role: 'group', 'aria-label': t('browse.sort', 'Sort') }, ...[['relevant', t('browse.sort.relevant', 'Most relevant')], ['price-asc', t('browse.sort.asc', 'Price low')], ['price-desc', t('browse.sort.desc', 'Price high')], ['latest', t('browse.sort.latest', 'Newest')]].map(([id, label]) => el('button', { class: f.sort === id ? 'on' : '', onClick: () => writeQuery({ ...f, sort: id }) }, label)));
    main.appendChild(el('div', { class: 'br-tools' }, el('button', { class: 'btn secondary sm br-mob', onClick: () => ui.sheet(t('browse.filters', 'Filters'), el('div', { style: { display: 'grid', gap: '18px' } }, ...[...rail(f, facets).children].map((c) => { c.style.display = ''; return c; }))) }, t('browse.filters', 'Filters')), sortPills));
    if (!cards.length) main.appendChild(ui.empty(t('browse.empty', 'Nothing matches those words and filters yet. Try fewer filters, or let the finder rank the cars we actually have.'), t('browse.empty.finder', 'Find my car'), () => HL.go('#/finder')));
    else main.appendChild(el('div', { class: 'br-grid' }, cards));
    // watch this search
    if (f.type !== 'new') main.appendChild(HL.spot(el('div', { class: 'br-watch' }, el('div', null, el('b', { text: t('browse.watch.h', 'Watch this search') }), el('div', { class: 'small muted', text: t('browse.watch.sub', 'We tell you when a trade-in or arrival matches these filters. Watch counts show on each car as a demand signal.') })), el('button', { class: 'btn secondary', onClick: async () => { const criteria = {}; if (f.body) criteria.body = f.body; if (f.fuel) criteria.fuel = f.fuel; if (f.priceMax) criteria.priceMax = f.priceMax; if (f.kmMax) criteria.kmMax = f.kmMax; const model = (HL.data.catalog.models || []).find((m) => f.q.toLowerCase().includes(m.name.toLowerCase())); if (model) criteria.model = model.name; if (!Object.keys(criteria).length) { ui.toast(t('browse.watch.need', 'Add a filter or a model name first.')); return; } try { const r = await HL.api('/api/used/watch', { method: 'POST', body: { criteria } }); HL.remember('watches', { criteria }); ui.toast(t('browse.watch.ok', 'Watching. {n} car(s) match right now.', { n: r.matchesNow })); } catch { ui.toast(t('browse.watch.off', 'Watching needs the live API.')); } } }, t('browse.watch.btn', 'Watch'))), 'personalised', t('browse.spot.watch', 'Saved criteria matched live against stock; watcher counts as demand signal'), ''));
    renderTray();
  }
  const trim = (s) => { const x = String(s || '').replace(/^Who it suits\s*\n?\s*/i, '').replace(/\s+/g, ' ').trim(); return x.length > 170 ? `${x.slice(0, 167)}…` : x; };

  HL.scene('browse', {
    mount(r) { style(); root = r; draw(); offs.push(HL.bus.on('lang', draw)); },
    unmount() { root = null; seq++; offs.forEach((f) => f()); offs = []; if (tray) { tray.remove(); tray = null; } },
  });
})();
