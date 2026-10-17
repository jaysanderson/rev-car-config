/* Harbourline One — Value my car (#/value). Agent D. Instant estimate (MOCK, deterministic), document reading
   simulation (MOCK of the DMS extraction), apply-to-a-car changeover and appraisal booking. Tokens from concept.css only. */
(function () {
  'use strict';
  const { el, chip } = HL.ui;
  const t = (k, f, v) => HL.t(`value.${k}`, f, v);
  let styled = false;
  const CSS = `
  .vl-hero{padding:clamp(28px,5vw,56px) 0 8px}
  .vl-hero h1{max-width:18ch}
  .vl-steps{display:grid;gap:16px;grid-template-columns:minmax(0,1fr);align-items:start}
  .vl-steps>*{min-width:0}
  .vl-est .chip,.vl-valid .chip{white-space:normal;text-align:left}
  @media (min-width:980px){.vl-steps{grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr)}}
  .vl-form{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}
  .vl-form .full{grid-column:1/-1}
  .vl-or{display:flex;align-items:center;gap:12px;color:var(--subtle);font-size:.8rem;grid-column:1/-1}
  .vl-or::before,.vl-or::after{content:"";flex:1;border-top:1px solid var(--hair)}
  .vl-est{display:grid;gap:14px}
  .vl-range{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
  .vl-range b{font-family:var(--display);font-size:clamp(1.8rem,4vw,2.6rem);letter-spacing:-.03em}
  .vl-bar{position:relative;height:10px;border-radius:999px;background:linear-gradient(90deg,var(--amber-soft),var(--green-soft));margin:6px 0 2px}
  .vl-bar i{position:absolute;top:-5px;width:20px;height:20px;border-radius:50%;background:var(--ink);border:3px solid var(--paper);transform:translateX(-50%);box-shadow:var(--shadow)}
  .vl-lines{display:grid;gap:0}
  .vl-line{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid var(--hair);font-size:.92rem}
  .vl-line:first-child{border-top:0}
  .vl-line .num{font-weight:600;white-space:nowrap}
  .vl-line .neg{color:var(--red)} .vl-line .pos{color:var(--green)}
  .vl-raise li{margin:6px 0}
  .vl-drop{border:1.5px dashed var(--line);border-radius:var(--r-lg);padding:26px 20px;text-align:center;color:var(--muted);transition:border-color .2s,background .2s;cursor:pointer}
  .vl-drop.over{border-color:var(--kb);background:var(--kb-soft)}
  .vl-prog{display:grid;gap:8px;margin-top:12px}
  .vl-prog .st{display:flex;align-items:center;gap:10px;font-size:.9rem;color:var(--muted)}
  .vl-prog .st.done{color:var(--ink)} .vl-prog .st i{width:18px;height:18px;border-radius:50%;border:2px solid var(--line);display:inline-grid;place-items:center;font-size:.6rem}
  .vl-prog .st.done i{background:var(--green);border-color:var(--green);color:#fff}
  .vl-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-top:10px}
  .vl-fields .f{background:var(--canvas-2);border-radius:var(--r);padding:10px 12px}
  .vl-fields .f .k{font-size:.72rem;color:var(--muted)} .vl-fields .f .v{font-weight:600}
  .vl-apply{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))}
  .vl-ch{display:flex;flex-direction:column;gap:8px;padding:16px;border:1px solid var(--line);border-radius:var(--r-lg);background:var(--paper)}
  .vl-ch .chg{font-family:var(--display);font-size:1.5rem;font-weight:800;letter-spacing:-.02em}
  .vl-valid{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:.86rem;color:var(--muted)}
  `;
  const MAKES = ['Toyota', 'Mazda', 'Hyundai', 'Kia', 'Ford', 'Subaru', 'Mitsubishi', 'Honda', 'Nissan', 'Volkswagen', 'Tesla', 'BMW', 'Mercedes-Benz'];
  const MODELS = { Toyota: ['RAV4', 'Corolla', 'Camry', 'Kluger', 'HiLux', 'LandCruiser Prado', 'Yaris Cross', 'Corolla Cross', 'C-HR', 'Fortuner'], Mazda: ['CX-5', 'CX-3', 'Mazda3', 'BT-50'], Hyundai: ['i30', 'Tucson', 'Kona', 'Santa Fe'], Kia: ['Sportage', 'Cerato', 'Seltos', 'Carnival'], Ford: ['Ranger', 'Everest', 'Focus', 'Puma'], Subaru: ['Forester', 'Outback', 'XV'], Mitsubishi: ['Outlander', 'Triton', 'ASX'], Honda: ['CR-V', 'Civic', 'HR-V'], Nissan: ['X-Trail', 'Navara', 'Qashqai'], Volkswagen: ['Golf', 'Tiguan', 'Amarok'], Tesla: ['Model 3', 'Model Y'], BMW: ['X3', '3 Series'], 'Mercedes-Benz': ['GLC', 'C-Class'] };
  const BASE = { Toyota: 1.0, Mazda: .86, Hyundai: .74, Kia: .76, Ford: .88, Subaru: .84, Mitsubishi: .7, Honda: .8, Nissan: .72, Volkswagen: .78, Tesla: .95, BMW: .9, 'Mercedes-Benz': .92 };
  const NEW_PRICE = { RAV4: 51190, Corolla: 32990, Camry: 42990, Kluger: 68690, HiLux: 59990, 'LandCruiser Prado': 79990, 'Yaris Cross': 37390, 'Corolla Cross': 38990, 'C-HR': 44990, Fortuner: 59990 };
  /** HL.data.market is only populated from the snapshot; fetch it when the live path left it out. */
  async function marketRows() {
    if (HL.data && Array.isArray(HL.data.market)) return HL.data.market;
    try { const s = await (await fetch('data/snapshot.json')).json(); const r = s.stock?.used_market_prices; HL.data.market = Array.isArray(r) ? r : r?.rows || []; } catch { if (HL.data) HL.data.market = []; }
    return (HL.data && HL.data.market) || [];
  }
  const hash = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const fmtDate = (d) => d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });

  /** Deterministic estimate. Uses Domo used_market_prices when the model matches, else a depreciation formula. */
  function estimate(v) {
    const age = Math.max(0, 2026 - v.year); const km = Number(v.km) || age * 15000;
    const market = (HL.data?.market || []).filter((r) => r.make === v.make && r.model === v.model && v.year >= r.yearFrom && v.year <= r.yearTo);
    let retail, basis;
    if (market.length) { retail = Math.round(market.reduce((s, r) => s + r.median, 0) / market.length); basis = { kind: 'domo', text: t('basis.domo', 'Median of {n} comparable sales and listings in the last 90 days (Domo · used_market_prices)', { n: market.reduce((s, r) => s + r.sample, 0) }) }; }
    else { const start = (NEW_PRICE[v.model] || 42000) * (BASE[v.make] || .8); retail = Math.round(start * Math.pow(0.86, Math.min(age, 10)) * (0.98 + (hash(v.model) % 7) / 100)); basis = { kind: 'mock', text: t('basis.formula', 'No market rows for this model yet; estimate uses a depreciation curve from the new price (MOCK)') }; }
    const expectedKm = Math.max(1, age) * 15000; const kmDiff = km - expectedKm; const kmAdj = -Math.round(Math.max(-0.12, Math.min(0.12, kmDiff / 150000)) * retail / 50) * 50;
    const condAdj = { excellent: Math.round(retail * .03 / 50) * 50, good: 0, fair: -Math.round(retail * .05 / 50) * 50 }[v.condition || 'good'];
    const svcAdj = v.serviceVerified ? 400 : 0; const svcUnknown = v.serviceVerified ? 0 : -Math.round(retail * .025 / 50) * 50;
    const recon = -Math.round(retail * .04 / 50) * 50; const marginToRetail = -Math.round(retail * .09 / 50) * 50;
    const mid = retail + kmAdj + condAdj + svcAdj + svcUnknown + recon + marginToRetail;
    const low = Math.round(mid * 0.955 / 100) * 100; const high = Math.round(mid * 1.045 / 100) * 100;
    return { retail, low, high, mid: Math.round(mid / 100) * 100, basis, lines: [
      { k: t('line.retail', 'Retail reference for a {y} {mk} {md}', { y: v.year, mk: v.make, md: v.model }), v: retail },
      { k: kmDiff > 0 ? t('line.kmover', 'Kilometres {n} above average for its age', { n: HL.km(Math.abs(kmDiff)) }) : t('line.kmunder', 'Kilometres {n} under average for its age', { n: HL.km(Math.abs(kmDiff)) }), v: kmAdj },
      { k: t('line.cond', 'Condition: {c}', { c: v.condition || 'good' }), v: condAdj },
      v.serviceVerified ? { k: t('line.svcok', 'Verified service history (read from your service book)'), v: svcAdj } : { k: t('line.svcunknown', 'Service history not yet verified'), v: svcUnknown },
      { k: t('line.recon', 'Reconditioning allowance (tyres, detail, 120-point inspection)'), v: recon },
      { k: t('line.margin', 'Dealer margin to retail'), v: marginToRetail },
    ] };
  }

  async function mount(root) {
    await marketRows();
    if (!styled) { document.head.appendChild(el('style', { text: CSS })); styled = true; }
    const saved = HL.state.journey.valued || {};
    const v = Object.assign({ make: 'Toyota', model: 'RAV4', year: 2022, km: 58000, condition: 'good', rego: '', state: 'NSW', serviceVerified: false, watch: false }, saved);
    const wrap = el('div', { class: 'wrap' });
    root.appendChild(wrap);
    wrap.appendChild(el('div', { class: 'vl-hero stack' }, el('div', { class: 'kick', text: t('kick', 'Value my car') }), el('h1', { text: t('title', 'A trade-in figure you can argue with') }), el('p', { class: 'muted', style: { maxWidth: '62ch' } }, t('sub', 'An instant range with every adjustment shown, based on what comparable cars actually sold for. Then read your service book to firm it up, and see the changeover on any car here.')), el('div', { class: 'row' }, chip(t('mockchip', 'Estimate logic is a mock'), 'mock'), chip(t('domochip', 'Market basis: Domo'), 'domo'), chip(t('dmschip', 'Document reading: Agentic RAG in the back office'), 'kb'))));

    const grid = el('div', { class: 'vl-steps' }); wrap.appendChild(grid);
    const left = el('div', { class: 'stack' }); const right = el('div', { class: 'stack' }); grid.append(left, right);

    // ── step 1: the car ────────────────────────────────────────────────────
    const form = el('div', { class: 'card pad stack' });
    left.appendChild(form);
    const sel = (name, opts, val, onChange) => el('select', { class: 'input', name, onChange: (e) => onChange(e.target.value) }, opts.map((o) => el('option', { value: o, selected: String(o) === String(val) ? true : null, text: String(o) })));
    const modelSel = sel('model', MODELS[v.make] || [], v.model, (x) => { v.model = x; recalc(); });
    const makeSel = sel('make', MAKES, v.make, (x) => { v.make = x; v.model = (MODELS[x] || [])[0]; modelSel.innerHTML = ''; (MODELS[x] || []).forEach((m) => modelSel.appendChild(el('option', { value: m, text: m }))); recalc(); });
    const years = Array.from({ length: 15 }, (_, i) => 2026 - i);
    form.append(
      el('div', { class: 'row between' }, el('h3', { text: t('s1', '1. Your car') }), chip(t('s1chip', 'No account needed'), 'outline')),
      el('div', { class: 'vl-form' },
        el('div', { class: 'field' }, el('label', { text: t('rego', 'Registration plate') }), el('input', { class: 'input mono', placeholder: 'EKP42L', value: v.rego, style: { textTransform: 'uppercase' }, onInput: (e) => { v.rego = e.target.value.toUpperCase(); } })),
        el('div', { class: 'field' }, el('label', { text: t('state', 'State') }), sel('state', ['NSW', 'VIC', 'QLD', 'ACT', 'SA', 'WA', 'TAS', 'NT'], v.state, (x) => { v.state = x; })),
        el('div', { class: 'vl-or', text: t('or', 'or describe it') }),
        el('div', { class: 'field' }, el('label', { text: t('make', 'Make') }), makeSel),
        el('div', { class: 'field' }, el('label', { text: t('model', 'Model') }), modelSel),
        el('div', { class: 'field' }, el('label', { text: t('year', 'Year') }), sel('year', years, v.year, (x) => { v.year = Number(x); recalc(); })),
        el('div', { class: 'field' }, el('label', { text: t('km', 'Odometer (km)') }), el('input', { class: 'input num', type: 'number', min: 0, step: 1000, value: v.km, onInput: (e) => { v.km = Number(e.target.value) || 0; recalc(); } })),
        el('div', { class: 'field full' }, el('label', { text: t('cond', 'Condition') }), el('div', { class: 'pills' }, ['excellent', 'good', 'fair'].map((c) => el('button', { class: v.condition === c ? 'on' : '', onClick: (e) => { v.condition = c; [...e.target.parentNode.children].forEach((b) => b.classList.toggle('on', b === e.target)); recalc(); } }, t(`cond.${c}`, { excellent: 'Excellent', good: 'Good', fair: 'Fair' }[c]))))),
      ),
      el('p', { class: 'tiny subtle' }, t('s1note', 'In production the plate lookup resolves the VIN, build and compliance dates through the state registry; here the plate is kept only on this device.')),
    );

    // ── step 2: the estimate ───────────────────────────────────────────────
    const estBox = HL.spot(el('div', { class: 'card pad vl-est' }), 'value', t('spot.est', 'Instant estimate with a Domo market basis'), 'domo');
    right.appendChild(estBox);
    let est = null;
    function recalc() {
      est = estimate(v); estBox.innerHTML = '';
      const pos = Math.max(4, Math.min(96, 50 + (v.condition === 'excellent' ? 22 : v.condition === 'fair' ? -22 : 0) + (v.serviceVerified ? 10 : -6)));
      const validTo = new Date(Date.now() + 7 * 86400000);
      estBox.append(
        el('div', { class: 'row between' }, el('div', null, el('div', { class: 'kick', text: t('s2', '2. Instant estimate') }), el('h3', { text: `${v.year} ${v.make} ${v.model}` })), chip(t('mock', 'MOCK'), 'mock', t('mocktitle', 'Illustrative logic; production uses a valuation feed such as RedBook plus the dealer\'s own trade history'))),
        el('div', { class: 'vl-range' }, el('b', { class: 'num', text: `${HL.money(est.low)} – ${HL.money(est.high)}` }), el('span', { class: 'muted', text: t('tradein', 'trade-in, before any changeover') })),
        el('div', { class: 'vl-bar' }, el('i', { style: { left: `${pos}%` } })),
        el('div', { class: 'row' }, chip(est.basis.text, est.basis.kind)),
        el('div', { class: 'vl-lines' }, est.lines.map((l) => el('div', { class: 'vl-line' }, el('span', { text: l.k }), el('span', { class: `num ${l.v < 0 ? 'neg' : l.v > 0 ? 'pos' : ''}`, text: `${l.v > 0 ? '+' : l.v < 0 ? '−' : ''}${HL.money(Math.abs(l.v))}` }))), el('div', { class: 'vl-line', style: { fontWeight: 700 } }, el('span', { text: t('line.mid', 'Midpoint') }), el('span', { class: 'num', text: HL.money(est.mid) }))),
        el('div', { class: 'vl-raise' }, el('div', { class: 'kick', text: t('raise', 'What would raise it') }), el('ul', { style: { margin: '6px 0 0', paddingLeft: '18px' } },
          !v.serviceVerified ? el('li', null, t('raise.svc', 'A verified service history adds about $400: read your service book below.')) : null,
          el('li', null, t('raise.keys', 'Two keys and the service books present on the day (missing key: about $350).')),
          el('li', null, t('raise.tyres', 'Tyres above 4 mm all round avoids a $600–900 reconditioning deduction.')),
          v.condition !== 'excellent' ? el('li', null, t('raise.detail', 'A detailed interior and repaired stone chips typically move the condition band up one step.')) : null)),
        el('div', { class: 'vl-valid' }, el('span', { text: t('valid', 'Offer valid 7 days, to {d}', { d: fmtDate(validTo) }) }),
          el('label', { class: `switch ${v.watch ? 'on' : ''}`, onClick: (e) => { v.watch = !v.watch; e.currentTarget.classList.toggle('on', v.watch); save(); HL.ui.toast(v.watch ? t('watchon', 'Offer Watch on: we will tell you if the market moves your figure.') : t('watchoff', 'Offer Watch off.')); } }, el('i'), t('watch', 'Offer Watch'))),
      );
      save();
    }
    const save = () => HL.journey({ valued: Object.assign({}, v, { estimate: est ? { low: est.low, high: est.high, mid: est.mid } : null }) });

    // ── step 3: read the service book (mock) ───────────────────────────────
    const docBox = HL.spot(el('div', { class: 'card pad stack' }), 'value', t('spot.doc', 'Document reading (mock of the DMS extraction)'), 'mock');
    left.appendChild(docBox);
    const drop = el('div', { class: 'vl-drop', tabindex: 0, role: 'button' }, el('div', { style: { fontSize: '1.6rem' } }, '📘'), el('div', null, el('b', { text: t('drop', 'Drop your service book or a few photos here') })), el('div', { class: 'tiny', text: t('dropnote', 'Nothing is uploaded in this concept. The file name and size are read in your browser only.') }));
    const prog = el('div', { class: 'vl-prog' });
    const fileIn = el('input', { type: 'file', accept: 'image/*,.pdf', multiple: true, hidden: true, onChange: (e) => simulate([...e.target.files]) });
    drop.onclick = () => fileIn.click(); drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') fileIn.click(); };
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over'); drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); simulate([...e.dataTransfer.files]); };
    docBox.append(el('div', { class: 'row between' }, el('h3', { text: t('s3', '3. Firm it up with your service book') }), chip(t('mock', 'MOCK'), 'mock')), drop, fileIn, prog,
      el('p', { class: 'tiny subtle' }, t('s3note', 'In the back office this is real: a contract, appraisal or invoice uploaded to the DMS becomes a knowledge-box resource and the agent extracts its fields with confidence scores. '), el('a', { href: '#', onClick: (e) => { e.preventDefault(); HL.powers.open('value'); } }, t('s3link', 'See how'))));
    function simulate(files) {
      if (!files.length) return;
      prog.innerHTML = '';
      const steps = [t('p1', 'Received {n} file(s): {name}', { n: files.length, name: files.slice(0, 2).map((f) => f.name).join(', ') }), t('p2', 'Creating a resource and processing the pages'), t('p3', 'Extracting service entries with a JSON schema'), t('p4', 'Cross-checking kilometres against your odometer reading')];
      const items = steps.map((s) => el('div', { class: 'st' }, el('i', { text: '✓' }), el('span', { text: s }))); items.forEach((i) => prog.appendChild(i));
      items.forEach((it, i) => setTimeout(() => it.classList.add('done'), 500 + i * 700));
      setTimeout(() => {
        const n = 3 + (hash(files[0].name) % 4); const lastKm = Math.max(5000, Math.round((Number(v.km) - 2000 - (hash(files[0].name) % 4000)) / 10) * 10);
        prog.appendChild(el('div', { class: 'vl-fields fade-in' },
          el('div', { class: 'f' }, el('div', { class: 'k', text: t('f.svc', 'Logged services') }), el('div', { class: 'v', text: String(n) })),
          el('div', { class: 'f' }, el('div', { class: 'k', text: t('f.last', 'Last service') }), el('div', { class: 'v', text: `${HL.km(lastKm)} · ${new Date(Date.now() - (60 + hash(files[0].name) % 200) * 86400000).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}` })),
          el('div', { class: 'f' }, el('div', { class: 'k', text: t('f.by', 'Serviced by') }), el('div', { class: 'v', text: v.make === 'Toyota' ? 'Toyota dealers (all entries)' : `${v.make} dealer and one independent` })),
          el('div', { class: 'f' }, el('div', { class: 'k', text: t('f.conf', 'Confidence') }), el('div', { class: 'v', text: '0.91' }))));
        prog.appendChild(el('div', { class: 'row', style: { marginTop: '10px' } }, chip(t('p5', '+$400 verified service history applied to the estimate'), 'good'), chip(t('mock', 'MOCK'), 'mock')));
        v.serviceVerified = true; recalc();
      }, 500 + steps.length * 700 + 300);
    }

    // ── step 4: apply to a car + book an appraisal ─────────────────────────
    const applyBox = el('div', { class: 'card pad stack' }); right.appendChild(applyBox);
    function renderApply() {
      applyBox.innerHTML = '';
      const viewed = (HL.state.journey.viewed || []).slice(-2).reverse();
      const targets = viewed.length ? viewed : [{ kind: 'model', id: 'rav4' }, { kind: 'unit', id: 'U-33002' }];
      applyBox.append(el('div', { class: 'row between' }, el('h3', { text: t('s4', '4. Apply it to a car') }), chip(viewed.length ? t('fromjourney', 'From the cars you looked at') : t('defaults', 'Two suggestions'), viewed.length ? 'mem' : 'outline')));
      const row = el('div', { class: 'vl-apply' }); applyBox.appendChild(row);
      for (const tg of targets) {
        let title, price, note, href;
        if (tg.kind === 'unit') { const u = HL.unit(tg.id); if (!u) continue; title = `${u.title || `${u.year} ${u.make} ${u.model}`} ${u.grade}`; price = u.price; note = t('exgov', 'excl. govt charges'); href = `#/car/u:${u.stockNo}`; }
        else { const m = HL.model(tg.id); if (!m) continue; const p = HL.priceOf(Object.assign({}, HL.state.build, { modelId: m.id, gradeId: HL.state.build.modelId === m.id ? HL.state.build.gradeId : m.grades[0].id })); title = `Toyota ${m.name} ${(HL.grade(m.id, HL.state.build.modelId === m.id ? HL.state.build.gradeId : m.grades[0].id) || m.grades[0]).name}`; price = p ? p.total : m.fromPrice; note = t('driveaway', 'drive-away estimate'); href = `#/car/m:${m.id}`; }
        const chg = price - (est ? est.mid : 0);
        row.appendChild(el('div', { class: 'vl-ch' }, el('a', { href, style: { textDecoration: 'none', fontWeight: 700 }, text: title }), el('div', { class: 'small muted', text: `${HL.money(price)} ${note}` }), el('div', { class: 'small muted', text: t('less', 'less your trade at the midpoint {n}', { n: HL.money(est ? est.mid : 0) }) }), el('div', { class: 'chg num', text: HL.money(chg) }), el('div', { class: 'tiny subtle', text: t('changeover', 'changeover, before finance') }), el('a', { class: 'btn secondary sm', href, text: t('open', 'Open this car') })));
      }
      applyBox.appendChild(el('div', { class: 'row', style: { marginTop: '4px' } }, el('button', { class: 'btn primary', onClick: bookAppraisal }, t('book', 'Book an appraisal')), el('span', { class: 'small muted', text: t('bookwhy', 'A written valuation, valid 7 days, from any of our four sites.') })));
    }
    function bookAppraisal() {
      let site = 'par'; const sites = HL.data?.sites || [];
      const pills = el('div', { class: 'pills', style: { flexWrap: 'wrap' } }, sites.map((s) => el('button', { class: s.id === site ? 'on' : '', onClick: (e) => { site = s.id; [...pills.children].forEach((b) => b.classList.toggle('on', b === e.target)); } }, s.name)));
      const when = el('input', { class: 'input', type: 'datetime-local', value: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 11) + '10:00' });
      const body = el('div', { class: 'stack' }, el('p', { class: 'muted', text: t('bookbody', 'Bring the car, both keys and the service book. The appraiser confirms the figure on the spot and it is held for 7 days.') }), el('div', { class: 'field' }, el('label', { text: t('site', 'Site') }), pills), el('div', { class: 'field' }, el('label', { text: t('when', 'When') }), when), el('div', { class: 'row' }, chip(t('mock', 'MOCK'), 'mock'), el('span', { class: 'tiny subtle', text: t('booknote', 'In production this creates a lead and an appointment in the DMS, like the test-drive booking does today.') })));
      HL.ui.sheet(t('book', 'Book an appraisal'), body, [{ label: t('cancel', 'Cancel') }, { label: t('confirm', 'Confirm'), kind: 'primary', onClick: () => { HL.ui.toast(t('booked', 'Appraisal booked at {s} for {d}. Reference VA-{r}.', { s: HL.site(site).name, d: new Date(when.value).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }), r: Math.random().toString(36).slice(2, 7).toUpperCase() }), 5000); } }]);
    }

    recalc(); renderApply();
    unsub = HL.bus.on('journey', renderApply);
  }
  let unsub = null;
  HL.scene('value', { mount, unmount() { if (unsub) unsub(); unsub = null; } });
})();
