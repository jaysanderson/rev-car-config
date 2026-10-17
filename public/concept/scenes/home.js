/* Harbourline One — front door (#/). Owner: Agent A. Uses only the HL contract (app.js). */
(function () {
  'use strict';
  const ui = HL.ui; const el = ui.el; const t = HL.t;
  const CSS = `
  .hm-hero{position:relative;overflow:hidden;padding:clamp(48px,9vw,120px) 0 clamp(36px,6vw,72px);background:radial-gradient(1200px 600px at 20% -10%,color-mix(in srgb,var(--red) 7%,transparent),transparent 60%),radial-gradient(900px 500px at 90% 10%,color-mix(in srgb,var(--blue) 8%,transparent),transparent 60%),var(--canvas)}
  .hm-hero .kick{margin-bottom:14px}
  .hm-hero h1{max-width:16ch;font-size:clamp(2.3rem,6vw,4.4rem);font-weight:800;letter-spacing:-.03em;line-height:1.02}
  .hm-hero .lede{margin-top:16px;max-width:56ch;font-size:clamp(1rem,1.6vw,1.2rem);color:var(--ink-2)}
  .hm-ask{margin-top:28px;max-width:760px}
  .hm-ask .askbar{padding:6px 6px 6px 22px}
  .hm-ask .askbar .mic{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;color:var(--muted)}
  .hm-ask .askbar .mic.on{color:var(--red);animation:pulse 1.2s infinite}
  .hm-ask .hint{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;align-items:center}
  .hm-ask .hint button{font-size:.82rem;color:var(--ink-2);padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:var(--paper)}
  .hm-ask .hint button:hover{border-color:var(--ink)}
  .hm-doors{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));margin-top:40px}
  .hm-door{display:flex;flex-direction:column;gap:10px;padding:22px;border-radius:var(--r-xl);background:var(--paper);border:1px solid var(--line);text-decoration:none;min-height:170px;transition:transform .2s var(--ease),box-shadow .2s;position:relative;overflow:hidden}
  .hm-door:hover{transform:translateY(-3px);box-shadow:var(--shadow-lg)}
  .hm-door .ic{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--canvas-2);font-size:1.2rem}
  .hm-door h3{font-size:1.25rem}
  .hm-door p{color:var(--muted);font-size:.92rem}
  .hm-door .go{margin-top:auto;font-weight:600;font-size:.9rem;display:inline-flex;gap:6px;align-items:center}
  .hm-door.primary{background:var(--ink);color:var(--canvas);border-color:var(--ink)} .hm-door.primary p{color:color-mix(in srgb,var(--canvas) 70%,transparent)} .hm-door.primary .ic{background:rgba(255,255,255,.12)}
  .hm-rows{display:grid;gap:28px;min-width:0}.hm-rows>*{min-width:0}
  .hm-row .rh{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}
  .hm-row .rh h3{font-size:1.15rem}
  .hm-row .rh .why{font-size:.82rem;color:var(--muted)}
  .hm-scroller{width:100%;min-width:0;display:grid;grid-auto-flow:column;grid-auto-columns:minmax(260px,300px);gap:14px;overflow-x:auto;padding:4px 4px 12px;scroll-snap-type:x mandatory;scrollbar-width:thin}
  .hm-scroller>*{scroll-snap-align:start}
  .hm-knows{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 16px;border-radius:var(--r-lg);background:var(--paper);border:1px dashed var(--line)}
  .hm-knows .lbl{font-weight:600;font-size:.9rem}
  .hm-knows .btn{margin-left:auto}
  .hm-offers{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))}
  .hm-offer{display:flex;flex-direction:column;gap:10px;padding:18px;border-radius:var(--r-lg);background:var(--paper);border:1px solid var(--line);text-decoration:none;transition:transform .2s var(--ease),box-shadow .2s}
  .hm-offer:hover{transform:translateY(-2px);box-shadow:var(--shadow-lg)}
  .hm-offer .val{font-family:var(--display);font-weight:800;font-size:1.5rem;letter-spacing:-.02em}
  .hm-offer .ttl{font-weight:700}
  .hm-offer .why{font-size:.88rem;color:var(--ink-2)}
  .hm-offer .meta{display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:.76rem;color:var(--muted);margin-top:auto}
  .hm-happen{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))}
  .hm-happen .card{padding:18px}
  .hm-happen h4{margin-bottom:8px;font-size:.95rem}
  .hm-happen ul{margin:0;padding:0;list-style:none;display:grid;gap:6px;font-size:.88rem}
  .hm-happen li{display:flex;justify-content:space-between;gap:8px}
  .hm-happen li span:last-child{color:var(--muted);white-space:nowrap}
  .hm-trust{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))}
  .hm-trust button{text-align:left;display:flex;flex-direction:column;gap:6px;padding:18px;border-radius:var(--r-lg);background:var(--canvas-2)}
  .hm-trust button:hover{background:var(--paper);box-shadow:var(--shadow)}
  .hm-trust b{font-family:var(--display)}
  .hm-trust span{font-size:.86rem;color:var(--muted)}
  `;
  const style = () => { if (!document.getElementById('hm-css')) document.head.appendChild(el('style', { id: 'hm-css', text: CSS })); };

  // ── query routing ─────────────────────────────────────────────────────────
  const CAR_WORDS = /\b(suv|ute|hatch|sedan|coupe|wagon|4x4|awd|hybrid|electric|ev|diesel|petrol|manual|auto|seats?|seater|tow|towing|caravan|boat|trailer|km|kilomet|budget|under|over|cheap|price|certified|used|pre-?owned|demo|new|family|commute|work)\b|\$\s?\d|\d{2,3}k\b|rav4|corolla|camry|kluger|hilux|prado|landcruiser|fortuner|yaris|c-hr|chr|bz4x|gr86|gr |ranger|cx-5|sportage|forester|outlander|i30|丰田|车|混动|xe|hybrid/i;
  function submit(text) {
    const q = String(text || '').trim(); if (!q) return;
    HL.remember('asked', { q });
    if (CAR_WORDS.test(q) && q.length < 160) HL.go(`#/browse?q=${encodeURIComponent(q)}`); else HL.assistant.ask(q);
  }

  // ── hero ──────────────────────────────────────────────────────────────────
  const EXAMPLES = ['Something that tows a caravan and seats seven', '一辆省油的混动家用车，预算四万五以内', 'Xe hybrid dưới 45 nghìn đô, ít km', 'A pre-owned RAV4 hybrid with one owner', 'When do the NSW school holidays start?'];
  function hero() {
    let i = 0; let timer;
    const input = el('input', { type: 'text', 'aria-label': t('home.ask.aria', 'Tell us what you need'), placeholder: EXAMPLES[0], autocomplete: 'off', onKeydown: (e) => { if (e.key === 'Enter') submit(input.value); } });
    const cycle = () => { if (document.activeElement === input || input.value) return; i = (i + 1) % EXAMPLES.length; input.placeholder = EXAMPLES[i]; };
    timer = setInterval(cycle, 3200);
    const mic = micButton(input);
    const bar = el('div', { class: 'askbar' }, input, mic, el('button', { class: 'btn primary', onClick: () => submit(input.value) }, t('home.ask.go', 'Ask'), el('span', { class: 'arrow' }, '→')));
    const hints = el('div', { class: 'hint' }, el('span', { class: 'tiny muted', text: t('home.ask.try', 'Try:') }), ...[t('home.ask.h1', 'Tows 2.5 t, under $65k'), t('home.ask.h2', 'Seven seats, hybrid'), t('home.ask.h3', 'Can I tow my caravan with a RAV4?'), t('home.ask.h4', 'Pre-owned Camry, one owner')].map((h) => el('button', { onClick: () => { input.value = h; submit(h); } }, h)));
    const ask = HL.spot(el('div', { class: 'hm-ask' }, bar, hints), 'multilingual', t('home.spot.ask', 'Ask in any language: retrieval over cars and documents, answer in your language'));
    const doors = el('div', { class: 'hm-doors' },
      door('#/finder', '◎', t('home.door.finder', 'Find my car'), t('home.door.finder.sub', 'Five questions. We rank the cars we actually have, new and pre-owned, with the reasons.'), 'primary'),
      door('#/browse', '▦', t('home.door.browse', 'Browse what is here'), t('home.door.browse.sub', 'Every new model and every pre-owned car across four sites, searchable in plain words.')),
      door(`#/car/m:${HL.state.build.modelId || 'rav4'}`, '✦', t('home.door.build', 'Build new'), t('home.door.build.sub', 'Grades, colours and packs with live availability and a drive-away price.')));
    const sec = el('section', { class: 'hm-hero' }, el('div', { class: 'wrap' },
      el('div', { class: 'kick', text: t('home.kick', 'Harbourline Toyota · new, pre-owned and ownership') }),
      el('h1', { text: t('home.h1', 'Tell us what you need. We will find the car and show our working.') }),
      el('p', { class: 'lede', text: t('home.lede', 'One place for the whole range and every pre-owned car on our four lots. Every answer cites its source, every offer says why it exists, and nothing needs an account.') }),
      ask, doors));
    sec._stop = () => clearInterval(timer);
    return sec;
  }
  function door(href, icon, title, sub, cls) { return el('a', { class: `hm-door ${cls || ''}`, href }, el('span', { class: 'ic', 'aria-hidden': 'true', text: icon }), el('h3', { text: title }), el('p', { text: sub }), el('span', { class: 'go' }, t('home.door.go', 'Open'), el('span', { class: 'arrow' }, '→'))); }
  function micButton(input) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return el('span', { hidden: true });
    const b = el('button', { class: 'mic', 'aria-label': t('home.ask.mic', 'Speak'), title: t('home.ask.mic', 'Speak') }, '🎤');
    b.onclick = () => {
      try {
        const r = new SR(); r.lang = { en: 'en-AU', zh: 'zh-CN', vi: 'vi-VN', ar: 'ar-SA', hi: 'hi-IN' }[HL.state.lang] || 'en-AU'; r.interimResults = false;
        b.classList.add('on'); r.onresult = (e) => { input.value = e.results[0][0].transcript; submit(input.value); }; r.onend = () => b.classList.remove('on'); r.onerror = () => b.classList.remove('on'); r.start();
      } catch { b.classList.remove('on'); }
    };
    return b;
  }

  // ── for you ───────────────────────────────────────────────────────────────
  async function forYou(root) {
    const host = el('div', { class: 'hm-rows' }, ui.skeleton(3, 160));
    const sec = HL.spot(ui.section(t('home.foryou.kick', 'For you'), t('home.foryou.h', 'Picked from your visit, not from a profile'), t('home.foryou.sub', 'The page turns what you looked at, asked and answered into retrieval queries over every car and document. Nothing is stored beyond this device.'), host), 'personalised', t('home.spot.foryou', 'Journey-based retrieval: viewed, asked and answered become /find queries'));
    root.appendChild(sec);
    const rows = []; let journey = null;
    const b = HL.state.build || {}; const ans = (HL.state.journey.answers || []).map((a) => `${a.id}:${a.value}`).join(',');
    const [usedFy, newFy] = HL.online ? await Promise.all([
      HL.api('/api/used/foryou', { timeoutMs: 25000 }).catch(() => null),
      (b.modelId || ans) ? HL.api(`/api/foryou?${new URLSearchParams({ model: b.modelId || '', grade: b.gradeId || '', colour: b.colourId || '', answers: ans })}`, { timeoutMs: 60000 }).catch(() => null) : null,
    ]) : [null, null];
    if (usedFy) { journey = usedFy.journey; for (const r of usedFy.rows || []) rows.push({ title: r.title, why: r.why, kind: 'mem', items: r.items.map((u) => ui.unitCard(u)) }); }
    if (Array.isArray(newFy)) for (const r of newFy) { const items = r.items.map((it) => { const m = HL.model(it.modelId); return m ? ui.modelCard(m, { reason: it.blurb, trace: it.citation ? [{ label: it.citation.title, kind: 'kb' }] : [] }) : null; }).filter(Boolean); if (items.length) rows.push({ title: r.title, why: r.reason, kind: 'kb', items }); }
    host.innerHTML = '';
    const j = HL.state.journey;
    const facts = [].concat((journey?.viewed || j.viewed.map((v) => v.id || v.stockNo || v)).slice(-3).map((v) => t('home.knows.viewed', 'viewed {x}', { x: typeof v === 'string' ? v : v.title || v })), (journey?.asked || j.asked).slice(-2).map((a) => t('home.knows.asked', 'asked "{x}"', { x: (a.q || '').slice(0, 40) })), j.answers.length ? [t('home.knows.answers', '{n} finder answers', { n: j.answers.length })] : [], (journey?.watches || j.watches).length ? [t('home.knows.watches', '{n} watch(es)', { n: (journey?.watches || j.watches).length })] : []);
    if (!rows.length && !facts.length) { sec.remove(); return; }
    host.appendChild(el('div', { class: 'hm-knows' }, el('span', { class: 'lbl', text: t('home.knows', 'What this page knows about you') }), ...(facts.length ? facts.map((f) => ui.chip(f, 'mem')) : [ui.chip(t('home.knows.nothing', 'Nothing yet. It learns as you browse.'), 'outline')]), ui.chip(t('home.knows.scope', 'Session only · no account'), 'outline'), el('button', { class: 'btn ghost sm', onClick: () => HL.forget().then(() => HL.rerender()) }, t('home.knows.forget', 'Forget me'))));
    for (const r of rows) host.appendChild(el('div', { class: 'hm-row' }, el('div', { class: 'rh' }, el('h3', { text: r.title }), el('span', { class: 'why' }, ui.chip(r.why, r.kind))), el('div', { class: 'hm-scroller' }, r.items)));
    if (!rows.length) host.appendChild(ui.empty(t('home.foryou.empty', 'Look at a car or ask a question and this section fills itself.'), t('home.door.browse', 'Browse what is here'), () => HL.go('#/browse')));
  }

  // ── offers chosen by the data ─────────────────────────────────────────────
  const seenOffers = new Set();
  function offers(root) {
    const d = HL.data; if (!d) return;
    const tiles = [];
    for (const o of (d.offers || []).slice(0, 3)) {
      const m = HL.model(o.modelId); const g = HL.grade(o.modelId, o.gradeId); if (!m) continue;
      if (!seenOffers.has(o.unitId)) { seenOffers.add(o.unitId); HL.track('offer_view', { unitId: o.unitId }); }
      tiles.push(el('a', { class: 'hm-offer', href: `#/car/m:${o.modelId}?grade=${o.gradeId}&colour=${o.colourId}&unit=${o.unitId}`, onClick: () => HL.track('offer_click', { unitId: o.unitId }) },
        el('div', { class: 'row between' }, ui.chip(t('home.offer.readynow', 'Ready now'), 'good'), ui.chip(t('home.offer.domo', 'Domo · aged stock'), 'domo')),
        el('div', { class: 'val num', text: o.bonus ? `${HL.money(o.bonus)} ${t('home.offer.bonus', 'ready-now bonus')}` : HL.money(o.price) }),
        el('div', { class: 'ttl', text: `Toyota ${m.name} ${g ? g.name : ''} · ${HL.colour(o.colourId)?.name || o.colourId}` }),
        el('p', { class: 'why', text: t('home.offer.why', 'On the lot at {site} and ready to drive away. {reason}', { site: HL.site(o.site).name, reason: customerSafe(o.reason) }) }),
        el('div', { class: 'meta' }, el('span', { text: `${HL.money(o.price)} ${t('home.offer.da', 'drive-away est.')}` }), el('span', { text: o.unitId }))));
    }
    for (const p of (d.promotions || []).filter((p) => p.status !== 'draft').slice(0, 3)) {
      const model = p.appliesTo?.models?.[0]; const m = model ? HL.model(model) : null;
      tiles.push(el('a', { class: 'hm-offer', href: m ? `#/car/m:${m.id}` : '#/browse' },
        el('div', { class: 'row between' }, ui.chip(KIND[p.kind] || p.kind, 'blue'), el('span', { class: 'row', style: { gap: '4px' } }, ui.chip(t('home.offer.signal', 'Domo signal'), 'domo'), p.composedBy === 'arag' ? ui.chip(t('home.offer.agent', 'Written by the agent'), 'kb') : null)),
        el('div', { class: 'val num', text: p.value ? `${HL.money(p.value)} ${t('home.offer.value', 'value')}` : p.short || '' }),
        el('div', { class: 'ttl', text: p.title }),
        el('p', { class: 'why', text: p.why || p.desc }),
        el('div', { class: 'meta' }, p.validUntil ? el('span', { text: t('home.offer.until', 'Until {d}', { d: fmtDate(p.validUntil) }) }) : null, m ? el('span', { text: `Toyota ${m.name}` }) : null, (p.source?.kb || []).length ? el('span', { title: p.source.kb.join(', '), text: t('home.offer.sources', '{n} source(s)', { n: p.source.kb.length }) }) : null)));
    }
    if (!tiles.length) return;
    root.appendChild(HL.spot(ui.section(t('home.offers.kick', 'Offers'), t('home.offers.h', 'Chosen by the data, not by marketing'), t('home.offers.sub', 'Domo tells us which cars have sat too long and where next month\'s allocation is heavy. The agent writes the customer-safe offer and says why it exists.'), el('div', { class: 'hm-offers' }, tiles)), 'pricing', t('home.spot.offers', 'Domo dealer signals → agent-composed promotions with a stated reason'), 'domo'));
  }
  const KIND = { 'accessory-bundle': 'Accessories', servicing: 'Servicing', 'trade-in': 'Trade-in', finance: 'Finance', delivery: 'Delivery' };
  const customerSafe = (s) => String(s || '').replace(/\d+ days in stock\s*·?\s*/i, '').replace(/\$[\d,]+ bonus headroom\s*·?\s*/i, '').replace(/^\s*·\s*/, '').replace(/\(([^)]+) transfer\)/i, '($1 transfer run)').trim();
  const fmtDate = (s) => { const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }); };

  // ── happening at Harbourline ──────────────────────────────────────────────
  function happening(root) {
    const d = HL.data; if (!d || !d.stock) return;
    const inbound = (d.stock.inbound_pipeline || []).filter((u) => !u.sold && u.eta_days != null && u.eta_days <= 14).sort((a, b) => a.eta_days - b.eta_days).slice(0, 5);
    const eta = (d.stock.order_bank_eta || []).slice(0, 6);
    const sites = (d.sites || []).map((s) => ({ ...s, run: s.transferRun || (d.stock.transfer_feasibility || []).find((x) => x.from_site === s.id)?.run_day }));
    const used = (d.used || []).filter((u) => u.status === 'arriving' || u.status === 'reconditioning').slice(0, 3);
    const li = (a, b) => el('li', null, el('span', { text: a }), el('span', { text: b }));
    const cards = [
      el('div', { class: 'card flat' }, el('h4', { text: t('home.hap.arriving', 'Arriving in the next two weeks') }), el('ul', null, ...inbound.map((u) => li(`Toyota ${HL.model(u.model)?.name || u.model} ${HL.grade(u.model, u.grade)?.name || u.grade} · ${HL.colour(u.colour)?.name || u.colour}`, t('home.hap.days', '{n} days · {site}', { n: u.eta_days, site: HL.site(u.destination_site).name }))), ...used.map((u) => li(`${u.title} ${u.grade} (${t('home.hap.preowned', 'pre-owned')})`, u.status === 'arriving' ? t('home.hap.days', '{n} days · {site}', { n: u.etaDays, site: u.siteName }) : t('home.hap.recon', 'reconditioning'))), inbound.length + used.length ? null : li(t('home.hap.none', 'Nothing due this fortnight'), '')), el('div', { style: { marginTop: '10px' } }, ui.chip(t('home.hap.domo.inbound', 'Domo · inbound pipeline'), 'domo'))),
      el('div', { class: 'card flat' }, el('h4', { text: t('home.hap.order', 'Factory order lead times') }), el('ul', null, ...eta.map((r) => li(`Toyota ${HL.model(r.model)?.name || r.model}`, `${r.label}${r.note ? ` · ${r.note}` : ''}`))), el('div', { style: { marginTop: '10px' } }, ui.chip(t('home.hap.domo.eta', 'Domo · order bank ETA'), 'domo'))),
      el('div', { class: 'card flat' }, el('h4', { text: t('home.hap.dates', 'Dates that matter') }), el('ul', null, li(t('home.hap.holidays', 'NSW summer school holidays start'), t('home.hap.holidays.date', 'Fri 18 Dec 2026')), li(t('home.hap.lastday', 'Last school day'), t('home.hap.lastday.date', 'Thu 17 Dec 2026')), li(t('home.hap.eofy', 'Plate clearance'), t('home.hap.eofy.date', 'from 1 Jan 2027'))), el('div', { style: { marginTop: '10px' } }, ui.chip(t('home.hap.kb.dates', 'Knowledge box · NSW term dates'), 'kb'))),
      el('div', { class: 'card flat' }, el('h4', { text: t('home.hap.sites', 'Four sites, one lot') }), el('ul', null, ...sites.map((s) => li(s.name, s.distanceKm ? t('home.hap.site.run', '{km} km · {day} run', { km: s.distanceKm, day: s.run || '—' }) : t('home.hap.site.home', 'home site')))), el('div', { style: { marginTop: '10px' } }, ui.chip(t('home.hap.domo.transfer', 'Domo · transfer feasibility'), 'domo'))),
    ];
    root.appendChild(HL.spot(ui.section(t('home.hap.kick', 'Happening at Harbourline'), t('home.hap.h', 'What is moving this fortnight'), t('home.hap.sub', 'Live from the stock feeds the dealership already runs on, so the site never promises a car it does not have.'), el('div', { class: 'hm-happen' }, cards)), 'pricing', t('home.spot.hap', 'Domo inbound pipeline, order-bank ETA and transfer runs rendered live'), 'domo'));
  }

  // ── trust strip ───────────────────────────────────────────────────────────
  function trust(root) {
    const items = [
      ['conversational', t('home.trust.cited', 'Every answer cites its source'), t('home.trust.cited.sub', 'Spec sheets, policies and each car\'s own record. Tap a citation to see the paragraph.')],
      ['pricing', t('home.trust.data', 'The data layer is visible'), t('home.trust.data.sub', 'Chips show whether a fact came from the knowledge box, from Domo or from your own visit.')],
      ['personalised', t('home.trust.noaccount', 'No account needed'), t('home.trust.noaccount.sub', 'Personalisation comes from this visit, on this device. Forget it whenever you like.')],
      ['multilingual', t('home.trust.lang', 'Speaks your language'), t('home.trust.lang.sub', 'Ask in English, 中文, Tiếng Việt, العربية or हिन्दी. The corpus stays in English; the answer does not.')],
    ];
    root.appendChild(ui.section(t('home.trust.kick', 'How this works'), t('home.trust.h', 'Built to show its working'), null, el('div', { class: 'hm-trust' }, items.map(([id, b, s]) => el('button', { onClick: () => HL.powers.open(id) }, el('b', { text: b }), el('span', { text: s }), el('span', { class: 'tiny', style: { color: 'var(--kb)', fontWeight: 600 }, text: t('home.trust.more', 'What powers this →') }))))));
  }

  // ── scene ─────────────────────────────────────────────────────────────────
  let offs = []; let heroEl = null;
  HL.scene('home', {
    mount(root) {
      style();
      heroEl = hero(); root.appendChild(heroEl);
      const body = el('div'); root.appendChild(body);
      const fill = () => { body.innerHTML = ''; forYou(body); offers(body); happening(body); trust(body); };
      if (HL.data) fill(); else { body.appendChild(el('div', { class: 'wrap section' }, ui.skeleton(3, 180))); offs.push(HL.bus.on('data', fill)); }
    },
    unmount() { offs.forEach((f) => f()); offs = []; if (heroEl && heroEl._stop) heroEl._stop(); heroEl = null; },
  });
})();
