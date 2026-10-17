/* Harbourline One — Find my car (#/finder): one branching interview across new and used. Agent B. */
(function () {
  'use strict';
  const { el, chip } = HL.ui;
  const t = (k, f, v) => HL.t(`finder.${k}`, f, v);
  const css = `
.fd-wrap{max-width:860px;margin:0 auto}
.fd-prog{display:flex;align-items:center;gap:10px;font-size:.84rem;color:var(--muted)}
.fd-prog .bar{flex:1;height:4px;border-radius:2px;background:var(--line);overflow:hidden} .fd-prog .bar i{display:block;height:100%;background:var(--red);transition:width .4s var(--ease)}
.fd-q{display:grid;gap:18px;animation:fi .35s var(--ease) both}
.fd-q h1{font-size:clamp(1.6rem,3.6vw,2.6rem)}
.fd-opts{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr))}
.fd-opt{display:grid;gap:4px;text-align:left;padding:18px 18px 16px;border:1px solid var(--line);border-radius:var(--r-lg);background:var(--paper);transition:border-color .15s,transform .15s var(--ease),box-shadow .2s;min-height:104px}
.fd-opt:hover{border-color:var(--ink);transform:translateY(-2px);box-shadow:var(--shadow)}
.fd-opt .l{font-family:var(--display);font-weight:700;font-size:1.08rem} .fd-opt .s{font-size:.86rem;color:var(--muted)} .fd-opt .n{font-size:.76rem;color:var(--amber);font-weight:600;margin-top:4px}
.fd-why{display:flex;gap:10px;align-items:flex-start;font-size:.9rem;color:var(--ink-2);padding:12px 14px;border-radius:var(--r);background:var(--canvas-2)}
.fd-res{display:grid;gap:28px}
.fd-sum{display:grid;gap:10px;padding:22px;border-radius:var(--r-xl);background:linear-gradient(135deg,var(--canvas-2),var(--paper));border:1px solid var(--line)}
.fd-sum p{font-size:1.1rem;line-height:1.55;max-width:70ch}
.fd-fit{position:absolute;top:10px;right:10px;z-index:2;display:inline-grid;place-items:center;width:46px;height:46px;border-radius:50%;background:var(--ink);color:var(--canvas);font:800 .82rem var(--display);box-shadow:var(--shadow)}
.fd-nudge{display:flex;gap:8px;align-items:flex-start;font-size:.84rem;padding:10px 12px;border-radius:var(--r);background:var(--domo-soft);color:var(--ink-2)}
.fd-watch{font-size:.82rem;color:var(--amber)}
.fd-wait{display:grid;gap:10px;justify-items:center;padding:40px 0;color:var(--muted)}
.fd-wait .dots i{display:inline-block;width:8px;height:8px;margin:0 3px;border-radius:50%;background:var(--red);animation:fdb 1s infinite} .fd-wait .dots i:nth-child(2){animation-delay:.15s} .fd-wait .dots i:nth-child(3){animation-delay:.3s}
@keyframes fdb{50%{opacity:.25;transform:translateY(-3px)}}
`;
  const style = () => { if (!document.getElementById('fd-style')) document.head.appendChild(el('style', { id: 'fd-style', text: css })); };

  // ── mapping new-finder answers → used finder answers ────────────────────────
  const numsIn = (s) => (String(s).match(/\d+(?:\.\d+)?/g) || []).map((n) => Number(n) * (/k\b/i.test(s) || Number(n) < 1000 ? 1000 : 1));
  const budgetBand = (a) => { if (!a) return null; const ns = numsIn(a.label || a.value); if (!ns.length) return null; const max = /under|below|less/i.test(a.label || '') ? ns[0] : Math.max(...ns); return max <= 30000 ? 'under-30k' : max <= 45000 ? '30-45k' : max <= 65000 ? '45-65k' : '65k-plus'; };
  const has = (a, re) => re.test(`${a.value} ${a.label || ''}`.toLowerCase());
  function mapToUsed(answers) {
    const by = Object.fromEntries(answers.map((a) => [a.id, a]));
    const out = [];
    const b = budgetBand(by.budget); if (b) out.push({ id: 'budget', value: b });
    if (by.use) { const a = by.use; out.push({ id: 'use', value: has(a, /commut|city/) ? 'commute' : has(a, /famil/) ? 'family' : has(a, /tow/) ? 'work' : has(a, /work|off-road|offroad|trade/) ? 'adventure' : has(a, /fun|sport|enjoy|perform/) ? 'fun' : 'family' }); }
    if (by.people) out.push({ id: 'people', value: has(by.people, /7|seven|more|six|8/) ? 'seven' : 'five' });
    if (by.towing && !has(by.towing, /no-towing|^none|\bno\b|don't|dont/)) out.push({ id: 'towing', value: has(by.towing, /over-2t|heavy|3[,.]?5|2[,.]?5/) ? 'heavy' : has(by.towing, /up-to-2t|caravan|boat|camper|medium|1[,.]?5|2[,.]?0/) ? 'medium' : 'light' });
    if (by.power) out.push({ id: 'power', value: has(by.power, /hybrid/) ? 'hybrid' : has(by.power, /\bev\b|electric|battery/) ? 'electric' : 'any' });
    if (by.terrain && !has(by.terrain, /sealed|bitumen|tarmac|city/)) out.push({ id: 'terrain', value: has(by.terrain, /off-?road|track|beach|serious|proper|rough/) ? 'offroad' : 'gravel' });
    if (by.priorities) out.push({ id: 'priorities', value: has(by.priorities, /price|cheap|budget|value/) ? 'price' : has(by.priorities, /safe|warrant|reliab/) ? 'certified' : has(by.priorities, /new|tech|latest/) ? 'newest' : 'low-km' });
    if (by.when) out.push({ id: 'when', value: has(by.when, /now|week|asap|soon|immediately/) ? 'this-week' : has(by.when, /month/) ? 'this-month' : 'looking' });
    return out;
  }

  // ── scene ───────────────────────────────────────────────────────────────────
  HL.scene('finder', {
    mount(root, r) {
      style();
      const wrap = el('div', { class: 'wrap section' }); const box = el('div', { class: 'fd-wrap stack' }); wrap.appendChild(box); root.appendChild(wrap);
      const st = { answers: [], usedAnswers: [], phase: 'new', step: 1, question: null, usedQuestion: null, results: null, usedResults: null, trace: [] };
      const cache = new Map();
      const key = (answers) => JSON.stringify(answers.map((a) => [a.id, a.value]));
      const fetchNext = (answers, prefetch) => { const k = key(answers); if (cache.has(k)) return cache.get(k); const p = HL.api('/api/finder/next', { method: 'POST', body: { answers, lang: HL.state.lang }, headers: prefetch ? { 'x-prefetch': '1' } : {}, timeoutMs: 45000 }).catch((e) => { cache.delete(k); throw e; }); cache.set(k, p); return p; };

      const wait = (msg) => { box.innerHTML = ''; box.appendChild(el('div', { class: 'fd-wait' }, el('div', { class: 'dots' }, el('i'), el('i'), el('i')), el('p', { text: msg }))); };
      const progress = (n, total, label) => el('div', { class: 'fd-prog' }, el('span', { text: label }), el('div', { class: 'bar' }, el('i', { style: { width: `${Math.round((n / total) * 100)}%` } })), el('span', { class: 'num', text: `${n} / ${total}` }));

      const renderQuestion = (q, { total, n, onPick, back, kicker }) => {
        box.innerHTML = '';
        const sec = el('div', { class: 'fd-q' }, progress(n, total, kicker), el('div', null, el('div', { class: 'kick' }, t('kick', 'Find my car')), el('h1', { text: q.text })), q.why ? el('div', { class: 'fd-why' }, chip(t('why', 'Why we ask'), 'kb'), el('span', { text: q.why })) : null,
          el('div', { class: 'fd-opts' }, (q.options || []).map((o) => el('button', { class: 'fd-opt', onClick: () => onPick(o) }, el('span', { class: 'l', text: o.label }), o.sub ? el('span', { class: 's', text: o.sub }) : null, o.note ? el('span', { class: 'n', text: o.note }) : null))),
          el('div', { class: 'row between' }, back ? el('button', { class: 'btn ghost sm', onClick: back }, `← ${t('back', 'Back')}`) : el('span'), el('span', { class: 'small muted' }, st.phase === 'new' ? chip(t('agentq', 'Question written by the agent from your answers so far'), 'kb') : chip(t('usedq', 'Pre-owned follow-up · scored against real stock'), 'dms'))));
        box.appendChild(HL.spot(sec, 'conversational', t('spot.interview', 'Branching interview')));
      };

      // phase 1: new-car finder
      const askNew = async () => {
        if (!HL.online) { box.innerHTML = ''; box.appendChild(HL.ui.empty(t('offline', 'The finder needs the API: the agent writes each question from your previous answers.'), t('browse', 'Browse instead'), () => HL.go('#/browse'))); return; }
        wait(t('thinking', 'Choosing the next question from what you have told us…'));
        let res; try { res = await fetchNext(st.answers, false); } catch (e) { box.innerHTML = ''; box.appendChild(HL.ui.empty(`${t('err', 'The finder did not answer')}: ${e.message}`, t('retry', 'Try again'), askNew)); return; }
        if (res.done) { st.results = res; st.trace = res.trace || []; HL.journey({ answers: st.answers }); return askUsed(); }
        st.question = res.question; st.step = res.step || st.answers.length + 1;
        renderQuestion(res.question, { total: res.of || 5, n: st.step, kicker: t('phase.new', 'Your needs'), back: st.answers.length ? () => { st.answers.pop(); askNew(); } : null, onPick: (o) => { const a = { id: res.question.id, value: o.id, label: o.label }; st.answers.push(a); HL.remember('answers', a); askNew(); } });
        // prefetch each option's next question
        for (const o of res.question.options || []) fetchNext(st.answers.concat({ id: res.question.id, value: o.id, label: o.label }), true).catch(() => {});
      };
      // phase 2: used match with mapped answers; ask only what cannot be mapped
      const askUsed = async () => {
        st.phase = 'used'; if (!st.usedAnswers.length) st.usedAnswers = mapToUsed(st.answers);
        wait(t('matching', 'Matching pre-owned stock to the same answers…'));
        let res; try { res = await HL.api('/api/used/match', { method: 'POST', body: { answers: st.usedAnswers, lang: HL.state.lang }, timeoutMs: 30000 }); } catch (e) { st.usedResults = { results: [], summary: '', error: e.message }; return renderResults(); }
        if (res.done) { st.usedResults = res; return renderResults(); }
        const q = res.question;
        renderQuestion({ id: q.id, text: q.text, why: q.why, options: q.options }, { total: 5, n: Math.min(5, st.usedAnswers.length + 1), kicker: t('phase.used', 'Pre-owned follow-up'), back: () => { if (st.usedAnswers.length) { st.usedAnswers.pop(); askUsed(); } else { st.answers.pop(); st.phase = 'new'; askNew(); } }, onPick: (o) => { st.usedAnswers.push({ id: q.id, value: o.id }); askUsed(); } });
      };

      const renderResults = () => {
        box.innerHTML = ''; box.className = 'stack';
        const recs = st.results?.recommendations || []; const used = st.usedResults?.results || [];
        const agentWrote = (st.trace || []).some((x) => x.kind === 'kb' && /recommend|summary|agent/i.test(x.label)) || (st.usedResults?.trace || [])[0]?.kind === 'kb';
        const summary = el('div', { class: 'fd-sum' }, el('div', { class: 'row' }, el('span', { class: 'kick' }, t('res.kick', 'Your shortlist')), chip(agentWrote ? t('res.agent', 'Summary written by the agent') : t('res.scripted', 'Summary scripted'), agentWrote ? 'kb' : 'dms')), el('p', { text: st.results?.summary || st.usedResults?.summary || '' }), st.usedResults?.summary && st.results?.summary ? el('p', { class: 'small muted', text: st.usedResults.summary }) : null, el('div', { class: 'row' }, ...st.answers.map((a) => chip(a.label || a.value, 'outline'))), HL.ui.trace([...(st.trace || []), ...(st.usedResults?.trace || [])].slice(0, 4)));
        box.appendChild(summary);
        const grid = el('div', { class: 'fd-res' });
        if (recs.length) {
          const cards = recs.map((r) => { const m = HL.model(r.modelId); if (!m) return null; const g = HL.grade(r.modelId, r.gradeId); const card = HL.ui.modelCard(m, { title: `Toyota ${m.name} ${g?.name || ''}`.trim(), price: g?.price || m.fromPrice, priceNote: t('res.driveaway', 'drive-away estimate'), reason: (r.why || []).join(' · '), href: `#/car/m:${m.id}`, trace: [{ kind: 'kb', label: t('res.whykb', 'Reasons · agent from the knowledge box') }] }); card.prepend(el('span', { class: 'fd-fit num', text: `${r.fit}%` })); if (r.nudge?.reason) card.querySelector('.body').appendChild(HL.spot(el('div', { class: 'fd-nudge' }, chip('Domo', 'domo'), el('span', { text: `${t('res.nudge', 'Why Harbourline can make this easy now')}: ${r.nudge.reason}` })), 'pricing', t('res.nudge', 'Why Harbourline can make this easy now'), 'domo')); if (r.watch?.length) card.querySelector('.body').appendChild(el('p', { class: 'fd-watch', text: `${t('res.watch', 'Watch')}: ${r.watch.join(' · ')}` })); return card; }).filter(Boolean);
          grid.appendChild(el('section', { class: 'stack' }, el('div', null, el('div', { class: 'kick' }, t('res.new.kick', 'New')), el('h2', { text: t('res.new', 'Built for you, or on the lot now') })), el('div', { class: 'grid g3' }, cards)));
        }
        const usedSec = el('section', { class: 'stack' }, el('div', null, el('div', { class: 'kick' }, t('res.used.kick', 'Pre-owned')), el('h2', { text: used.length ? t('res.used', 'Here now, scored against your answers') : t('res.used.none', 'Nothing pre-owned fits yet') })));
        if (used.length) usedSec.appendChild(el('div', { class: 'grid g3' }, used.map((x) => { const card = HL.ui.unitCard(x.card, { reason: (x.why || []).join(' · ') }); card.prepend(el('span', { class: 'fd-fit num', text: `${x.fit}%` })); if (x.watch?.length) card.querySelector('.body').appendChild(el('p', { class: 'fd-watch', text: `${t('res.watch', 'Watch')}: ${x.watch.join(' · ')}` })); return card; })));
        if (used.length < 3) usedSec.appendChild(el('div', { class: 'row' }, el('button', { class: 'btn secondary', onClick: async () => { if (!HL.online) return HL.ui.toast(t('offline.short', 'Offline')); try { const r = await HL.api('/api/used/watch', { method: 'POST', body: { criteria: st.usedResults?.criteria || {} } }); HL.remember('watches', { kind: 'criteria', criteria: st.usedResults?.criteria || {} }); HL.ui.toast(t('res.watching', 'Watching this search · {n} cars match today', { n: r.matchesNow })); } catch (e) { HL.ui.toast(e.message); } } }, `☆ ${t('res.watchsearch', 'Watch this search')}`), el('span', { class: 'small muted', text: t('res.watchwhy', 'We will tell you when a trade-in or arrival matches.') })));
        grid.appendChild(usedSec);
        box.appendChild(HL.spot(grid, 'personalised', t('spot.results', 'Results ranked for you')));
        box.appendChild(el('div', { class: 'row' }, el('button', { class: 'btn ghost', onClick: () => { st.answers = []; st.usedAnswers = []; st.phase = 'new'; st.results = null; st.usedResults = null; box.className = 'fd-wrap stack'; askNew(); } }, `↺ ${t('again', 'Start again')}`), el('button', { class: 'btn', onClick: () => HL.assistant.open(t('res.askopen', 'Tell me more about my shortlist')) }, t('res.ask', 'Talk it through'))));
        HL.powers.refreshPins();
      };

      if (r.query.restart) { st.answers = []; }
      askNew();
    },
    unmount() {},
  });
})();
