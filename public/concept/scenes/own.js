/* Harbourline One — Own (#/own): owner mode for a delivered customer. Agent D.
   Live: "Ask your car" and service/loan-car facts from the knowledge box via /api/ask. Mock: delivery tracker,
   recall status, equity clock, service booking. Tokens from concept.css only. */
(function () {
  'use strict';
  const { el, chip } = HL.ui;
  const t = (k, f, v) => HL.t(`own.${k}`, f, v);
  let styled = false;
  const CSS = `
  .ow-hero{padding:clamp(28px,5vw,56px) 0 8px}
  .ow-owners{display:flex;gap:10px;flex-wrap:wrap}
  .ow-owner{display:flex;align-items:center;gap:12px;padding:10px 14px 10px 10px;border:1px solid var(--line);border-radius:999px;background:var(--paper);text-align:left}
  .ow-owner.on{border-color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink)}
  .ow-owner .av{width:36px;height:36px;border-radius:50%;background:var(--ink);color:var(--canvas);display:grid;place-items:center;font:700 .8rem var(--display)}
  .ow-owner b{display:block;font-size:.95rem} .ow-owner span{display:block;font-size:.76rem;color:var(--muted)}
  .ow-grid{display:grid;gap:16px;grid-template-columns:minmax(0,1fr)}
  @media (min-width:980px){.ow-grid{grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr)}}
  .ow-track{display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin:8px 0 4px}
  .ow-step{display:grid;gap:6px;text-align:center;font-size:.74rem;color:var(--muted)}
  .ow-step i{height:6px;border-radius:999px;background:var(--line)}
  .ow-step.done i{background:var(--green)} .ow-step.now i{background:var(--ink)} .ow-step.now{color:var(--ink);font-weight:600}
  .ow-step small{display:block;color:var(--subtle)}
  .ow-check{display:grid;gap:6px;margin-top:10px}
  .ow-check div{display:flex;align-items:center;gap:10px;font-size:.9rem}
  .ow-check i{width:18px;height:18px;border-radius:50%;border:2px solid var(--line);display:inline-grid;place-items:center;font-size:.6rem;flex:none}
  .ow-check .done i{background:var(--green);border-color:var(--green);color:#fff}
  .ow-ask{display:flex;gap:8px}
  .ow-ask input{flex:1}
  .ow-chips{display:flex;gap:6px;flex-wrap:wrap}
  .ow-chips button{padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:var(--paper);font-size:.84rem}
  .ow-chips button:hover{border-color:var(--ink)}
  .ow-ans{background:var(--canvas-2);border-radius:var(--r-lg);padding:14px 16px;display:grid;gap:8px}
  .ow-ans .q{font-weight:600}
  .ow-cite{font-size:.78rem;color:var(--muted)}
  .ow-kv{display:grid;grid-template-columns:1fr auto;gap:8px 16px;font-size:.92rem}
  .ow-kv dt{color:var(--muted)} .ow-kv dd{margin:0;font-weight:600;text-align:right}
  .ow-clock{display:grid;gap:10px}
  .ow-eq{position:relative;height:12px;border-radius:999px;background:var(--canvas-2);overflow:hidden}
  .ow-eq i{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,var(--amber),var(--green))}
  .ow-eq b{position:absolute;top:-4px;width:20px;height:20px;border-radius:50%;background:var(--ink);border:3px solid var(--paper);transform:translateX(-50%)}
  .ow-docs a{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid var(--hair);text-decoration:none}
  .ow-docs a:first-child{border-top:0}
  .ow-feat{columns:2;column-gap:20px;font-size:.9rem;margin:0;padding-left:18px}
  @media (max-width:640px){.ow-feat{columns:1}}
  `;
  const OWNERS = [
    { id: 'raman', name: 'Priya Raman', initials: 'PR', modelId: 'rav4', gradeId: 'cruiser', colourId: 'graphite', stockNo: 'HL-2231', vin: 'JTMW079192231B000', car: '2026 Toyota RAV4 Cruiser Hybrid AWD', contract: '2026-10-12', delivery: '2026-10-21', lender: 'Toyota Finance', term: 60, financed: 48030, driveAway: 63530, accessories: ['Protection Pack (fitted)', 'Towing Pack'], deal: 'D-10482', tradeIn: '2017 Mazda CX-5 Maxx Sport (TI-30418)', gfv: 27900, salesperson: 'Mia Thompson', site: 'par' },
    { id: 'okafor', name: 'Daniel Okafor', initials: 'DO', modelId: 'kluger', gradeId: 'grande', colourId: 'graphite', stockNo: 'HL-1941', vin: '5TDB633521941A000', car: '2026 Toyota Kluger Grande Hybrid AWD', contract: '2026-10-13', delivery: '2026-10-24', lender: 'Macquarie', term: 48, financed: 79180, driveAway: 90980, accessories: ['Roof & Cargo Pack', 'Ceramic window tint', 'Paint protection film'], deal: 'D-10517', tradeIn: '2015 Ford Territory TS (TI-30441)', gfv: 44600, salesperson: 'Ben Kowalski', site: 'hor' },
  ];
  /** HL.data.market is only populated from the snapshot; fetch it when the live path left it out. */
  async function marketRows() {
    if (HL.data && Array.isArray(HL.data.market)) return HL.data.market;
    try { const s = await (await fetch('data/snapshot.json')).json(); const r = s.stock?.used_market_prices; HL.data.market = Array.isArray(r) ? r : r?.rows || []; } catch { if (HL.data) HL.data.market = []; }
    return (HL.data && HL.data.market) || [];
  }
  const TODAY = new Date('2026-10-17T09:00:00+11:00');
  const addD = (iso, n) => new Date(new Date(iso).getTime() + n * 86400000);
  const fmt = (d) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  const fmtY = (d) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  const cache = {};
  async function askKb(question, modelId, lang) {
    const key = `${modelId}|${lang}|${question}`;
    if (cache[key]) return cache[key];
    const r = await HL.api('/api/ask', { method: 'POST', body: { question, lang, build: { modelId } }, timeoutMs: 25000 });
    const grounded = !(r.trace || []).some((x) => /no grounded answer|not configured|unavailable/i.test(x.label));
    cache[key] = { answer: r.answer, citations: r.citations || [], trace: r.trace || [], grounded };
    return cache[key];
  }

  async function mount(root) {
    await marketRows();
    if (!styled) { document.head.appendChild(el('style', { text: CSS })); styled = true; }
    let owner = OWNERS.find((o) => o.id === (HL.state.owner || 'raman')) || OWNERS[0];
    const wrap = el('div', { class: 'wrap' }); root.appendChild(wrap);
    const pick = el('div', { class: 'ow-owners' });
    wrap.appendChild(el('div', { class: 'ow-hero stack' }, el('div', { class: 'kick', text: t('kick', 'Own') }), el('h1', { text: t('title', 'Your car, after the handshake') }), el('p', { class: 'muted', style: { maxWidth: '64ch' } }, t('sub', 'Delivery, handover, questions about the car, service and recalls, and the moment the trade cycle matures. Pick a demo owner from the back-office seed.')), pick));
    const body = el('div', { class: 'ow-grid' }); wrap.appendChild(body);
    const renderPick = () => { pick.innerHTML = ''; OWNERS.forEach((o) => pick.appendChild(el('button', { class: `ow-owner ${o.id === owner.id ? 'on' : ''}`, onClick: () => { owner = o; HL.set({ owner: o.id }); renderPick(); render(); } }, el('span', { class: 'av', text: o.initials }), el('span', null, el('b', { text: o.name }), el('span', { text: o.car }))))); };

    function render() {
      body.innerHTML = '';
      const left = el('div', { class: 'stack' }); const right = el('div', { class: 'stack' }); body.append(left, right);
      const m = HL.model(owner.modelId); const g = HL.grade(owner.modelId, owner.gradeId);
      const daysToDelivery = Math.round((new Date(owner.delivery) - TODAY) / 86400000);

      // 1. delivery tracker (mock)
      const steps = [['built', t('st.built', 'Built'), addD(owner.contract, -100)], ['shipped', t('st.shipped', 'Shipped'), addD(owner.contract, -78)], ['landed', t('st.landed', 'Landed at Harbourline'), addD(owner.contract, -60)], ['allocated', t('st.allocated', 'Allocated to you'), owner.contract], ['prep', t('st.prep', 'In preparation'), addD(owner.contract, 2)], ['ready', t('st.ready', 'Ready for handover'), owner.delivery]];
      const nowIdx = 4;
      const tracker = HL.spot(el('div', { class: 'card pad stack' }), 'own', t('spot.track', 'Delivery tracker (mock of the OEM order feed)'), 'mock');
      tracker.append(
        el('div', { class: 'row between' }, el('div', null, el('div', { class: 'kick', text: t('s1', 'Delivery') }), el('h3', { text: daysToDelivery > 0 ? t('s1h', 'Handover in {n} days at {s}', { n: daysToDelivery, s: HL.site(owner.site).name }) : t('s1done', 'Delivered') })), el('div', { class: 'row' }, chip(t('mock', 'MOCK'), 'mock'), chip(t('fromdms', 'Dates from the deal in the DMS'), 'dms'))),
        el('div', { class: 'ow-track' }, steps.map(([id, label, d], i) => el('div', { class: `ow-step ${i < nowIdx ? 'done' : i === nowIdx ? 'now' : ''}` }, el('i'), el('span', null, label, el('small', { text: fmt(d) }))))),
        el('div', { class: 'kick', style: { marginTop: '8px' }, text: t('pdi', 'Pre-delivery checklist') }),
        el('div', { class: 'ow-check' }, [...owner.accessories.map((a) => [a, true]), [t('pdi.rego', 'Registration and CTP'), true], [t('pdi.finance', 'Finance settled ({l}, {n} months)', { l: owner.lender, n: owner.term }), owner.id === 'raman'], [t('pdi.detail', 'Final detail and 120-point PDI'), false], [t('pdi.tradein', 'Trade-in received: {ti}', { ti: owner.tradeIn }), false]].map(([label, done]) => el('div', { class: done ? 'done' : '' }, el('i', { text: done ? '✓' : '' }), el('span', { text: label })))),
        el('p', { class: 'tiny subtle' }, t('s1note', 'Production: stages come from the OEM allocation and shipping feed; the checklist is the DMS delivery policy, which the agent already reads for the contract cross-check.')),
      );
      left.appendChild(tracker);

      // 2. handover pack
      const asked = (HL.state.journey.asked || []).slice(-4);
      const pack = el('div', { class: 'card pad stack' },
        el('div', { class: 'row between' }, el('div', null, el('div', { class: 'kick', text: t('s2', 'Handover pack') }), el('h3', { text: t('s2h', 'What {n} will walk through with you', { n: owner.salesperson }) })), el('div', { class: 'row' }, chip(t('mem', 'Session memory'), 'mem'), chip(HL.LANGS[HL.state.lang], 'outline'))),
        el('div', { class: 'kick', text: t('feat', 'The features of your {c}', { c: `${m?.name || ''} ${g?.name || ''}` }) }),
        el('ul', { class: 'ow-feat' }, (g?.highlights || []).concat(owner.accessories).map((h) => el('li', { text: h }))),
        el('div', { class: 'kick', text: t('yourq', 'Your questions so far') }),
        asked.length ? el('ul', { style: { margin: 0, paddingLeft: '18px' } }, asked.map((q) => el('li', { class: 'small', text: typeof q === 'string' ? q : q.q || JSON.stringify(q) }))) : el('p', { class: 'small muted', text: t('noq', 'Nothing yet this visit. Anything you ask below, or anywhere on this site, lands here for the handover.') }),
        el('div', { class: 'row' }, chip(t('followup', 'Three-week follow-up booked: {d}', { d: fmt(addD(owner.delivery, 21)) }), 'good'), chip(t('lang', 'Pack produced in {l}', { l: HL.LANGS[HL.state.lang] }), 'kb')),
      );
      left.appendChild(pack);

      // 3. ask your car (live KB)
      const askBox = HL.spot(el('div', { class: 'card pad stack' }), 'own', t('spot.ask', 'Ask your car: cited answers from the knowledge box'));
      const input = el('input', { class: 'input', placeholder: t('askph', 'Ask about your {m}…', { m: m?.name || 'car' }) });
      const answers = el('div', { class: 'stack' });
      const CHIPS = [t('q1', 'When is my first service and what does it cost?'), t('q2', 'What does my warranty cover and for how long?'), t('q3', 'Can I tow with it and what is the limit?'), t('q4', 'What safety systems does it have?'), t('q5', 'Why is the tyre-pressure light on?')];
      async function ask(q) {
        if (!q) return; input.value = '';
        HL.remember('asked', { stockNo: owner.stockNo, q, scope: 'own' });
        const box = el('div', { class: 'ow-ans fade-in' }, el('div', { class: 'q', text: q }), el('div', { class: 'skel', style: { height: '54px' } }));
        answers.prepend(box);
        if (!HL.online) { box.lastChild.replaceWith(el('p', { class: 'muted', text: t('offline', 'The knowledge box is offline in this snapshot; answers appear when the API is live.') })); return; }
        try {
          const r = await askKb(q, owner.modelId, HL.state.lang);
          box.lastChild.replaceWith(el('div', { class: 'stack' },
            el('p', { text: r.answer }),
            r.grounded ? null : el('div', { class: 'row' }, chip(t('ungrounded', 'The knowledge box has no owner-manual content for this yet; it answered from the model facts it does have'), 'warn')),
            r.citations.length ? el('div', { class: 'ow-cite' }, t('sources', 'Sources: '), r.citations.map((c) => c.title).join(' · ')) : null,
            HL.ui.trace(r.trace.filter((x) => x.kind !== 'domo' || /stock/i.test(x.label)).slice(0, 3))));
        } catch (e) { box.lastChild.replaceWith(el('p', { class: 'muted', text: t('err', 'Could not reach the assistant ({e}).', { e: e.message }) })); }
      }
      askBox.append(
        el('div', { class: 'row between' }, el('div', null, el('div', { class: 'kick', text: t('s3', 'Ask your car') }), el('h3', { text: t('s3h', 'Questions answered from the knowledge box, in your language') })), chip(t('kb', 'Agentic RAG · /ask'), 'kb')),
        el('div', { class: 'ow-ask' }, input, el('button', { class: 'btn primary', onClick: () => ask(input.value.trim()) }, t('ask', 'Ask'))),
        el('div', { class: 'ow-chips' }, CHIPS.map((c) => el('button', { onClick: () => ask(c) }, c))),
        answers,
        el('p', { class: 'tiny subtle' }, t('s3note', 'Today the knowledge box holds the specs, safety, towing, warranty and servicing resources. Production adds the owner\'s manual per VIN so dashboard-light questions get a cited page.')),
      );
      input.onkeydown = (e) => { if (e.key === 'Enter') ask(input.value.trim()); };
      right.appendChild(askBox);

      // 4. service and recalls
      const svc = el('div', { class: 'card pad stack' });
      const svcFacts = el('div', { class: 'ow-kv' });
      svc.append(
        el('div', { class: 'row between' }, el('div', null, el('div', { class: 'kick', text: t('s4', 'Service and recalls') }), el('h3', { text: t('s4h', 'Next: first service at 15,000 km or {d}', { d: fmtY(addD(owner.delivery, 365)) }) })), el('div', { class: 'row' }, chip(t('kb', 'Agentic RAG · /ask'), 'kb'), chip(t('mock', 'Recall feed: MOCK'), 'mock'))),
        svcFacts,
        el('div', { class: 'row' }, el('button', { class: 'btn secondary', onClick: bookService }, t('booksvc', 'Book a service')), el('span', { class: 'small muted', text: t('recall', 'No open recalls for VIN …{v}', { v: owner.vin.slice(-6) }) })),
      );
      right.appendChild(svc);
      const kv = (k, v, kind) => svcFacts.append(el('dt', { text: k }), el('dd', null, v, kind ? ' ' : null, kind ? chip(kind.text, kind.kind) : null));
      kv(t('kv.interval', 'Service interval'), t('kv.intervalv', '15,000 km or 12 months'));
      kv(t('kv.cap', 'Capped price (first 5 services)'), el('span', { class: 'skel', style: { display: 'inline-block', width: '90px', height: '16px' } }));
      kv(t('kv.loan', 'Loan car'), el('span', { class: 'skel', style: { display: 'inline-block', width: '160px', height: '16px' } }));
      if (HL.online) {
        askKb(`What is the capped price per service under Toyota Service Advantage for the ${m?.name || 'RAV4'} hybrid and how many services does it cover? Answer in one sentence.`, owner.modelId, HL.state.lang).then((r) => { svcFacts.children[3].innerHTML = ''; svcFacts.children[3].append(el('span', { class: 'small', style: { fontWeight: 500 }, text: r.answer.slice(0, 220) }), ' ', chip('KB', 'kb')); }).catch(() => { svcFacts.children[3].textContent = '—'; });
        askKb('What is the loan car or courtesy transport policy for service customers? Answer in one sentence.', owner.modelId, HL.state.lang).then((r) => { svcFacts.children[5].innerHTML = ''; svcFacts.children[5].append(el('span', { class: 'small', style: { fontWeight: 500 }, text: r.answer.slice(0, 220) }), ' ', chip(r.grounded ? 'KB' : t('policymock', 'policy not in KB'), r.grounded ? 'kb' : 'warn')); }).catch(() => { svcFacts.children[5].textContent = '—'; });
      } else { svcFacts.children[3].textContent = '—'; svcFacts.children[5].textContent = '—'; }
      function bookService() {
        let site = owner.site; const sites = HL.data?.sites || [];
        const pills = el('div', { class: 'pills', style: { flexWrap: 'wrap' } }, sites.map((s) => el('button', { class: s.id === site ? 'on' : '', onClick: (e) => { site = s.id; [...pills.children].forEach((b) => b.classList.toggle('on', b === e.target)); } }, s.name)));
        const when = el('input', { class: 'input', type: 'datetime-local', value: addD(owner.delivery, 365).toISOString().slice(0, 11) + '08:30' });
        const body = el('div', { class: 'stack' },
          el('div', { class: 'row' }, chip(t('recallaware', 'Recall-aware: any open campaign is added to the job automatically'), 'mock'), chip(t('capped', 'Capped-price item due: first service'), 'kb')),
          el('div', { class: 'field' }, el('label', { text: t('site', 'Site') }), pills), el('div', { class: 'field' }, el('label', { text: t('when', 'When') }), when),
          el('label', { class: 'switch on' }, el('i'), t('loan', 'I need a loan car (subject to the loan-car policy above)')),
          el('p', { class: 'tiny subtle', text: t('svcnote', 'Production: the booking lands in the workshop diary and the service advisor sees the owner\'s questions and the recall status on one screen.') }));
        HL.ui.sheet(t('booksvc', 'Book a service'), body, [{ label: t('cancel', 'Cancel') }, { label: t('confirm', 'Confirm'), kind: 'primary', onClick: () => HL.ui.toast(t('svcbooked', 'Service booked at {s}, {d}. Reference SV-{r}.', { s: HL.site(site).name, d: new Date(when.value).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }), r: Math.random().toString(36).slice(2, 7).toUpperCase() }), 5000) }]);
      }

      // 5. warranty + equity clock (mock, Domo market basis)
      const monthsIn = Math.max(0, Math.round((TODAY - new Date(owner.delivery)) / (30.44 * 86400000)));
      const market = (HL.data?.market || []).filter((r) => r.make === 'Toyota' && r.model === (m?.name || '') && r.gradeTier === 'top');
      const med = market.length ? Math.round(market.reduce((s, r) => s + r.median, 0) / market.length) : Math.round(owner.driveAway * .8);
      const estNow = Math.round(owner.driveAway * (1 - 0.14 - monthsIn * 0.009) / 100) * 100;
      const owing = Math.round(owner.financed - (owner.financed - owner.gfv) * (monthsIn / owner.term));
      const equity = estNow - owing; const pct = Math.max(2, Math.min(98, 50 + equity / (owner.driveAway * 0.6) * 100));
      const clock = HL.spot(el('div', { class: 'card pad ow-clock' }), 'own', t('spot.equity', 'Equity clock: trade-cycle timing from DMS finance + Domo market'), 'domo');
      clock.append(
        el('div', { class: 'row between' }, el('div', null, el('div', { class: 'kick', text: t('s5', 'Warranty and trade cycle') }), el('h3', { text: t('s5h', 'Month {n} of {t}', { n: monthsIn, t: owner.term }) })), el('div', { class: 'row' }, chip(t('mock', 'MOCK'), 'mock'), chip(t('domomarket', 'Domo · used market prices'), 'domo'))),
        el('dl', { class: 'ow-kv' }, el('dt', { text: t('kv.warranty', 'New-car warranty') }), el('dd', { text: t('kv.warrantyv', '5 years, unlimited km, to {d}', { d: fmtY(addD(owner.delivery, 365 * 5)) }) }), el('dt', { text: t('kv.drive', 'Engine and driveline') }), el('dd', { text: t('kv.drivev', '7 years when serviced to schedule') }), el('dt', { text: t('kv.financed', 'Amount financed ({l})', { l: owner.lender }) }), el('dd', { class: 'num', text: HL.money(owner.financed) }), el('dt', { text: t('kv.gfv', 'Guaranteed future value at month {t}', { t: owner.term }) }), el('dd', { class: 'num', text: HL.money(owner.gfv) }), el('dt', { text: t('kv.estnow', 'Estimated value today') }), el('dd', { class: 'num', text: `${HL.money(estNow)} ` }, chip(t('vsmed', 'top-grade median {n}', { n: HL.money(med) }), 'domo')), el('dt', { text: t('kv.owing', 'Estimated payout today') }), el('dd', { class: 'num', text: HL.money(owing) })),
        el('div', { class: 'ow-eq' }, el('i', { style: { width: `${pct}%` } }), el('b', { style: { left: `${pct}%` } })),
        el('div', { class: 'row between' }, el('span', { class: `small ${equity >= 0 ? '' : 'muted'}`, style: { fontWeight: 600 }, text: equity >= 0 ? t('eqpos', '{n} in your favour', { n: HL.money(equity) }) : t('eqneg', '{n} short of changeover', { n: HL.money(-equity) }) }), el('span', { class: 'small muted', text: t('eqnote', 'At month 30 we show you a replacement build with the figures filled in.') })),
        el('a', { class: 'btn secondary sm', href: `#/car/m:${owner.modelId}`, style: { justifySelf: 'start' } }, t('replace', 'Preview the replacement build'), el('span', { class: 'arrow' }, '→')),
      );
      right.appendChild(clock);

      // 6. documents (back office)
      const docs = HL.spot(el('div', { class: 'card pad stack' }), 'backoffice', t('spot.docs', 'Documents read by the agent in the back office'));
      docs.append(
        el('div', { class: 'row between' }, el('div', null, el('div', { class: 'kick', text: t('s6', 'Your documents') }), el('h3', { text: t('s6h', 'Read by the agent, checked by a person') })), chip(t('dms', 'Back office · DMS'), 'dms')),
        el('div', { class: 'ow-docs' },
          el('a', { href: '/dms/#/documents' }, el('span', null, el('b', { text: t('doc.contract', 'Signed contract of sale {d}', { d: owner.deal }) }), el('span', { class: 'small muted', style: { display: 'block' }, text: t('doc.contractsub', 'Fields extracted and cross-checked against the deal and the VIN') })), chip(t('extracted', 'extracted'), 'kb')),
          el('a', { href: '/dms/#/documents' }, el('span', null, el('b', { text: t('doc.tradein', 'Trade-in appraisal: {ti}', { ti: owner.tradeIn }) }), el('span', { class: 'small muted', style: { display: 'block' }, text: t('doc.tradeinsub', 'Condition notes and valuation read from the signed form') })), chip(t('extracted', 'extracted'), 'kb')),
          el('a', { href: '/dms/' }, el('span', null, el('b', { text: t('doc.open', 'Open the back office') }), el('span', { class: 'small muted', style: { display: 'block' }, text: t('doc.opensub', 'Demo logins on the sign-in page') })), el('span', { class: 'arrow' }, '→'))),
      );
      left.appendChild(docs);
    }
    renderPick(); render();
    HL.bus.on('journey', () => { /* handover pack picks up new questions on next render */ });
  }
  HL.scene('own', { mount });
})();
