/* Harbourline One — product view (#/car/m:<modelId> new, #/car/u:<stockNo> used). Agent B. */
(function () {
  'use strict';
  const { el, chip, trace } = HL.ui;
  const t = (k, f, v) => HL.t(`product.${k}`, f, v);
  const RATE = 0.0749; // illustrative
  const askCache = new Map();

  const css = `
.pd-hero{position:relative;border-radius:var(--r-xl);overflow:hidden;background:var(--canvas-2);aspect-ratio:16/8;max-height:560px}
.pd-hero img{width:100%;height:100%;object-fit:cover}
.pd-hero .pd-credit{position:absolute;left:14px;bottom:10px;font-size:.68rem;color:#fff;opacity:.8;text-shadow:0 1px 2px rgba(0,0,0,.7)}
.pd-hero .pd-badges{position:absolute;top:14px;left:14px;display:flex;gap:6px;flex-wrap:wrap}.pd-hero .pd-badges .chip{background:color-mix(in srgb,var(--paper) 90%,transparent);backdrop-filter:blur(6px)}.pd-hero .pd-badges .chip.good{color:var(--green)}.pd-hero .pd-badges .chip.blue{color:var(--blue)}.pd-hero .pd-badges .chip.outline{color:var(--ink-2);border-color:transparent}
.pd-hero .pd-nophoto{position:absolute;inset:0;display:grid;place-items:center;color:var(--muted)}
.pd-dot{position:absolute;width:26px;height:26px;border-radius:50%;background:var(--mock);color:#1a1a1a;font:700 .74rem var(--mono);display:grid;place-items:center;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);cursor:pointer;transform:translate(-50%,-50%)}
.pd-dot:hover,.pd-dot.on{background:#fff}
.pd-callouts{display:grid;gap:6px;margin-top:10px}
.pd-callouts li{display:flex;gap:10px;align-items:flex-start;font-size:.86rem}
.pd-callouts b{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:var(--mock-soft);color:var(--mock);font:700 .7rem var(--mono);flex:none}
.pd-layout{display:grid;gap:28px;margin-top:24px}
@media (min-width:1000px){.pd-layout{grid-template-columns:minmax(0,1fr);align-items:start}.pd-layout>*{min-width:0}.pd-aside{position:sticky;top:calc(var(--band-h) + var(--head-h) + 16px)}}
.pd-title h1{font-size:clamp(1.7rem,3.4vw,2.6rem)}
.pd-price{font-family:var(--display);font-weight:800;font-size:2rem;letter-spacing:-.03em;line-height:1}
.pd-price small{display:block;font:500 .78rem var(--body);color:var(--muted);letter-spacing:0;margin-top:4px}
.pd-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.pd-actions .btn.full{grid-column:1/-1}
.pd-block{display:grid;gap:14px}
.pd-block h3{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.pd-receipt{display:grid;gap:6px;font-size:.92rem}
.pd-receipt div{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--hair)}
.pd-receipt div.total{border-bottom:0;font-weight:700;font-size:1.05rem;padding-top:10px}
.pd-receipt .muted{font-size:.8rem}
.pd-opts{display:grid;gap:8px}
.pd-opt{display:grid;grid-template-columns:1fr auto;gap:2px 12px;align-items:center;text-align:left;padding:12px 14px;border:1px solid var(--line);border-radius:var(--r);background:var(--paper);transition:border-color .15s,background .15s}
.pd-opt:hover{border-color:var(--ink)}
.pd-opt.on{border-color:var(--ink);background:var(--canvas-2);box-shadow:inset 0 0 0 1px var(--ink)}
.pd-opt .n{font-weight:600} .pd-opt .p{font-family:var(--mono);font-size:.8rem;color:var(--muted)} .pd-opt .d{grid-column:1/-1;font-size:.8rem;color:var(--muted)}
.pd-sw{display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:8px}
.pd-sw button{display:grid;gap:6px;justify-items:center;padding:8px 4px;border-radius:var(--r);border:1px solid transparent;font-size:.72rem;color:var(--muted)}
.pd-sw button i{width:34px;height:34px;border-radius:50%;border:1px solid rgba(0,0,0,.12);box-shadow:inset 0 0 0 2px var(--paper)}
.pd-sw button.on{border-color:var(--ink);color:var(--ink)} .pd-sw button.on i{box-shadow:inset 0 0 0 2px var(--paper),0 0 0 2px var(--ink)}
.pd-avail{display:grid;gap:8px}
.pd-avail .site{display:grid;grid-template-columns:10px 1fr auto;gap:10px;align-items:center;padding:10px 12px;border-radius:var(--r);background:var(--canvas-2);font-size:.9rem}
.pd-avail .site i{width:10px;height:10px;border-radius:50%} .pd-avail .here i{background:var(--green)} .pd-avail .near i{background:var(--amber)} .pd-avail .in i{background:var(--blue)} .pd-avail .none i{background:transparent;border:1.5px solid var(--subtle)}
.pd-avail .site small{display:block;color:var(--muted);font-size:.78rem}
.pd-offer{display:grid;gap:6px;padding:14px 16px;border-radius:var(--r-lg);background:linear-gradient(135deg,var(--red-soft),var(--paper));border:1px solid var(--line)}
.pd-fin{display:grid;gap:12px}
.pd-fin .big{font-family:var(--display);font-weight:800;font-size:2rem;letter-spacing:-.03em} .pd-fin .big small{font:500 .8rem var(--body);color:var(--muted)}
.pd-fin input[type=range]{width:100%;accent-color:var(--red)}
.pd-fin .terms{display:flex;gap:6px;flex-wrap:wrap}
.pd-fin details{border-top:1px solid var(--hair);padding-top:10px} .pd-fin summary{cursor:pointer;font-weight:600}
.pd-comments p{font-size:1.02rem;line-height:1.65;max-width:70ch}
.pd-comments h2{font-size:1.5rem}
.pd-hl{display:grid;gap:6px;padding-left:18px;margin:0}
.pd-prov{display:grid;gap:18px}
.pd-prov table{width:100%;border-collapse:collapse;font-size:.88rem} .pd-prov td,.pd-prov th{padding:8px 6px;border-bottom:1px solid var(--hair);text-align:left;vertical-align:top} .pd-prov th{color:var(--muted);font-weight:600;font-size:.76rem;text-transform:uppercase;letter-spacing:.06em}
.pd-kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.pd-kv div{padding:10px 12px;border-radius:var(--r);background:var(--canvas-2)} .pd-kv b{display:block;font-size:.72rem;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.06em} .pd-kv span{font-weight:600}
.pd-insp li{display:grid;grid-template-columns:1fr auto;gap:10px;padding:8px 0;border-bottom:1px solid var(--hair);font-size:.9rem}
.pd-ask{display:grid;gap:10px}
.pd-ask .chips{display:flex;flex-wrap:wrap;gap:6px} .pd-ask .chips button{padding:7px 12px;border-radius:999px;border:1px solid var(--line);font-size:.82rem;background:var(--paper)} .pd-ask .chips button:hover{border-color:var(--ink)}
.pd-q{display:grid;gap:8px} .pd-q li{padding:10px 12px;border-radius:var(--r);background:var(--mem-soft);font-size:.88rem} .pd-q li b{display:block;color:var(--mem)} .pd-q li span{color:var(--ink-2)}
.pd-cmp{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))}
.pd-slots{display:grid;gap:12px} .pd-days{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none} .pd-days button{flex:none;padding:8px 12px;border-radius:var(--r);border:1px solid var(--line);font-size:.84rem} .pd-days button.on{background:var(--ink);color:var(--canvas);border-color:var(--ink)}
.pd-times{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:6px} .pd-times button{padding:9px 6px;border-radius:var(--r);border:1px solid var(--line);font-size:.86rem} .pd-times button:disabled{opacity:.35;text-decoration:line-through} .pd-times button.on{background:var(--red);color:#fff;border-color:var(--red)}
.pd-sheet-q{display:grid;gap:14px} .pd-sheet-q .q{display:grid;gap:8px} .pd-sheet-q .q p{font-weight:600} .pd-sheet-q .o{display:flex;flex-wrap:wrap;gap:6px} .pd-sheet-q .o button{padding:8px 12px;border-radius:999px;border:1px solid var(--line);font-size:.86rem} .pd-sheet-q .o button.on{background:var(--ink);color:var(--canvas);border-color:var(--ink)}
.pd-hand{display:grid;gap:10px;padding:14px;border-radius:var(--r-lg);background:var(--canvas-2);font-size:.9rem} .pd-hand ul{margin:0;padding-left:18px}
.pd-form{display:grid;gap:12px}
.pd-note{font-size:.8rem;color:var(--muted)}
`;
  const style = () => { if (!document.getElementById('pd-style')) document.head.appendChild(el('style', { id: 'pd-style', text: css })); };

  // ── shared helpers ──────────────────────────────────────────────────────────
  const money = HL.money;
  const ask = async (question, extra = {}) => { const key = question + JSON.stringify(extra); if (askCache.has(key)) return askCache.get(key); const r = await HL.api('/api/ask', { method: 'POST', body: Object.assign({ question, lang: HL.state.lang }, extra), timeoutMs: 30000 }); askCache.set(key, r); return r; };
  const repayment = (principal, months, rate = RATE) => { const r = rate / 12; return principal <= 0 ? 0 : (principal * r) / (1 - Math.pow(1 + r, -months)); };
  const nswDuty = (p) => (p <= 45000 ? p * 0.03 : 1350 + (p - 45000) * 0.05);
  const inCompare = (id) => (HL.state.compare || []).includes(id);
  const toggleCompare = (id) => { const c = (HL.state.compare || []).slice(); const i = c.indexOf(id); if (i >= 0) c.splice(i, 1); else { if (c.length >= 3) c.shift(); c.push(id); } HL.set({ compare: c }); HL.ui.toast(i >= 0 ? t('cmp.removed', 'Removed from compare') : t('cmp.added', 'Added to compare ({n} of 3)', { n: c.length })); };
  const block = (title, kids, { spot, kind, chips } = {}) => { const b = el('section', { class: 'pd-block card pad' }, el('h3', null, title, ...(chips || [])), ...[].concat(kids)); return spot ? HL.spot(b, spot, title, kind) : b; };

  // ── gallery ─────────────────────────────────────────────────────────────────
  function gallery(ctx) {
    const src = ctx.modelId ? HL.img(ctx.modelId, 'hero') : null;
    const hero = el('div', { class: 'pd-hero' });
    if (src) hero.appendChild(el('img', { src, alt: ctx.title, onError: (e) => { e.target.remove(); hero.appendChild(el('div', { class: 'pd-nophoto' }, t('media.pending', 'Photos being taken'))); } }));
    else hero.appendChild(el('div', { class: 'pd-nophoto' }, t('media.pending', 'Photos being taken')));
    hero.appendChild(el('div', { class: 'pd-badges' }, ...ctx.badges.map((b) => chip(b.text, b.kind))));
    if (ctx.modelId) hero.appendChild(el('span', { class: 'pd-credit', text: `${t('media.library', 'Library image of this model')} · ${HL.credit(ctx.modelId)}` }));
    const wrap = el('div', null, hero);
    if (ctx.unit) {
      const pos = [[72, 72], [28, 44], [56, 30], [20, 78], [82, 38]];
      const items = (ctx.unit.inspection?.items || []).slice(0, 5);
      const list = el('ol', { class: 'pd-callouts', style: { listStyle: 'none', padding: 0 } });
      items.forEach((it, i) => {
        const dot = el('button', { class: 'pd-dot', style: { left: `${pos[i][0]}%`, top: `${pos[i][1]}%` }, title: it.note, 'aria-label': it.note, onClick: () => { hero.querySelectorAll('.pd-dot').forEach((d) => d.classList.remove('on')); dot.classList.add('on'); list.querySelectorAll('li').forEach((l, j) => (l.style.fontWeight = j === i ? '700' : '')); } }, String(i + 1));
        hero.appendChild(dot);
        list.appendChild(el('li', null, el('b', null, String(i + 1)), el('span', null, `${it.area}: ${it.note} `, chip(it.action, it.action === 'noted' ? 'warn' : 'good'))));
      });
      if (items.length) wrap.appendChild(el('div', { style: { marginTop: '10px' } }, el('div', { class: 'row' }, el('span', { class: 'kick' }, t('callouts', 'Inspection call-outs')), chip(t('callouts.mock', 'MOCK positions · notes are from the inspection record'), 'mock')), list));
    }
    return wrap;
  }

  // ── receipts ────────────────────────────────────────────────────────────────
  function receipts(ctx) {
    const rows = [];
    let total = 0;
    if (ctx.unit) {
      const u = ctx.unit; const duty = nswDuty(u.price); const ctp = 600; const transfer = 40;
      rows.push([t('rc.price', 'Advertised price'), u.price, t('rc.exgov', 'excludes government charges')]);
      rows.push([t('rc.duty', 'NSW stamp duty (3% to $45k, 5% above)'), duty, 'mock']);
      rows.push([t('rc.transfer', 'Registration transfer'), transfer, 'mock']);
      rows.push([t('rc.ctp', 'CTP insurance, estimate'), ctp, 'mock']);
      total = u.price + duty + transfer + ctp;
    } else {
      const p = HL.priceOf(HL.state.build); if (!p) return el('div');
      const g = HL.grade(ctx.modelId, HL.state.build.gradeId);
      rows.push([`${ctx.model.name} ${g?.name || ''}`, p.base, t('rc.grade', 'grade, drive-away estimate')]);
      const col = HL.colour(HL.state.build.colourId); if (col) rows.push([col.name, p.colour, p.colour ? t('rc.prem', 'premium paint') : t('rc.inc', 'included')]);
      const int = (HL.data.catalog.interiors || []).find((i) => i.id === HL.state.build.interiorId); if (int) rows.push([int.name, p.interior, p.interior ? '' : t('rc.inc', 'included')]);
      for (const pk of p.packList) rows.push([pk.name, pk.price, t('rc.fitted', 'fitted before delivery')]);
      total = p.total;
    }
    const list = el('div', { class: 'pd-receipt' }, rows.map(([label, n, note]) => el('div', null, el('span', null, label, note === 'mock' ? el('span', null, ' ', chip('MOCK', 'mock')) : note ? el('span', { class: 'muted' }, ` · ${note}`) : null), el('span', { class: 'num', text: money(n) }))),
      el('div', { class: 'total' }, el('span', null, ctx.unit ? t('rc.total.used', 'Indicative drive-away') : t('rc.total.new', 'Drive-away estimate')), el('span', { class: 'num', text: money(total) })));
    const pc = el('input', { class: 'input', style: { width: '110px' }, value: HL.state.postcode, maxlength: '4', inputmode: 'numeric', 'aria-label': 'Postcode', onChange: (e) => { HL.set({ postcode: e.target.value.replace(/\D/g, '').slice(0, 4) }); HL.ui.toast(t('rc.pc', 'Drive-away is estimated for NSW postcode {pc}', { pc: HL.state.postcode })); } });
    const chips = [chip(ctx.unit ? t('rc.src.used', 'Price · dealer record') : t('rc.src.new', 'Prices · Harbourline catalogue'), 'dms')];
    if (ctx.market) chips.push(chip(ctx.market.position === 'below' ? t('mk.below', '{n} below market median {m}', { n: money(Math.abs(ctx.market.diff)), m: money(ctx.market.median) }) : ctx.market.position === 'above' ? t('mk.above', '{n} above market median {m}', { n: money(ctx.market.diff), m: money(ctx.market.median) }) : t('mk.at', 'At the market median {m}', { m: money(ctx.market.median) }), 'domo', `Domo · used_market_prices · ${ctx.market.sample} comparable listings`));
    return block(t('rc.title', 'Price with receipts'), [el('div', { class: 'trace' }, ...chips), list, el('div', { class: 'row small muted' }, el('span', null, t('rc.pcl', 'Estimated for postcode')), pc, el('span', null, ctx.unit ? t('rc.note.used', 'Government charges are an illustrative estimate; the contract shows the exact figures.') : t('rc.note.new', 'NSW drive-away estimate including registration, CTP and stamp duty; illustrative demo pricing.')))], { spot: 'pricing', kind: 'domo' });
  }

  // ── finance ─────────────────────────────────────────────────────────────────
  function finance(ctx, price) {
    let depositPct = 10; let term = 60;
    const big = el('div', { class: 'big' }); const sub = el('div', { class: 'small muted' });
    const upd = () => { const dep = Math.round(price * depositPct / 100); const m = repayment(price - dep, term); big.innerHTML = ''; big.appendChild(document.createTextNode(`${money(m)}`)); big.appendChild(el('small', null, ` ${t('fin.pm', 'per month')}`)); sub.textContent = t('fin.sub', '{dep} deposit · {term} months · {rate}% p.a. comparison rate (illustrative)', { dep: money(dep), term, rate: (RATE * 100).toFixed(2) }); };
    const slider = el('input', { type: 'range', min: '0', max: '30', step: '5', value: String(depositPct), 'aria-label': t('fin.dep', 'Deposit'), onInput: (e) => { depositPct = Number(e.target.value); upd(); } });
    const terms = el('div', { class: 'terms' }, [36, 48, 60, 84].map((n) => el('button', { class: `btn sm ${n === term ? '' : 'secondary'}`, onClick: (e) => { term = n; terms.querySelectorAll('button').forEach((b) => (b.className = 'btn sm secondary')); e.currentTarget.className = 'btn sm'; upd(); } }, `${n} ${t('fin.months', 'months')}`)));
    upd();
    const gfv = el('div', { class: 'small muted' }, t('fin.loading', 'Asking the knowledge box…'));
    const det = el('details', null, el('summary', null, t('fin.gfv', 'Toyota Access and guaranteed future value, explained')), gfv);
    det.addEventListener('toggle', async () => { if (!det.open || det.dataset.done) return; det.dataset.done = '1'; if (!HL.online) { gfv.textContent = t('fin.offline', 'Offline: the explanation comes from the knowledge box when the API is available.'); return; } try { const r = await ask('Explain Toyota Access and the guaranteed future value in two sentences'); gfv.innerHTML = ''; gfv.appendChild(el('p', { text: r.answer })); gfv.appendChild(el('div', { class: 'trace', style: { marginTop: '8px' } }, chip(t('fin.kb', 'Knowledge box · finance resource'), 'kb'), ...(r.citations || []).slice(0, 2).map((c) => chip(c.title, 'outline')))); } catch { gfv.textContent = t('fin.err', 'The knowledge box did not answer in time.'); } }, { once: false });
    return block(t('fin.title', 'Finance, illustrated'), [el('div', { class: 'trace' }, chip(t('fin.mock', 'MOCK · illustrative repayment, not a quote'), 'mock')), el('div', { class: 'pd-fin' }, big, sub, el('div', { class: 'field' }, el('label', null, `${t('fin.dep', 'Deposit')} · ${depositPct}%`), slider), terms, det, el('p', { class: 'pd-note', text: t('fin.note', 'A real quote needs a credit application with Toyota Finance or a partner lender; terms from 24 to 84 months.') }))], { spot: 'pricing', kind: 'mock' });
  }

  // ── assistant panel + your questions ────────────────────────────────────────
  function assistantPanel(ctx) {
    const scope = { kind: ctx.unit ? 'unit' : 'model', id: ctx.unit ? ctx.unit.stockNo : ctx.modelId, title: ctx.title };
    const chipsQ = ctx.unit ? [t('aq.u1', 'Has it had all its services?'), t('aq.u2', 'Any accident history?'), t('aq.u3', 'Can I tow with it?'), t('aq.u4', 'Why this price?')] : [t('aq.m1', 'Which grade is the best value?'), t('aq.m2', 'Can it tow my caravan?'), t('aq.m3', 'When could I have it in this colour?'), t('aq.m4', 'What does the safety pack include?')];
    const input = el('input', { class: 'input', placeholder: t('aq.ph', 'Ask about this car, in any language'), 'aria-label': t('aq.ph', 'Ask about this car, in any language') });
    const go = (q) => { if (!q || !q.trim()) return; HL.remember('asked', { kind: scope.kind, id: scope.id, q: q.trim() }); HL.assistant.open(); HL.assistant.ask(q.trim(), { scope }); input.value = ''; };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(input.value); });
    return block(t('aq.title', 'Ask about this car'), [el('div', { class: 'pd-ask' }, el('div', { class: 'row' }, chip(t('aq.scope', 'Scoped to this car\'s record'), 'kb'), chip(t('aq.mem', 'Remembers your questions'), 'mem')), el('div', { class: 'chips' }, chipsQ.map((q) => el('button', { onClick: () => go(q) }, q))), el('div', { class: 'row' }, el('div', { class: 'grow' }, input), el('button', { class: 'btn icon', 'aria-label': 'Ask', onClick: () => go(input.value) }, '↑')))], { spot: 'conversational', kind: '' });
  }
  async function yourQuestions(ctx) {
    let qs = [];
    if (ctx.unit) qs = (ctx.vdp?.yourQuestions || []).map((x) => ({ q: x.q, a: x.a, at: x.at }));
    else qs = (HL.state.journey.asked || []).filter((x) => x.kind === 'model' && x.id === ctx.modelId).map((x) => ({ q: x.q }));
    if (!qs.length) return null;
    return block(t('yq.title', 'Your questions about this car'), [el('div', { class: 'trace' }, chip(t('yq.mem', 'Session memory · this device only'), 'mem')), el('ol', { class: 'pd-q', style: { listStyle: 'none', padding: 0, margin: 0 } }, qs.slice(-5).reverse().map((x) => el('li', null, el('b', { text: x.q }), x.a ? el('span', { text: x.a.length > 220 ? `${x.a.slice(0, 217)}…` : x.a }) : null)))], { spot: 'personalised', kind: '' });
  }

  // ── compare + fitment ───────────────────────────────────────────────────────
  function compareStrip(ctx) {
    let cards = [];
    if (ctx.unit) cards = (ctx.vdp?.similar || []).slice(0, 2).map((c) => HL.ui.unitCard(c, { reason: c.headline || null }));
    else { const m = ctx.model; const near = (HL.data.catalog.models || []).filter((x) => x.id !== m.id).map((x) => [Math.abs(x.fromPrice - m.fromPrice) / 10000 + (x.body === m.body ? 0 : 2) + (x.seats === m.seats ? 0 : 1), x]).sort((a, b) => a[0] - b[0]).slice(0, 2); cards = near.map(([, x]) => HL.ui.modelCard(x, { reason: t('cmp.why', 'Same class · from {p}', { p: money(x.fromPrice) }) })); }
    if (!cards.length) return null;
    return block(t('cmp.title', 'Worth comparing'), [el('div', { class: 'pd-cmp' }, cards), el('div', { class: 'row' }, el('button', { class: 'btn secondary sm', onClick: () => HL.go('#/browse?compare=1') }, t('cmp.open', 'Open compare tray')), el('span', { class: 'small muted' }, t('cmp.n', '{n} of 3 selected', { n: (HL.state.compare || []).length })))]);
  }
  function fitment(ctx) {
    const packs = HL.data.catalog?.accessories || []; if (!packs.length) return null;
    const out = el('div', { class: 'small', style: { minHeight: '20px' } });
    const sel = el('select', { class: 'input', 'aria-label': t('fit.pick', 'Choose a pack') }, el('option', { value: '' }, t('fit.pick', 'Choose a pack')), packs.map((p) => el('option', { value: p.id }, `${p.name} · ${money(p.price)}`)));
    const run = async () => { const p = packs.find((x) => x.id === sel.value); if (!p) return; out.innerHTML = ''; out.appendChild(el('span', { class: 'muted' }, t('fit.asking', 'Checking fitment in the knowledge box…'))); if (!HL.online) { out.textContent = t('fit.offline', 'Offline: fitment answers come from the knowledge box when the API is available.'); return; } try { const r = await ask(`Will the ${p.name} fit a ${ctx.title} and what does it cost fitted?`, { build: ctx.unit ? undefined : HL.state.build }); out.innerHTML = ''; out.appendChild(el('p', { text: r.answer })); out.appendChild(el('div', { class: 'trace', style: { marginTop: '8px' } }, chip(t('fit.kb', 'Knowledge box · accessories'), 'kb'), ...(r.citations || []).slice(0, 2).map((c) => chip(c.title, 'outline')))); } catch { out.textContent = t('fit.err', 'The knowledge box did not answer in time.'); } };
    sel.addEventListener('change', run);
    return block(t('fit.title', 'Accessories fitment advisor'), [el('p', { class: 'small muted', text: t('fit.sub', 'Pick a genuine pack and the agent checks fit and fitted cost from the accessories resource and supplier invoices.') }), el('div', { class: 'row' }, el('div', { class: 'grow' }, sel), el('button', { class: 'btn sm', onClick: run }, t('fit.go', 'Check'))), out], { spot: 'product', kind: '' });
  }

  // ── new: build rail, availability, offers ───────────────────────────────────
  function buildRail(ctx, rerender) {
    const m = ctx.model; const b = HL.state.build; const cat = HL.data.catalog;
    const setB = (patch) => { HL.set({ build: Object.assign({}, HL.state.build, patch) }); HL.track('build_change', { modelId: m.id, gradeId: HL.state.build.gradeId, colourId: HL.state.build.colourId, interiorId: HL.state.build.interiorId, packs: HL.state.build.packs }); rerender(); };
    const grades = el('div', { class: 'pd-opts' }, m.grades.map((g) => el('button', { class: `pd-opt ${g.id === b.gradeId ? 'on' : ''}`, onClick: () => setB({ gradeId: g.id }) }, el('span', { class: 'n', text: g.name }), el('span', { class: 'p', text: g.id === m.grades[0].id ? money(g.price) : `+${money(g.price - m.grades[0].price)}` }), el('span', { class: 'd', text: `${g.drive || ''}${g.highlights?.length ? ' · ' + g.highlights.slice(0, 2).join(' · ') : ''}` }))));
    const colours = el('div', { class: 'pd-sw' }, (m.colours || []).map((cid) => { const c = HL.colour(cid); if (!c) return null; return el('button', { class: cid === b.colourId ? 'on' : '', title: `${c.name}${c.price ? ` +${money(c.price)}` : ''}`, onClick: () => setB({ colourId: cid }) }, el('i', { style: { background: c.hex } }), el('span', { text: c.name.split(' ')[0] })); }));
    const interiors = el('div', { class: 'pd-opts' }, (m.interiors || []).map((iid) => { const i = (cat.interiors || []).find((x) => x.id === iid); if (!i) return null; return el('button', { class: `pd-opt ${iid === b.interiorId ? 'on' : ''}`, onClick: () => setB({ interiorId: iid }) }, el('span', { class: 'n', text: i.name }), el('span', { class: 'p', text: i.price ? `+${money(i.price)}` : t('build.inc', 'included') })); }));
    const packs = el('div', { class: 'pd-opts' }, (m.accessories || []).map((pid) => { const p = (cat.accessories || []).find((x) => x.id === pid); if (!p) return null; const on = (b.packs || []).includes(pid); return el('button', { class: `pd-opt ${on ? 'on' : ''}`, onClick: () => setB({ packs: on ? b.packs.filter((x) => x !== pid) : b.packs.concat(pid) }) }, el('span', { class: 'n', text: p.name }), el('span', { class: 'p', text: `+${money(p.price)}` }), el('span', { class: 'd', text: p.desc || '' })); }));
    return block(t('build.title', 'Build it your way'), [el('div', { class: 'trace' }, chip(t('build.cat', 'Catalogue · grades, colours, packs'), 'dms'), chip(t('build.live', 'Live availability · Domo stock by site'), 'domo')), el('div', { class: 'kick' }, t('build.grade', 'Grade')), grades, el('div', { class: 'kick' }, t('build.colour', 'Colour')), colours, el('div', { class: 'kick' }, t('build.interior', 'Interior')), interiors, el('div', { class: 'kick' }, t('build.packs', 'Accessory packs')), packs], { spot: 'product', kind: 'domo' });
  }
  function availability(ctx) {
    const b = HL.state.build; const s = HL.data.stock || {}; const units = HL.unitsOf(ctx.modelId); const sites = HL.data.sites || [];
    const score = (u) => (u.colour === b.colourId ? 2 : 0) + (u.grade === b.gradeId ? 3 : 0);
    const rows = sites.map((site) => { const here = units.filter((u) => u.site === site.id && u.status === 'on_lot').sort((a, c) => score(c) - score(a)); const tf = (s.transfer_feasibility || []).find((x) => x.from_site === site.id); const best = here[0]; return { site, here, best, tf }; });
    const inbound = (s.inbound_pipeline || []).filter((u) => u.model === ctx.modelId && !u.sold);
    const eta = (s.order_bank_eta || []).find((x) => x.model === ctx.modelId);
    const list = el('div', { class: 'pd-avail' }, rows.map(({ site, here, best, tf }) => { const exact = best && score(best) === 5; const cls = !here.length ? 'none' : site.id === 'par' ? 'here' : 'near'; return el('div', { class: `site ${cls}` }, el('i'), el('span', null, el('b', { text: site.name }), el('small', { text: here.length ? `${here.length} ${t('av.onlot', 'on the lot')}${best ? ` · ${exact ? t('av.exact', 'your exact build') : `${HL.grade(ctx.modelId, best.grade)?.name || best.grade} ${t('av.in', 'in')} ${HL.colour(best.colour)?.name || best.colour}`}` : ''}${tf && site.id !== 'par' ? ` · ${t('av.transfer', '{day} transfer, {n} days', { day: tf.run_day, n: tf.lead_days })}` : ''}` : t('av.none', 'None on site') })), here.length ? el('span', { class: 'mono small' }, best?.id) : null); }),
      inbound.length ? el('div', { class: 'site in' }, el('i'), el('span', null, el('b', { text: t('av.inbound', 'Arriving') }), el('small', { text: inbound.map((u) => `${u.unit_id} · ${HL.grade(ctx.modelId, u.grade)?.name || u.grade} ${HL.colour(u.colour)?.name || u.colour} · ${u.eta_days} ${t('av.days', 'days')}`).join(' · ') }))) : null,
      eta ? el('div', { class: 'site in' }, el('i'), el('span', null, el('b', { text: t('av.order', 'Factory order') }), el('small', { text: `${eta.label}${eta.note ? ` · ${eta.note}` : ''}` }))) : null);
    return block(t('av.title', 'Where it is right now'), [el('div', { class: 'trace' }, chip(t('av.domo', 'Domo · stock_by_site, transfer_feasibility, inbound_pipeline, order_bank_eta'), 'domo'), s.refreshed_at ? chip(t('av.refreshed', 'refreshed {when}', { when: new Date(s.refreshed_at).toLocaleString('en-AU', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' }) }), 'outline') : null), list], { spot: 'product', kind: 'domo' });
  }
  function offers(ctx) {
    const list = (HL.data.offers || []).filter((o) => o.modelId === ctx.modelId).slice(0, 2);
    const promos = (HL.data.promotions || []).filter((p) => (p.appliesTo?.models || []).includes(ctx.modelId) || (p.appliesTo?.units || []).some((u) => list.some((o) => o.unitId === u))).slice(0, 2);
    if (!list.length && !promos.length) return null;
    list.forEach((o) => HL.track('offer_view', { unitId: o.unitId }));
    return block(t('of.title', 'Ready now'), [el('div', { class: 'trace' }, chip(t('of.domo', 'Domo · aged stock actions'), 'domo'), chip(t('of.kb', 'Offer copy · agent'), 'kb')), ...list.map((o) => el('div', { class: 'pd-offer' }, el('div', { class: 'row between' }, el('b', { text: `${HL.grade(ctx.modelId, o.gradeId)?.name || o.gradeId} ${t('of.in', 'in')} ${HL.colour(o.colourId)?.name || o.colourId}` }), el('span', { class: 'mono small', text: o.unitId })), el('div', null, el('span', { class: 'pd-price', style: { fontSize: '1.4rem' } }, money(o.price - (o.bonus || 0))), ' ', el('span', { class: 'small muted' }, `${t('of.bonus', 'includes a {b} ready-now bonus', { b: money(o.bonus || 0) })}`)), el('p', { class: 'small muted', text: o.reason }), el('div', { class: 'row' }, el('button', { class: 'btn primary sm', onClick: () => { HL.track('offer_click', { unitId: o.unitId }); bookDrive(ctx, o.unitId); } }, t('of.drive', 'Drive this one')), el('span', { class: 'small muted' }, HL.site(o.site).name)))),
      ...promos.map((p) => el('div', { class: 'pd-offer' }, el('b', { text: p.title }), el('p', { class: 'small', text: p.desc }), el('p', { class: 'small muted', text: `${p.why || ''}${p.validUntil ? ` · ${t('of.until', 'until')} ${p.validUntil}` : ''}` })))], { spot: 'pricing', kind: 'domo' });
  }

  // ── used: comments + provenance ─────────────────────────────────────────────
  function comments(ctx) {
    const c = ctx.vdp?.comments || (HL.data.usedComments || {})[ctx.unit.stockNo] || null;
    if (!c) return null;
    const agent = c.by === 'agent' || (c.generatedAt && !c.by);
    return block(t('cm.title', 'Dealer comments'), [el('div', { class: 'trace' }, agent ? chip(t('cm.agent', 'Written by the agent from this car\'s own resource in the knowledge box'), 'kb') : chip(t('cm.scripted', 'Composed from the record (agent copy not generated yet)'), 'dms'), ...(c.sources || []).slice(0, 2).map((s) => chip(s, 'outline')), c.generatedAt ? chip(t('cm.when', 'written {d}', { d: new Date(c.generatedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) }), 'outline') : null), el('div', { class: 'pd-comments stack' }, el('h2', { text: c.headline }), el('p', { text: c.body })), c.highlights?.length ? el('div', null, el('div', { class: 'kick', style: { marginBottom: '6px' } }, t('cm.hl', 'Highlights')), el('ul', { class: 'pd-hl' }, c.highlights.map((h) => el('li', { text: h })))) : null, c.honest?.length ? el('div', null, el('div', { class: 'kick', style: { marginBottom: '6px' } }, t('cm.honest', 'Worth knowing')), el('ul', { class: 'pd-hl' }, c.honest.map((h) => el('li', { text: h })))) : null], { spot: 'product', kind: '' });
  }
  function provenance(ctx) {
    const u = ctx.unit; const i = u.inspection || {}; const p = u.ppsr || {}; const w = u.warranty || {};
    const kv = el('div', { class: 'pd-kv' }, [[t('pv.owners', 'Owners'), String(u.owners)], [t('pv.keys', 'Keys'), String(u.keys)], [t('pv.books', 'Service books'), u.books ? t('pv.yes', 'Present') : t('pv.no', 'No')], [t('pv.first', 'First registered'), u.firstRegistered], [t('pv.rego', 'Registered to'), u.regoExpiry], [t('pv.via', 'Came to us via'), `${u.acquiredVia}${u.tradeInId ? ` (${u.tradeInId})` : ''}`]].map(([k, v]) => el('div', null, el('b', { text: k }), el('span', { text: v }))));
    const svc = el('table', null, el('thead', null, el('tr', null, el('th', null, t('pv.date', 'Date')), el('th', null, t('pv.km', 'Odometer')), el('th', null, t('pv.work', 'Work')), el('th', null, t('pv.by', 'By')))), el('tbody', null, (u.serviceHistory || []).map((s) => el('tr', null, el('td', { class: 'mono small', text: s.date }), el('td', { class: 'num', text: HL.km(s.km) }), el('td', { text: s.work }), el('td', { class: 'small muted', text: s.by })))));
    const insp = el('ul', { class: 'pd-insp', style: { listStyle: 'none', padding: 0, margin: 0 } }, (i.items || []).map((it) => el('li', null, el('span', null, el('b', { text: `${it.area}: ` }), it.note), chip(it.action, it.action === 'noted' ? 'warn' : 'good'))));
    return block(t('pv.title', 'Provenance'), [el('div', { class: 'trace' }, chip(t('pv.src', 'Dealer record · listing + provenance resource'), 'kb'), chip(t('pv.synthetic', 'Synthetic demo history'), 'outline')), kv,
      el('div', { class: 'pd-prov' }, el('div', null, el('h4', null, `${t('pv.service', 'Service history')} · ${(u.serviceHistory || []).length} ${t('pv.logged', 'logged')}`), svc, el('p', { class: 'small muted', style: { marginTop: '6px' } }, t('pv.next', 'Next service due at {km} or by {d}', { km: HL.km(u.nextServiceDue?.km || 0), d: u.nextServiceDue?.date || '' }))),
        el('div', null, el('h4', null, `${i.points || 120}-${t('pv.insp', 'point inspection')} · ${i.date || ''} · ${i.inspector || ''} · ${i.passed ? t('pv.passed', 'passed') : t('pv.failed', 'failed')}`), insp, el('p', { class: 'small muted', style: { marginTop: '6px' } }, t('pv.tyres', 'Tyres {f} mm front, {r} mm rear · brakes {bf}% front, {br}% rear', { f: i.tyresMm?.front, r: i.tyresMm?.rear, bf: i.brakesPct?.front, br: i.brakesPct?.rear }))),
        el('div', { class: 'pd-kv' }, el('div', null, el('b', { text: t('pv.ppsr', 'PPSR check') }), el('span', { text: `${p.checkedAt || ''} · ${p.encumbrance ? t('pv.enc', 'encumbrance') : t('pv.clear', 'no encumbrance')} · ${p.writtenOff ? t('pv.wo', 'written-off listed') : t('pv.nowo', 'not written off')}` }), el('div', { class: 'tiny mono muted', text: p.certificate || '' })), el('div', null, el('b', { text: t('pv.warranty', 'Warranty') }), el('span', { text: `${w.type || ''}${w.until ? ` · ${t('pv.until', 'until')} ${w.until}` : ''}` }), w.note ? el('div', { class: 'tiny muted', text: w.note }) : null)),
        (u.reconditioning || []).length ? el('div', null, el('h4', null, t('pv.recon', 'Reconditioning by Harbourline')), el('ul', { class: 'pd-hl' }, u.reconditioning.map((r) => el('li', null, `${r.item} · `, el('span', { class: 'mono small', text: money(r.cost) }))))) : null)], { spot: 'product', kind: '' });
  }

  // ── actions: enquiry / reserve / watch / booking ─────────────────────────────
  function enquiryForm(ctx, kind) {
    const u = ctx.unit; if (!u) { HL.assistant.open(t('enq.newhint', 'I would like to enquire about the {t}', { t: ctx.title })); return; }
    const f = { name: el('input', { class: 'input', autocomplete: 'name' }), phone: el('input', { class: 'input', inputmode: 'tel' }), email: el('input', { class: 'input', inputmode: 'email' }), message: el('textarea', { class: 'input', rows: '3' }), term: el('select', { class: 'input' }, [36, 48, 60, 84].map((n) => el('option', { value: String(n), selected: n === 60 }, `${n} ${t('fin.months', 'months')}`))), deposit: el('input', { class: 'input', inputmode: 'numeric', value: '5000' }) };
    const body = el('div', { class: 'pd-form' }, el('p', { class: 'small muted', text: `${ctx.title} ${u.grade} · ${u.stockNo} · ${money(u.price)}` }), el('div', { class: 'field' }, el('label', null, t('enq.name', 'Your name')), f.name), el('div', { class: 'grid g2' }, el('div', { class: 'field' }, el('label', null, t('enq.phone', 'Mobile')), f.phone), el('div', { class: 'field' }, el('label', null, t('enq.email', 'Email')), f.email)), kind === 'finance' ? el('div', { class: 'grid g2' }, el('div', { class: 'field' }, el('label', null, t('enq.term', 'Term')), f.term), el('div', { class: 'field' }, el('label', null, t('enq.deposit', 'Deposit')), f.deposit)) : null, el('div', { class: 'field' }, el('label', null, t('enq.msg', 'Anything we should know?')), f.message), el('p', { class: 'pd-note' }, chip(t('enq.demo', 'Demo: no payment is taken. Reserve places a 48-hour hold.'), 'mock'), ' ', chip(t('enq.dms', 'Creates a lead in the DMS'), 'dms')));
    const label = kind === 'reserve' ? t('enq.reserve', 'Reserve now') : kind === 'finance' ? t('enq.finance', 'Request a finance quote') : t('enq.send', 'Send enquiry');
    HL.ui.sheet(label, body, [{ label: t('enq.cancel', 'Cancel'), kind: 'ghost' }, { label, kind: 'primary', onClick: () => {
      const payload = { kind, name: f.name.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim(), message: f.message.value.trim(), financeTermMonths: kind === 'finance' ? Number(f.term.value) : undefined, deposit: kind === 'finance' ? Number(f.deposit.value) : undefined };
      if (!payload.name || (!payload.phone && !payload.email)) { HL.ui.toast(t('enq.need', 'A name and a mobile or email are needed.')); return false; }
      if (!HL.online) { HL.ui.toast(t('enq.offline', 'Offline: enquiries reach the DMS when the API is available.')); return; }
      HL.api(`/api/used/${u.stockNo}/enquiry`, { method: 'POST', body: payload }).then((r) => { HL.ui.sheet(t('enq.done', 'Thank you'), el('div', { class: 'stack' }, el('p', { text: r.message }), el('div', { class: 'trace' }, chip(`${t('enq.ref', 'Reference')} ${r.ref}`, 'outline'), r.leadId ? chip(`${t('enq.lead', 'DMS lead')} ${r.leadId}`, 'dms') : null, r.hold ? chip(t('enq.hold', 'Held until {d}', { d: new Date(r.hold.until).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) }), 'warn') : null)), [{ label: t('enq.close', 'Close'), kind: 'primary' }]); if (kind === 'reserve') HL.rerender(); }).catch((e) => HL.ui.toast(e.message || t('enq.err', 'That did not go through.')));
    } }]);
  }
  async function watch(ctx) {
    if (!ctx.unit) { HL.remember('watches', { kind: 'model', id: ctx.modelId }); HL.ui.toast(t('watch.model', 'Watching the {t}: we will show arrivals on your front door.', { t: ctx.title })); return; }
    if (!HL.online) { HL.ui.toast(t('watch.offline', 'Offline: watches are saved when the API is available.')); return; }
    try { const r = await HL.api('/api/used/watch', { method: 'POST', body: { stockNo: ctx.unit.stockNo } }); HL.remember('watches', { kind: 'unit', id: ctx.unit.stockNo }); HL.ui.toast(t('watch.ok', 'Watching this car · {n} watching', { n: r.watchers ?? '' })); } catch (e) { HL.ui.toast(e.message); }
  }
  function bookDrive(ctx, unitId) {
    const sites = HL.data.sites || []; const st = { site: 'par', day: 0, slot: null, slots: null, booking: null, answers: {} };
    const box = el('div', { class: 'pd-slots' });
    const close = HL.ui.sheet(t('bk.title', 'Book a test drive'), box, [], { wide: false });
    const step1 = async () => {
      box.innerHTML = ''; box.appendChild(el('p', { class: 'small muted', text: `${ctx.title}${ctx.unit ? ` · ${ctx.unit.stockNo}` : ''}` }));
      box.appendChild(el('div', { class: 'pills' }, sites.map((s) => el('button', { class: s.id === st.site ? 'on' : '', onClick: () => { st.site = s.id; st.slot = null; step1(); } }, s.name))));
      const grid = el('div', { class: 'stack' }, el('div', { class: 'skel', style: { height: '120px' } })); box.appendChild(grid);
      if (!HL.online) { grid.innerHTML = ''; grid.appendChild(el('p', { class: 'muted', text: t('bk.offline', 'Offline: live slots come from the DMS diary when the API is available.') })); return; }
      try { st.slots = await HL.api(`/api/testdrive/slots?site=${st.site}`); } catch (e) { grid.innerHTML = ''; grid.appendChild(el('p', { text: e.message })); return; }
      const render = () => { grid.innerHTML = ''; const days = st.slots.days; grid.appendChild(el('div', { class: 'pd-days' }, days.map((d, i) => el('button', { class: i === st.day ? 'on' : '', onClick: () => { st.day = i; st.slot = null; render(); } }, d.label)))); grid.appendChild(el('div', { class: 'pd-times' }, days[st.day].slots.map((s) => el('button', { class: st.slot?.id === s.id ? 'on' : '', disabled: !s.available, onClick: () => { st.slot = s; render(); } }, s.time)))); grid.appendChild(el('div', { class: 'row between' }, el('span', { class: 'small muted' }, chip(t('bk.dms', 'Live diary · DMS stand-in'), 'dms')), el('button', { class: 'btn primary', disabled: !st.slot, onClick: step2 }, t('bk.next', 'Book this slot')))); };
      render();
    };
    const step2 = async () => {
      box.innerHTML = ''; box.appendChild(el('div', { class: 'skel', style: { height: '160px' } })); box.appendChild(el('p', { class: 'small muted', text: t('bk.writing', 'Booking the slot and asking the agent for three salesperson questions…') }));
      const viewed = (HL.state.journey.viewed || []).filter((v) => v.kind === 'model').map((v) => ({ modelId: v.id }));
      const bestUnit = unitId || (ctx.unit ? null : (HL.unitsOf(ctx.modelId).filter((u) => u.status === 'on_lot').sort((a, b) => ((b.grade === HL.state.build.gradeId) + (b.colour === HL.state.build.colourId)) - ((a.grade === HL.state.build.gradeId) + (a.colour === HL.state.build.colourId)))[0]?.id || null));
      const body = { sid: HL.state.sid, site: st.site, slotId: st.slot.id, unitId: bestUnit, build: ctx.unit ? { modelId: ctx.unit.modelId || undefined } : HL.state.build, viewed, finder: { answers: HL.state.journey.answers || [] }, lang: HL.state.lang };
      if (ctx.unit && !ctx.unit.modelId) body.build = { modelId: 'rav4' };
      try { st.booking = await HL.api('/api/testdrive/book', { method: 'POST', body, timeoutMs: 40000 }); } catch (e) { box.innerHTML = ''; box.appendChild(el('p', { text: e.message })); box.appendChild(el('button', { class: 'btn secondary', onClick: step1 }, t('bk.back', 'Back'))); return; }
      const b = st.booking; box.innerHTML = '';
      box.appendChild(el('div', { class: 'stack' }, el('h4', null, t('bk.booked', 'Booked: {when} at {site}', { when: b.whenLabel, site: b.siteName })), el('p', { class: 'small muted', text: ctx.unit ? t('bk.usednote', 'The diary books by model; the {s} team will have {u} ready for you.', { s: b.siteName, u: ctx.unit.stockNo }) : (b.unitId ? t('bk.unit', 'Unit {u} will be ready.', { u: b.unitId }) : t('bk.nounit', 'A {m} will be ready.', { m: b.model })) }), HL.ui.trace(b.trace || [])));
      const qwrap = el('div', { class: 'pd-sheet-q' }, el('p', { class: 'kick' }, t('bk.q', 'Three quick questions so your salesperson is ready')), b.questions.map((q) => el('div', { class: 'q' }, el('p', { text: q.text }), q.why ? el('span', { class: 'small muted', text: q.why }) : null, el('div', { class: 'o' }, q.options.map((o) => el('button', { class: st.answers[q.id] === o.id ? 'on' : '', onClick: (e) => { st.answers[q.id] = o.id; e.currentTarget.parentElement.querySelectorAll('button').forEach((x) => x.classList.remove('on')); e.currentTarget.classList.add('on'); } }, o.label))))));
      box.appendChild(qwrap);
      box.appendChild(el('div', { class: 'row between' }, chip(t('bk.incentive', '{t}', { t: b.incentive?.title || '' }), 'domo', b.incentive?.reason), el('button', { class: 'btn primary', onClick: step3 }, t('bk.send', 'Send answers'))));
    };
    const step3 = async () => {
      const answers = Object.entries(st.answers).map(([id, value]) => ({ id, questionId: id, value }));
      let reply = null;
      if (answers.length) { try { reply = await HL.api('/api/testdrive/answers', { method: 'POST', body: { bookingId: st.booking.bookingId, answers }, timeoutMs: 30000 }); } catch (e) { HL.ui.toast(e.message); } }
      box.innerHTML = '';
      box.appendChild(el('div', { class: 'stack' }, el('h4', null, t('bk.thanks', 'See you {when}', { when: st.booking.whenLabel })), reply?.reply ? el('p', { text: reply.reply }) : null, el('div', { class: 'pd-offer' }, el('b', { text: st.booking.incentive?.title || '' }), el('p', { class: 'small muted', text: st.booking.incentive?.desc || st.booking.incentive?.reason || '' }))));
      const hand = el('div', { class: 'pd-hand' }, el('div', { class: 'row' }, el('b', null, t('bk.hand', 'What your salesperson will see')), chip(t('bk.handdms', 'Handover sheet · DMS'), 'dms')), el('div', { class: 'skel', style: { height: '80px' } }));
      box.appendChild(HL.spot(hand, 'backoffice', t('bk.hand', 'What your salesperson will see')));
      try { const h = await HL.api(`/api/testdrive/handover/${st.booking.bookingId}`, { timeoutMs: 40000 }); hand.querySelector('.skel')?.remove(); hand.appendChild(el('ul', null, (h.talkingPoints || []).map((x) => el('li', { text: x })))); if (h.promotionsToOffer?.length) hand.appendChild(el('p', { class: 'small' }, el('b', null, `${t('bk.promos', 'Offers to raise')}: `), h.promotionsToOffer.map((p) => p.title).join(' · '))); if (h.prep?.length) hand.appendChild(el('p', { class: 'small muted' }, el('b', null, `${t('bk.prep', 'Prep')}: `), h.prep.join(' · '))); hand.appendChild(HL.ui.trace(h.trace || [])); } catch { hand.querySelector('.skel')?.remove(); hand.appendChild(el('p', { class: 'small muted', text: t('bk.handlater', 'The sheet is being written; the team sees it in the DMS.') })); }
      box.appendChild(el('div', { class: 'row', style: { justifyContent: 'flex-end' } }, el('button', { class: 'btn', onClick: close }, t('bk.done', 'Done'))));
    };
    step1();
  }
  function actions(ctx) {
    const u = ctx.unit; const id = u ? `u:${u.stockNo}` : `m:${ctx.modelId}`;
    const held = u && u.status !== 'on_lot';
    return el('div', { class: 'pd-actions' },
      el('button', { class: 'btn primary full lg', onClick: () => bookDrive(ctx) }, t('act.drive', 'Book a test drive')),
      u ? el('button', { class: 'btn', disabled: held, title: held ? t('act.heldwhy', 'Not available to reserve right now') : '', onClick: () => enquiryForm(ctx, 'reserve') }, held ? t('act.held', 'On hold') : t('act.reserve', 'Reserve · 48 h hold')) : el('button', { class: 'btn', onClick: () => enquiryForm(ctx, 'finance') }, t('act.quote', 'Get a quote')),
      el('button', { class: 'btn secondary', onClick: () => enquiryForm(ctx, u ? 'enquire' : 'enquire') }, t('act.enquire', 'Enquire')),
      el('button', { class: 'btn secondary', onClick: () => watch(ctx) }, `☆ ${t('act.watch', 'Watch')}`),
      el('button', { class: 'btn secondary', onClick: (e) => { toggleCompare(id); e.currentTarget.textContent = inCompare(id) ? `✓ ${t('act.compared', 'In compare')}` : `+ ${t('act.compare', 'Compare')}`; } }, inCompare(id) ? `✓ ${t('act.compared', 'In compare')}` : `+ ${t('act.compare', 'Compare')}`));
  }

  // ── title block ─────────────────────────────────────────────────────────────
  function titleBlock(ctx) {
    const u = ctx.unit; const price = u ? u.price : HL.priceOf(HL.state.build)?.total;
    const sub = u ? `${u.grade} ${u.variantCode} · ${HL.km(u.km)} · ${u.transmission} · ${u.fuel} · ${u.drive}` : `${ctx.model.bodyLabel} · ${ctx.model.powertrainLabel} · ${ctx.model.seats} ${t('seats', 'seats')}${ctx.model.towKg ? ` · ${t('tows', 'tows')} ${ctx.model.towKg.toLocaleString('en-AU')} kg` : ''}`;
    return el('div', { class: 'card pad stack pd-title' }, el('div', { class: 'row' }, ...ctx.badges.map((b) => chip(b.text, b.kind))), el('h1', { text: ctx.title }), el('p', { class: 'muted', text: sub }), el('div', { class: 'pd-price num' }, money(price), el('small', { text: u ? `${t('exgov', 'Excl. Govt. Charges')} · ${t('illus', 'illustrative')}` : `${t('driveaway', 'Drive-away estimate, NSW')} · ${t('illus', 'illustrative')}` })),
      u ? el('div', { class: 'row small muted' }, el('span', { text: `${t('at', 'At')} ${u.siteName || HL.site(u.siteId).name}` }), u.watchers ? chip(`${u.watchers} ${t('watching', 'watching')}`, 'outline') : null, ctx.vdp?.resourceId ? chip(t('resource', 'KB resource'), 'kb', ctx.vdp.resourceId) : null) : el('div', { class: 'row small muted' }, el('span', { text: `${HL.grade(ctx.modelId, HL.state.build.gradeId)?.name || ''} · ${HL.colour(HL.state.build.colourId)?.name || ''}` })),
      actions(ctx));
  }

  // ── scene ───────────────────────────────────────────────────────────────────
  let unsub = [];
  HL.scene('car', {
    async mount(root, r) {
      style();
      const id = r.params[0] || 'm:rav4'; const [kind, key] = id.includes(':') ? id.split(':') : ['m', id];
      const wrap = el('div', { class: 'wrap section' }); root.appendChild(wrap);
      if (!HL.data) { wrap.appendChild(HL.ui.skeleton(1, 420)); return; }
      const ctx = { kind, badges: [] };
      if (kind === 'u') {
        let vdp = null;
        if (HL.online) { try { vdp = await HL.api(`/api/used/${key}`); } catch (e) { if (e.status === 404) { wrap.appendChild(HL.ui.empty(t('nf', 'We could not find that car.'), t('browse', 'Browse pre-owned'), () => HL.go('#/browse?kind=used'))); return; } } }
        const unit = vdp?.unit || (HL.data.usedFull || []).find((u) => u.stockNo === key.toUpperCase()) || HL.unit(key);
        if (!unit) { wrap.appendChild(HL.ui.empty(t('nf', 'We could not find that car.'), t('browse', 'Browse pre-owned'), () => HL.go('#/browse?kind=used'))); return; }
        Object.assign(ctx, { unit, vdp, modelId: unit.modelId, title: `${unit.year} ${unit.make} ${unit.model}`, market: vdp?.market || null });
        ctx.badges = [{ text: t('badge.used', 'Pre-owned'), kind: 'outline' }, unit.certified ? { text: t('badge.cert', 'Toyota Certified'), kind: 'good' } : null, unit.status === 'held' ? { text: t('badge.held', 'On hold'), kind: 'warn' } : unit.status === 'arriving' ? { text: t('badge.arr', 'Arriving in {n} days', { n: unit.etaDays }), kind: 'blue' } : unit.status === 'reconditioning' ? { text: t('badge.recon', 'In reconditioning'), kind: 'blue' } : null, unit.owners === 1 ? { text: t('badge.owner', 'One owner'), kind: 'blue' } : null].filter(Boolean);
        HL.track('used_view', { stockNo: unit.stockNo }); HL.remember('viewed', { kind: 'unit', id: unit.stockNo, title: ctx.title });
      } else {
        const model = HL.model(key); if (!model) { wrap.appendChild(HL.ui.empty(t('nf', 'We could not find that car.'), t('browse', 'Browse the range'), () => HL.go('#/browse'))); return; }
        if (HL.state.build.modelId !== model.id) HL.set({ build: { modelId: model.id, gradeId: model.grades[0].id, colourId: model.colours[0], interiorId: model.interiors[0], packs: [] } });
        Object.assign(ctx, { model, modelId: model.id, title: `Toyota ${model.name}` });
        const here = HL.unitsOf(model.id).filter((u) => u.status === 'on_lot').length;
        ctx.badges = [{ text: t('badge.new', 'New'), kind: 'outline' }, here ? { text: t('badge.onlot', '{n} on the lot', { n: here }), kind: 'good' } : null, model.powertrain === 'hybrid' ? { text: t('badge.hybrid', 'Hybrid'), kind: 'blue' } : model.powertrain === 'ev' || model.powertrain === 'electric' ? { text: t('badge.ev', 'Electric'), kind: 'blue' } : null].filter(Boolean);
        HL.remember('viewed', { kind: 'model', id: model.id, title: ctx.title });
      }
      HL.assistant.setScope({ kind: ctx.unit ? 'unit' : 'model', id: ctx.unit ? ctx.unit.stockNo : ctx.modelId, title: ctx.title });
      wrap.appendChild(el('a', { href: ctx.unit ? '#/browse?kind=used' : '#/browse', class: 'small muted', style: { textDecoration: 'none', display: 'inline-block', marginBottom: '14px' } }, `← ${ctx.unit ? t('back.used', 'All pre-owned cars') : t('back.new', 'The range')}`));
      wrap.appendChild(gallery(ctx));
      const main = el('div', { class: 'stack', style: { gap: '20px', display: 'grid' } }); const aside = el('div', { class: 'pd-aside stack', style: { gap: '20px', display: 'grid' } });
      wrap.appendChild(el('div', { class: 'pd-layout' }, main, aside));
      const price = () => (ctx.unit ? ctx.unit.price : HL.priceOf(HL.state.build)?.total || 0);
      const paint = async () => {
        aside.innerHTML = ''; main.innerHTML = '';
        aside.appendChild(titleBlock(ctx)); aside.appendChild(assistantPanel(ctx)); const yq = await yourQuestions(ctx); if (yq) aside.appendChild(yq);
        if (ctx.unit) { const c = comments(ctx); if (c) main.appendChild(c); main.appendChild(receipts(ctx)); main.appendChild(provenance(ctx)); main.appendChild(finance(ctx, price())); }
        else { main.appendChild(buildRail(ctx, paint)); main.appendChild(availability(ctx)); const o = offers(ctx); if (o) main.appendChild(o); main.appendChild(receipts(ctx)); main.appendChild(finance(ctx, price())); }
        const f = fitment(ctx); if (f) main.appendChild(f); const cs = compareStrip(ctx); if (cs) main.appendChild(cs);
        HL.powers.refreshPins();
      };
      await paint();
      unsub.push(HL.bus.on('assistant:close', async () => { if (ctx.unit && HL.online) { try { ctx.vdp = await HL.api(`/api/used/${ctx.unit.stockNo}`); } catch { /* ignore */ } } const old = aside.querySelector('[data-spot="personalised"]'); const yq = await yourQuestions(ctx); if (old) old.remove(); if (yq) aside.appendChild(yq); }));
      unsub.push(HL.bus.on('lang', () => HL.rerender()));
    },
    unmount() { unsub.forEach((u) => u && u()); unsub = []; HL.assistant.setScope(null); },
  });
})();
