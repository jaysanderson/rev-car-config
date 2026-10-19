// Harbourline DMS · Help bubble (bottom-right, every authenticated page).
// Mode "software": POST /help/ask {question, page, lang, mode:'software'} → cited answer from the
// manual and policies (call-deflection use case; every answer is logged server-side and rated here).
// Mode "business": the same route with mode:'business' → the live-ERP agent.
// Exposes window.hlHelp.open({question, context}) for the friendly-error hook in core.js.
import { api, state, esc, icon, prose, citations, thinking, tagArag, ann, num, toast } from './core.js';

const SUGGEST = {
  dashboard: ['What do the KPI cards on the dashboard mean?', 'How is target attainment calculated?', 'Where do the Domo signals come from?'],
  leads: ['How do I merge duplicate leads?', 'What is the first-contact target for a configurator lead?', 'How do I book a test drive from a lead?'],
  'test-drives': ['What do the three salesperson questions do?', 'How do I record a no-show?', 'Can a P-plater take a GR Yaris on a test drive?'],
  deals: ['How do I request a discount approval?', 'What do I need before moving a deal to finance?', 'Why is this deal marked stuck?'],
  customers: ['How do I add a memo to a customer?', 'How do I attach a document or photo to a customer?', 'What does "Ask about this customer" use?'],
  stock: ['How do I place a hold on a unit?', 'What does reason code aged_90d mean?', 'How do transfers between sites work?'],
  finance: ['How do I resubmit a declined finance application?', 'What is the trade-in valuation policy?', 'Who signs off a payout figure?'],
  promotions: ['How are promotions composed from Domo targets?', 'Who can publish a promotion?', 'What is the promotions governance policy?'],
  campaigns: ['How is campaign attribution calculated?', 'How do I create a campaign?', 'Which promotions can a campaign carry?'],
  dxm: ['What is on a handover sheet?', 'How do configurator events reach the DMS?', 'What does the configurator report show?'],
  documents: ['How do I process a contract with the agent?', 'What do the confidence scores mean?', 'What happens when a field needs verification?'],
  insights: ['Which Domo datasets can I export?', 'How often are the derived datasets rebuilt?', 'What is dealer_signals?'],
  settings: ['How do I create a personal access token?', 'How do I connect Claude Code to the DMS over MCP?', 'Which datasets does Domo pull?'],
  assistant: ['What is the difference between Ask the manual and Ask the ERP?', 'How are answers cited?', 'Which languages are supported?'],
  'job-cards': ['How do I add a memo to a job card?', 'How do I attach photos to a job card?', 'How do I quote from an Infomedia menu?'],
  suppliers: ['How do I record a supplier invoice?', 'What are our standard supplier terms?', 'How do I ask across all suppliers?'],
  onboarding: ['How does onboarding verify a step?', 'Can I restart my onboarding?', 'Which steps are role-specific?'],
  manual: ['How do I search the manual?', 'Which chapters cover approvals?', 'Where is the Infomedia chapter?'],
  default: ['How do I find a customer quickly?', 'Who can approve a discount?', 'How do I get help without ringing support?'],
};
const SUGGEST_BIZ = ['Which deals are stuck in finance for more than 5 days?', 'How many RAV4s over 60 days old do we have?', 'Which leads from this week have not been contacted?'];

const pageOf = () => (location.hash.replace(/^#\/?/, '').split('?')[0].split('/')[0] || 'dashboard');
const SS = (() => { try { return window.sessionStorage; } catch { return null; } })();
const threads = {}; // page → [{q, mode, html, pending}]
const loadThread = (p) => { if (threads[p]) return threads[p]; try { threads[p] = JSON.parse(SS?.getItem('dms.help.' + p) || '[]'); } catch { threads[p] = []; } return threads[p]; };
const saveThread = (p) => { try { SS?.setItem('dms.help.' + p, JSON.stringify(loadThread(p).filter((t) => !t.pending).slice(-12))); } catch {} };

let built = false, open = false, mode = 'software', deflection = null, bannerChecked = false;
const $ = (s, r = document) => r.querySelector(s);

function build() {
  if (built) return; built = true;
  const wrap = document.createElement('div'); wrap.id = 'hb'; wrap.className = 'hb';
  wrap.innerHTML = `
    <button class="hb-fab" id="hbFab" aria-controls="hbPanel" aria-expanded="false" title="Help: ask the manual or the business"><span class="hb-av">?</span><span class="hb-fab-label">Help</span></button>
    <section class="hb-panel" id="hbPanel" aria-label="Help" aria-hidden="true">
      <header class="hb-head">
        <div><div class="hb-title">Help ${tagArag()}</div><div class="hb-sub" id="hbSub">Answers from the manual, cited. No need to ring support.</div></div>
        <button class="btn ghost sm" id="hbClose" aria-label="Close help">Close</button>
      </header>
      <div class="hb-modes"><div class="segmented" role="group" aria-label="Help mode"><button data-hmode="software" aria-pressed="true">Help with the software</button><button data-hmode="business" aria-pressed="false">Ask the business</button></div><span id="hbAnn"></span></div>
      <div class="hb-thread" id="hbThread"></div>
      <div class="hb-sugg" id="hbSugg"></div>
      <form class="hb-form" id="hbForm"><textarea class="textarea" id="hbQ" rows="1" placeholder="Ask how to do something…" aria-label="Your question"></textarea><button class="btn" id="hbSend" aria-label="Send">${icon('assistant')}</button></form>
      <footer class="hb-foot"><span id="hbDefl">…</span><a href="#/manual">Open the manual</a></footer>
    </section>`;
  document.body.appendChild(wrap);
  $('#hbFab').onclick = () => toggle();
  $('#hbClose').onclick = () => toggle(false);
  wrap.querySelectorAll('[data-hmode]').forEach((b) => (b.onclick = () => setMode(b.dataset.hmode)));
  $('#hbForm').onsubmit = (e) => { e.preventDefault(); send($('#hbQ').value); };
  $('#hbQ').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send($('#hbQ').value); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) toggle(false); });
  window.addEventListener('hashchange', () => { if (built) { paint(); suggestions(); } maybeBanner(); });
  setMode('software');
}
function setMode(m) {
  mode = m;
  document.querySelectorAll('#hb [data-hmode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.hmode === m)));
  $('#hbQ').placeholder = m === 'software' ? 'Ask how to do something…' : 'Ask what is happening: which deals, how many, who…';
  $('#hbSub').textContent = m === 'software' ? 'Answers from the manual and policies, cited. No need to ring support.' : 'The live-ERP agent answers from the tables, with your role’s permissions.';
  $('#hbAnn').innerHTML = ann(m === 'software' ? 'POST /dms/api/help/ask {mode:software}' : 'POST /dms/api/help/ask {mode:business}', 'kb');
  suggestions();
}
function suggestions() {
  const box = $('#hbSugg'); if (!box) return;
  const list = mode === 'software' ? (SUGGEST[pageOf()] || SUGGEST.default) : SUGGEST_BIZ;
  box.innerHTML = list.map((q) => `<button type="button" class="hb-chip">${esc(q)}</button>`).join('');
  box.querySelectorAll('button').forEach((b) => (b.onclick = () => send(b.textContent)));
}
function toggle(force) {
  build();
  open = force ?? !open;
  const p = $('#hbPanel'); p.classList.toggle('open', open); p.setAttribute('aria-hidden', String(!open));
  $('#hbFab').setAttribute('aria-expanded', String(open)); document.body.classList.toggle('hb-open', open);
  if (open) { paint(); suggestions(); loadDeflection(); setTimeout(() => $('#hbQ')?.focus(), 150); }
}
async function loadDeflection() {
  if (deflection && Date.now() - deflection.at < 60000) return;
  const r = await api('/help/deflection', { query: { days: 30 }, timeout: 8000 });
  deflection = { at: Date.now(), d: r.ok ? r.data : null };
  const el = $('#hbDefl'); if (!el) return;
  if (!r.ok) { el.innerHTML = `<span class="subtle">${r.status === 404 ? 'Deflection stats arrive with the help API' : 'Deflection stats unavailable'}</span>`; return; }
  const d = r.data || {};
  el.innerHTML = `<span title="Questions answered here instead of a call to support, last 30 days"><b>${num(d.answers || 0)}</b> answered without a call · <b>${d.deflectionRate != null ? Math.round(d.deflectionRate * 100) + '%' : '—'}</b> resolved</span> ${ann('GET /dms/api/help/deflection', 'dms')}`;
}
function paint() {
  const th = $('#hbThread'); if (!th) return;
  const list = loadThread(pageOf());
  th.innerHTML = list.length ? list.map((t, i) => `<div class="hb-msg user">${esc(t.q)}</div>${t.pending ? `<div class="hb-msg bot">${thinking(t.mode === 'software' ? 'Reading the manual…' : 'The ERP agent is planning its queries…')}</div>` : `<div class="hb-msg bot" data-i="${i}">${t.html}</div>`}`).join('')
    : `<div class="hb-welcome"><b>Hi${state.user?.name ? ', ' + esc(state.user.name.split(' ')[0]) : ''}.</b> Ask how to do anything in the DMS and I answer from the manual, with the chapter cited. Switch to <i>Ask the business</i> for live numbers.</div>`;
  th.scrollTop = th.scrollHeight;
  th.querySelectorAll('[data-fb]').forEach((b) => (b.onclick = () => feedback(b)));
  th.querySelectorAll('[data-ticket]').forEach((b) => (b.onclick = () => ticket(b)));
}
function manualRoute(c) {
  const t = String(c.title || c.slug || '').toLowerCase();
  const m = t.match(/manual[-\s]+([a-z0-9-]+)/); if (m) return `#/manual/${m[1]}`;
  const slug = String(c.slug || '').replace(/^dms-?/, ''); if (/^manual-/.test(slug)) return `#/manual/${slug.replace(/^manual-/, '')}`;
  return null;
}
function answerHtml(d, question) {
  const cites = (d.citations || []).map((c, i) => { const r = manualRoute(c); const label = `[${i + 1}] ${esc(c.title || c.resourceId || 'Source')}`; return r ? `<a class="cite" href="${r}">${label}</a>` : `<span class="cite" title="${esc(c.snippet || '')}">${label}</span>`; }).join('');
  const pages = (d.suggestedPages || []).map((p) => `<a class="hb-chip" href="${esc(p.route)}">${esc(p.title)}</a>`).join('');
  const trace = (d.trace || []).map((t) => `<span class="chip ${t.kind === 'domo' ? 'domo' : t.kind === 'dms' ? 'dms' : 'kb'}">${esc(t.label || t)}</span>`).join('');
  const evidence = Array.isArray(d.evidence) && d.evidence.length ? `<div class="hb-evidence">${d.evidence.slice(0, 5).map((e) => `<div>${esc(typeof e === 'string' ? e : e.title || e.id || JSON.stringify(e))}</div>`).join('')}</div>` : '';
  const answer = d.answer || d.text || (d.status ? `No grounded answer (${d.status}).` : 'No answer.');
  return `<div class="prose">${prose(answer)}</div>${evidence}${cites ? `<div class="cites" style="margin-top:8px">${cites}</div>` : ''}${pages ? `<div class="hb-pages">${pages}</div>` : ''}
    <div class="hb-meta">${trace}<span class="hb-fb" data-help="${esc(d.helpId || '')}"><button class="btn ghost sm" data-fb="1" title="This helped">👍</button><button class="btn ghost sm" data-fb="0" title="This did not help">👎</button></span></div>`;
}
async function send(text) {
  text = String(text || '').trim(); if (!text) return;
  build(); if (!open) toggle(true);
  const page = pageOf(); const list = loadThread(page); const q = $('#hbQ'); q.value = '';
  const entry = { q: text, mode, pending: true }; list.push(entry); paint();
  const r = await api('/help/ask', { method: 'POST', body: { question: text, page, lang: state.lang, mode }, timeout: 60000 });
  entry.pending = false;
  if (r.ok) entry.html = answerHtml(r.data, text);
  else if (r.status === 404) {
    // Help API not mounted yet: fall back to the existing assistant routes so the bubble still works.
    const f = mode === 'software' ? await api('/ask', { method: 'POST', body: { question: text, scope: 'all', lang: state.lang, context: `page: ${page}` }, timeout: 60000 }) : await api('/agent/query', { method: 'POST', body: { question: text, lang: state.lang }, timeout: 90000 });
    entry.html = f.ok ? answerHtml(f.data, text) + `<div class="subtle" style="font-size:.7rem;margin-top:6px">Answered via ${mode === 'software' ? 'POST /ask' : 'POST /agent/query'} (help API not in this build yet).</div>` : `<div class="notice bad">${icon('alert')}<div>${esc(f.friendly?.message || f.error || 'Could not get an answer.')}</div></div>`;
  } else entry.html = `<div class="notice bad">${icon('alert')}<div><b>${esc(r.friendly?.title || 'Could not get an answer')}</b><br>${esc(r.friendly?.message || r.error || '')}${r.friendly?.nextStep ? `<br><span class="subtle">${esc(r.friendly.nextStep)}</span>` : ''}</div></div>`;
  saveThread(page); paint();
}
async function feedback(btn) {
  const wrap = btn.closest('.hb-fb'); const helpful = btn.dataset.fb === '1'; const helpId = wrap.dataset.help;
  wrap.querySelectorAll('button').forEach((b) => (b.disabled = true));
  if (helpId) api('/help/feedback', { method: 'POST', body: { helpId, helpful }, timeout: 8000 });
  const msg = btn.closest('.hb-msg'); const i = Number(msg.dataset.i); const list = loadThread(pageOf());
  if (helpful) { wrap.innerHTML = '<span class="chip good">Thanks, logged as resolved</span>'; if (list[i]) list[i].html = msg.innerHTML; saveThread(pageOf()); loadDeflection(); return; }
  wrap.innerHTML = `<span class="chip warn">Sorry about that</span><button class="btn secondary sm" data-ticket="${esc(helpId)}" data-q="${esc(list[i]?.q || '')}">Raise a ticket</button>`;
  if (list[i]) list[i].html = msg.innerHTML; saveThread(pageOf());
  msg.querySelectorAll('[data-ticket]').forEach((b) => (b.onclick = () => ticket(b)));
}
async function ticket(btn) {
  btn.disabled = true; btn.textContent = 'Raising…';
  const r = await api('/help/tickets', { method: 'POST', body: { helpId: btn.dataset.ticket || undefined, question: btn.dataset.q, page: pageOf() }, timeout: 10000 });
  const msg = btn.closest('.hb-msg'); const i = Number(msg.dataset.i); const list = loadThread(pageOf());
  btn.outerHTML = r.ok ? `<span class="chip kb">Ticket ${esc(r.data?.id || '')} raised · a human will reply</span>` : `<span class="chip bad">${esc(r.friendly?.message || r.error || 'Could not raise a ticket')}</span>`;
  if (list[i]) list[i].html = msg.innerHTML; saveThread(pageOf());
}

// First-login onboarding banner (above the page content; no other page edited).
async function maybeBanner() {
  if (!state.user) return;
  const page = pageOf(); const homePages = ['dashboard', 'assistant', 'job-cards', 'leads'];
  const old = document.getElementById('obBanner'); if (old) old.remove();
  if (!homePages.includes(page)) return;
  let dismissed = false; try { dismissed = SS?.getItem('dms.ob.dismissed') === '1'; } catch {}
  if (dismissed) return;
  if (!bannerChecked) { const r = await api('/onboarding/progress', { timeout: 8000 }); bannerChecked = true; if (!r.ok || (r.data && (r.data.startedAt || (r.data.done && r.data.done > 0)))) { if (r.ok) try { SS?.setItem('dms.ob.dismissed', '1'); } catch {} return; } }
  const main = document.getElementById('main'); const view = document.getElementById('view'); if (!main || !view || document.getElementById('obBanner') || pageOf() !== page) return;
  const b = document.createElement('div'); b.id = 'obBanner'; b.className = 'ob-banner';
  b.innerHTML = `<span>${icon('assistant')}</span><div><b>New here?</b> Start the 20-minute onboarding: it points you at each page, sets a task and checks what you did.</div><a class="btn sm" href="#/onboarding">Start onboarding</a><button class="btn ghost sm" id="obDismiss" aria-label="Dismiss">✕</button>`;
  main.insertBefore(b, view);
  b.querySelector('#obDismiss').onclick = () => { b.remove(); try { SS?.setItem('dms.ob.dismissed', '1'); } catch {} };
}

export function initHelp() {
  if (!state.user) return;
  build();
  maybeBanner();
}
window.hlHelp = {
  open({ question, context } = {}) {
    build(); toggle(true); setMode('software');
    if (question) send(context ? `${question}\n\nContext: ${context}` : question);
  },
  ask: (q) => send(q),
};
