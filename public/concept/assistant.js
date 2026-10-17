/* Harbourline One — conversational shopping overlay (Agent C). Lives in <aside id="assistant" class="drawer">.
   Talks to /api/ask (new cars, build-aware), /api/used/:stockNo/ask (a car on the lot) and /api/used/ask (the used range),
   renders citations + trace + actions, acts on actions, recognises a few intents locally, remembers the thread per session. */
(function () {
  'use strict';
  const { el, chip, trace: traceEl, toast } = HL.ui;
  const T = (k, d, v) => HL.t(k, d, v);

  // ── styles (scoped, tokens only) ──────────────────────────────────────────
  const css = `
  .as-root{display:flex;flex-direction:column;height:100%;min-height:0}
  .as-head{display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--hair);flex:none}
  .as-av{width:38px;height:38px;border-radius:50%;background:var(--red);color:#fff;display:grid;place-items:center;font:800 .82rem var(--display);flex:none}
  .as-title{font-family:var(--display);font-weight:700;font-size:1.05rem;letter-spacing:-.01em;line-height:1.15}
  .as-sub{font-size:.76rem;color:var(--muted);margin-top:2px}
  .as-scope{display:flex;align-items:center;gap:8px;padding:10px 20px;background:var(--canvas-2);border-bottom:1px solid var(--hair);font-size:.84rem;flex:none}
  .as-scope b{font-weight:600}
  .as-scope button{color:var(--red);font-weight:600;font-size:.8rem}
  .as-thread{flex:1;min-height:0;overflow-y:auto;padding:20px 20px 8px;display:flex;flex-direction:column;gap:14px;scroll-behavior:smooth}
  .as-msg{display:flex;flex-direction:column;gap:8px;max-width:92%;animation:fi .3s var(--ease) both}
  .as-msg.user{align-self:flex-end;align-items:flex-end}
  [dir="rtl"] .as-msg.user{align-self:flex-start;align-items:flex-start}
  .as-bubble{padding:12px 16px;border-radius:18px;line-height:1.55;font-size:.95rem;white-space:pre-wrap;word-wrap:break-word}
  .as-msg.user .as-bubble{background:var(--ink);color:var(--canvas);border-bottom-right-radius:6px}
  .as-msg.bot .as-bubble{background:var(--canvas-2);color:var(--ink);border-bottom-left-radius:6px}
  .as-msg.bot.err .as-bubble{background:var(--amber-soft);color:var(--amber)}
  .as-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  .as-cite{cursor:pointer}
  .as-cite-open{font-size:.78rem;color:var(--muted);padding:6px 10px;border-left:2px solid var(--kb);background:var(--kb-soft);border-radius:0 var(--r) var(--r) 0}
  .as-actions{display:flex;flex-wrap:wrap;gap:8px}
  .as-typing{display:flex;flex-direction:column;gap:6px;padding:12px 16px;border-radius:18px;background:var(--canvas-2);font-size:.82rem;color:var(--muted);max-width:92%}
  .as-typing .st{display:flex;align-items:center;gap:8px;opacity:.45;transition:opacity .3s}
  .as-typing .st.on{opacity:1;color:var(--ink)}
  .as-typing .st i{width:6px;height:6px;border-radius:50%;background:currentColor}
  .as-typing .st.on i{animation:pulse 1s infinite}
  .as-foot{flex:none;border-top:1px solid var(--hair);padding:12px 16px 14px;display:flex;flex-direction:column;gap:10px;background:var(--paper)}
  .as-sugg{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}
  .as-sugg::-webkit-scrollbar{display:none}
  .as-sugg button{flex:none;padding:6px 12px;border-radius:999px;border:1px solid var(--line);font-size:.8rem;color:var(--ink-2);background:var(--paper);white-space:nowrap}
  .as-sugg button:hover{border-color:var(--ink)}
  .as-compose{display:flex;align-items:flex-end;gap:8px;padding:6px 6px 6px 14px;border:1px solid var(--line);border-radius:22px;background:var(--canvas)}
  .as-compose:focus-within{border-color:var(--ink)}
  .as-compose textarea{flex:1;min-width:0;border:0;background:transparent;resize:none;padding:8px 0;max-height:140px;font-size:.95rem;line-height:1.4;outline:none}
  .as-compose textarea::placeholder{color:var(--subtle)}
  .as-ib{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;flex:none;color:var(--muted);transition:background .15s,color .15s}
  .as-ib:hover{background:var(--canvas-2);color:var(--ink)}
  .as-ib.send{background:var(--red);color:#fff}
  .as-ib.send:hover{background:var(--red-2)}
  .as-ib.rec{background:var(--red-soft);color:var(--red);animation:pulse 1.2s infinite}
  .as-note{font-size:.72rem;color:var(--subtle);text-align:center}
  .as-welcome{background:var(--canvas-2);border-radius:18px;padding:16px;display:grid;gap:10px}
  .as-welcome h4{font-size:1rem}
  .as-welcome ul{margin:0;padding-left:18px;font-size:.88rem;color:var(--ink-2)}
  `;
  if (!document.getElementById('as-style')) { const s = document.createElement('style'); s.id = 'as-style'; s.textContent = css; document.head.appendChild(s); }

  // ── state ─────────────────────────────────────────────────────────────────
  let built = false; let thread; let composer; let suggBox; let scopeBar; let micBtn;
  let busy = false; let recog = null;
  let history = []; // [{role:'user'|'assistant', content}]
  try { history = JSON.parse(sessionStorage.getItem('hl1-chat') || '[]'); } catch { history = []; }
  const saveHistory = () => { try { sessionStorage.setItem('hl1-chat', JSON.stringify(history.slice(-16))); } catch { /* ignore */ } };

  // ── language detection ────────────────────────────────────────────────────
  const detectLang = (s) => {
    if (/[一-鿿㐀-䶿]/.test(s)) return 'zh';
    if (/[؀-ۿ]/.test(s)) return 'ar';
    if (/[ऀ-ॿ]/.test(s)) return 'hi';
    if (/[ăâđêôơưĂÂĐÊÔƠƯạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(s) || /\b(không|của|được|xe|có|cho|tôi|và)\b/i.test(s)) return 'vi';
    return 'en';
  };
  const LANG_WORDS = { zh: /\b(chinese|mandarin|中文|汉语|普通话)\b/i, vi: /\b(vietnamese|tiếng việt)\b/i, ar: /\b(arabic|العربية)\b/i, hi: /\b(hindi|हिन्दी|हिंदी)\b/i, en: /\b(english)\b/i };

  // ── model detection ───────────────────────────────────────────────────────
  const modelsIn = (text) => {
    const s = text.toLowerCase().replace(/[-_]/g, ' ');
    return (HL.data?.catalog?.models || []).filter((m) => {
      const names = [m.name.toLowerCase(), m.id.replace(/-/g, ' ')];
      if (m.id === 'landcruiser-300') names.push('landcruiser', 'land cruiser', 'lc300', 'lc 300');
      if (m.id === 'prado') names.push('land cruiser prado');
      return names.some((n) => s.includes(n));
    }).filter((m, i, arr) => !(m.id === 'corolla' && arr.some((x) => x.id === 'corolla-cross') && !/corolla(?!\s*cross)/i.test(text.replace(/corolla\s*cross/gi, ''))) && !(m.id === 'yaris-cross' && false));
  };
  const USED_RE = /\b(used|pre[- ]?owned|second[- ]?hand|demo|ex[- ]demo|certified|km|kilometres|kilometers|owner|owners|service history|logbook|ppsr|stock number|u-\d{5}|二手|xe cũ|مستعمل|पुरानी)\b/i;

  // ── DOM ───────────────────────────────────────────────────────────────────
  function build() {
    if (built) return; built = true;
    const aside = document.getElementById('assistant'); aside.innerHTML = '';
    const root = el('div', { class: 'as-root' });
    root.appendChild(el('div', { class: 'as-head' },
      el('span', { class: 'as-av' }, 'HL'),
      el('div', { class: 'grow' }, el('div', { class: 'as-title', text: T('as.title', 'Harbourline assistant') }), el('div', { class: 'as-sub', text: T('as.sub', 'Answers with sources · acts on the page · any language') })),
      el('button', { class: 'btn ghost sm icon', 'aria-label': T('as.close', 'Close'), onClick: () => HL.drawer('assistant', false) }, '✕')));
    scopeBar = el('div', { class: 'as-scope' }); scopeBar.hidden = true; root.appendChild(scopeBar);
    thread = el('div', { class: 'as-thread', role: 'log', 'aria-live': 'polite' }); HL.spot(thread, 'conversational', 'Conversational shopping');
    root.appendChild(thread);
    suggBox = el('div', { class: 'as-sugg' });
    composer = el('textarea', { rows: 1, placeholder: T('as.placeholder', 'Ask about any car, in any language…'), 'aria-label': T('as.placeholder', 'Ask about any car, in any language…'), onInput: autogrow, onKeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } } });
    micBtn = el('button', { class: 'as-ib', title: T('as.mic', 'Speak'), 'aria-label': T('as.mic', 'Speak'), onClick: toggleMic }, '🎤');
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) micBtn.disabled = true;
    root.appendChild(el('div', { class: 'as-foot' }, suggBox,
      el('div', { class: 'as-compose' }, composer, micBtn, el('button', { class: 'as-ib send', title: T('as.send', 'Send'), 'aria-label': T('as.send', 'Send'), onClick: submit }, '↑')),
      el('div', { class: 'as-note', text: T('as.note', 'Replies come from the knowledge box with citations. Nothing you type leaves this prototype except your question.') })));
    aside.appendChild(root);
    renderScope(); renderSuggestions();
    if (history.length) { for (const m of history.slice(-16)) addMsg(m.role === 'user' ? 'user' : 'bot', m.content, m.extra || {}, false); }
    else welcome();
  }
  function autogrow() { composer.style.height = 'auto'; composer.style.height = Math.min(140, composer.scrollHeight) + 'px'; }

  function renderScope() {
    if (!scopeBar) return;
    const s = HL.assistant.scope;
    scopeBar.innerHTML = ''; scopeBar.hidden = !s;
    if (s) scopeBar.append(el('span', { class: 'grow' }, T('as.about', 'About:'), ' ', el('b', { text: s.title || s.id })), el('button', { onClick: () => HL.assistant.setScope(null) }, T('as.change', 'Ask about everything')));
    renderSuggestions();
  }
  function renderSuggestions() {
    if (!suggBox) return;
    suggBox.innerHTML = '';
    const s = HL.assistant.scope; const j = HL.state.journey;
    let list;
    if (s?.kind === 'unit') list = [T('as.s.service', 'Has it had all its services?'), T('as.s.accident', 'Any accident or finance history?'), T('as.s.tow', 'Can I tow with it?'), T('as.s.price', 'Why this price?'), T('as.s.warranty', 'What warranty comes with it?')];
    else if (s?.kind === 'model') list = [T('as.s.grades', 'What does the top grade add?'), T('as.s.stock', 'Which colours are on the lot?'), T('as.s.towing', 'How much can it tow?'), T('as.s.eta', 'How long is a factory order?'), T('as.s.safety', 'What safety kit is standard?')];
    else {
      list = [T('as.s.seven', 'Which hybrids seat seven?'), T('as.s.under45', 'Show me SUVs under $45,000'), T('as.s.caravan', 'What can tow a 2.5 tonne caravan?'), T('as.s.holidays', 'Can I have a car before the school holidays?'), T('as.s.vi', 'Nói tiếng Việt')];
      if (j.viewed?.length) list.unshift(T('as.s.compare', 'Compare the cars I looked at'));
    }
    for (const q of list) suggBox.appendChild(el('button', { onClick: () => { composer.value = q; autogrow(); submit(); } }, q));
  }

  function welcome() {
    const j = HL.state.journey; const items = [];
    if (j.viewed?.length) { const v = j.viewed[j.viewed.length - 1]; items.push(T('as.w.viewed', 'You were looking at {car}; ask me anything about it.', { car: v.title || v.id })); }
    if (j.answers?.length) items.push(T('as.w.answers', 'I have your finder answers, so I can shortlist against real stock.'));
    if (j.asked?.length) items.push(T('as.w.asked', 'I remember your earlier questions this visit.'));
    if (!items.length) items.push(T('as.w.new', 'Ask about a model, a car on the lot, towing, finance or timing. I answer with sources and can change the page for you.'));
    const w = el('div', { class: 'as-welcome' }, el('h4', { text: T('as.w.title', 'Hello. I am the Harbourline assistant.') }), el('ul', null, items.map((t) => el('li', { text: t }))), el('div', { class: 'as-meta' }, chip(T('as.w.kb', 'Knowledge box'), 'kb'), chip(T('as.w.domo', 'Live stock via Domo'), 'domo'), chip(T('as.w.mem', 'Session memory'), 'mem')));
    thread.appendChild(el('div', { class: 'as-msg bot' }, w));
  }

  function addMsg(role, text, extra = {}, scroll = true) {
    const m = el('div', { class: `as-msg ${role}${extra.error ? ' err' : ''}` }, el('div', { class: 'as-bubble', text }));
    if (role === 'bot') {
      const cites = (extra.citations || []).filter((c) => c && c.title);
      const tr = (extra.trace || []).map((t) => ({ label: t.label, kind: t.kind === 'memory' ? 'mem' : t.kind === 'dms' ? 'dms' : t.kind === 'domo' ? 'domo' : 'kb' }));
      if (cites.length || tr.length) {
        const meta = el('div', { class: 'as-meta' });
        cites.forEach((c, i) => { const ch = chip(`${T('as.source', 'Source')} ${i + 1}`, 'kb as-cite', c.title); ch.onclick = () => { const open = m.querySelector(`.as-cite-open[data-i="${i}"]`); if (open) open.remove(); else m.appendChild(el('div', { class: 'as-cite-open', dataset: { i: String(i) } }, c.title, c.topic ? ` · ${c.topic}` : '')); }; meta.appendChild(ch); });
        if (extra.by === 'scripted' || extra.mock) meta.appendChild(chip(extra.mock ? 'MOCK' : T('as.scripted', 'Scripted answer'), 'mock'));
        tr.forEach((t) => meta.appendChild(chip(t.label, t.kind)));
        m.appendChild(meta);
      }
      const acts = (extra.actions || []).filter(Boolean);
      if (acts.length) m.appendChild(el('div', { class: 'as-actions' }, acts.map((a) => el('button', { class: 'btn sm secondary', onClick: () => runAction(a, extra.scope) }, a.label || a.type))));
    }
    thread.appendChild(m);
    if (scroll) thread.scrollTop = thread.scrollHeight;
    return m;
  }
  function typing() {
    const stages = [T('as.t1', 'Reading the knowledge box'), T('as.t2', 'Checking stock and your journey'), T('as.t3', 'Writing')];
    const box = el('div', { class: 'as-typing' }, stages.map((s) => el('div', { class: 'st' }, el('i'), s)));
    thread.appendChild(box); thread.scrollTop = thread.scrollHeight;
    let i = 0; const rows = box.querySelectorAll('.st'); rows[0].classList.add('on');
    const iv = setInterval(() => { i = Math.min(i + 1, rows.length - 1); rows.forEach((r, k) => r.classList.toggle('on', k <= i)); }, 2200);
    return () => { clearInterval(iv); box.remove(); };
  }

  // ── actions ───────────────────────────────────────────────────────────────
  function runAction(a, scope) {
    const b = HL.state.build;
    switch (a.type) {
      case 'model': HL.set({ build: Object.assign({}, b, { modelId: a.value, gradeId: HL.model(a.value)?.grades?.[0]?.id || null, packs: [] }) }); HL.track('build_change', { modelId: a.value, gradeId: HL.state.build.gradeId }); toast(T('as.a.model', 'Build switched to the {m}', { m: HL.model(a.value)?.name || a.value })); HL.go(`#/car/m:${a.value}`); break;
      case 'grade': { const mid = [b.modelId, scope?.kind === 'model' ? scope.id : null, ...modelsIn(a.label || '').map((m) => m.id)].find((id) => id && HL.grade(id, a.value)) || b.modelId; HL.set({ build: Object.assign({}, b, { modelId: mid, gradeId: a.value }) }); HL.track('build_change', { modelId: mid, gradeId: a.value }); toast(T('as.a.grade', 'Grade set to {g}', { g: HL.grade(mid, a.value)?.name || a.value })); HL.go(`#/car/m:${mid}`); break; }
      case 'pack': { const packs = b.packs.includes(a.value) ? b.packs : b.packs.concat(a.value); HL.set({ build: Object.assign({}, b, { packs }) }); HL.track('build_change', { modelId: b.modelId, gradeId: b.gradeId, packs }); toast(T('as.a.pack', 'Pack added to your build')); HL.go(`#/car/m:${b.modelId}`); break; }
      case 'unit': { const u = (HL.data?.stock?.stock_by_site || []).find((x) => x.id === a.value); if (u) { HL.set({ build: Object.assign({}, b, { modelId: u.model, gradeId: u.grade, colourId: u.colour }) }); HL.track('offer_click', { unitId: u.id }); HL.go(`#/car/m:${u.model}?unit=${u.id}`); } break; }
      case 'open': if (a.stockNo) HL.go(`#/car/u:${a.stockNo}`); else if (a.modelId) HL.go(`#/car/m:${a.modelId}`); break;
      case 'book': case 'enquire': case 'finance': case 'reserve': case 'watch': { const target = a.stockNo ? `#/car/u:${a.stockNo}` : scope?.kind === 'unit' ? `#/car/u:${scope.id}` : `#/car/m:${a.modelId || scope?.id || b.modelId}`; HL.go(target); setTimeout(() => HL.bus.emit('assistant:action', Object.assign({}, a, { stockNo: a.stockNo || (scope?.kind === 'unit' ? scope.id : null) })), 350); HL.drawer('assistant', false); break; }
      case 'match': HL.go('#/finder'); HL.drawer('assistant', false); break;
      case 'browse': HL.go(`#/browse?q=${encodeURIComponent(a.q || '')}`); HL.drawer('assistant', false); break;
      default: HL.bus.emit('assistant:action', a);
    }
  }

  // ── local intents ─────────────────────────────────────────────────────────
  function localIntent(q) {
    const s = q.trim();
    if (/\b(switch|change|speak|answer|talk|reply|chuyển|đổi|切换|说|تحدث|बोल)\b.*\b(to|in|sang|用|إلى|में)?\b/i.test(s) || /^(speak|in|en|nói|说|تحدث)\b/i.test(s)) {
      for (const [code, re] of Object.entries(LANG_WORDS)) if (re.test(s) && /\b(switch|change|speak|answer|talk|reply|in|to|chuyển|đổi|切换|说|تحدث|बोल)\b/i.test(s)) { HL.setLang(code); return { answer: T('as.i.lang', 'Done. The page and my answers are now in {l}.', { l: HL.LANGS[code] }), trace: [{ kind: 'memory', label: T('as.i.langtrace', 'Language preference saved for this session') }], actions: [] }; }
    }
    if (/^nói tiếng việt$/i.test(s)) { HL.setLang('vi'); return { answer: 'Xong. Trang và câu trả lời của tôi bây giờ bằng tiếng Việt.', trace: [], actions: [] }; }
    if (/\b(compare)\b/i.test(s) && (modelsIn(s).length >= 2 || /\b(looked at|viewed|i saw)\b/i.test(s))) {
      const ids = modelsIn(s).map((m) => m.id); const viewed = HL.state.journey.viewed || [];
      const q2 = ids.length ? `compare ${ids.map((i) => HL.model(i).name).join(' and ')}` : `compare ${viewed.slice(-3).map((v) => v.title || v.id).join(', ')}`;
      const cmp = ids.length ? ids.map((i) => `m:${i}`) : viewed.slice(-3).map((v) => (v.kind === 'unit' ? `u:${v.id}` : `m:${v.id}`));
      if (cmp.length >= 2) HL.set({ compare: cmp.slice(0, 3) });
      return { answer: T('as.i.compare', 'Opening a comparison in Browse: {q}.', { q: q2 }), actions: [{ type: 'browse', q: q2, label: T('as.i.open', 'Open Browse') }], trace: [], go: `#/browse?q=${encodeURIComponent(q2)}` };
    }
    if (/^(show|find|list|search|browse|display|any|got|looking for|i want|i need|do you have)\b/i.test(s) && !/\?$/.test(s) && !/\b(why|how|what|when|which|does|is|can)\b/i.test(s.split(' ').slice(0, 2).join(' ')) && (/\b(ute|utes|suv|suvs|hatch|sedan|hybrid|hybrids|electric|under|below|less than|cheaper|\$\d|k\b|seat|seats|4x4|awd|manual|diesel|used|pre-owned|certified)\b/i.test(s))) {
      const q2 = s.replace(/^(show me|show|find me|find|list|search for|search|browse|display|do you have|any|got|i want|i need|looking for)\s+/i, '');
      return { answer: T('as.i.browse', 'Here is what we have for "{q}", ranked by the knowledge box.', { q: q2 }), actions: [{ type: 'browse', q: q2, label: T('as.i.open', 'Open Browse') }], trace: [{ kind: 'kb', label: T('as.i.browsetrace', 'Natural-language search over new and pre-owned stock') }], go: `#/browse?q=${encodeURIComponent(q2)}` };
    }
    return null;
  }

  // ── ask ───────────────────────────────────────────────────────────────────
  async function ask(question, opts = {}) {
    build(); const q = String(question || '').trim().slice(0, 1000); if (!q || busy) return;
    const scope = opts.scope || HL.assistant.scope || null;
    addMsg('user', q); history.push({ role: 'user', content: q }); saveHistory();
    HL.remember('asked', { q, scope: scope ? { kind: scope.kind, id: scope.id } : null, at: new Date().toISOString() });
    composer.value = ''; autogrow();
    const local = localIntent(q);
    if (local) { const m = addMsg('bot', local.answer, { trace: local.trace, actions: local.actions }); history.push({ role: 'assistant', content: local.answer, extra: { trace: local.trace, actions: local.actions } }); saveHistory(); if (local.go) setTimeout(() => { HL.go(local.go); if (matchMedia('(max-width:900px)').matches) HL.drawer('assistant', false); }, 600); return m; }
    const lang = detectLang(q) !== 'en' ? detectLang(q) : HL.state.lang;
    if (HL.online === false) {
      const a = T('as.offline', 'The knowledge box is offline right now, so I cannot answer from sources. I can still take you to Browse, the finder or a car page.');
      addMsg('bot', a, { error: true, actions: [{ type: 'browse', q, label: T('as.i.open', 'Open Browse') }, { type: 'match', label: T('as.i.finder', 'Find my car') }] }); history.push({ role: 'assistant', content: a }); saveHistory(); return;
    }
    busy = true; const stop = typing();
    const hist = history.slice(-9, -1).map((m) => ({ role: m.role, text: m.content.slice(0, 1200), content: m.content.slice(0, 1200) })); // /api/ask reads {role,text}; /api/used/* reads {role,content}
    try {
      let res; let kind;
      const mentioned = modelsIn(q);
      if (scope?.kind === 'unit') { kind = 'unit'; res = await HL.api(`/api/used/${encodeURIComponent(scope.id)}/ask`, { method: 'POST', body: { question: q, lang, history: hist }, timeoutMs: 30000 }); }
      else if (scope?.kind === 'model' || mentioned.length || !USED_RE.test(q)) {
        kind = 'new';
        const b = Object.assign({}, HL.state.build); if (scope?.kind === 'model' && scope.id !== b.modelId) { b.modelId = scope.id; b.gradeId = HL.model(scope.id)?.grades?.[0]?.id || null; }
        res = await HL.api('/api/ask', { method: 'POST', body: { question: q, lang, build: b, finder: { answers: HL.state.journey.answers || [] }, history: hist }, timeoutMs: 30000 });
      } else { kind = 'used'; res = await HL.api('/api/used/ask', { method: 'POST', body: { question: q, lang, history: hist }, timeoutMs: 30000 }); }
      stop();
      const trace = (res.trace || []).slice(0, 4); if (kind !== 'unit' && (HL.state.journey.asked || []).length > 1) trace.push({ kind: 'memory', label: T('as.memtrace', '{n} earlier question(s) this visit', { n: HL.state.journey.asked.length - 1 }) });
      const extra = { citations: res.citations || [], trace, actions: res.actions || [], by: res.by, scope };
      addMsg('bot', res.answer, extra); history.push({ role: 'assistant', content: res.answer, extra: { citations: extra.citations, trace: extra.trace, actions: extra.actions, by: res.by } }); saveHistory();
      if (kind === 'unit' && res.yourQuestions) HL.bus.emit('assistant:answered', { stockNo: scope.id, questions: res.yourQuestions });
    } catch (e) {
      stop();
      const a = e.status === 429 ? T('as.busy', 'A lot of people are asking at once. Give me a few seconds and try again.') : T('as.fail', 'I could not reach the knowledge box for that one. Try again, or ask in a different way.');
      addMsg('bot', a, { error: true });
    } finally { busy = false; renderSuggestions(); }
  }
  function submit() { const q = composer.value; if (q.trim()) ask(q); }

  // ── voice ─────────────────────────────────────────────────────────────────
  function toggleMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
    if (recog) { recog.stop(); return; }
    recog = new SR(); recog.lang = { en: 'en-AU', zh: 'zh-CN', vi: 'vi-VN', ar: 'ar-SA', hi: 'hi-IN' }[HL.state.lang] || 'en-AU'; recog.interimResults = true;
    micBtn.classList.add('rec'); composer.placeholder = T('as.listening', 'Listening…');
    recog.onresult = (e) => { composer.value = Array.from(e.results).map((r) => r[0].transcript).join(''); autogrow(); };
    recog.onend = () => { micBtn.classList.remove('rec'); composer.placeholder = T('as.placeholder', 'Ask about any car, in any language…'); recog = null; if (composer.value.trim()) submit(); };
    recog.onerror = () => { micBtn.classList.remove('rec'); recog = null; toast(T('as.micfail', 'Microphone not available.')); };
    try { recog.start(); } catch { recog = null; micBtn.classList.remove('rec'); }
  }

  // ── wiring ────────────────────────────────────────────────────────────────
  HL.bus.on('assistant:open', () => { build(); setTimeout(() => composer && composer.focus(), 320); });
  HL.bus.on('assistant:prefill', (text) => { build(); if (text) { composer.value = text; autogrow(); composer.focus(); } });
  HL.bus.on('assistant:ask', (d) => { build(); HL.drawer('assistant', true); ask(d.question, { scope: d.scope }); });
  HL.bus.on('assistant:scope', () => { renderScope(); });
  HL.bus.on('route', (r) => { if (r.name !== 'car' && HL.assistant.scope) { HL.assistant.scope = null; renderScope(); } });
  HL.bus.on('lang', () => { if (!built) return; const open = document.getElementById('assistant').classList.contains('open'); built = false; const keep = history; history = keep; build(); if (open) composer.focus(); });
  HL.bus.on('journey', () => { if (built) renderSuggestions(); });
  HL.assistant.clear = () => { history = []; saveHistory(); if (built) { thread.innerHTML = ''; welcome(); } };
})();
