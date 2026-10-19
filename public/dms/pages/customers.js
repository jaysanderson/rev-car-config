import { drawerForm } from '../core.js';
import { api, esc, date, dateTime, ago, money, num, pagehead, loading, failState, ann, statusChip, siteName, modelName, cap, custName, bindRetry, icon, state, tagArag, staffMap, spinBtn, toast, API } from '../core.js';
import { listView, interestLabel, channelChip } from '../parts.js';
import { answerBlock } from './service.js';

const SOURCES = ['web-configurator', 'walk-in', 'phone', 'referral', 'campaign', 'service'];
const MEMO_KINDS = { customer_note: 'Customer note', call: 'Call', advisor_note: 'Advisor note', credit: 'Credit', sla: 'SLA', quality: 'Quality' };
const JC_LABEL = { booked: 'Booked', checked_in: 'Checked in', in_progress: 'In progress', awaiting_parts: 'Awaiting parts', awaiting_approval: 'Awaiting approval', completed: 'Completed', invoiced: 'Invoiced', collected: 'Collected', cancelled: 'Cancelled' };
const canWrite = () => (state.user?.caps || ['customers.write']).includes('customers.write');
const isImage = d => /^image\//.test(d.contentType || '') || /\.(png|jpe?g|webp)$/i.test(d.fileName || '') || d.kind === 'image' || d.kind === 'photo';
const imgUrl = (d, thumb) => d.thumbUrl && thumb ? d.thumbUrl : d.url || `${API}/documents/${encodeURIComponent(d.id)}/file?${thumb ? 'thumb=1&' : ''}token=${encodeURIComponent(state.token || '')}`;

export default async function customers(root, ctx) {
  if (ctx.params[0]) return detail(root, ctx, ctx.params[0]);
  root.innerHTML = pagehead({ title: 'Customers', tags: tagArag(), sub: 'People who have enquired, test-driven, bought or serviced with us. Customers with memos, documents or a history are knowledge-box resources, so you can ask about one customer or across all of them.' }) +
  `<section class="card aipanel"><div class="chead"><h3>Ask across customers</h3>${tagArag()}<div class="r">${ann('POST /dms/api/customers/ask', 'kb')}</div></div><div class="cbody stack" style="gap:10px">
    <form class="row" id="askf"><input class="input" id="askq" placeholder="Which customers asked us to call before extra work?" style="flex:1;min-width:240px" aria-label="Question"><button class="btn" id="askb">Ask across customers</button></form>
    <div class="examples" id="askex">${['Which customers asked us to call before any extra work?', 'Who has a RAV4 due for its 60,000 km service this quarter?', 'Which customers complained about a loan car in the last 90 days?', 'Who bought in 2024 and has not been back for service?'].map(x => `<button type="button">${esc(x)}</button>`).join('')}</div>
    <div id="askout"></div></div></section><div id="lv"></div>`;
  const ask = async () => {
    const q = root.querySelector('#askq'), b = root.querySelector('#askb'), out = root.querySelector('#askout'); const text = q.value.trim(); if (!text) return;
    spinBtn(b, true, 'Asking…'); out.innerHTML = `<div class="thinking"><span class="dots"><i></i><i></i><i></i></span>Retrieving customer resources, memos and histories…</div>`;
    const r = await api('/customers/ask', { method: 'POST', body: { question: text, lang: state.lang } }); spinBtn(b, false);
    out.innerHTML = r.ok ? answerBlock(r.data, { considered: r.data.customersConsidered, evidenceHref: id => '#/customers/' + encodeURIComponent(id) }) : failState(r, { what: 'an answer', endpoint: 'POST /customers/ask', inline: true });
  };
  root.querySelector('#askf').onsubmit = e => { e.preventDefault(); ask(); };
  root.querySelectorAll('#askex button').forEach(b => b.onclick = () => { root.querySelector('#askq').value = b.textContent; ask(); });
  await listView(root.querySelector('#lv'), {
    endpoint: '/customers', count: 'customers', search: 'Search name, email, phone, suburb…', annText: 'GET /dms/api/customers', initial: ctx.query,
    filters: [{ key: 'source', label: 'Any source', options: SOURCES.map(s => [s, cap(s.replace('-', ' '))]) }],
    href: c => '#/customers/' + encodeURIComponent(c.id),
    cols: [
      { label: 'Customer', sort: 'lastName', render: c => `<span class="cell-title">${esc(custName(c))}</span><span class="cell-sub mono">${esc(c.id)}</span>` },
      { label: 'Contact', render: c => `${esc(c.email || '—')}<span class="cell-sub">${esc(c.phone || '')}</span>` },
      { label: 'Suburb', render: c => `${esc(c.suburb || '—')} <span class="subtle">${esc(c.postcode || '')}</span>` },
      { label: 'Source', render: c => `<span class="chip ${c.source === 'web-configurator' ? 'info' : 'out'}">${esc(cap(String(c.source || '—').replace('-', ' ')))}</span>` },
      { label: 'Tags', render: c => (c.tags || []).slice(0, 3).map(t => `<span class="chip neutral">${esc(t)}</span>`).join(' ') },
      { label: 'Since', sort: 'createdAt', render: c => date(c.createdAt) },
    ],
  });
}

async function detail(root, ctx, id) {
  root.innerHTML = loading(8);
  const [r, staff] = await Promise.all([api('/customers/' + encodeURIComponent(id)), staffMap()]);
  if (!r.ok) { root.innerHTML = pagehead({ title: id, crumbs: [['Customers', '#/customers'], [id]] }) + failState(r, { what: 'this customer', endpoint: 'GET /dms/api/customers/' + id }); bindRetry(root, ctx.rerender); return; }
  const x = r.data || {}; const c = x.customer || x;
  const leads = x.leads || c.leads || [], deals = x.deals || c.deals || [], drives = x.testDrives || x.test_drives || c.testDrives || [], docsAll = x.documents || c.documents || [];
  const memos = [...(x.memos || c.memos || [])].sort((a, b) => (b.pinned === true) - (a.pinned === true) || String(b.at).localeCompare(String(a.at)));
  const jobs = x.jobCards || x.job_cards || c.jobCards || [];
  const images = docsAll.filter(isImage), docs = docsAll.filter(d => !isImage(d));
  const sec = (t, n, body, extra = '') => `<section class="card"><div class="chead"><h3>${t}</h3><span class="sub">${n}</span>${extra ? `<div class="r">${extra}</div>` : ''}</div><div class="cbody">${n ? body : '<span class="muted" style="font-size:.85rem">None</span>'}</div></section>`;
  root.innerHTML = pagehead({ title: custName(c), crumbs: [['Customers', '#/customers'], [c.id]], sub: `${esc(c.email || '')}${c.phone ? ' · ' + esc(c.phone) : ''}${c.suburb ? ' · ' + esc(c.suburb) : ''} · customer since ${date(c.createdAt)}`,
    actions: canWrite() ? `<button class="btn" id="addmemo">Add memo</button><button class="btn secondary" id="addphoto">Add photo</button><input type="file" id="photofile" accept="image/png,image/jpeg,image/webp" class="sr"><button class="btn secondary" id="adddoc">Upload document</button><input type="file" id="docfile" accept="application/pdf,.pdf" class="sr">` : '' }) +
  `<div class="split"><div class="stack">
    ${sec('Memos', memos.length, `<ol class="timeline">${memos.map(m => `<li class="${m.pinned ? 'k-stage' : ''}"><div class="t">${dateTime(m.at)} · <span class="chip out" style="font-size:.66rem">${esc(MEMO_KINDS[m.kind] || cap(m.kind || 'note'))}</span>${m.byStaffId ? ' · ' + esc(staff[m.byStaffId]?.name || m.byStaffId) : ''}${m.pinned ? ' · <b>Pinned</b>' : ''}${canWrite() ? ` · <button class="btn ghost sm" style="min-height:22px;padding:0 6px;font-size:.7rem" data-pin="${esc(m.id)}" data-pinned="${m.pinned ? 'true' : 'false'}">${m.pinned ? 'Unpin' : 'Pin'}</button>` : ''}</div><div class="n">${esc(m.text || '')}</div></li>`).join('')}</ol>`, ann('memos · POST /customers/:id/memos', 'kb'))}
    ${sec('Job cards', jobs.length, `<div class="stack" style="gap:8px">${jobs.map(j => `<a class="row" href="#/job-cards/${encodeURIComponent(j.id)}">${icon('stock')}<span class="mono">${esc(j.id)}</span><span class="chip ${/await/.test(j.status) ? 'warn' : /complete|invoiced/.test(j.status) ? 'good' : 'info'}">${esc(JC_LABEL[j.status] || cap(j.status))}</span><span class="muted">${esc([j.vehicle?.year, j.vehicle?.make, j.vehicle?.model].filter(Boolean).join(' '))} ${j.vehicle?.rego ? '· ' + esc(j.vehicle.rego) : ''} · ${date(j.bookedAt)} · ${money(j.total)}</span></a>`).join('')}</div>`, ann('GET /job-cards?customerId='))}
    ${sec('Deals', deals.length, `<div class="stack" style="gap:8px">${deals.map(d => `<a class="row" href="#/deals/${encodeURIComponent(d.id)}">${icon('deals')}<span class="mono">${esc(d.id)}</span>${statusChip(d.stage)}<span class="muted">${money(d.driveAway)} · ${date(d.createdAt)}</span></a>`).join('')}</div>`)}
    ${sec('Leads', leads.length, `<div class="stack" style="gap:8px">${leads.map(l => `<a class="row" href="#/leads/${encodeURIComponent(l.id)}">${icon('leads')}<span class="mono">${esc(l.id)}</span>${statusChip(l.status)}${channelChip(l.channel)}<span class="muted">${esc(interestLabel(l.interest))} · ${date(l.createdAt)}</span></a>`).join('')}</div>`)}
    ${sec('Test drives', drives.length, `<div class="stack" style="gap:8px">${drives.map(t => `<a class="row" href="#/test-drives/${encodeURIComponent(t.id)}">${icon('drive')}<span class="mono">${esc(t.id)}</span>${statusChip(t.status)}<span class="muted">${esc(modelName(t.modelId))} · ${dateTime(t.when)}</span></a>`).join('')}</div>`)}
    ${sec('Photos', images.length, `<div class="grid g3" style="gap:10px">${images.map(d => `<figure style="margin:0" class="card flat"><a href="${esc(imgUrl(d))}" target="_blank" rel="noopener" style="display:block;aspect-ratio:4/3;overflow:hidden;border-radius:8px 8px 0 0;background:var(--hairline)"><img src="${esc(imgUrl(d, true))}" alt="${esc(d.title || d.fileName || 'Photo')}" loading="lazy" style="width:100%;height:100%;object-fit:cover"></a><figcaption style="padding:8px 10px;font-size:.78rem"><b>${esc(d.title || d.fileName || 'Photo')}</b><div class="subtle">${dateTime(d.uploadedAt)}${d.jobCardId ? ` · <a href="#/job-cards/${encodeURIComponent(d.jobCardId)}">${esc(d.jobCardId)}</a>` : ''}</div></figcaption></figure>`).join('')}</div>`, ann('documents kind image', 'kb'))}
    ${sec('Documents', docs.length, `<div class="stack" style="gap:8px">${docs.map(o => `<a class="row" href="#/documents/${encodeURIComponent(o.id)}">${icon('doc')}${esc(o.fileName || o.id)}<span class="chip out">${esc(cap(o.kind))}</span>${statusChip(o.status)}</a>`).join('')}</div>`)}
  </div><div class="stack">
    <section class="card aipanel"><div class="chead"><h3>Ask about this customer</h3>${tagArag()}<div class="r">${ann('POST /dms/api/customers/' + c.id + '/ask', 'kb')}</div></div><div class="cbody stack" style="gap:10px">
      <p class="muted" style="font-size:.82rem">Answers come from this customer’s resource: profile, memos, deals, job cards and the documents the agent has read, with citations.</p>
      <form class="row" id="askf"><input class="input" id="askq" placeholder="What did they ask us last time, and is anything outstanding?" style="flex:1;min-width:160px" aria-label="Question"><button class="btn" id="askb">Ask</button></form>
      <div class="examples" id="askex">${['What did they ask us last time, and is anything outstanding?', 'Summarise their history with us', 'Is their car due for a service?', 'Have they raised any complaints?'].map(x => `<button type="button">${esc(x)}</button>`).join('')}</div>
      <div id="askout"></div></div></section>
    <section class="card"><div class="chead"><h3>Profile</h3><div class="r">${ann('GET /dms/api/customers/' + c.id)}</div></div><div class="cbody"><dl class="kv">
      <dt>Name</dt><dd>${esc(custName(c))}</dd><dt>Email</dt><dd>${esc(c.email || '—')}</dd><dt>Phone</dt><dd>${esc(c.phone || '—')}</dd><dt>Address</dt><dd>${esc([c.suburb, c.postcode].filter(Boolean).join(' ') || '—')}</dd><dt>Source</dt><dd>${esc(cap(String(c.source || '—').replace('-', ' ')))}</dd><dt>Tags</dt><dd>${(c.tags || []).map(t => `<span class="chip neutral">${esc(t)}</span>`).join(' ') || '—'}</dd>${c.notes ? `<dt>Notes</dt><dd>${esc(c.notes)}</dd>` : ''}
    </dl></div></section>
    <section class="card"><div class="chead"><h3>Knowledge box</h3>${tagArag()}</div><div class="cbody" style="font-size:.84rem"><dl class="kv"><dt>Resource</dt><dd class="mono">${esc(x.kbResourceId || c.kbResourceId || 'not synced')}</dd><dt>Label</dt><dd class="mono">topic/customer</dd></dl></div></section>
  </div></div>`;
  const on = (sel, fn) => { const b = root.querySelector(sel); if (b) b.onclick = fn; };
  root.querySelectorAll('[data-pin]').forEach(b => b.onclick = async () => { const y = await api('/memos/' + encodeURIComponent(b.dataset.pin), { method: 'PATCH', body: { pinned: b.dataset.pinned !== 'true' } }); if (y.ok) ctx.rerender(); else toast(`Couldn’t pin: ${y.error}`); });
  on('#addmemo', async () => {
    const f = await drawerForm('Add memo', `<div class="field"><label for="mk">Kind</label><select class="select" id="mk" name="kind">${Object.entries(MEMO_KINDS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></div><div class="field"><label for="mt">Memo</label><textarea class="textarea" id="mt" name="text" style="min-height:110px" required></textarea></div><label class="switch"><input type="checkbox" name="pinned"> Pin to the top</label>`, { submit: 'Add memo', sub: c.id, note: 'Memos are part of the customer’s knowledge-box resource.' });
    if (!f) return; const y = await api(`/customers/${encodeURIComponent(c.id)}/memos`, { method: 'POST', body: { kind: f.values.kind, text: f.values.text.trim(), pinned: f.values.pinned === 'on' } }); if (!y.ok) return f.err(y.status === 404 ? 'POST /customers/:id/memos is not in this build yet.' : `Couldn’t add: ${y.error}`); f.close(); toast('Memo added'); ctx.rerender();
  });
  const upload = async (file, kind) => {
    if (file.size > 6 * 1024 * 1024) return toast('That file is over 6 MB.');
    const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(file); });
    const y = await api(`/customers/${encodeURIComponent(c.id)}/documents`, { method: 'POST', body: { fileName: file.name, kind, contentType: file.type || 'application/pdf', contentBase64: b64, title: file.name.replace(/\.[^.]+$/, '') } });
    if (!y.ok) return toast(y.status === 404 ? 'POST /customers/:id/documents is not in this build yet' : `Upload failed (${y.status}): ${y.error}`);
    toast(kind === 'image' ? 'Photo added' : 'Document uploaded'); ctx.rerender();
  };
  on('#addphoto', () => root.querySelector('#photofile').click()); const pf = root.querySelector('#photofile'); if (pf) pf.onchange = () => pf.files[0] && upload(pf.files[0], 'image');
  on('#adddoc', () => root.querySelector('#docfile').click()); const df = root.querySelector('#docfile'); if (df) df.onchange = () => df.files[0] && upload(df.files[0], 'licence');
  const ask = async () => {
    const q = root.querySelector('#askq'), b = root.querySelector('#askb'), out = root.querySelector('#askout'); const text = q.value.trim(); if (!text) return;
    spinBtn(b, true, 'Asking…'); out.innerHTML = `<div class="thinking"><span class="dots"><i></i><i></i><i></i></span>Reading this customer’s resource, memos and history…</div>`;
    const y = await api(`/customers/${encodeURIComponent(c.id)}/ask`, { method: 'POST', body: { question: text, lang: state.lang } }); spinBtn(b, false);
    out.innerHTML = y.ok ? answerBlock(y.data) : failState(y, { what: 'an answer', endpoint: `POST /customers/${c.id}/ask`, inline: true });
  };
  root.querySelector('#askf').onsubmit = e => { e.preventDefault(); ask(); };
  root.querySelectorAll('#askex button').forEach(b => b.onclick = () => { root.querySelector('#askq').value = b.textContent; ask(); });
}
