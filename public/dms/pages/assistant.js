import { api, state, esc, pick, items, num, money, dateTime, pagehead, failState, tagArag, ann, prose, citations, icon, cap, LANGS, siteName, modelName } from '../core.js';

const EX = {
  manual: [
    'Who can approve a $2,500 discount on a deal with $900 front gross?',
    'What do I need before moving a deal from finance to approval?',
    'What is the first-contact target for a configurator lead on a Saturday?',
    'Can a P-plater take a GR Yaris on a test drive?',
    'What does reason code days_of_supply mean?',
  ],
  erp: [
    'Which deals are stuck in finance for more than 5 days at Penrith?',
    'How many RAV4s over 60 days old do we have, and where are they?',
    'Which configurator leads from this week have not been contacted?',
    'What is Hornsby’s target attainment this month?',
    'Who has the highest average gross per unit this quarter?',
  ],
};
const PREF = { deals: ['id', 'stage', 'model', 'modelId', 'daysInStage', 'driveAway', 'grossProfit', 'siteId'], leads: ['id', 'status', 'channel', 'siteId', 'ownerId', 'score', 'createdAt', 'daysSinceUpdate'], vehicles: ['stockNo', 'model', 'grade', 'siteId', 'status', 'daysInStock', 'bonusHeadroom', 'movePriority'], test_drives: ['id', 'when', 'status', 'modelId', 'siteId', 'staffId'], finance_apps: ['id', 'dealId', 'lender', 'status', 'amount', 'daysPending', 'siteId'], customers: ['id', 'firstName', 'lastName', 'suburb', 'source'], trade_ins: ['id', 'dealId', 'make', 'model', 'year', 'valuation', 'offered'], promotions: ['id', 'title', 'kind', 'value', 'status'], campaigns: ['id', 'name', 'channel', 'sent', 'leads'] };
const ROUTE = { leads: 'leads', deals: 'deals', test_drives: 'test-drives', customers: 'customers', documents: 'documents', vehicles: 'stock?unit=' };
const hrefFor = (table, id) => ROUTE[table] ? (ROUTE[table].endsWith('=') ? `#/${ROUTE[table]}${encodeURIComponent(id)}` : `#/${ROUTE[table]}/${encodeURIComponent(id)}`) : table === 'finance_apps' || table === 'trade_ins' ? '#/finance' : null;

let history = [];
export default async function assistant(root, ctx) {
  let mode = ctx.query.mode === 'erp' ? 'erp' : ctx.query.mode === 'manual' ? 'manual' : (history.at(-1)?.mode || 'manual');
  let scope = 'all';
  root.innerHTML = pagehead({ title: 'Assistant', tags: tagArag(), sub: 'Questions about <b>how things should be done</b> go to the manual; questions about <b>what is happening</b> go to the ERP. Both are answered by Progress Agentic RAG, with citations or the evidence rows used.' }) +
  `<div class="split"><section class="card chatwrap">
    <div class="chead"><div class="segmented" role="group" aria-label="Mode"><button data-mode="manual">Ask the manual</button><button data-mode="erp">Ask the ERP</button></div>
      <span id="scopew" class="row" style="gap:6px"><span class="label">Scope</span><div class="segmented" role="group" aria-label="Scope"><button data-scope="manual">Manual</button><button data-scope="policy">Policy</button><button data-scope="all">All</button></div></span>
      <div class="r"><span class="chip neutral" title="Change in the band">${esc(LANGS[state.lang] || 'English')}</span><span id="apiann"></span></div></div>
    <div class="scrollarea"><div class="chat" id="chat"></div></div>
    <form class="composer" id="cf"><textarea class="textarea" id="q" placeholder="Ask a question…" rows="1" aria-label="Question"></textarea><button class="btn" id="ask">Ask</button></form>
  </section>
  <aside class="stack"><section class="card"><div class="chead"><h3>Example questions</h3></div><div class="cbody examples" id="ex"></div></section>
    <section class="card"><div class="chead"><h3>How it works</h3></div><div class="cbody" style="font-size:.84rem;display:grid;gap:8px" id="how"></div></section></aside></div>`;
  const chat = root.querySelector('#chat'), q = root.querySelector('#q'), btn = root.querySelector('#ask');
  const setMode = m => {
    mode = m;
    root.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    root.querySelector('#scopew').style.display = m === 'manual' ? '' : 'none';
    root.querySelector('#apiann').innerHTML = ann(m === 'manual' ? 'POST /dms/api/ask {question, scope}' : 'POST /dms/api/agent/query {question}', 'kb');
    root.querySelector('#ex').innerHTML = EX[m].map(x => `<button type="button">${esc(x)}</button>`).join('');
    root.querySelectorAll('#ex button').forEach(b => b.onclick = () => { q.value = b.textContent; send(); });
    root.querySelector('#how').innerHTML = m === 'manual'
      ? '<p>The question goes to the Harbourline knowledge box with a label filter: <span class="mono">topic/manual</span>, <span class="mono">topic/policy</span> or both. The answer is generated only from the retrieved passages and cites them. If the knowledge box doesn’t contain the answer, it says so.</p>'
      : '<p>A live-ERP retrieval agent plans up to four tool calls (<span class="mono">erp.search</span>, <span class="mono">erp.get</span>, <span class="mono">erp.kpi</span>). The server runs them <b>with your role’s permissions</b>, then the agent answers from the rows. Open <b>Evidence</b> to see the rows and calls.</p>';
    q.placeholder = m === 'manual' ? 'How do I…, What is our policy on…, Who approves…' : 'Which…, How many…, Show me…';
  };
  const setScope = s => { scope = s; root.querySelectorAll('[data-scope]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scope === s))); };
  root.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  root.querySelectorAll('[data-scope]').forEach(b => b.onclick = () => setScope(b.dataset.scope));
  setMode(mode); setScope(scope);
  const paint = () => {
    chat.innerHTML = history.length ? history.map(h => `<div class="bubble user">${esc(h.q)}<div style="font-size:.66rem;opacity:.75;margin-top:4px">${h.mode === 'manual' ? `Ask the manual · ${cap(h.scope)}` : 'Ask the ERP'}</div></div>${h.pending ? `<div class="bubble assistant"><div class="thinking"><span class="dots"><i></i><i></i><i></i></span>${h.mode === 'manual' ? 'Retrieving from the manual and policies…' : 'Planning tool calls and querying the live ERP…'}</div></div>` : h.html}`).join('')
      : `<div class="emptystate inline" style="border:0"><div class="ib">${icon('assistant')}</div><h3>Ask the DMS</h3><p>Pick a mode above and type a question, or click an example.</p></div>`;
    chat.parentElement.scrollTop = chat.parentElement.scrollHeight;
    chat.querySelectorAll('tr[data-href]').forEach(tr => tr.onclick = () => { location.hash = tr.dataset.href; });
  };
  async function send() {
    const text = q.value.trim(); if (!text) return;
    q.value = ''; btn.disabled = true;
    const h = { q: text, mode, scope, pending: true }; history.push(h); paint();
    const r = mode === 'manual'
      ? await api('/ask', { method: 'POST', body: { question: text, scope, lang: state.lang } })
      : await api('/agent/query', { method: 'POST', body: { question: text, lang: state.lang } });
    h.pending = false; btn.disabled = false;
    h.html = r.ok ? (mode === 'manual' ? manualAnswer(r.data) : erpAnswer(r.data)) : `<div class="bubble assistant">${failState(r, { what: 'an answer', endpoint: mode === 'manual' ? 'POST /ask' : 'POST /agent/query', inline: true })}</div>`;
    paint();
  }
  root.querySelector('#cf').onsubmit = e => { e.preventDefault(); send(); };
  q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  paint();
  if (ctx.query.q) { q.value = ctx.query.q; history = history.filter(h => h.q !== ctx.query.q); send(); history.length; }
}

function manualAnswer(d) {
  const grounded = d.grounded !== false && d.status !== 'not_configured';
  return `<div class="bubble assistant"><div class="prose">${prose(d.answer || 'No answer.')}</div>
    ${!grounded ? `<div class="notice" style="margin-top:8px">${icon('alert')}<div>The knowledge box didn’t contain a grounded answer${d.status ? ` (${esc(d.status)})` : ''}.</div></div>` : ''}
    ${(d.citations || []).length ? `<div style="margin-top:10px"><span class="label">Sources</span>${citations(d.citations.map(c => ({ ...c, title: `${c.title}${(c.topic || []).includes('policy') ? ' · policy' : (c.topic || []).includes('manual') ? ' · manual' : ''}` })))}</div>` : ''}
    <div class="meta">${tagArag()}<span class="subtle" style="font-size:.72rem">scope ${esc(d.scope || 'all')} · ${esc(LANGS[d.lang] || d.lang || '')}${d.ms ? ` · ${(d.ms / 1000).toFixed(1)} s` : ''}</span></div>
    <div class="json">${esc(JSON.stringify(d, null, 2))}</div></div>`;
}
function cell(v) { if (v == null || v === '') return '—'; if (typeof v === 'object') return esc(JSON.stringify(v).slice(0, 80)); if (typeof v === 'number' && v > 999) return num(v); return esc(String(v).slice(0, 60)); }
function erpAnswer(d) {
  const ev = d.evidence || [];
  const byTable = {};
  for (const e of ev) (byTable[e.table] ||= []).push(e);
  const calls = d.plan?.calls || [];
  return `<div class="bubble assistant"><div class="prose">${prose(d.answer || 'No answer.')}</div>
    ${(d.kpis || []).length ? `<div class="pills" style="margin-top:8px">${d.kpis.map(k => `<span class="chip info">erp.kpi · ${esc(k.name)}</span>`).join('')}</div>` : ''}
    <details style="margin-top:10px" ${ev.length ? 'open' : ''}><summary style="cursor:pointer;font-weight:600;font-size:.84rem">Evidence · ${ev.length} row${ev.length === 1 ? '' : 's'} · ${calls.length} tool call${calls.length === 1 ? '' : 's'}</summary>
      ${Object.entries(byTable).map(([t, list]) => { const keys = [...new Set(list.flatMap(e => Object.keys(e.row || {})))]; const pref = (PREF[t] || []).filter(k => keys.includes(k)); const cols = (pref.length >= 3 ? pref : keys.filter(k => !/^(events|finderAnswers|viewed|handover|questions|accessories|promotions|tags|notes|interest|leadId|customerId|businessManagerId|vin)$/.test(k))).slice(0, 7);
        return `<div class="label" style="margin:10px 0 4px">${esc(t)}</div><div class="datatable compact"><div class="scroll"><table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}<th>Why</th></tr></thead><tbody>${list.map(e => `<tr ${hrefFor(t, e.id) ? `data-href="${hrefFor(t, e.id)}"` : ''}>${cols.map(c => `<td style="white-space:nowrap">${cell(e.row?.[c])}</td>`).join('')}<td class="subtle">${esc(e.why || '')}</td></tr>`).join('')}</tbody></table></div></div>`; }).join('')}
      ${calls.length ? `<div class="label" style="margin:10px 0 4px">Tool calls</div><div class="code">${calls.map(c => esc(`${c.tool}(${JSON.stringify(c.args)}) → ${c.error ? 'error: ' + c.error : (c.total ?? '') + ' rows'}`)).join('\n')}</div>` : ''}
    </details>
    ${(d.followups || []).length ? `<div class="pills" style="margin-top:8px">${d.followups.map(f => `<a class="chip out" href="#/assistant?mode=erp&q=${encodeURIComponent(f)}">${esc(f)}</a>`).join('')}</div>` : ''}
    <div class="meta">${tagArag('Progress Agentic RAG · live-ERP agent')}<span class="subtle" style="font-size:.72rem">${esc(d.path || '')}${d.ms?.total ? ` · ${(d.ms.total / 1000).toFixed(1)} s` : ''}</span></div>
    <div class="json">${esc(JSON.stringify({ plan: d.plan, planner: d.planner, answerer: d.answerer }, null, 2))}</div></div>`;
}
