import { drawerForm, notInBuild, MODEL_LABEL, SITES, items as itemsOf } from '../core.js';
import { api, state, esc, pick, items, num, money, date, dateTime, ago, pagehead, loading, failState, empty, tagArag, tagDomo, ann, statusChip, siteName, modelName, cap, custName, staffMap, bindRetry, spinBtn, toast, citations, copy, LANGS, icon, table, bindRows } from '../core.js';
import { listView, withCustomers, leadName, leadRef, interestLabel, scoreBar, channelChip, handoverSheet, qaList , gradeName} from '../parts.js';

const STATUSES = ['new', 'contacted', 'qualified', 'test_drive_booked', 'quoted', 'won', 'lost'];
const CHANNELS = ['configurator', 'web-form', 'phone', 'walk-in', 'campaign'];
const canWrite = () => (state.user?.caps || ['leads.write']).includes('leads.write');

export default async function leads(root, ctx) {
  if (ctx.params[0]) return detail(root, ctx, ctx.params[0]);
  const staff = await staffMap();
  const q = ctx.query;
  const quick = [['Mine', 'mine=1'], ['Unassigned', 'unassigned=1'], ['New', 'status=new'], ['Overdue', 'overdue=1'], ['Configurator', 'channel=configurator']];
  const cur = location.hash.split('?')[1] || '';
  root.innerHTML = pagehead({ title: 'Leads', sub: `Every enquiry across ${state.site ? siteName(state.site) : 'the group'}. Configurator leads carry first-party data: finder answers, viewed cars, offers clicked and the test-drive handover sheet.${state.user?.role === 'salesperson' ? ' Showing your leads.' : ''}`,
    actions: canWrite() ? `<button class="btn" id="newLead">New lead</button>${ann('POST /dms/api/leads')}` : '' }) +
    `<div class="row" style="margin:-6px 0 12px">${quick.map(([l, qs]) => `<a class="chip ${cur === qs ? '' : 'out'}" href="#/leads${cur === qs ? '' : '?' + qs}" aria-pressed="${cur === qs}">${l}</a>`).join('')}</div><div id="lv"></div>`;
  const nb = root.querySelector('#newLead'); if (nb) nb.onclick = () => newLead();
  const yesterday = new Date(Date.now() - 864e5).toISOString();
  await listView(root.querySelector('#lv'), {
    endpoint: '/leads', count: 'leads', query: { mine: q.mine, to: q.overdue ? yesterday : undefined, status: q.overdue ? 'new' : undefined, ownerId: q.unassigned ? '' : undefined }, search: 'Search name, email, model, ref…', annText: 'GET /dms/api/leads',
    initial: ctx.query,
    filters: [
      { key: 'status', label: 'Any status', options: STATUSES.map(s => [s, cap(s)]) },
      { key: 'channel', label: 'Any channel', options: CHANNELS.map(s => [s, cap(s)]) },
    ],
    enrich: rows => withCustomers(q.unassigned ? rows.filter(r => !r.ownerId) : rows),
    href: l => '#/leads/' + encodeURIComponent(l.id),
    cols: [
      { label: 'Lead', render: l => `<span class="cell-title">${esc(leadName(l))}</span><span class="cell-sub"><span class="mono">${esc(l.id)}</span>${!l.customerId && leadRef(l) ? ` · ref ${esc(leadRef(l))}` : ''}</span>` },
      { label: 'Interest', render: l => `${esc(interestLabel(l.interest))}${l.interest?.stockNo ? `<span class="cell-sub mono">${esc(l.interest.stockNo)}</span>` : ''}` },
      { label: 'Channel', render: l => channelChip(l.channel) },
      { label: 'Status', sort: 'status', render: l => statusChip(l.status) },
      { label: 'Score', sort: 'score', render: l => scoreBar(l.score) },
      { label: 'Owner', render: l => (l.ownerId ? esc(staff[l.ownerId]?.name || l.ownerId) : '<b style="color:var(--danger-fg)">Unassigned</b>') + `<span class="cell-sub">${esc(siteName(l.siteId))}</span>` },
      { label: 'Created', sort: 'createdAt', render: l => `${date(l.createdAt)}<span class="cell-sub">${ago(l.createdAt)}</span>` },
    ],
  });
}

async function detail(root, ctx, id) {
  root.innerHTML = loading(10);
  const [r, staff] = await Promise.all([api('/leads/' + encodeURIComponent(id)), staffMap()]);
  if (!r.ok) { root.innerHTML = pagehead({ title: 'Lead ' + id, crumbs: [['Leads', '#/leads'], [id]] }) + failState(r, { what: 'this lead', endpoint: 'GET /dms/api/leads/' + id }); bindRetry(root, ctx.rerender); return; }
  const d = r.data || {};
  const l = d.lead || d;
  const cust = d.customer || l.customer || null;
  const anon = !l.customerId && !cust;
  const name = cust ? custName(cust) : anon ? 'Anonymous configurator session' : l.customerId;
  const drives = d.testDrives || d.test_drives || l.testDrives || [];
  const deals = d.deals || l.deals || [];
  const events = d.events || d.configuratorEvents || l.events || [];
  const offers = d.offersClicked || l.offersClicked || events.filter(e => /offer|promo/i.test(e.type || ''));
  const booking = d.booking || l.booking || null;
  const handover = l.handover || booking?.handover || drives.find(t => t.handover)?.handover || null;
  const owner = staff[l.ownerId];

  root.innerHTML = pagehead({
    title: name, crumbs: [['Leads', '#/leads'], [l.id]],
    tags: `${statusChip(l.status)} ${channelChip(l.channel)}`,
    sub: `${esc(interestLabel(l.interest))} · ${esc(siteName(l.siteId))} · created ${dateTime(l.createdAt)}${anon && leadRef(l) ? ` · ref <span class="mono">${esc(leadRef(l))}</span>` : ''}`,
    actions: canWrite() && !['won', 'lost'].includes(l.status) ? `<button class="btn secondary" id="logc">Log contact</button><button class="btn secondary" id="booktd">Book test drive</button><button class="btn" id="mkdeal">Create deal</button><button class="btn ghost" id="mklost">Mark lost</button>` : '',
  }) + `<div class="split">
    <div class="stack">
      ${anon ? `<section class="card" id="capture"><div class="chead"><h3>Anonymous configurator session</h3><span class="sub">ref ${esc(leadRef(l) || '—')}</span><div class="r">${ann('PATCH /dms/api/leads/' + l.id, 'dms')}</div></div><div class="cbody">
        <p class="muted" style="font-size:.85rem;margin-bottom:12px">This customer booked from the configurator without leaving contact details. When they call or arrive, capture them here to create the customer record.</p>
        ${canWrite() ? `<form id="capf" class="grid" style="gap:10px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))"><div class="field"><label for="cf1">First name</label><input class="input" id="cf1" name="firstName" required></div><div class="field"><label for="cf2">Last name</label><input class="input" id="cf2" name="lastName"></div><div class="field"><label for="cf3">Email</label><input class="input" id="cf3" name="email" type="email"></div><div class="field"><label for="cf4">Phone</label><input class="input" id="cf4" name="phone" type="tel"></div><div class="row" style="grid-column:1/-1"><button class="btn" type="submit">Capture details</button><span class="err" id="caperr"></span></div></form>` : '<p class="subtle">Your role can’t edit leads.</p>'}
      </div></section>` : ''}
      <section class="card" id="fp"><div class="chead"><h3>Configurator</h3><span class="sub">first-party data</span>${tagDomo('Domo · configurator_events')}<div class="r">${ann('lead.finderAnswers · lead.viewed · configurator_events', 'domo')}</div></div><div class="cbody fp">
        ${fpSection('Finder answers', (l.finderAnswers || []).length ? qaList(l.finderAnswers) : '')}
        ${fpSection('Viewed cars', (l.viewed || []).length ? `<div class="pills">${l.viewed.map(v => `<span class="chip out">${esc(typeof v === 'string' ? modelName(v) : [modelName(v.modelId), v.gradeId && gradeName(v.gradeId)].filter(Boolean).join(' · '))}${v.unitId ? ` <span class="mono">${esc(v.unitId)}</span>` : ''}</span>`).join('')}</div>` : '')}
        ${fpSection('Offers clicked', offers.length ? `<div class="pills">${offers.map(o => `<span class="chip good">${esc(o.title || o.label || o.value || o.promotionId || o.type)}</span>`).join('')}</div>` : '')}
        ${fpSection('Booking', booking || l.bookingId ? `<div class="row" style="font-size:.86rem"><span class="mono">${esc(l.bookingId || booking?.bookingId)}</span>${booking?.whenLabel || booking?.when ? `<span>· ${esc(booking.whenLabel || dateTime(booking.when))}</span>` : ''}${drives[0] ? ` ${statusChip(drives[0].status)} <a href="#/test-drives/${encodeURIComponent(drives[0].id)}">Open test drive</a>` : ''}</div>` : '')}
        ${handover ? handoverSheet(handover) : ''}
        ${!l.finderAnswers?.length && !l.viewed?.length && !offers.length && !l.bookingId && !handover ? `<p class="muted" style="font-size:.85rem">${l.channel === 'configurator' ? 'No configurator activity was recorded for this session.' : `This lead came in by ${esc(cap(l.channel || 'another channel'))}, so there is no configurator session attached.`}</p>` : ''}
      </div></section>
      <section class="card"><div class="chead"><h3>Lead</h3><div class="r">${ann('GET /dms/api/leads/' + l.id)}</div></div><div class="cbody"><dl class="kv">
        <dt>Customer</dt><dd>${cust ? `<a href="#/customers/${encodeURIComponent(cust.id || l.customerId)}">${esc(name)}</a>${cust.email ? ` · ${esc(cust.email)}` : ''}${cust.phone ? ` · ${esc(cust.phone)}` : ''}` : anon ? '<span class="muted">Not captured yet</span>' : esc(l.customerId)}</dd>
        <dt>Interest</dt><dd>${esc(interestLabel(l.interest))}${l.interest?.colourId ? ` · ${esc(cap(String(l.interest.colourId).replace(/-/g, ' ')))}` : ''}${l.interest?.stockNo ? ` · <a class="mono" href="#/stock?q=${esc(l.interest.stockNo)}">${esc(l.interest.stockNo)}</a>` : ''}</dd>
        <dt>Source</dt><dd>${esc(cap(l.source || '—'))} via ${esc(cap(l.channel || '—'))}</dd>
        <dt>Owner</dt><dd>${esc(owner?.name || l.ownerId || 'Unassigned')} · ${esc(siteName(l.siteId))}</dd>
        <dt>Score</dt><dd>${scoreBar(l.score)}</dd>
        <dt>Updated</dt><dd>${dateTime(l.updatedAt)}</dd>
        ${l.lostReason ? `<dt>Lost reason</dt><dd>${esc(l.lostReason)}</dd>` : ''}
      </dl></div></section>
      ${(drives.length || deals.length) ? `<section class="card"><div class="chead"><h3>Related</h3></div><div class="cbody stack" style="gap:10px">
        ${drives.map(t => `<a class="row" href="#/test-drives/${encodeURIComponent(t.id)}">${icon('drive')}<span class="mono">${esc(t.id)}</span> ${statusChip(t.status)} <span class="muted">${dateTime(t.when)} · ${esc(modelName(t.modelId))}</span></a>`).join('')}
        ${deals.map(x => `<a class="row" href="#/deals/${encodeURIComponent(x.id)}">${icon('deals')}<span class="mono">${esc(x.id)}</span> ${statusChip(x.stage)} <span class="muted">${money(x.driveAway)}</span></a>`).join('')}
      </div></section>` : ''}
    </div>
    <div class="stack">
      <section class="card aipanel" id="fu"><div class="chead"><h3>Follow-up</h3>${tagArag()}<div class="r">${ann('POST /dms/api/leads/' + l.id + '/followup', 'kb')}</div></div><div class="cbody stack" style="gap:12px">
        <p class="muted" style="font-size:.82rem">Grounded in this lead’s configurator data, live promotions and dealer policy. It never invents a promotion.</p>
        <div class="row"><select class="select" id="fuch" style="width:auto"><option value="email">Email</option><option value="sms">SMS</option></select><select class="select" id="futone" style="width:auto"><option value="friendly">Friendly</option><option value="professional">Professional</option><option value="concise">Brief</option></select><span class="chip neutral" title="Change in the band">${esc(LANGS[state.lang] || 'English')}</span></div>
        <button class="btn" id="fubtn">${icon('assistant')}Draft follow-up</button>
        <div id="fuout"></div>
      </div></section>
    </div>
  </div>`;

  const st = null;
  const on = (sel, fn) => { const b = root.querySelector(sel); if (b) b.onclick = fn; };
  on('#logc', () => logContact(l, ctx));
  on('#mklost', async () => {
    const f = await drawerForm('Mark lost', `<div class="field"><label for="lr">Lost reason</label><select class="select" id="lr" name="lostReason" required>${['Bought elsewhere', 'Price', 'Finance declined', 'Timing', 'No response', 'Other'].map(x => `<option>${x}</option>`).join('')}</select></div><div class="field"><label for="ln">Note</label><textarea class="textarea" id="ln" name="note" style="min-height:80px"></textarea></div>`, { submit: 'Confirm', sub: l.id, note: 'A lead can’t be marked lost without a lost reason.' });
    if (!f) return;
    const y = await api('/leads/' + encodeURIComponent(l.id), { method: 'PATCH', body: { status: 'lost', lostReason: f.values.lostReason + (f.values.note ? ': ' + f.values.note : '') } });
    if (!y.ok) return f.err(`Couldn’t save (${y.status}): ${y.error}`);
    f.close(); toast('Lead marked lost'); ctx.rerender();
  });
  on('#booktd', async () => {
    const f = await drawerForm('Book test drive', `<div class="grid g2" style="gap:10px"><div class="field"><label>Site</label><select class="select" name="siteId">${Object.entries(SITES).map(([k, v]) => `<option value="${k}" ${k === l.siteId ? 'selected' : ''}>${v}</option>`).join('')}</select></div><div class="field"><label>Date and time</label><input class="input" type="datetime-local" name="when" required></div><div class="field"><label>Model</label><select class="select" name="modelId">${Object.entries(MODEL_LABEL).filter(([k], i, a) => a.findIndex(x => x[1] === MODEL_LABEL[k]) === i).map(([k, v]) => `<option value="${k}" ${k === l.interest?.modelId ? 'selected' : ''}>${v}</option>`).join('')}</select></div><div class="field"><label>Grade</label><input class="input" name="gradeId" value="${esc(l.interest?.gradeId || '')}"></div><div class="field"><label>Stock unit (optional)</label><input class="input mono" name="stockNo" placeholder="HL-####" value="${esc(l.interest?.stockNo || '')}"></div><div class="field"><label>Salesperson</label><select class="select" name="staffId">${Object.values(staff).filter(x => /sales/.test(x.role) && (!l.siteId || x.siteId === l.siteId)).map(x => `<option value="${x.id}" ${x.id === l.ownerId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div></div>`, { submit: 'Book', sub: l.id });
    if (!f) return;
    const y = await api('/test-drives', { method: 'POST', body: { leadId: l.id, ...f.values, when: f.values.when ? new Date(f.values.when).toISOString() : undefined } });
    if (y.status === 404 || y.status === 405) { f.close(); return notInBuild('Book test drive', 'POST /dms/api/test-drives'); }
    if (!y.ok) return f.err(`Couldn’t book (${y.status}): ${y.error}`);
    f.close(); toast('Test drive booked'); ctx.rerender();
  });
  on('#mkdeal', async () => {
    const f = await drawerForm('Create deal', `<div class="segmented" role="group"><label style="padding:4px 10px"><input type="radio" name="kind" value="stock" checked> Stock unit</label><label style="padding:4px 10px"><input type="radio" name="kind" value="order"> Factory order</label></div><div class="field"><label>Stock unit</label><input class="input mono" name="stockNo" placeholder="HL-####" value="${esc(l.interest?.stockNo || '')}"></div><div class="grid g2" style="gap:10px"><div class="field"><label>Model</label><input class="input" name="modelId" value="${esc(l.interest?.modelId || '')}"></div><div class="field"><label>Grade</label><input class="input" name="gradeId" value="${esc(l.interest?.gradeId || '')}"></div><div class="field"><label>Colour</label><input class="input" name="colourId" value="${esc(l.interest?.colourId || '')}"></div></div>`, { submit: 'Create', sub: l.id, note: 'The deal starts at stage quote and the lead moves to quoted.' });
    if (!f) return;
    const v = f.values;
    const body = v.kind === 'order' ? { leadId: l.id, order: { modelId: v.modelId, gradeId: v.gradeId, colourId: v.colourId } } : { leadId: l.id, stockNo: v.stockNo };
    const y = await api('/deals', { method: 'POST', body });
    if (y.status === 404 || y.status === 405) { f.close(); return notInBuild('Create deal', 'POST /dms/api/deals'); }
    if (!y.ok) return f.err(`Couldn’t create (${y.status}): ${y.error}`);
    f.close(); toast('Deal created'); location.hash = '#/deals/' + encodeURIComponent((y.data?.deal || y.data).id);
  });
  const capf = root.querySelector('#capf');
  if (capf) capf.onsubmit = async e => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(capf).entries());
    if (!body.firstName || (!body.email && !body.phone)) { root.querySelector('#caperr').textContent = 'A first name and an email or phone are needed.'; return; }
    const b = capf.querySelector('button'); spinBtn(b, true, 'Saving…');
    const x = await api('/leads/' + encodeURIComponent(l.id), { method: 'PATCH', body });
    spinBtn(b, false);
    if (!x.ok) { root.querySelector('#caperr').textContent = x.status === 403 ? 'Your role can’t edit leads.' : `Couldn’t save (${x.status}): ${x.error}`; return; }
    toast('Customer captured'); ctx.rerender();
  };
  root.querySelector('#fubtn').onclick = async () => {
    const b = root.querySelector('#fubtn'), out = root.querySelector('#fuout');
    const channel = root.querySelector('#fuch').value, tone = root.querySelector('#futone').value;
    spinBtn(b, true, 'Drafting…'); out.innerHTML = `<div class="thinking"><span class="dots"><i></i><i></i><i></i></span>Reading the lead, promotions and policy…</div>`;
    const x = await api(`/leads/${encodeURIComponent(l.id)}/followup`, { method: 'POST', body: { tone, channel, lang: state.lang } });
    spinBtn(b, false);
    if (!x.ok) { out.innerHTML = failState(x, { what: 'the follow-up draft', endpoint: `POST /leads/${l.id}/followup`, inline: true }); return; }
    const f = x.data || {};
    const body = pick(f, 'body', 'text', 'message', 'draft', 'draft.body') || '';
    const subject = pick(f, 'subject', 'draft.subject') || '';
    const promos = f.promotions || f.promotionsUsed || [];
    out.innerHTML = `<div class="stack" style="gap:10px">
      ${channel === 'email' ? `<div class="field"><label for="fusub">Subject</label><input class="input" id="fusub" value="${esc(subject)}"></div>` : ''}
      <div class="field"><label for="fubody">${channel === 'sms' ? 'SMS' : 'Email body'} <span class="subtle">· editable</span></label><textarea class="textarea" id="fubody" style="min-height:${channel === 'sms' ? 110 : 260}px">${esc(body)}</textarea>${channel === 'sms' ? `<span class="subtle" style="font-size:.72rem" id="smsn">${body.length} characters</span>` : ''}</div>
      ${promos.length ? `<div><span class="label">Promotions referenced</span><div class="pills" style="margin-top:4px">${promos.map(p => `<span class="chip good">${esc(p.title || p.id || p)}</span>`).join('')}</div></div>` : ''}
      ${(f.citations || f.sources || []).length ? `<div><span class="label">Grounded in</span>${citations(f.citations || f.sources)}</div>` : ''}
      ${f.warnings?.length ? `<div class="notice">${icon('alert')}<div>${f.warnings.map(esc).join('<br>')}</div></div>` : ''}
      <div class="row"><button class="btn secondary sm" id="fucopy">${icon('copy')}Copy</button><button class="btn accent sm" id="fusent">Send</button><span class="subtle" style="font-size:.72rem;margin-left:auto">${f.model || f.by ? esc(f.by || f.model) : ''}</span></div>
      <div class="json">${esc(JSON.stringify(f, null, 2))}</div></div>`;
    const ta = out.querySelector('#fubody'); const n = out.querySelector('#smsn'); if (n) ta.oninput = () => { n.textContent = ta.value.length + ' characters'; };
    out.querySelector('#fucopy').onclick = () => copy((out.querySelector('#fusub')?.value ? out.querySelector('#fusub').value + '\n\n' : '') + ta.value);
    out.querySelector('#fusent').onclick = async () => {
      const y = await api('/leads/' + encodeURIComponent(l.id), { method: 'PATCH', body: { ...(l.status === 'new' ? { status: 'contacted' } : {}), notes: appendNote(l, `${channel === 'sms' ? 'SMS' : 'Email'} sent (AI draft): ${ta.value.slice(0, 600)}`) } });
      toast(y.ok ? 'Sent and logged as a contact (prototype: nothing is actually sent)' : `Couldn’t log: ${y.error}`); if (y.ok) { l.status = y.data.status; l.notes = y.data.notes; }
    };
  };
}
const fpSection = (title, body) => body ? `<div class="sec"><h4>${esc(title)}</h4>${body}</div>` : '';

const appendNote = (l, text) => `${l.notes ? l.notes + '\n' : ''}[${new Date().toLocaleString('en-AU')}] ${text}`.slice(-2000);
async function logContact(l, ctx) {
  const f = await drawerForm('Log contact', `<div class="field"><label for="lcm">Method</label><select class="select" id="lcm" name="method"><option>Call</option><option>Email</option><option>SMS</option><option>In person</option></select></div><div class="field"><label for="lcn">Note</label><textarea class="textarea" id="lcn" name="note" required style="min-height:100px"></textarea></div>`, { submit: 'Save', sub: l.id, note: l.status === 'new' ? 'Saving moves the lead from new to contacted and records the response time.' : '' });
  if (!f) return;
  const y = await api('/leads/' + encodeURIComponent(l.id), { method: 'PATCH', body: { ...(l.status === 'new' ? { status: 'contacted' } : {}), notes: appendNote(l, `${f.values.method}: ${f.values.note}`) } });
  if (!y.ok) return f.err(`Couldn’t save (${y.status}): ${y.error}`);
  f.close(); toast('Contact logged'); ctx.rerender();
}

async function newLead() {
  const f = await drawerForm('New lead', `
    <div class="field"><label for="nlq">Customer</label><input class="input" id="nlq" placeholder="Search name, email or phone"><div id="nlres" class="stack" style="gap:4px;margin-top:6px"></div><input type="hidden" name="customerId" id="nlcid"></div>
    <details id="nlnew"><summary style="cursor:pointer;font-size:.84rem;font-weight:600;color:var(--brand-600)">Create customer</summary><div class="grid g2" style="gap:10px;margin-top:10px"><div class="field"><label>First name</label><input class="input" name="firstName"></div><div class="field"><label>Last name</label><input class="input" name="lastName"></div><div class="field"><label>Email</label><input class="input" type="email" name="email"></div><div class="field"><label>Phone</label><input class="input" name="phone"></div></div></details>
    <div class="grid g2" style="gap:10px"><div class="field"><label>Channel</label><select class="select" name="channel">${CHANNELS.map(c => `<option value="${c}">${cap(c)}</option>`).join('')}</select></div><div class="field"><label>Source</label><select class="select" name="source">${['walk-in', 'phone', 'web-configurator', 'referral', 'campaign', 'service'].map(c => `<option value="${c}">${cap(c.replace('-', ' '))}</option>`).join('')}</select></div>
    <div class="field"><label>Site</label><select class="select" name="siteId">${Object.entries(SITES).map(([k, v]) => `<option value="${k}" ${k === (state.site || state.user?.siteId) ? 'selected' : ''}>${v}</option>`).join('')}</select></div><div class="field"><label>Interest · model</label><select class="select" name="modelId" required>${Object.entries(MODEL_LABEL).filter(([k], i, a) => a.findIndex(x => x[1] === MODEL_LABEL[k]) === i).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div><div class="field"><label>Grade (optional)</label><input class="input" name="gradeId"></div></div>`, { submit: 'Save lead', note: 'The lead is created with status new and assigned to you unless a manager picks another owner.' });
  return f && saveNewLead(f);
}
async function saveNewLead(f) {
  const v = f.values; let customerId = v.customerId;
  if (!customerId) {
    if (!v.firstName || (!v.email && !v.phone)) return f.err('Pick a customer, or use Create customer with a first name and an email or phone.');
    const c = await api('/customers', { method: 'POST', body: { firstName: v.firstName, lastName: v.lastName || '-', email: v.email || undefined, phone: v.phone || undefined, source: v.source } });
    if (!c.ok) return f.err(`Couldn’t create the customer (${c.status}): ${c.error}`);
    customerId = c.data.id;
  }
  const y = await api('/leads', { method: 'POST', body: { customerId, channel: v.channel, source: v.source, siteId: v.siteId, interest: { modelId: v.modelId, gradeId: v.gradeId || undefined } } });
  if (!y.ok) return f.err(`Couldn’t save the lead (${y.status}): ${y.error}`);
  f.close(); toast('Lead created'); location.hash = '#/leads/' + encodeURIComponent(y.data.id);
}
// customer search inside the New lead drawer
document.addEventListener('input', async e => {
  if (e.target.id !== 'nlq') return;
  const q = e.target.value.trim(); const res = document.getElementById('nlres'); if (!res) return;
  if (q.length < 2) { res.innerHTML = ''; return; }
  const r = await api('/customers', { query: { q, pageSize: 5 } });
  if (!r.ok) { res.innerHTML = `<span class="err">Search failed (${r.status})</span>`; return; }
  const rows = itemsOf(r.data);
  res.innerHTML = rows.length ? rows.map(c => `<button type="button" class="btn ghost sm" style="justify-content:flex-start" data-cid="${esc(c.id)}">${esc(custName(c))} <span class="subtle">${esc(c.email || c.phone || '')}</span></button>`).join('') : '<span class="subtle" style="font-size:.8rem">No match. Use Create customer below.</span>';
  res.querySelectorAll('[data-cid]').forEach(b => b.onclick = () => { document.getElementById('nlcid').value = b.dataset.cid; res.querySelectorAll('[data-cid]').forEach(x => x.classList.toggle('secondary', x === b)); });
});
