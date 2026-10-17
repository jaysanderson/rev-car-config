/* Harbourline One — "What powers this" drawer and demo-mode pins. Agent D.
   One card per use case: what the visitor sees, the Agentic RAG features and Domo datasets behind it, where it
   appears, and a Demonstrate button that fires the real call (or a scripted MOCK). Tokens from concept.css only. */
(function () {
  'use strict';
  const { el, chip } = HL.ui;
  const t = (k, f, v) => HL.t(`powers.${k}`, f, v);
  let styled = false; let built = false;
  const CSS = `
  .pw-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:16px}
  .pw-sum .s{background:var(--canvas-2);border-radius:var(--r);padding:10px 12px}
  .pw-sum .s b{display:block;font-family:var(--display);font-size:1.3rem;letter-spacing:-.02em}
  .pw-sum .s span{font-size:.72rem;color:var(--muted)}
  .pw-card{border:1px solid var(--line);border-radius:var(--r-lg);background:var(--paper);margin-bottom:10px;overflow:hidden}
  .pw-card.open{box-shadow:var(--shadow)}
  .pw-head{display:flex;align-items:center;gap:12px;padding:14px 16px;width:100%;text-align:left}
  .pw-head .n{width:26px;height:26px;border-radius:50%;background:var(--kb);color:#fff;display:grid;place-items:center;font:700 .74rem var(--mono);flex:none}
  .pw-head b{font-family:var(--display);font-size:1rem}
  .pw-head .sees{font-size:.82rem;color:var(--muted);display:block}
  .pw-head .tw{margin-left:auto;transition:transform .2s var(--ease);color:var(--subtle)}
  .pw-card.open .tw{transform:rotate(180deg)}
  .pw-body{display:none;padding:0 16px 16px;border-top:1px solid var(--hair)}
  .pw-card.open .pw-body{display:grid;gap:14px}
  .pw-cols{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));margin-top:12px}
  .pw-col{border-radius:var(--r);padding:12px 14px}
  .pw-col.kb{background:var(--kb-soft)} .pw-col.domo{background:var(--domo-soft)}
  .pw-col h5{margin:0 0 6px;font-size:.74rem;letter-spacing:.1em;text-transform:uppercase}
  .pw-col.kb h5{color:var(--kb)} .pw-col.domo h5{color:var(--domo)}
  .pw-col ul{margin:0;padding-left:16px;font-size:.86rem;display:grid;gap:3px}
  .pw-where{display:flex;gap:6px;flex-wrap:wrap}
  .pw-where a{font-size:.8rem;padding:4px 10px;border-radius:999px;border:1px solid var(--line);text-decoration:none}
  .pw-where a:hover{border-color:var(--ink)}
  .pw-demo{display:grid;gap:8px}
  .pw-out{background:var(--canvas-2);border-radius:var(--r);padding:12px 14px;font-size:.86rem;display:grid;gap:8px}
  .pw-out .req{font-family:var(--mono);font-size:.76rem;color:var(--muted);word-break:break-all}
  .pw-out .ans{white-space:pre-wrap}
  .pw-out details summary{cursor:pointer;font-size:.78rem;color:var(--muted)}
  .pw-out pre{margin:6px 0 0;font-size:.7rem;max-height:260px;overflow:auto;white-space:pre-wrap;word-break:break-all}
  .pw-note{font-size:.8rem;color:var(--muted)}
  `;
  const S = (path) => path; // same-origin
  const pretty = (o) => JSON.stringify(o, null, 2);
  const trim = (s, n = 1200) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  // ── demonstrations ─────────────────────────────────────────────────────────
  const step = (out, label) => { const d = el('div', { class: 'pw-out fade-in' }, el('div', { class: 'req', text: label }), el('div', { class: 'skel', style: { height: '40px' } })); out.appendChild(d); return d; };
  const show = (d, { answer, trace, raw, chips }) => { d.lastChild.replaceWith(el('div', { class: 'stack' }, chips?.length ? el('div', { class: 'row' }, chips.map((c) => chip(c.text, c.kind))) : null, answer ? el('div', { class: 'ans', text: trim(String(answer)) }) : null, trace?.length ? HL.ui.trace(trace) : null, raw !== undefined ? el('details', null, el('summary', { text: t('raw', 'Show raw response') }), el('pre', { text: trim(pretty(raw), 6000) })) : null)); };
  const fail = (d, e) => { d.lastChild.replaceWith(el('div', { class: 'small muted', text: t('fail', 'Call failed: {e}', { e: e.message }) })); };
  const ms = (t0) => `${Date.now() - t0} ms`;

  const DEMOS = {
    async multilingual(out) {
      const q = 'Toyota RAV4 có kéo được xe caravan 1.800 kg không? Có xe nào ở Parramatta không?';
      const d = step(out, `POST /api/ask  { question: "${q}", lang: "vi" }`); const t0 = Date.now();
      try { const r = await HL.api('/api/ask', { method: 'POST', body: { question: q, lang: 'vi', build: { modelId: 'rav4' } }, timeoutMs: 30000 }); show(d, { answer: r.answer, trace: (r.trace || []).concat([{ kind: 'kb', label: ms(t0) }]), raw: r, chips: [{ text: t('vi', 'Asked in Vietnamese, answered in Vietnamese, retrieved from an English corpus'), kind: 'kb' }] }); } catch (e) { fail(d, e); }
      const d2 = step(out, 'POST /api/ask  { question: "这辆车的保修期是多久？", lang: "zh" }');
      try { const r = await HL.api('/api/ask', { method: 'POST', body: { question: '这辆车的保修期是多久？', lang: 'zh', build: { modelId: 'kluger' } }, timeoutMs: 30000 }); show(d2, { answer: r.answer, trace: r.trace, raw: r }); } catch (e) { fail(d2, e); }
    },
    async search(out) {
      const q1 = 'seven seats hybrid under 60k'; const d = step(out, `GET /api/find?q=${q1}`); const t0 = Date.now();
      try { const r = await HL.api(`/api/find?q=${encodeURIComponent(q1)}`, { timeoutMs: 30000 }); show(d, { answer: r.slice(0, 4).map((h) => `• ${h.title}${h.modelId ? ` [${h.modelId}]` : ''}: ${String(h.text).slice(0, 140)}…`).join('\n'), trace: [{ kind: 'kb', label: t('hits', '{n} paragraph hits, hybrid semantic + keyword, reranked, {ms}', { n: r.length, ms: ms(t0) }) }], raw: r.slice(0, 5) }); } catch (e) { fail(d, e); }
      const q2 = 'something to tow a caravan with low kilometres'; const d2 = step(out, `GET /api/used?q=${q2}`); const t1 = Date.now();
      try { const r = await HL.api(`/api/used?q=${encodeURIComponent(q2)}&pageSize=6`, { timeoutMs: 30000 }); show(d2, { answer: r.items.slice(0, 5).map((c) => `• ${c.title} ${c.grade} · ${HL.km(c.km)} · ${HL.money(c.price)}${c.headline ? ` — ${c.headline}` : ''}`).join('\n'), trace: [{ kind: 'kb', label: r.semantic ? t('semantic', 'semantic: true (ARAG /find over topic/used resources), {ms}', { ms: ms(t1) }) : t('keyword', 'keyword fallback (no semantic hits)') }], raw: { total: r.total, semantic: r.semantic, tookMs: r.tookMs, items: r.items.slice(0, 3) } }); } catch (e) { fail(d2, e); }
    },
    async conversational(out) {
      const id = 'U-33050'; const q1 = 'How many services has it had and who did them?'; const d = step(out, `POST /api/used/${id}/ask  { question: "${q1}" }  (x-sid: ${HL.state.sid})`); const t0 = Date.now();
      try { const r = await HL.api(`/api/used/${id}/ask`, { method: 'POST', body: { question: q1, lang: HL.state.lang }, timeoutMs: 30000 }); show(d, { answer: r.answer, trace: (r.trace || []).concat([{ kind: 'kb', label: ms(t0) }]), raw: r }); } catch (e) { fail(d, e); return; }
      const q2 = 'And can it tow my 2.5 tonne caravan? Remember what I asked before.'; const d2 = step(out, `POST /api/used/${id}/ask  { question: "${q2}" }  — second turn, same session`); const t1 = Date.now();
      try { const r = await HL.api(`/api/used/${id}/ask`, { method: 'POST', body: { question: q2, lang: HL.state.lang }, timeoutMs: 30000 }); show(d2, { answer: r.answer, trace: (r.trace || []).concat([{ kind: 'kb', label: ms(t1) }]), raw: { yourQuestions: r.yourQuestions, actions: r.actions, citations: r.citations }, chips: [{ text: t('memory', '{n} earlier question(s) recalled from used_sessions.jsonl', { n: (r.yourQuestions || []).length }), kind: 'mem' }] }); } catch (e) { fail(d2, e); }
    },
    async personalised(out) {
      const d = step(out, `GET /api/used/foryou  (x-sid: ${HL.state.sid})`); const t0 = Date.now();
      try { const r = await HL.api('/api/used/foryou', { timeoutMs: 30000 }); show(d, { answer: r.rows.length ? r.rows.map((row) => `• ${row.title}\n   ${row.why} → ${row.items.map((i) => i.stockNo).join(', ')}`).join('\n') : t('newsession', 'New session: no rows yet. View a car or ask a question and this fills in.'), trace: [{ kind: 'mem', label: t('journey', 'journey: {v} viewed, {a} asked, {w} watches', { v: r.journey.viewed.length, a: r.journey.asked.length, w: r.journey.watches.length }) }, { kind: 'kb', label: ms(t0) }], raw: r }); } catch (e) { fail(d, e); }
      const d2 = step(out, 'GET /api/foryou?model=rav4&grade=cruiser&colour=graphite&answers=use:family,towing:medium'); const t1 = Date.now();
      try { const r = await HL.api('/api/foryou?model=rav4&grade=cruiser&colour=graphite&answers=use:family,towing:medium', { timeoutMs: 60000 }); show(d2, { answer: r.map((row) => `• ${row.title}: ${row.items.map((i) => i.title).slice(0, 4).join(', ')}\n   query: "${row.query}"`).join('\n'), trace: [{ kind: 'kb', label: t('rows', '{n} rows from /find with model-label mapping, {ms}', { n: r.length, ms: ms(t1) }) }], raw: r.map((row) => ({ ...row, items: row.items.slice(0, 2) })) }); } catch (e) { fail(d2, e); }
    },
    async product(out) {
      const d = step(out, 'GET /api/used/U-33002  (comments written by the agent from the car\'s own resource)'); const t0 = Date.now();
      try { const r = await HL.api('/api/used/U-33002', { timeoutMs: 20000 }); show(d, { answer: `${r.comments.headline}\n\n${r.comments.body}\n\nHighlights: ${r.comments.highlights.join('; ')}${r.comments.honest?.length ? `\nWorth knowing: ${r.comments.honest.join('; ')}` : ''}`, trace: (r.trace || []).concat([{ kind: 'kb', label: `resource ${r.resourceId || '—'}` }, { kind: 'domo', label: r.market ? t('market', 'market: {p} by {n} (median {m}, {s} listings)', { p: r.market.position, n: HL.money(Math.abs(r.market.diff)), m: HL.money(r.market.median), s: r.market.sample }) : 'no market row' }, { kind: 'kb', label: ms(t0) }]), raw: { comments: r.comments, market: r.market, resourceId: r.resourceId }, chips: [{ text: r.comments.by === 'agent' ? t('byagent', 'by: agent, validated against the record') : t('byscript', 'by: scripted fallback'), kind: r.comments.by === 'agent' ? 'kb' : 'warn' }] }); } catch (e) { fail(d, e); }
      const d2 = step(out, 'GET /api/offers  (new-car offers from aged stock with reasons)');
      try { const r = await HL.api('/api/offers', { timeoutMs: 20000 }); const list = Array.isArray(r) ? r : r.offers || []; show(d2, { answer: list.slice(0, 3).map((o) => `• ${o.unitId} ${o.modelId} ${o.gradeId}: ${HL.money(o.price)}, bonus ${HL.money(o.bonus)} — ${o.reason}`).join('\n'), trace: [{ kind: 'domo', label: 'stock_by_site + aged_stock_actions + transfer_feasibility' }], raw: list.slice(0, 3) }); } catch (e) { fail(d2, e); }
    },
    async pricing(out) {
      const d = step(out, 'GET /api/dealer/priorities  (weights derived from Domo dealer_signals, read-only)');
      try { const r = await HL.api('/api/dealer/priorities', { timeoutMs: 20000 }); show(d, { answer: `${t('weights', 'Weights')}: ${Object.entries(r.weights).map(([k, v]) => `${k} ${typeof v === 'object' ? `${v.modelId} ${v.weight}` : v}`).join(' · ')}\n${(r.derivedFrom || []).slice(0, 4).map((x) => `• ${x.signal}: ${x.value}${x.effect ? ` → ${x.effect}` : ''}`).join('\n')}`, trace: [{ kind: 'domo', label: `${r.source} · ${String(r.refreshedAt).slice(0, 10)}` }], raw: r }); } catch (e) { fail(d, e); }
      const d2 = step(out, 'GET /api/promotions/explain  (Domo targets → agent-composed promotions, validated)');
      try { const r = await HL.api('/api/promotions/explain', { timeoutMs: 20000 }); show(d2, { answer: `${r.source}\n\n${(r.targets || []).slice(0, 3).map((x) => `• ${x.target} (${x.type}): ${x.signal}`).join('\n')}`, trace: [{ kind: 'kb', label: `composedBy ${r.composedBy}, ${r.latencyMs} ms` }, { kind: 'domo', label: `signals ${String(r.signalsRefreshedAt).slice(0, 10)}` }], raw: { targets: (r.targets || []).slice(0, 3), promotions: (r.promotions || []).slice(0, 2) } }); } catch (e) { fail(d2, e); }
    },
    async value(out) {
      const d = step(out, 'MOCK  valuation(rego EKP42L) → estimate');
      await new Promise((r) => setTimeout(r, 600));
      show(d, { answer: t('valuemock', '2017 Mazda CX-5 Maxx Sport, 98,450 km → $13,600 – $15,400 (midpoint $14,500).\nBasis: median of comparable sales (Domo · used_market_prices stand-in), kilometres 8,450 under average, condition good, service history not yet verified.\n\nProduction integration: a valuation feed (RedBook or carsales Instant Offer) for the retail reference, the dealer\'s own trade history from the DMS for the realised figures, and the same Domo dataset for the market position.'), chips: [{ text: 'MOCK', kind: 'mock' }, { text: 'Domo · used_market_prices', kind: 'domo' }] });
      const d2 = step(out, 'LIVE  the same document reading in the back office: GET /dms/api/health  (documents table)');
      try { const r = await HL.api('/dms/api/health', { timeoutMs: 10000 }); show(d2, { answer: t('docs', 'The DMS holds {n} documents (contracts, trade-in appraisals, supplier invoices). Uploading one creates a knowledge-box resource; the agent extracts its fields with /ask + answer_json_schema + rag_strategies: full_resource, scores each field against the extracted text and cross-checks the deal, then a person verifies the low-confidence fields. The sample trade-in appraisal TI-30418 (2017 Mazda CX-5) is the real version of the mock above.', { n: r.counts?.documents }), trace: [{ kind: 'kb', label: 'document processing · full_resource · JSON schema' }, { kind: 'dms', label: `arag ${r.arag?.ok ? 'ok' : 'down'} · ${r.counts?.documents} documents` }], raw: r }); } catch (e) { fail(d2, e); }
    },
    async own(out) {
      const q = 'What does the warranty cover on a new RAV4 and for how long?'; const d = step(out, `POST /api/ask  { question: "${q}" }`); const t0 = Date.now();
      try { const r = await HL.api('/api/ask', { method: 'POST', body: { question: q, build: { modelId: 'rav4' } }, timeoutMs: 30000 }); show(d, { answer: r.answer, trace: (r.trace || []).concat([{ kind: 'kb', label: ms(t0) }]), raw: r }); } catch (e) { fail(d, e); }
      const d2 = step(out, 'MOCK  delivery tracker, recall status, equity clock');
      await new Promise((r) => setTimeout(r, 400));
      show(d2, { answer: t('ownmock', 'Tracker stages come from the OEM allocation and shipping feed; recall status from the manufacturer campaign feed by VIN; the equity clock from the DMS finance application (amount financed, term, GFV) and the Domo market median. All three are drawn from the DMS seed and a formula here. The owner\'s manual per VIN is the next resource to ingest so dashboard-light questions get a cited page.'), chips: [{ text: 'MOCK', kind: 'mock' }, { text: 'DMS deals + finance_apps', kind: 'dms' }, { text: 'Domo · used_market_prices', kind: 'domo' }] });
    },
    async backoffice(out) {
      const d = step(out, 'GET /dms/api/openapi.json  (the route table the MCP tools are generated from)');
      try { const r = await HL.api('/dms/api/openapi.json', { timeoutMs: 15000 }); const paths = Object.keys(r.paths || {}); const ops = paths.reduce((n, p) => n + Object.keys(r.paths[p]).length, 0); show(d, { answer: t('openapi', '{t} v{v}: {p} paths, {o} operations. Every operation is also an MCP tool at POST /dms/mcp (stateless Streamable HTTP), so a salesperson\'s copilot in Claude or ChatGPT can search stock, draft a follow-up or read policy with the same role permissions.', { t: r.info?.title, v: r.info?.version, p: paths.length, o: ops }), trace: [{ kind: 'dms', label: `${paths.length} paths` }, { kind: 'kb', label: 'MCP: /dms/mcp + the knowledge box\'s own MCP endpoint' }], raw: { info: r.info, tags: r.tags, samplePaths: paths.slice(0, 12) } }); } catch (e) { fail(d, e); }
      const d2 = step(out, 'GET /api/health  (knowledge box counters)');
      try { const r = await HL.api('/api/health', { timeoutMs: 10000 }); show(d2, { answer: t('kbhealth', 'Knowledge box {id}: {n} resources, {p} processing. One box serves the configurator, the used surface, the owner questions and the back office, scoped by model/* and topic/* labels.', { id: String(r.kb?.id || '').slice(0, 8), n: r.kb?.resources, p: r.kb?.processing }), trace: [{ kind: 'kb', label: `Domo mode: ${r.domo}` }], raw: r }); } catch (e) { fail(d2, e); }
    },
  };

  // ── cards ──────────────────────────────────────────────────────────────────
  const CARDS = [
    { id: 'multilingual', title: t('c.multi', 'Multilingual, everywhere'), sees: t('c.multi.sees', 'Ask in Vietnamese, Mandarin, Arabic or Hindi and get the answer, the finder and the chrome in that language; the corpus stays English.'), live: true,
      kb: [t('f.lang', 'Generative answers in the language of the question over an English corpus'), t('f.schema', '/ask with answer_json_schema so translated finder questions keep fixed option ids'), t('f.history', 'chat_history for multi-turn in any language')], domo: [t('d.langreport', 'Language mix lands in the configurator report dataset (ask events carry a lang code, no text)')], where: ['#/', '#/finder', '#/own'] },
    { id: 'personalised', title: t('c.pers', 'Personalised shopping from the journey'), sees: t('c.pers.sees', '"Because you looked at…", "Because you asked…", "Because you are watching…": rows built from this visit, no account, forgettable in one click.'), live: true,
      kb: [t('f.find', '/find hybrid retrieval with the visitor\'s own words as the query'), t('f.labels', 'model/* and topic/* labels map paragraph hits back to cars'), t('f.memory', 'Session memory (questions, watches, finder answers) passed as extra_context')], domo: [t('d.stock', 'stock_by_site decides which unit leads a row'), t('d.signals', 'dealer_signals weights the finder\'s dealer factor (capped, reason shown)')], where: ['#/', '#/browse', '#/finder'] },
    { id: 'conversational', title: t('c.conv', 'Conversational shopping that acts'), sees: t('c.conv.sees', 'A thread that changes the build, filters the grid, opens a car, books a drive or reserves, and remembers what you asked about each car.'), live: true,
      kb: [t('f.actions', '/ask returns {answer, actions[]} under a JSON schema; actions are validated against the catalogue and stock'), t('f.extra', 'extra_context: the live build, stock summary, promotions and the visitor\'s earlier questions'), t('f.ctxagent', 'A context agent on the retrieval agent can call our /api/stock?q= itself')], domo: [t('d.stocksummary', 'stock_by_site, aged_stock_actions, transfer_feasibility summarised into every answer ("one on the lot in Graphite")')], where: ['#/car/u:U-33050', '#/car/m:rav4'] },
    { id: 'search', title: t('c.search', 'Rich search in plain words'), sees: t('c.search.sees', '"Something to tow a caravan with low kilometres" ranks real cars, new and used, with the reason and the source paragraph.'), live: true,
      kb: [t('f.find2', '/find: semantic + keyword, reranked, over spec sheets, guides and every used listing (each car is a resource with listing, provenance, photo and metadata)'), t('f.filter', 'filter_expression on labels (topic/used, model/rav4) and on a single resource')], domo: [t('d.market', 'used_market_prices → market position chip on each card'), t('d.inbound', 'inbound_pipeline + order_bank_eta → arriving and factory-order options in the same grid')], where: ['#/browse?q=tow%20a%20caravan', '#/browse'] },
    { id: 'product', title: t('c.product', 'Product pages that write themselves'), sees: t('c.product.sees', 'Dealer comments written by the agent from the car\'s own resource, validated against the record; provenance, market position and availability by site.'), live: true,
      kb: [t('f.resource', 'The listing is a resource: text fields listing + provenance, a photo file, origin metadata, labels; the comments are written back as its summary'), t('f.validate', 'Generation under a schema (headline, body, highlights, honest notes), rejected if a figure is not in the record')], domo: [t('d.market2', 'used_market_prices (position vs median)'), t('d.availability', 'stock_by_site + transfer_feasibility (which site, which run day) for new cars'), t('d.aged', 'aged_stock_actions → ready-now bonus with the reason')], where: ['#/car/u:U-33002', '#/car/m:kluger'] },
    { id: 'pricing', title: t('c.pricing', 'Pricing and offers with receipts'), sees: t('c.pricing.sees', 'Offers that say why they exist, promotions composed by the agent from Domo targets, drive-away breakdowns, and a "price with receipts" line on every number.'), live: true,
      kb: [t('f.compose', 'Promotions composed by /ask from accessories, service and finance resources, validated against the catalogue, cached'), t('f.customer-safe', 'A filter blocks margin, age and target language from customer copy')], domo: [t('d.signals2', 'dealer_signals (days of supply, allocation, target gap) → four read-only weights'), t('d.aged2', 'aged_stock_actions → headroom and placement'), t('d.eta', 'order_bank_eta → honest delivery windows')], where: ['#/', '#/car/m:rav4'] },
    { id: 'value', title: t('c.value', 'Value my car, with the working shown'), sees: t('c.value.sees', 'An instant range with every adjustment itemised, a service book "read" to firm it up, and the changeover applied to any car.'), live: false,
      kb: [t('f.docs', 'Document processing (in the back office today): upload → resource → /ask with full_resource and a per-kind schema → confidence per field → human verify'), t('f.tradehist', 'The dealer\'s own trade-in appraisals as resources for grounded comparables')], domo: [t('d.market3', 'used_market_prices for the retail reference'), t('d.tradeins', 'A trade-ins dataset (DMS export) for realised figures')], where: ['#/value'] },
    { id: 'own', title: t('c.own', 'Ownership, from handover to renewal'), sees: t('c.own.sees', 'Delivery tracker, handover pack in your language, "ask your car", recall-aware service booking, and an equity clock that knows when to show you the next car.'), live: 'partial',
      kb: [t('f.manual', 'Warranty, servicing, safety and towing resources answer owner questions with citations; the owner\'s manual per VIN is the next resource'), t('f.handover', 'Handover pack generated from the build, the booking and the visitor\'s questions (session memory)')], domo: [t('d.market4', 'used_market_prices → estimated value today for the equity clock'), t('d.finance', 'DMS finance_apps and deals exported to Domo → trade-cycle timing by cohort')], where: ['#/own'] },
    { id: 'backoffice', title: t('c.back', 'One knowledge layer, staff side too'), sees: t('c.back.sees', 'Every enquiry, reservation and booking lands in the DMS with the visitor\'s journey; the same knowledge box answers staff through the DMS and through MCP tools.'), live: true,
      kb: [t('f.mcp', '54 MCP tools generated from the DMS OpenAPI document + the knowledge box\'s own MCP endpoint'), t('f.agentloop', 'Agent query loop in the DMS: plan → execute tools → answer, ≤4 calls'), t('f.extract', 'Contract and appraisal extraction with cross-checks')], domo: [t('d.datasets', '19 DMS datasets + the configurator and used report datasets, recomputed dealer_signals')], where: ['/dms/', '/dms/api/docs'] },
  ];
  CARDS.forEach((c) => HL.powers.register(c));

  // ── drawer ─────────────────────────────────────────────────────────────────
  function build() {
    if (!styled) { document.head.appendChild(el('style', { text: CSS })); styled = true; }
    const d = document.getElementById('powers'); d.innerHTML = '';
    const demoBtn = el('button', { class: `btn secondary sm ${document.body.classList.contains('demo') ? 'on' : ''}`, onClick: () => { HL.powers.demoMode(); demoBtn.classList.toggle('on', document.body.classList.contains('demo')); } }, t('demomode', 'Demo mode pins'));
    d.appendChild(el('div', { class: 'dh' }, el('div', { class: 'grow' }, el('div', { class: 'kick', text: t('kick', 'What powers this') }), el('h3', { text: t('title', 'Progress Agentic RAG + Domo intelligence, one knowledge layer') })), demoBtn, el('button', { class: 'btn ghost sm icon', 'aria-label': 'Close', onClick: () => HL.drawer('powers', false) }, '✕')));
    const body = el('div', { class: 'db' }); d.appendChild(body);
    const sum = el('div', { class: 'pw-sum' }); body.appendChild(sum);
    const stat = (n, label) => el('div', { class: 's' }, el('b', { class: 'num', text: n ?? '—' }), el('span', { text: label }));
    sum.append(stat('…', t('s.kb', 'KB resources')), stat('…', t('s.sessions', 'sessions, 30 d')), stat('…', t('s.asks', 'questions answered')), stat('…', t('s.bookings', 'drives + enquiries')), stat(String(CARDS.length), t('s.cases', 'use cases')));
    if (HL.online) {
      HL.api('/api/health', { timeoutMs: 8000 }).then((h) => { sum.children[0].firstChild.textContent = String(h.kb?.resources ?? '—'); }).catch(() => {});
      Promise.all([HL.api('/api/report/configurator?days=30', { timeoutMs: 10000 }).catch(() => null), HL.api('/api/used/report?days=30', { timeoutMs: 10000 }).catch(() => null)]).then(([c, u]) => { sum.children[1].firstChild.textContent = String((c?.sessions || 0) + (u?.sessions || 0)); sum.children[2].firstChild.textContent = String((c?.asks?.count ?? c?.asks ?? 0) + (u?.asks || 0)); const enq = u ? Object.values(u.enquiries || {}).reduce((a, b) => a + b, 0) : 0; sum.children[3].firstChild.textContent = String((c?.bookings?.count ?? 0) + enq); });
    } else body.appendChild(el('p', { class: 'pw-note', text: t('offline', 'Offline snapshot: the cards describe each feature; Demonstrate needs the API.') }));
    body.appendChild(el('div', { class: 'row', style: { marginBottom: '12px' } }, chip(t('legend.kb', 'Agentic RAG'), 'kb'), chip(t('legend.domo', 'Domo'), 'domo'), chip(t('legend.mem', 'Session memory'), 'mem'), chip(t('legend.dms', 'DMS'), 'dms'), chip(t('legend.mock', 'MOCK'), 'mock')));
    CARDS.forEach((c, i) => {
      const card = el('div', { class: 'pw-card', id: `pw-${c.id}` });
      const out = el('div', { class: 'pw-demo' });
      const demo = el('button', { class: 'btn primary sm', disabled: !HL.online && c.live === true ? true : null, onClick: async () => { out.innerHTML = ''; demo.disabled = true; try { await DEMOS[c.id](out); } finally { demo.disabled = false; } } }, t('demonstrate', 'Demonstrate'), el('span', { class: 'arrow' }, '→'));
      card.append(
        el('button', { class: 'pw-head', 'aria-expanded': 'false', onClick: () => { card.classList.toggle('open'); card.firstChild.setAttribute('aria-expanded', String(card.classList.contains('open'))); } }, el('span', { class: 'n', text: String(i + 1) }), el('span', { class: 'grow' }, el('b', { text: c.title }), el('span', { class: 'sees', text: c.sees })), chip(c.live === true ? t('live', 'LIVE') : c.live === 'partial' ? t('partial', 'LIVE + MOCK') : t('mock', 'MOCK'), c.live === true ? 'good' : c.live === 'partial' ? 'warn' : 'mock'), el('span', { class: 'tw', text: '⌄' })),
        el('div', { class: 'pw-body' },
          el('div', { class: 'pw-cols' }, el('div', { class: 'pw-col kb' }, el('h5', { text: t('col.kb', 'Agentic RAG') }), el('ul', null, c.kb.map((x) => el('li', { text: x })))), el('div', { class: 'pw-col domo' }, el('h5', { text: t('col.domo', 'Domo') }), el('ul', null, c.domo.map((x) => el('li', { text: x }))))),
          el('div', null, el('div', { class: 'kick', style: { marginBottom: '6px' }, text: t('where', 'Where you see it') }), el('div', { class: 'pw-where' }, c.where.map((h) => el('a', { href: h, text: h, onClick: () => { if (h.startsWith('#')) HL.drawer('powers', false); } })))),
          el('div', { class: 'row' }, demo, el('span', { class: 'pw-note', text: c.live === true ? t('demonote', 'Fires the real call and shows the response and its trace.') : c.live === 'partial' ? t('demonotepartial', 'One live call, then the mocked parts explained.') : t('demonotemock', 'Plays a scripted response marked MOCK and names the production integration.') })),
          out));
      body.appendChild(card);
    });
    built = true;
  }
  HL.bus.on('powers:open', (id) => {
    if (!built) build();
    const d = document.getElementById('powers');
    d.querySelectorAll('.pw-card').forEach((c) => c.classList.remove('open'));
    if (id) { const c = d.querySelector(`#pw-${id}`); if (c) { c.classList.add('open'); c.firstChild.setAttribute('aria-expanded', 'true'); setTimeout(() => c.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); } }
  });
  // Deep link: #/?powers=<card id> opens the drawer on that card; &demo=1 also runs its demonstration (used by the demo script and headless checks).
  HL.bus.on('ready', () => { const q = HL.route().query; if (q.powers) { HL.powers.open(q.powers); if (q.demo === '1') setTimeout(() => document.querySelector(`#pw-${q.powers} .btn.primary`)?.click(), 600); } });
  HL.bus.on('lang', () => { built = false; if (document.getElementById('powers').classList.contains('open')) build(); });
  HL.bus.on('online', () => { built = false; });
})();
