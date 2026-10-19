// Harbourline DMS · Onboarding: a per-role programme composed by Progress Agentic RAG from the manual,
// with steps that point at a page, set a task and verify completion from live data.
import { api, state, esc, icon, pagehead, loading, failState, empty, tagArag, ann, prose, citations, toast, ROLE_LABEL, num } from '../core.js';

export default async function onboarding(root, ctx) {
  root.innerHTML = pagehead({ title: 'Onboarding', tags: tagArag(), sub: `A programme for your role, written by the agent from the manual. Each step points you at a page, sets a task and <b>checks what you did</b> in the live data. ${ann('GET /dms/api/onboarding/programme · /progress', 'kb')}` }) + `<div id="ob">${loading(6)}</div>`;
  await render(root.querySelector('#ob'), ctx);
}

async function render(box, ctx) {
  const [p, g] = await Promise.all([api('/onboarding/programme', { timeout: 60000 }), api('/onboarding/progress', { timeout: 20000 })]);
  if (!p.ok) { box.innerHTML = p.status === 404 ? empty({ ic: 'plug', title: 'Onboarding API not in this build yet', body: 'When <code>GET /dms/api/onboarding/programme</code> is available, this page shows a programme for your role, generated from the manual, with live verification of each step.', actions: '<a class="btn sm" href="#/manual">Read the manual instead</a>' }) : failState(p, { what: 'the onboarding programme', endpoint: 'GET /onboarding/programme' }); return; }
  const prog = p.data || {}; const steps = prog.steps || [];
  const pr = g.ok ? (g.data || {}) : { steps: {} };
  const doneMap = pr.steps || {};
  const isDone = (s) => Boolean(doneMap[s.id]?.doneAt);
  const doneN = steps.filter(isDone).length; const total = steps.length;
  const nextId = pr.nextStep || steps.find((s) => !isDone(s))?.id || null;
  const ordered = [...steps.filter((s) => !isDone(s)), ...steps.filter(isDone)];
  const minutes = steps.reduce((n, s) => n + (Number(s.estimatedMinutes) || 3), 0);
  const complete = total > 0 && doneN === total;
  box.innerHTML = `
    <div class="ob-top card">
      <div class="cbody ob-summary">
        <div><div class="label">Programme</div><div class="ob-role">${esc(ROLE_LABEL[prog.role] || prog.role || ROLE_LABEL[state.user?.role] || '')}</div><div class="subtle" style="font-size:.78rem">${total} steps · about ${minutes} minutes · ${prog.composedBy === 'agent' ? 'composed by the agent from the manual' : 'from the catalogue'}${prog.generatedAt ? ' · ' + esc(String(prog.generatedAt).slice(0, 10)) : ''}</div></div>
        <div class="ob-progress"><div class="ob-bar"><i style="width:${total ? Math.round(doneN / total * 100) : 0}%"></i></div><div class="subtle" style="font-size:.78rem">${doneN} of ${total} done${pr.startedAt ? ' · started ' + esc(String(pr.startedAt).slice(0, 10)) : ''}</div></div>
        <div class="row"><button class="btn ghost sm" id="obReset">Start again</button></div>
      </div>
    </div>
    ${complete ? `<div class="notice info" style="margin:12px 0">${icon('assistant')}<div><b>Onboarding complete.</b> ${steps.map((s) => esc(s.title)).join(' · ')}. The Help bubble (bottom right) and the manual stay with you.</div></div>` : ''}
    <ol class="ob-steps">${ordered.map((s, i) => stepHtml(s, i + 1, isDone(s), s.id === nextId, doneMap[s.id])).join('')}</ol>`;
  box.querySelector('#obReset').onclick = async () => { const r = await api('/onboarding/reset', { method: 'POST' }); if (r.ok) { toast('Onboarding reset'); render(box, ctx); } };
  box.querySelectorAll('[data-open]').forEach((a) => (a.onclick = () => { try { sessionStorage.setItem('dms.ob.return', '1'); } catch {} }));
  box.querySelectorAll('[data-expand]').forEach((b) => (b.onclick = () => { const li = b.closest('li'); li.classList.toggle('open'); }));
  box.querySelectorAll('[data-verify]').forEach((b) => (b.onclick = async () => {
    const id = b.dataset.verify; const how = b.dataset.how || 'verified'; b.disabled = true; b.textContent = how === 'verified' ? 'Checking the data…' : 'Saving…';
    const r = await api(`/onboarding/steps/${encodeURIComponent(id)}/complete`, { method: 'POST', body: { how }, timeout: 30000 });
    const out = b.closest('li').querySelector('.ob-verify');
    if (!r.ok) { b.disabled = false; b.textContent = how === 'verified' ? 'I did it, check' : 'Mark as done'; out.innerHTML = `<div class="notice bad">${icon('alert')}<div>${esc(r.friendly?.message || r.error || 'Could not verify')}${r.data?.found != null ? ` · found ${num(r.data.found)}` : ''}${r.friendly?.nextStep ? `<br><span class="subtle">${esc(r.friendly.nextStep)}</span>` : ''}</div></div>`; return; }
    const v = r.data?.steps?.[id] || r.data?.verified?.find?.((x) => x.id === id) || r.data?.result || {};
    const what = v.detail || v.verifiedBy || r.data?.message || (how === 'verified' ? 'Verified from live data' : 'Marked as done');
    toast(`Step done: ${what}`);
    render(box, ctx);
  }));
  box.querySelectorAll('[data-askstep]').forEach((f) => (f.onsubmit = async (e) => {
    e.preventDefault(); const id = f.dataset.askstep; const inp = f.querySelector('input'); const q = inp.value.trim(); if (!q) return;
    const out = f.closest('li').querySelector('.ob-answer'); out.innerHTML = `<div class="thinking"><span class="dots"><i></i><i></i><i></i></span>Reading the chapter…</div>`;
    const r = await api(`/onboarding/steps/${encodeURIComponent(id)}/ask`, { method: 'POST', body: { question: q, lang: state.lang }, timeout: 60000 });
    out.innerHTML = r.ok ? `<div class="bubble assistant"><div class="prose">${prose(r.data.answer || 'No answer.')}</div>${citations(r.data.citations)}</div>` : `<div class="notice bad">${icon('alert')}<div>${esc(r.friendly?.message || r.error || 'Could not answer')}</div></div>`;
  }));
}

function stepHtml(s, n, done, current, rec) {
  const verifyKind = s.verify?.kind || 'manual';
  const verifyText = verifyKind === 'query' ? `Checked in the data: ${esc(s.verify.table || 'records')}${s.verify.where ? ` where ${esc(typeof s.verify.where === 'string' ? s.verify.where : JSON.stringify(s.verify.where))}` : ''}${s.verify.minCount ? `, at least ${s.verify.minCount}` : ''}` : verifyKind === 'ask' ? 'Checked by asking the assistant a question about this chapter' : 'Self-attested: mark it done when you have read it';
  return `<li class="ob-step ${done ? 'done' : ''} ${current ? 'open current' : ''}">
    <div class="ob-head"><span class="ob-n">${done ? '✓' : n}</span><div class="grow"><b>${esc(s.title)}</b><div class="subtle" style="font-size:.78rem">${esc(s.route || '')}${s.estimatedMinutes ? ` · ${s.estimatedMinutes} min` : ''}${done && rec?.doneAt ? ` · done ${esc(String(rec.doneAt).slice(0, 10))}${rec.verifiedBy ? ' · ' + esc(rec.verifiedBy) : ''}` : ''}</div></div><button class="btn ghost sm" data-expand>${done ? 'Review' : current ? 'Hide' : 'Open'}</button></div>
    <div class="ob-body">
      ${s.why ? `<p><span class="label">Why</span><br>${esc(s.why)}</p>` : ''}
      ${s.task ? `<p><span class="label">Your task</span><br>${esc(s.task)}</p>` : ''}
      <div class="row">${s.route ? `<a class="btn secondary sm" href="${esc(s.route)}" data-open>Go to ${esc(s.route.replace(/^#\//, '').split('?')[0].replace(/-/g, ' '))} →</a>` : ''}${s.manualRef ? `<a class="btn ghost sm" href="#/manual/${esc(String(s.manualRef).replace(/^manual-/, ''))}">Read the chapter</a>` : ''}
        ${!done ? `<button class="btn sm" data-verify="${esc(s.id)}" data-how="${verifyKind === 'manual' ? 'manual' : 'verified'}">${verifyKind === 'manual' ? 'Mark as done' : 'I did it, check'}</button>` : ''}</div>
      <div class="subtle" style="font-size:.74rem">${verifyText}</div>
      <div class="ob-verify"></div>
      <form class="row ob-ask" data-askstep="${esc(s.id)}"><input class="input" placeholder="Ask about this step…" style="flex:1;min-width:200px"><button class="btn ghost sm">Ask</button></form>
      <div class="ob-answer"></div>
    </div></li>`;
}
