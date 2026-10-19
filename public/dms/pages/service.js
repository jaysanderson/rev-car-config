// Service · job cards: list, workshop board, job card detail (lines, Infomedia menu quote, memos,
// photos, documents, vehicle history) and the two Progress Agentic RAG panels: "Ask about this
// job card" (resource-scoped) and "Ask across job cards" (all cards). API: docs/DMS-PHASE2-SPEC.md §3.
import { drawerForm, openDrawer, closeDrawer } from '../core.js';
import { api, state, esc, pick, items, num, money, date, dateTime, ago, pagehead, loading, failState, empty, tagArag, tagDomo, ann, statusChip, siteName, modelName, cap, custName, staffMap, bindRetry, spinBtn, toast, citations, prose, icon, LANGS, API } from '../core.js';
import { listView, withCustomers } from '../parts.js';

export const STATUSES = ['booked', 'checked_in', 'in_progress', 'awaiting_parts', 'awaiting_approval', 'completed', 'invoiced', 'collected', 'cancelled'];
const OPEN = STATUSES.slice(0, 7);
const LABEL = { booked: 'Booked', checked_in: 'Checked in', in_progress: 'In progress', awaiting_parts: 'Awaiting parts', awaiting_approval: 'Awaiting approval', completed: 'Completed', invoiced: 'Invoiced', collected: 'Collected', cancelled: 'Cancelled' };
// Button name → next status (names are the manual's exact button names)
const ACTIONS = { booked: [['Check in', 'checked_in']], checked_in: [['Start work', 'in_progress']], in_progress: [['Awaiting parts', 'awaiting_parts'], ['Request approval', 'awaiting_approval'], ['Complete', 'completed']], awaiting_parts: [['Start work', 'in_progress']], awaiting_approval: [['Start work', 'in_progress'], ['Complete', 'completed']], completed: [['Invoice', 'invoiced']], invoiced: [['Collected', 'collected']] };
const MEMO_KINDS = { customer_note: 'Customer note', tech_note: 'Technician note', advisor_note: 'Advisor note', parts_note: 'Parts note', quality: 'Quality check', call: 'Call', sla: 'SLA', credit: 'Credit' };
const INTERVALS = [10000, 15000, 20000, 30000, 40000, 45000, 50000, 60000, 75000, 80000, 90000, 100000, 105000, 120000];
const canWrite = () => (state.user?.caps || ['service.write']).includes('service.write');
const vehLabel = v => v ? [v.year, v.make || modelName(v.modelId), v.model && v.model !== modelName(v.modelId) ? v.model : null].filter(Boolean).join(' ') : '—';
const daysOpen = c => c.daysOpen ?? (c.bookedAt && !['collected', 'cancelled'].includes(c.status) ? Math.max(0, Math.floor((Date.now() - new Date(c.checkedInAt || c.bookedAt)) / 864e5)) : null);
const overdue = c => c.promisedAt && OPEN.includes(c.status) && c.status !== 'completed' && new Date(c.promisedAt) < new Date();
const chipTone = { booked: 'neutral', checked_in: 'info', in_progress: 'info', awaiting_parts: 'warn', awaiting_approval: 'warn', completed: 'good', invoiced: 'good', collected: 'neutral', cancelled: 'bad' };
const jcChip = s => s ? `<span class="chip ${chipTone[s] || ''}">${esc(LABEL[s] || cap(s))}</span>` : '';
const isImage = d => /^image\//.test(d.contentType || '') || /\.(png|jpe?g|webp)$/i.test(d.fileName || '') || d.kind === 'image' || d.kind === 'photo';

// ── fixture (only when the API has no /job-cards route yet; labelled on screen) ──
let FIXTURE = null;
async function fixture() {
  if (FIXTURE) return FIXTURE;
  const now = Date.now();
  const card = (i, status, model, make = 'Toyota', year = 2022) => ({ id: `JC-F${String(i).padStart(3, '0')}`, siteId: ['par', 'hor', 'pen', 'liv'][i % 4], customerId: 'C-10001', vehicle: { vin: `JTM0000000000${i}`, rego: `FX${i}AB`, make, model, modelId: model.toLowerCase().replace(/ /g, '-'), year, km: 30000 + i * 7000 }, advisorId: 'st-sp-01', technicianId: 'st-sp-02', status, bookedAt: new Date(now - (i + 2) * 864e5).toISOString(), promisedAt: new Date(now + (i % 3 - 1) * 864e5).toISOString(), customerRequests: ['Logbook service', i % 2 ? 'Check brake squeal' : 'Tyre pressure warning'], findings: i % 2 ? ['Front pads 3 mm, recommend replacement'] : [], recallsOpen: [], lines: [{ id: 'L1', type: 'labour', code: 'SVC60', desc: '60,000 km logbook service', qty: 1, hours: 1.8, unitPrice: 165, total: 297, source: 'menu', approved: true }, { id: 'L2', type: 'part', code: '90915-YZZD4', desc: 'Oil filter', qty: 1, hours: null, unitPrice: 18.5, total: 18.5, source: 'epc', approved: true }], laborHours: 1.8, partsTotal: 18.5, labourTotal: 297, total: 315.5, loanCar: i % 3 === 0, waiting: i % 4 === 0, memoCount: 2, imageCount: 1, documentCount: 1, statusHistory: [{ status: 'booked', at: new Date(now - (i + 2) * 864e5).toISOString() }], createdAt: new Date(now - (i + 2) * 864e5).toISOString() });
  const rows = [card(1, 'in_progress', 'RAV4'), card(2, 'awaiting_parts', 'HiLux'), card(3, 'booked', 'Corolla'), card(4, 'completed', 'Kluger'), card(5, 'awaiting_approval', 'Camry'), card(6, 'checked_in', 'Prado')];
  FIXTURE = { rows, memos: [{ id: 'M-F1', entity: 'job_card', entityId: 'JC-F001', at: new Date(now - 3600e3).toISOString(), byStaffId: 'st-sp-02', kind: 'tech_note', text: 'Front pads measured at 3 mm. Rotors within spec. Recommend pad replacement at this visit.', pinned: true }, { id: 'M-F2', entity: 'job_card', entityId: 'JC-F001', at: new Date(now - 7200e3).toISOString(), byStaffId: 'st-sp-01', kind: 'customer_note', text: 'Customer waiting in lounge; wants a call before any extra work over $300.', pinned: false }] };
  return FIXTURE;
}
const isFixture = r => r && r.status === 404;

// ── entry ────────────────────────────────────────────────────────────────────
export default async function jobCards(root, ctx) {
  if (ctx.params[0] === 'new') { await createCard(ctx); location.hash = '#/job-cards'; return; }
  if (ctx.params[0]) return detail(root, ctx, ctx.params[0]);
  const mode = ctx.query.view === 'board' ? 'board' : 'list';
  root.innerHTML = pagehead({
    title: 'Job cards', tags: tagArag(),
    sub: `Workshop repair orders for ${state.site ? siteName(state.site) : 'the group'}. Every card is a knowledge-box resource with its memos, photos and documents, so you can ask one card or all of them.`,
    actions: `<div class="segmented" role="group" aria-label="View"><button aria-pressed="${mode === 'list'}" data-v="list">List</button><button aria-pressed="${mode === 'board'}" data-v="board">Board</button></div>${canWrite() ? `<button class="btn" id="newjc">${icon('upload').replace('upload', 'plus')}New job card</button>` : ''}`,
  }) + `<section class="card aipanel" id="askall"><div class="chead"><h3>Ask across job cards</h3>${tagArag()}<div class="r">${ann('POST /dms/api/job-cards/ask {question, filters}', 'kb')}</div></div><div class="cbody stack" style="gap:10px">
      <form class="row" id="askf"><input class="input" id="askq" placeholder="Which cards are waiting on parts for more than two days?" style="flex:1;min-width:240px" aria-label="Question"><button class="btn" id="askb">Ask across job cards</button></form>
      <div class="examples" id="askex">${['Which cards are waiting on parts for more than two days?', 'Which customers are waiting in the lounge right now?', 'What did technicians find on RAV4s this month?', 'Which promised times have we missed today?', 'Summarise open recalls on cards in the workshop'].map(x => `<button type="button">${esc(x)}</button>`).join('')}</div>
      <div id="askout"></div></div></section><div id="jv"></div>`;
  root.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { location.hash = '#/job-cards' + (b.dataset.v === 'board' ? '?view=board' : ''); });
  const nb = root.querySelector('#newjc'); if (nb) nb.onclick = async () => { const c = await createCard(ctx); if (c) location.hash = '#/job-cards/' + encodeURIComponent(c.id); };
  bindAskAll(root);
  const host = root.querySelector('#jv');
  const staff = await staffMap();
  if (mode === 'board') return board(host, ctx, staff);
  const techs = Object.values(staff).filter(s => /tech|service/.test(s.role || ''));
  const lv = await listView(host, {
    endpoint: '/job-cards', count: 'job cards', search: 'Search rego, VIN, customer, job card…', annText: 'GET /dms/api/job-cards', initial: ctx.query, sort: '-bookedAt',
    filters: [{ key: 'status', label: 'Any status', options: STATUSES.map(s => [s, LABEL[s]]) }, ...(techs.length ? [{ key: 'technicianId', label: 'Any technician', options: techs.map(t => [t.id, t.name]) }] : [])],
    enrich: rows => withCustomers(rows),
    href: c => '#/job-cards/' + encodeURIComponent(c.id),
    emptyHtml: empty({ inline: true, title: 'No job cards', body: 'Nothing matches, or the service module has no cards for this site yet.', actions: canWrite() ? '<button class="btn secondary sm" id="newjc2">New job card</button>' : '' }),
    cols: [
      { label: 'Job card', sort: 'bookedAt', render: c => `<span class="cell-title">${esc(vehLabel(c.vehicle))} <span class="mono subtle">${esc(c.vehicle?.rego || '')}</span></span><span class="cell-sub mono">${esc(c.id)} · ${date(c.bookedAt)}</span>` },
      { label: 'Customer', render: c => `${esc(c.customer ? custName(c.customer) : c.customerId || '—')}<span class="cell-sub">${esc(siteName(c.siteId))}${c.waiting ? ' · waiting' : ''}${c.loanCar ? ' · loan car' : ''}</span>` },
      { label: 'Status', sort: 'status', render: c => jcChip(c.status) + (overdue(c) ? ' <span class="chip bad">Promised time missed</span>' : '') },
      { label: 'Promised', sort: 'promisedAt', render: c => c.promisedAt ? dateTime(c.promisedAt) : '—' },
      { label: 'Technician', render: c => esc(staff[c.technicianId]?.name || c.technicianId || '—') + `<span class="cell-sub">${esc(staff[c.advisorId]?.name || '')}</span>` },
      { label: 'Days', num: true, render: c => daysOpen(c) == null ? '—' : num(daysOpen(c)) },
      { label: 'Memos · photos · docs', render: c => `<span class="pills"><span class="chip neutral" title="Memos">${num(c.memoCount || 0)} memo${c.memoCount === 1 ? '' : 's'}</span><span class="chip neutral" title="Photos">${num(c.imageCount || 0)} photo${c.imageCount === 1 ? '' : 's'}</span><span class="chip neutral" title="Documents">${num(c.documentCount || 0)} doc${c.documentCount === 1 ? '' : 's'}</span></span>` },
      { label: 'Total', num: true, sort: 'total', render: c => money(c.total) },
    ],
  });
  // API not built yet? show the fixture so the page can be reviewed, clearly labelled.
  const probe = await api('/job-cards', { query: { pageSize: 1 } });
  if (isFixture(probe)) {
    const f = await fixture();
    host.innerHTML = `<div class="notice">${icon('alert')}<div><b>Fixture data.</b> <code>GET /dms/api/job-cards</code> is not in this build yet; these six cards are a local fixture so the page can be reviewed.</div></div>` + host.innerHTML.replace(/<div data-list>[\s\S]*$/, '');
    const tbl = document.createElement('div'); host.appendChild(tbl);
    tbl.innerHTML = `<div class="datatable"><div class="scroll"><table><thead><tr><th>Job card</th><th>Status</th><th>Promised</th><th>Days</th><th class="num">Total</th></tr></thead><tbody>${f.rows.map(c => `<tr data-href="#/job-cards/${c.id}" tabindex="0"><td><span class="cell-title">${esc(vehLabel(c.vehicle))} <span class="mono subtle">${esc(c.vehicle.rego)}</span></span><span class="cell-sub mono">${esc(c.id)}</span></td><td>${jcChip(c.status)}</td><td>${dateTime(c.promisedAt)}</td><td>${daysOpen(c)}</td><td class="num">${money(c.total)}</td></tr>`).join('')}</tbody></table></div></div>`;
    tbl.querySelectorAll('tr[data-href]').forEach(tr => tr.onclick = () => { location.hash = tr.dataset.href; });
  }
  const nb2 = root.querySelector('#newjc2'); if (nb2) nb2.onclick = () => root.querySelector('#newjc')?.click();
  return lv;
}

function bindAskAll(root, { endpoint = '/job-cards/ask', filters } = {}) {
  const f = root.querySelector('#askf'), q = root.querySelector('#askq'), b = root.querySelector('#askb'), out = root.querySelector('#askout');
  const send = async () => {
    const text = q.value.trim(); if (!text) return;
    spinBtn(b, true, 'Asking…'); out.innerHTML = `<div class="thinking"><span class="dots"><i></i><i></i><i></i></span>Retrieving the matching job cards from the knowledge box and the live board…</div>`;
    const r = await api(endpoint, { method: 'POST', body: { question: text, lang: state.lang, filters: filters || { siteId: state.site || undefined } } });
    spinBtn(b, false);
    if (!r.ok) { out.innerHTML = failState(r, { what: 'an answer', endpoint: `POST ${endpoint}`, inline: true }); return; }
    out.innerHTML = answerBlock(r.data, { considered: r.data.cardsConsidered, evidenceHref: id => '#/job-cards/' + encodeURIComponent(id) });
  };
  f.onsubmit = e => { e.preventDefault(); send(); };
  root.querySelectorAll('#askex button').forEach(x => x.onclick = () => { q.value = x.textContent; send(); });
}

// Shared renderer for the agent's answer (job cards, suppliers, customers)
export function answerBlock(d, { considered, evidenceHref, label = 'Progress Agentic RAG' } = {}) {
  const ev = d.evidence || [];
  return `<div class="ai-out">
    <div class="prose">${prose(d.answer || 'No answer.')}</div>
    ${ev.length ? `<div><h4>Evidence</h4><div class="stack" style="gap:6px">${ev.map(e => `<a class="row" href="${evidenceHref ? evidenceHref(e.id) : '#'}">${icon('doc')}<span class="mono">${esc(e.id)}</span>${e.status ? jcChip(e.status) : ''}<span class="muted">${esc(e.why || e.title || '')}</span></a>`).join('')}</div></div>` : ''}
    ${(d.citations || d.sources || []).length ? `<div><h4>Sources</h4>${citations(d.citations || d.sources)}</div>` : ''}
    ${(d.trace || []).length ? `<div class="pills">${d.trace.map(t => `<span class="chip ${t.kind === 'kb' ? 'info' : t.kind === 'domo' ? 'good' : 'neutral'}">${esc(t.label || t)}</span>`).join('')}</div>` : ''}
    <div class="meta">${tagArag(label)}<span class="subtle" style="font-size:.72rem">${considered != null ? `${num(considered)} card${considered === 1 ? '' : 's'} considered · ` : ''}${d.memosUsed != null ? `${d.memosUsed} memo${d.memosUsed === 1 ? '' : 's'} read · ` : ''}${esc(LANGS[d.lang || state.lang] || '')}${d.ms ? ` · ${(d.ms / 1000).toFixed(1)} s` : ''}${d.by === 'scripted' || d.grounded === false ? ' · not grounded (fallback)' : ''}</span></div>
    <div class="json">${esc(JSON.stringify(d, null, 2))}</div></div>`;
}

// ── board ────────────────────────────────────────────────────────────────────
async function board(host, ctx, staff) {
  host.innerHTML = loading(6);
  let r = await api('/job-cards/board', { query: { siteId: state.site } });
  let cols;
  if (r.ok) cols = r.data?.columns || [];
  else if (isFixture(r)) { const f = await fixture(); cols = OPEN.map(s => ({ status: s, cards: f.rows.filter(c => c.status === s) })); host.insertAdjacentHTML('beforebegin', `<div class="notice">${icon('alert')}<div><b>Fixture data</b> · <code>GET /dms/api/job-cards/board</code> is not in this build yet.</div></div>`); }
  else { host.innerHTML = failState(r, { what: 'the workshop board', endpoint: 'GET /dms/api/job-cards/board' }); bindRetry(host, ctx.rerender); return; }
  const allCards = cols.flatMap(c => c.cards || []);
  const rows = await withCustomers(allCards);
  const byId = Object.fromEntries(rows.map(c => [c.id, c]));
  host.innerHTML = `<div class="board" data-src="GET /job-cards/board">${cols.filter(c => OPEN.includes(c.status)).map(col => { const list = (col.cards || []).map(c => byId[c.id] || c); const hrs = list.reduce((n, c) => n + (c.laborHours || 0), 0);
    return `<div class="col"><div class="h"><b>${esc(LABEL[col.status] || cap(col.status))}</b><span class="n">${list.length}</span><span class="s">${hrs ? hrs.toFixed(1) + ' h' : ''}</span></div><div class="list">${list.slice(0, 40).map(c => `<div class="dcard${overdue(c) ? ' stuck' : ''}"><a href="#/job-cards/${encodeURIComponent(c.id)}" style="text-decoration:none;color:inherit"><div class="t"><b>${esc(vehLabel(c.vehicle))}</b><span class="id">${esc(c.vehicle?.rego || c.id)}</span></div><div class="m">${esc(c.customer ? custName(c.customer) : c.customerId || '')}${c.waiting ? ' · <b>waiting</b>' : ''}${c.loanCar ? ' · loan car' : ''}</div><div class="f"><span class="subtle">${esc(staff[c.technicianId]?.avatarInitials || staff[c.technicianId]?.name?.split(' ').map(w => w[0]).join('') || '—')} · promised ${esc(c.promisedAt ? new Date(c.promisedAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }) : '—')}</span><span class="p">${money(c.total)}</span></div></a>${canWrite() && ACTIONS[c.status] ? `<div class="row" style="gap:4px;margin-top:6px;flex-wrap:wrap">${ACTIONS[c.status].map(([lab, st]) => `<button class="btn ghost sm" data-move="${esc(c.id)}:${st}">${esc(lab)}</button>`).join('')}</div>` : ''}</div>`).join('') || '<div class="subtle" style="font-size:.8rem;padding:8px">Empty</div>'}</div></div>`; }).join('')}</div>
  <p class="subtle" style="font-size:.74rem;margin-top:8px">Amber edge: promised time has passed. Totals are labour and parts on the card. ${ann('GET /dms/api/job-cards/board?siteId=')}</p>`;
  host.querySelectorAll('[data-move]').forEach(b => b.onclick = async () => { const [id, st] = b.dataset.move.split(':'); const y = await api('/job-cards/' + encodeURIComponent(id), { method: 'PATCH', body: { status: st } }); if (y.ok) { toast(`${id}: ${LABEL[st]}`); ctx.rerender(); } else toast(y.status === 403 ? 'Your role can’t move job cards' : `Couldn’t move: ${y.error}`); });
}

// ── create ───────────────────────────────────────────────────────────────────
async function createCard(ctx) {
  const staff = await staffMap();
  const advisors = Object.values(staff).filter(s => /service|advisor|sales_manager|gm/.test(s.role || ''));
  const f = await drawerForm('New job card', `
    <div class="grid g2" style="gap:10px">
      <div class="field"><label for="jcc">Customer id</label><input class="input mono" id="jcc" name="customerId" placeholder="C-10001" required></div>
      <div class="field"><label for="jcr">Registration</label><input class="input mono" id="jcr" name="rego" placeholder="ABC12D" required></div>
      <div class="field"><label for="jcv">VIN</label><input class="input mono" id="jcv" name="vin" placeholder="17 characters"></div>
      <div class="field"><label for="jcm">Make and model</label><input class="input" id="jcm" name="makeModel" placeholder="Toyota RAV4" required></div>
      <div class="field"><label for="jcy">Year</label><input class="input" id="jcy" name="year" type="number" min="1990" max="2027" value="2022"></div>
      <div class="field"><label for="jck">Odometer (km)</label><input class="input" id="jck" name="km" type="number" min="0" step="100"></div>
      <div class="field"><label for="jca">Service advisor</label><select class="select" id="jca" name="advisorId">${advisors.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('') || '<option value="">—</option>'}</select></div>
      <div class="field"><label for="jcp">Promised time</label><input class="input" id="jcp" name="promisedAt" type="datetime-local" required></div>
    </div>
    <div class="field"><label for="jcq">Customer requests (one per line)</label><textarea class="textarea" id="jcq" name="requests" style="min-height:80px" placeholder="Logbook service\nNoise from front left when braking"></textarea></div>
    <div class="row"><label class="switch"><input type="checkbox" name="waiting"> Customer waiting</label><label class="switch"><input type="checkbox" name="loanCar"> Loan car</label></div>`, { submit: 'New job card', note: 'Creates the repair order and its knowledge-box resource; memos, photos and documents can be added on the card.' });
  if (!f) return null;
  const v = f.values; const [make, ...rest] = String(v.makeModel || '').trim().split(/\s+/);
  const y = await api('/job-cards', { method: 'POST', body: { customerId: v.customerId, vehicle: { vin: v.vin || null, rego: v.rego, make, model: rest.join(' '), year: Number(v.year) || null, km: Number(v.km) || null }, advisorId: v.advisorId || null, promisedAt: v.promisedAt ? new Date(v.promisedAt).toISOString() : null, customerRequests: String(v.requests || '').split('\n').map(s => s.trim()).filter(Boolean), loanCar: v.loanCar === 'on', waiting: v.waiting === 'on' } });
  if (!y.ok) { f.err(y.status === 404 ? 'POST /dms/api/job-cards is not in this build yet.' : `Couldn’t create (${y.status}): ${y.error}`); return null; }
  f.close(); toast('Job card created');
  return y.data?.jobCard || y.data;
}

// ── detail ───────────────────────────────────────────────────────────────────
async function detail(root, ctx, id) {
  root.innerHTML = loading(10);
  const [r, staff] = await Promise.all([api('/job-cards/' + encodeURIComponent(id)), staffMap()]);
  let x, fix = false;
  if (r.ok) x = r.data || {};
  else if (isFixture(r)) { const f = await fixture(); const c = f.rows.find(c => c.id === id); if (!c) { root.innerHTML = pagehead({ title: id, crumbs: [['Job cards', '#/job-cards'], [id]] }) + failState(r, { what: 'this job card', endpoint: 'GET /dms/api/job-cards/' + id }); return; } x = { ...c, memos: f.memos.filter(m => m.entityId === id), documents: [], vehicleHistory: [] }; fix = true; }
  else { root.innerHTML = pagehead({ title: id, crumbs: [['Job cards', '#/job-cards'], [id]] }) + failState(r, { what: 'this job card', endpoint: 'GET /dms/api/job-cards/' + id }); bindRetry(root, ctx.rerender); return; }
  const c = x.jobCard || x;
  const cust = x.customer || c.customer;
  const memos = [...(x.memos || c.memos || [])].sort((a, b) => (b.pinned === true) - (a.pinned === true) || String(b.at).localeCompare(String(a.at)));
  const docs = x.documents || c.documents || [];
  const images = docs.filter(isImage), files = docs.filter(d => !isImage(d));
  const hist = x.vehicleHistory || [];
  const lines = c.lines || [];
  const adv = staff[c.advisorId], tech = staff[c.technicianId];
  const actions = canWrite() && ACTIONS[c.status] ? ACTIONS[c.status].map(([lab, st], i) => `<button class="btn ${i === 0 ? '' : 'secondary'}" data-move="${st}">${esc(lab)}</button>`).join('') : '';
  const labourTotal = c.labourTotal ?? lines.filter(l => l.type === 'labour' || l.type === 'menu').reduce((n, l) => n + (l.total || 0), 0);
  const partsTotal = c.partsTotal ?? lines.filter(l => l.type === 'part').reduce((n, l) => n + (l.total || 0), 0);
  const total = c.total ?? lines.reduce((n, l) => n + (l.total || 0), 0);
  const stIdx = OPEN.indexOf(c.status);

  root.innerHTML = pagehead({
    title: `${vehLabel(c.vehicle)} · ${c.vehicle?.rego || c.id}`, crumbs: [['Job cards', '#/job-cards'], [c.id]],
    tags: jcChip(c.status) + (overdue(c) ? ' <span class="chip bad">Promised time missed</span>' : '') + (c.waiting ? ' <span class="chip info">Customer waiting</span>' : '') + (c.loanCar ? ' <span class="chip neutral">Loan car</span>' : '') + (fix ? ' <span class="chip warn">Fixture</span>' : ''),
    sub: `<span class="mono">${esc(c.id)}</span> · ${cust ? `<a href="#/customers/${encodeURIComponent(cust.id)}">${esc(custName(cust))}</a>` : esc(c.customerId || '')} · ${esc(siteName(c.siteId))} · advisor ${esc(adv?.name || c.advisorId || '—')} · technician ${esc(tech?.name || c.technicianId || 'unassigned')} · promised ${c.promisedAt ? dateTime(c.promisedAt) : '—'}`,
    actions: actions + (canWrite() ? `<button class="btn ghost" id="assign">Assign technician</button>` : ''),
  }) + `
  <div class="card" style="margin-bottom:16px"><div class="cbody" style="display:flex;gap:4px;overflow-x:auto">${OPEN.map((s, i) => `<div style="flex:1;min-width:84px"><div style="height:5px;border-radius:999px;background:${c.status === 'cancelled' ? 'var(--hairline)' : i <= stIdx ? 'var(--accent-500)' : 'var(--hairline)'}"></div><div style="font-size:.72rem;margin-top:5px;color:${s === c.status ? 'var(--text)' : 'var(--muted)'};font-weight:${s === c.status ? 700 : 500}">${esc(LABEL[s])}</div></div>`).join('')}</div></div>
  <div class="split">
    <div class="stack">
      <div class="grid g2">
        <section class="card"><div class="chead"><h3>Vehicle</h3><div class="r">${ann('job_cards.vehicle')}</div></div><div class="cbody"><dl class="kv">
          <dt>Vehicle</dt><dd>${esc(vehLabel(c.vehicle))}</dd><dt>Registration</dt><dd class="mono">${esc(c.vehicle?.rego || '—')}</dd><dt>VIN</dt><dd class="mono">${esc(c.vehicle?.vin || '—')}</dd><dt>Odometer</dt><dd>${c.vehicle?.km != null ? num(c.vehicle.km) + ' km' : '—'}</dd>
          <dt>Booked</dt><dd>${dateTime(c.bookedAt)}</dd>${c.checkedInAt ? `<dt>Checked in</dt><dd>${dateTime(c.checkedInAt)}</dd>` : ''}${c.completedAt ? `<dt>Completed</dt><dd>${dateTime(c.completedAt)}</dd>` : ''}${c.collectedAt ? `<dt>Collected</dt><dd>${dateTime(c.collectedAt)}</dd>` : ''}
          ${(c.recallsOpen || []).length ? `<dt>Open recalls</dt><dd>${c.recallsOpen.map(rc => `<span class="chip bad">${esc(rc.campaign || '')} ${esc(rc.title || '')}</span>`).join(' ')} ${tagArag('Infomedia pack')}</dd>` : ''}
        </dl></div></section>
        <section class="card"><div class="chead"><h3>Requests and findings</h3>${canWrite() ? `<div class="r"><button class="btn ghost sm" id="addfind">Add finding</button></div>` : ''}</div><div class="cbody stack" style="gap:10px">
          <div><span class="label">Customer requests</span><ul style="margin:4px 0 0;padding-left:18px">${(c.customerRequests || []).map(q => `<li>${esc(q)}</li>`).join('') || '<li class="muted">None recorded</li>'}</ul></div>
          <div><span class="label">Technician findings</span><ul style="margin:4px 0 0;padding-left:18px" id="findings">${(c.findings || []).map(q => `<li>${esc(q)}</li>`).join('') || '<li class="muted">None yet</li>'}</ul></div>
        </div></section>
      </div>
      <section class="card"><div class="chead"><h3>Lines</h3><span class="sub">${lines.length}</span><div class="r">${canWrite() ? `<button class="btn ghost sm" id="addline">Add line</button><button class="btn secondary sm" id="quote">Quote from Infomedia menu</button>` : ''}${ann('job_cards.lines · POST /job-cards/:id/lines')}</div></div>
        <div class="cbody">${lines.length ? `<div class="datatable compact"><div class="scroll"><table><thead><tr><th>Type</th><th>Code</th><th>Description</th><th class="num">Qty</th><th class="num">Hours</th><th class="num">Unit</th><th class="num">Total</th><th>Source</th></tr></thead><tbody>${lines.map(l => `<tr><td><span class="chip ${l.type === 'part' ? 'neutral' : 'info'}">${esc(cap(l.type))}</span></td><td class="mono">${esc(l.code || '')}</td><td>${esc(l.desc || '')}${l.approved === false ? ' <span class="chip warn">Awaiting approval</span>' : ''}</td><td class="num">${num(l.qty ?? 1)}</td><td class="num">${l.hours != null ? Number(l.hours).toFixed(1) : '—'}</td><td class="num">${money(l.unitPrice)}</td><td class="num">${money(l.total)}</td><td><span class="chip out">${esc(l.source === 'menu' ? 'Infomedia menu' : l.source === 'epc' ? 'Microcat EPC' : cap(l.source || 'manual'))}</span></td></tr>`).join('')}</tbody></table></div></div>` : '<span class="muted" style="font-size:.85rem">No lines yet. Add a line or quote from an Infomedia menu.</span>'}</div>
        <div class="cfoot">Labour ${money(labourTotal)} (${(c.laborHours || 0).toFixed(1)} h) · Parts ${money(partsTotal)} · <b>Total ${money(total)}</b> incl. GST</div></section>
      <section class="card"><div class="chead"><h3>Memos</h3><span class="sub">${memos.length}</span><div class="r">${canWrite() ? `<button class="btn sm" id="addmemo">Add memo</button>` : ''}${ann('memos · POST /job-cards/:id/memos', 'kb')}</div></div><div class="cbody">
        <p class="muted" style="font-size:.82rem;margin-bottom:10px">Memos are part of the card’s knowledge-box resource, so the assistant reads them when you ask about this card. Pinned memos are listed first.</p>
        <ol class="timeline" id="memos">${memos.map(m => memoItem(m, staff)).join('') || '<li><span class="muted">No memos yet.</span></li>'}</ol></div></section>
      <section class="card"><div class="chead"><h3>Photos</h3><span class="sub">${images.length}</span><div class="r">${canWrite() ? `<button class="btn ghost sm" id="addphoto">Add photo</button><input type="file" id="photofile" accept="image/png,image/jpeg,image/webp" class="sr">` : ''}${ann('documents kind image · POST /job-cards/:id/documents', 'kb')}</div></div><div class="cbody">
        ${images.length ? `<div class="grid g3" style="gap:10px" id="gallery">${images.map(d => `<figure style="margin:0" class="card flat"><a href="#" data-lb="${esc(d.id)}" style="display:block;aspect-ratio:4/3;overflow:hidden;border-radius:8px 8px 0 0;background:var(--hairline)"><img src="${esc(imgUrl(d, true))}" alt="${esc(d.title || d.fileName || 'Photo')}" loading="lazy" style="width:100%;height:100%;object-fit:cover" data-full="${esc(imgUrl(d))}"></a><figcaption style="padding:8px 10px;font-size:.78rem"><b>${esc(d.title || d.caption || d.fileName || 'Photo')}</b>${d.caption && d.title ? `<div class="muted">${esc(d.caption)}</div>` : ''}<div class="row" style="gap:6px;margin-top:4px">${d.aragResourceId || d.attachedToKb ? `<span class="tag arag" title="Attached to the card’s knowledge-box resource"><i></i>read by the agent</span>` : `<span class="chip neutral">not yet in the knowledge box</span>`}<span class="subtle">${dateTime(d.uploadedAt)}</span></div></figcaption></figure>`).join('')}</div>` : '<span class="muted" style="font-size:.85rem">No photos. Add damage, odometer, dash-light or tread photos; they are attached to the card’s resource so the agent can see them.</span>'}</div></section>
      <section class="card"><div class="chead"><h3>Documents</h3><span class="sub">${files.length}</span><div class="r">${canWrite() ? `<button class="btn ghost sm" id="adddoc">Upload document</button><input type="file" id="docfile" accept="application/pdf,.pdf" class="sr">` : ''}</div></div><div class="cbody">${files.length ? `<div class="stack" style="gap:8px">${files.map(o => `<div class="row"><a class="row grow" href="#/documents/${encodeURIComponent(o.id)}" style="gap:8px">${icon('doc')}<span>${esc(o.fileName || o.id)}</span><span class="chip out">${esc(cap(o.kind || 'document'))}</span>${statusChip(o.status)}</a>${canWrite() && o.status === 'uploaded' ? `<a class="btn ghost sm" href="#/documents/${encodeURIComponent(o.id)}?process=1">Process</a>` : ''}</div>`).join('')}</div>` : '<span class="muted" style="font-size:.85rem">No documents. Upload an inspection report, a sublet invoice or a customer authority.</span>'}</div></section>
      ${hist.length ? `<section class="card"><div class="chead"><h3>Vehicle history</h3><span class="sub">${hist.length}</span><div class="r">${ann('GET /job-cards?vin=')}</div></div><div class="cbody"><div class="stack" style="gap:8px">${hist.map(h => `<a class="row" href="#/job-cards/${encodeURIComponent(h.id)}">${icon('doc')}<span class="mono">${esc(h.id)}</span>${jcChip(h.status)}<span class="muted">${date(h.bookedAt)} · ${h.vehicle?.km != null ? num(h.vehicle.km) + ' km · ' : ''}${esc((h.customerRequests || []).slice(0, 2).join('; '))} · ${money(h.total)}</span></a>`).join('')}</div></div></section>` : ''}
    </div>
    <div class="stack">
      <section class="card aipanel" id="ai"><div class="chead"><h3>Ask about this job card</h3>${tagArag()}<div class="r">${ann('POST /dms/api/job-cards/' + c.id + '/ask', 'kb')}</div></div><div class="cbody stack" style="gap:10px">
        <p class="muted" style="font-size:.82rem">Answers come from this card’s own resource (requests, findings, lines, memos, photos and documents) plus the service policies, with citations.</p>
        <form class="row" id="jcaskf"><input class="input" id="jcaskq" placeholder="What did the technician find?" style="flex:1;min-width:160px" aria-label="Question"><button class="btn" id="jcaskb">Ask</button></form>
        <div class="examples" id="jcex">${['What did the technician find?', 'Is the customer waiting, and what did they ask for?', 'What is outstanding before collection?', 'What do the photos show?', 'Is any work awaiting approval, and for how much?'].map(x => `<button type="button">${esc(x)}</button>`).join('')}</div>
        <div id="jcaskout"></div>
        <div class="hairline" style="padding-top:10px"><button class="btn secondary" id="handover">${icon('assistant')}Handover note</button> <span class="subtle" style="font-size:.72rem">Customer-ready note: what was done, found and what is next.</span></div>
      </div></section>
      ${cust ? `<section class="card"><div class="chead"><h3>Customer</h3></div><div class="cbody"><dl class="kv"><dt>Name</dt><dd><a href="#/customers/${encodeURIComponent(cust.id)}">${esc(custName(cust))}</a></dd><dt>Phone</dt><dd>${esc(cust.phone || '—')}</dd><dt>Email</dt><dd>${esc(cust.email || '—')}</dd><dt>Waiting</dt><dd>${c.waiting ? 'Yes, in the lounge' : 'No'}</dd><dt>Loan car</dt><dd>${c.loanCar ? 'Yes' : 'No'}</dd></dl></div></section>` : ''}
      <section class="card"><div class="chead"><h3>Knowledge box</h3>${tagArag()}</div><div class="cbody" style="font-size:.84rem"><dl class="kv"><dt>Resource</dt><dd class="mono">${esc(x.kbResourceId || c.kbResourceId || (fix ? 'fixture' : 'not synced'))}</dd><dt>Label</dt><dd class="mono">topic/jobcard</dd><dt>Contents</dt><dd>card text, ${memos.length} memo${memos.length === 1 ? '' : 's'}, ${images.length} photo${images.length === 1 ? '' : 's'}, ${files.length} document${files.length === 1 ? '' : 's'}</dd></dl>${canWrite() ? `<button class="btn ghost sm" id="synckb" style="margin-top:8px">Sync to knowledge box</button>${ann('POST /job-cards/:id/sync-kb', 'kb')}` : ''}</div></section>
    </div>
  </div>
  <div id="lightbox" hidden style="position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:120;display:grid;place-items:center;padding:24px"><img alt="" style="max-width:92vw;max-height:88vh;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.6)"><div style="position:absolute;top:16px;right:20px;color:#fff;font-size:.9rem" id="lbcap"></div></div>`;

  // actions
  const move = async (status, extra) => { const y = await api('/job-cards/' + encodeURIComponent(c.id), { method: 'PATCH', body: { status, ...(extra || {}) } }); if (y.ok) { toast(`${LABEL[status]}`); ctx.rerender(); } else toast(y.status === 403 ? 'Your role can’t change this job card' : y.status === 404 ? 'PATCH /job-cards/:id is not in this build yet' : `Couldn’t update: ${y.error}`); };
  root.querySelectorAll('[data-move]').forEach(b => b.onclick = () => move(b.dataset.move));
  const on = (sel, fn) => { const b = root.querySelector(sel); if (b) b.onclick = fn; };
  on('#assign', async () => {
    const techs = Object.values(staff).filter(s => /tech/.test(s.role || '')).concat(Object.values(staff).filter(s => !/tech/.test(s.role || '')));
    const f = await drawerForm('Assign technician', `<div class="field"><label for="tsel">Technician</label><select class="select" id="tsel" name="technicianId">${techs.map(t => `<option value="${esc(t.id)}" ${t.id === c.technicianId ? 'selected' : ''}>${esc(t.name)} · ${esc(cap(t.role || ''))}</option>`).join('')}</select></div>`, { submit: 'Assign', sub: c.id });
    if (!f) return; const y = await api('/job-cards/' + encodeURIComponent(c.id), { method: 'PATCH', body: { technicianId: f.values.technicianId } }); if (!y.ok) return f.err(`Couldn’t assign: ${y.error}`); f.close(); toast('Technician assigned'); ctx.rerender();
  });
  on('#addfind', async () => {
    const f = await drawerForm('Add finding', `<div class="field"><label for="fnd">Finding</label><textarea class="textarea" id="fnd" name="finding" style="min-height:80px" required placeholder="Front pads 3 mm, recommend replacement"></textarea></div>`, { submit: 'Add finding', sub: c.id, note: 'Findings go on the card and into its knowledge-box resource.' });
    if (!f) return; const y = await api('/job-cards/' + encodeURIComponent(c.id), { method: 'PATCH', body: { findings: [...(c.findings || []), f.values.finding.trim()] } }); if (!y.ok) return f.err(`Couldn’t save: ${y.error}`); f.close(); toast('Finding added'); ctx.rerender();
  });
  on('#addline', async () => {
    const f = await drawerForm('Add line', `<div class="grid g2" style="gap:10px"><div class="field"><label for="lt">Type</label><select class="select" id="lt" name="type"><option value="labour">Labour</option><option value="part">Part</option><option value="sublet">Sublet</option></select></div><div class="field"><label for="lc">Code</label><input class="input mono" id="lc" name="code" placeholder="SVC60 / 90915-YZZD4"></div><div class="field" style="grid-column:1/-1"><label for="ld">Description</label><input class="input" id="ld" name="desc" required></div><div class="field"><label for="lq">Qty</label><input class="input" id="lq" name="qty" type="number" min="0" step="1" value="1"></div><div class="field"><label for="lh">Hours (labour)</label><input class="input" id="lh" name="hours" type="number" min="0" step="0.1"></div><div class="field"><label for="lp">Unit price (AUD, incl. GST)</label><input class="input" id="lp" name="unitPrice" type="number" min="0" step="0.01" required></div></div>`, { submit: 'Add line', sub: c.id });
    if (!f) return; const v = f.values; const y = await api(`/job-cards/${encodeURIComponent(c.id)}/lines`, { method: 'POST', body: { type: v.type, code: v.code, desc: v.desc, qty: Number(v.qty) || 1, hours: v.hours ? Number(v.hours) : null, unitPrice: Number(v.unitPrice), source: 'manual' } }); if (!y.ok) return f.err(`Couldn’t add: ${y.error}`); f.close(); toast('Line added'); ctx.rerender();
  });
  on('#quote', () => infomediaQuote(c, ctx));
  on('#addmemo', async () => {
    const f = await drawerForm('Add memo', `<div class="field"><label for="mk">Kind</label><select class="select" id="mk" name="kind">${Object.entries(MEMO_KINDS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></div><div class="field"><label for="mt">Memo</label><textarea class="textarea" id="mt" name="text" style="min-height:110px" required placeholder="What should the next person know?"></textarea></div><label class="switch"><input type="checkbox" name="pinned"> Pin to the top</label>`, { submit: 'Add memo', sub: c.id, note: 'The memo is added to the card and its knowledge-box resource is re-synced, so “Ask about this job card” sees it within a minute.' });
    if (!f) return; const y = await api(`/job-cards/${encodeURIComponent(c.id)}/memos`, { method: 'POST', body: { kind: f.values.kind, text: f.values.text.trim(), pinned: f.values.pinned === 'on' } }); if (!y.ok) return f.err(y.status === 404 ? 'POST /job-cards/:id/memos is not in this build yet.' : `Couldn’t add: ${y.error}`); f.close(); toast('Memo added'); ctx.rerender();
  });
  root.querySelectorAll('[data-pin]').forEach(b => b.onclick = async () => { const y = await api('/memos/' + encodeURIComponent(b.dataset.pin), { method: 'PATCH', body: { pinned: b.dataset.pinned !== 'true' } }); if (y.ok) ctx.rerender(); else toast(`Couldn’t pin: ${y.error}`); });
  const uploadTo = async (file, kind) => {
    if (file.size > 6 * 1024 * 1024) return toast('That file is over 6 MB.');
    const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(file); });
    const y = await api(`/job-cards/${encodeURIComponent(c.id)}/documents`, { method: 'POST', body: { fileName: file.name, kind, contentType: file.type || (kind === 'image' ? 'image/jpeg' : 'application/pdf'), contentBase64: b64, title: file.name.replace(/\.[^.]+$/, '') } });
    if (!y.ok) return toast(y.status === 404 ? 'POST /job-cards/:id/documents is not in this build yet' : y.status === 413 ? 'The API refused the file as too large' : `Upload failed (${y.status}): ${y.error}`);
    toast(kind === 'image' ? 'Photo added and attached to the card’s resource' : 'Document uploaded'); ctx.rerender();
  };
  on('#addphoto', () => root.querySelector('#photofile').click()); const pf = root.querySelector('#photofile'); if (pf) pf.onchange = () => pf.files[0] && uploadTo(pf.files[0], 'image');
  on('#adddoc', () => root.querySelector('#docfile').click()); const df = root.querySelector('#docfile'); if (df) df.onchange = () => df.files[0] && uploadTo(df.files[0], 'inspection_report');
  // lightbox
  const lb = root.querySelector('#lightbox');
  root.querySelectorAll('[data-lb]').forEach(a => a.onclick = e => { e.preventDefault(); const img = a.querySelector('img'); lb.querySelector('img').src = img.dataset.full || img.src; lb.querySelector('#lbcap').textContent = img.alt; lb.hidden = false; });
  lb.onclick = () => { lb.hidden = true; };
  on('#synckb', async () => { const b = root.querySelector('#synckb'); spinBtn(b, true, 'Syncing…'); const y = await api(`/job-cards/${encodeURIComponent(c.id)}/sync-kb`, { method: 'POST', timeout: 60000 }); spinBtn(b, false); toast(y.ok ? `Synced · resource ${String(y.data?.resourceId || y.data?.kbResourceId || '').slice(0, 10)}` : y.status === 404 ? 'POST /job-cards/:id/sync-kb is not in this build yet' : `Sync failed: ${y.error}`); if (y.ok) ctx.rerender(); });
  // ask about this job card
  const aq = root.querySelector('#jcaskq'), ab = root.querySelector('#jcaskb'), ao = root.querySelector('#jcaskout');
  const askOne = async () => {
    const text = aq.value.trim(); if (!text) return;
    spinBtn(ab, true, 'Asking…'); ao.innerHTML = `<div class="thinking"><span class="dots"><i></i><i></i><i></i></span>Reading this card’s resource, memos and attachments…</div>`;
    const y = await api(`/job-cards/${encodeURIComponent(c.id)}/ask`, { method: 'POST', body: { question: text, lang: state.lang } });
    spinBtn(ab, false);
    ao.innerHTML = y.ok ? answerBlock(y.data) : failState(y, { what: 'an answer', endpoint: `POST /job-cards/${c.id}/ask`, inline: true });
  };
  root.querySelector('#jcaskf').onsubmit = e => { e.preventDefault(); askOne(); };
  root.querySelectorAll('#jcex button').forEach(b => b.onclick = () => { aq.value = b.textContent; askOne(); });
  on('#handover', async () => {
    const b = root.querySelector('#handover'); spinBtn(b, true, 'Writing…');
    const y = await api(`/job-cards/${encodeURIComponent(c.id)}/summary`, { method: 'POST', body: { lang: state.lang }, timeout: 60000 });
    spinBtn(b, false);
    const body = openDrawer('Handover note', y.ok ? `<div class="stack" style="gap:12px"><div class="prose">${prose(pick(y.data, 'note', 'summary', 'answer', 'text') || '')}</div>${(y.data.nextSteps || []).length ? `<div><span class="label">Next</span><ul style="margin:4px 0 0;padding-left:18px">${y.data.nextSteps.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}${(y.data.citations || []).length ? `<div><span class="label">Sources</span>${citations(y.data.citations)}</div>` : ''}<div class="meta">${tagArag()}<span class="subtle" style="font-size:.72rem">${esc(LANGS[state.lang] || '')}${y.data.ms ? ` · ${(y.data.ms / 1000).toFixed(1)} s` : ''}</span></div><button class="btn secondary" id="copynote">Copy for the customer</button></div>` : failState(y, { what: 'the handover note', endpoint: `POST /job-cards/${c.id}/summary`, inline: true }), c.id);
    const cp = body.querySelector('#copynote'); if (cp) cp.onclick = () => navigator.clipboard?.writeText(pick(y.data, 'note', 'summary', 'answer', 'text') || '').then(() => toast('Copied'));
  });
}

function memoItem(m, staff) {
  return `<li class="${m.pinned ? 'k-stage' : ''}" data-memo="${esc(m.id)}"><div class="t">${dateTime(m.at)} · <span class="chip out" style="font-size:.66rem">${esc(MEMO_KINDS[m.kind] || cap(m.kind || 'note'))}</span>${m.byStaffId ? ' · ' + esc(staff[m.byStaffId]?.name || m.byStaffId) : ''}${m.pinned ? ' · <b>Pinned</b>' : ''}${canWrite() && m.id && !/^M-F/.test(m.id) ? ` · <button class="btn ghost sm" style="min-height:22px;padding:0 6px;font-size:.7rem" data-pin="${esc(m.id)}" data-pinned="${m.pinned ? 'true' : 'false'}">${m.pinned ? 'Unpin' : 'Pin'}</button>` : ''}</div><div class="n">${esc(m.text || '')}</div></li>`;
}
const imgUrl = (d, thumb) => d.thumbUrl && thumb ? d.thumbUrl : d.url || `${API}/documents/${encodeURIComponent(d.id)}/file${thumb ? '?thumb=1' : ''}${state.token ? `&token=${encodeURIComponent(state.token)}` : ''}`.replace('/file&', '/file?');

// ── Infomedia menu quote ─────────────────────────────────────────────────────
async function infomediaQuote(c, ctx) {
  const model = c.vehicle?.modelId || String(c.vehicle?.model || '').toLowerCase().replace(/\s+/g, '-');
  const km = c.vehicle?.km || 0;
  const guess = INTERVALS.find(i => i >= km) || INTERVALS.at(-1);
  const body = openDrawer('Quote from Infomedia menu', `<div class="stack" style="gap:12px">
    <p class="muted" style="font-size:.84rem">Service menus come from the Infomedia data pack (Superservice Menus-style: operations, labour times and parts per interval), priced at this site’s labour rate. ${tagArag('Infomedia pack · knowledge box')}</p>
    <div class="row"><div class="field"><label for="imi">Interval</label><select class="select" id="imi">${INTERVALS.map(i => `<option value="${i}" ${i === guess ? 'selected' : ''}>${num(i)} km</option>`).join('')}</select></div><div class="field"><label>Model</label><div class="mono" style="padding:9px 0">${esc(model || '—')}</div></div><button class="btn secondary" id="imload" style="align-self:flex-end">Load menu</button></div>
    <div id="imout">${loading(3)}</div></div>`, c.id);
  const out = body.querySelector('#imout');
  const load = async () => {
    const interval = body.querySelector('#imi').value;
    out.innerHTML = loading(3);
    const r = await api('/infomedia/menus', { query: { model, interval, siteId: c.siteId } });
    if (!r.ok) { out.innerHTML = r.status === 404 ? empty({ inline: true, ic: 'plug', title: 'Infomedia pack not in this build yet', body: '<code>GET /dms/api/infomedia/menus</code> is being added. The pack holds VIN-specific service menus, a parts price file, labour rates and campaigns.' }) : failState(r, { what: 'the service menus', endpoint: 'GET /dms/api/infomedia/menus', inline: true }); return; }
    const menus = items(r.data).length ? items(r.data) : (r.data?.menus || []);
    if (!menus.length) { out.innerHTML = empty({ inline: true, title: 'No menu for this model and interval', body: 'Try another interval, or add lines by hand.' }); return; }
    out.innerHTML = menus.map(m => `<section class="card flat" style="margin-bottom:10px"><div class="chead"><h3>${esc(m.title || m.name || `${num(m.intervalKm || interval)} km service`)}</h3><span class="sub mono">${esc(m.id || '')}</span><div class="r"><b>${money(m.total ?? m.price)}</b></div></div><div class="cbody stack" style="gap:8px">
      ${(m.operations || []).length ? `<div><span class="label">Operations</span><ul style="margin:4px 0 0;padding-left:18px">${m.operations.map(o => `<li>${esc(typeof o === 'string' ? o : o.desc || o.name)}${o.hours ? ` <span class="subtle">· ${Number(o.hours).toFixed(1)} h</span>` : ''}</li>`).join('')}</ul></div>` : ''}
      ${(m.parts || []).length ? `<div><span class="label">Parts</span><div class="datatable compact"><div class="scroll"><table><thead><tr><th>Part no</th><th>Description</th><th class="num">Qty</th><th class="num">Price</th></tr></thead><tbody>${m.parts.map(p => `<tr><td class="mono">${esc(p.partNo || p.code || '')}</td><td>${esc(p.desc || p.description || '')}</td><td class="num">${num(p.qty ?? 1)}</td><td class="num">${money(p.price ?? p.unitPrice)}</td></tr>`).join('')}</tbody></table></div></div></div>` : ''}
      <div class="row"><span class="subtle" style="font-size:.76rem">Labour ${m.labourHours != null ? Number(m.labourHours).toFixed(1) + ' h' : '—'} at ${money(m.labourRate ?? r.data?.labourRate)}/h · parts ${money(m.partsTotal)} · ${esc(m.source || 'Infomedia data pack (simulated)')}</span>${canWrite() ? `<button class="btn sm" data-addmenu="${esc(m.id)}" style="margin-left:auto">Add menu to job card</button>` : ''}</div></div></section>`).join('') + `<div class="subtle" style="font-size:.72rem">${ann('GET /dms/api/infomedia/menus?model=&interval= · POST /job-cards/:id/lines {menuId}', 'kb')}</div>`;
    out.querySelectorAll('[data-addmenu]').forEach(b => b.onclick = async () => { spinBtn(b, true, 'Adding…'); const y = await api(`/job-cards/${encodeURIComponent(c.id)}/lines`, { method: 'POST', body: { menuId: b.dataset.addmenu } }); spinBtn(b, false); if (!y.ok) return toast(`Couldn’t add menu: ${y.error}`); closeDrawer(); toast('Menu lines added to the job card'); ctx.rerender(); });
  };
  body.querySelector('#imload').onclick = load;
  load();
}
