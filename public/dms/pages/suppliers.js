// Suppliers: list with "Ask across suppliers", detail with memos, invoices, documents and
// "Ask about this supplier". API: docs/DMS-PHASE2-SPEC.md §3 (suppliers routes).
import { drawerForm } from '../core.js';
import { api, state, esc, num, money, date, dateTime, pagehead, loading, failState, empty, tagArag, ann, statusChip, cap, staffMap, bindRetry, spinBtn, toast, icon } from '../core.js';
import { listView } from '../parts.js';
import { answerBlock } from './service.js';

const CATS = ['parts', 'accessories', 'tyres', 'tint-protection', 'sublet', 'consumables', 'towing'];
const MEMO_KINDS = { call: 'Call', credit: 'Credit note', sla: 'SLA', quality: 'Quality', parts_note: 'Parts note', advisor_note: 'Note' };
const canWrite = () => (state.user?.caps || ['suppliers.write']).includes('suppliers.write');
const stars = n => n == null ? '—' : `<span title="${n} of 5">${'★'.repeat(Math.round(n))}<span class="subtle">${'★'.repeat(5 - Math.round(n))}</span></span>`;

export default async function suppliers(root, ctx) {
  if (ctx.params[0]) return detail(root, ctx, ctx.params[0]);
  root.innerHTML = pagehead({
    title: 'Suppliers', tags: tagArag(),
    sub: 'Parts, accessories, tyres, tint and sublet suppliers. Each supplier is a knowledge-box resource with its memos and invoice summaries, so you can ask about one supplier or across all of them.',
    actions: canWrite() ? `<button class="btn" id="newsup">New supplier</button>` : '',
  }) + `<section class="card aipanel"><div class="chead"><h3>Ask across suppliers</h3>${tagArag()}<div class="r">${ann('POST /dms/api/suppliers/ask', 'kb')}</div></div><div class="cbody stack" style="gap:10px">
      <form class="row" id="askf"><input class="input" id="askq" placeholder="Which suppliers have an open credit note or an SLA breach this quarter?" style="flex:1;min-width:240px" aria-label="Question"><button class="btn" id="askb">Ask across suppliers</button></form>
      <div class="examples" id="askex">${['Which suppliers have an open credit note or an SLA breach this quarter?', 'Who supplies tow bars and what are their terms?', 'Which invoices are over 30 days and from whom?', 'Which supplier had the most quality notes in the last 90 days?'].map(x => `<button type="button">${esc(x)}</button>`).join('')}</div>
      <div id="askout"></div></div></section><div id="lv"></div>`;
  const ask = async () => {
    const q = root.querySelector('#askq'), b = root.querySelector('#askb'), out = root.querySelector('#askout'); const text = q.value.trim(); if (!text) return;
    spinBtn(b, true, 'Asking…'); out.innerHTML = `<div class="thinking"><span class="dots"><i></i><i></i><i></i></span>Retrieving supplier resources, memos and invoice summaries…</div>`;
    const r = await api('/suppliers/ask', { method: 'POST', body: { question: text, lang: state.lang } }); spinBtn(b, false);
    out.innerHTML = r.ok ? answerBlock(r.data, { considered: r.data.suppliersConsidered, evidenceHref: id => '#/suppliers/' + encodeURIComponent(id) }) : failState(r, { what: 'an answer', endpoint: 'POST /suppliers/ask', inline: true });
  };
  root.querySelector('#askf').onsubmit = e => { e.preventDefault(); ask(); };
  root.querySelectorAll('#askex button').forEach(b => b.onclick = () => { root.querySelector('#askq').value = b.textContent; ask(); });
  const nb = root.querySelector('#newsup'); if (nb) nb.onclick = async () => { const s = await createSupplier(); if (s) location.hash = '#/suppliers/' + encodeURIComponent(s.id); };
  await listView(root.querySelector('#lv'), {
    endpoint: '/suppliers', count: 'suppliers', search: 'Search name, ABN, contact…', annText: 'GET /dms/api/suppliers', initial: ctx.query, sort: 'name',
    filters: [{ key: 'category', label: 'Any category', options: CATS.map(c => [c, cap(c.replace('-', ' '))]) }, { key: 'status', label: 'Any status', options: [['active', 'Active'], ['on_hold', 'On hold']] }],
    href: s => '#/suppliers/' + encodeURIComponent(s.id),
    emptyHtml: empty({ inline: true, title: 'No suppliers', body: '<code>GET /dms/api/suppliers</code> returned nothing for this filter, or the route is not in this build yet.' }),
    cols: [
      { label: 'Supplier', sort: 'name', render: s => `<span class="cell-title">${esc(s.name)}</span><span class="cell-sub mono">${esc(s.id)}${s.abn ? ' · ABN ' + esc(s.abn) : ''}</span>` },
      { label: 'Category', render: s => `<span class="chip out">${esc(cap(String(s.category || '').replace('-', ' ')))}</span>` },
      { label: 'Contact', render: s => `${esc(s.contact?.name || '—')}<span class="cell-sub">${esc(s.contact?.email || s.contact?.phone || '')}</span>` },
      { label: 'Terms', render: s => esc(s.terms || '—') },
      { label: 'Rating', render: s => stars(s.rating) },
      { label: 'Spend 12 m', num: true, sort: 'spend12m', render: s => money(s.spend12m) },
      { label: 'Open invoices', num: true, render: s => num(s.openInvoices || 0) },
      { label: 'Memos', num: true, render: s => num(s.memoCount || 0) },
      { label: 'Status', render: s => statusChip(s.status) },
    ],
  });
}

async function createSupplier() {
  const f = await drawerForm('New supplier', `<div class="grid g2" style="gap:10px"><div class="field" style="grid-column:1/-1"><label for="sn">Name</label><input class="input" id="sn" name="name" required></div><div class="field"><label for="sa">ABN</label><input class="input mono" id="sa" name="abn" placeholder="11 digits"></div><div class="field"><label for="sc">Category</label><select class="select" id="sc" name="category">${CATS.map(c => `<option value="${c}">${esc(cap(c.replace('-', ' ')))}</option>`).join('')}</select></div><div class="field"><label for="scn">Contact name</label><input class="input" id="scn" name="contactName"></div><div class="field"><label for="sce">Contact email</label><input class="input" id="sce" name="contactEmail" type="email"></div><div class="field"><label for="scp">Contact phone</label><input class="input" id="scp" name="contactPhone"></div><div class="field"><label for="st">Terms</label><input class="input" id="st" name="terms" value="30 days"></div></div>`, { submit: 'New supplier' });
  if (!f) return null; const v = f.values;
  const y = await api('/suppliers', { method: 'POST', body: { name: v.name, abn: v.abn || null, category: v.category, contact: { name: v.contactName || null, email: v.contactEmail || null, phone: v.contactPhone || null }, terms: v.terms || '30 days' } });
  if (!y.ok) { f.err(y.status === 404 ? 'POST /dms/api/suppliers is not in this build yet.' : `Couldn’t create (${y.status}): ${y.error}`); return null; }
  f.close(); toast('Supplier created'); return y.data?.supplier || y.data;
}

async function detail(root, ctx, id) {
  root.innerHTML = loading(8);
  const [r, staff] = await Promise.all([api('/suppliers/' + encodeURIComponent(id)), staffMap()]);
  if (!r.ok) { root.innerHTML = pagehead({ title: id, crumbs: [['Suppliers', '#/suppliers'], [id]] }) + failState(r, { what: 'this supplier', endpoint: 'GET /dms/api/suppliers/' + id }); bindRetry(root, ctx.rerender); return; }
  const x = r.data || {}; const s = x.supplier || x;
  const memos = [...(x.memos || s.memos || [])].sort((a, b) => (b.pinned === true) - (a.pinned === true) || String(b.at).localeCompare(String(a.at)));
  const invoices = x.invoices || (x.documents || []).filter(d => d.kind === 'supplier_invoice');
  const docs = (x.documents || s.documents || []).filter(d => d.kind !== 'supplier_invoice');
  const spend = x.spend || {};
  root.innerHTML = pagehead({
    title: s.name, crumbs: [['Suppliers', '#/suppliers'], [s.id]], tags: statusChip(s.status) + ` <span class="chip out">${esc(cap(String(s.category || '').replace('-', ' ')))}</span>`,
    sub: `<span class="mono">${esc(s.id)}</span>${s.abn ? ` · ABN ${esc(s.abn)}` : ''} · ${esc(s.contact?.name || '')}${s.contact?.email ? ' · ' + esc(s.contact.email) : ''}${s.contact?.phone ? ' · ' + esc(s.contact.phone) : ''} · terms ${esc(s.terms || '—')} · ${stars(s.rating)}`,
    actions: canWrite() ? `<button class="btn" id="addmemo">Add memo</button><button class="btn secondary" id="upinv">Upload invoice</button><input type="file" id="invfile" accept="application/pdf,.pdf" class="sr">${s.status === 'active' ? `<button class="btn ghost" data-st="on_hold">Put on hold</button>` : `<button class="btn ghost" data-st="active">Reactivate</button>`}` : '',
  }) + `<div class="split"><div class="stack">
    <div class="grid g2">
      <section class="card"><div class="chead"><h3>Spend</h3>${ann('documents kind supplier_invoice · deals.accessories')}</div><div class="cbody"><dl class="kv"><dt>Last 12 months</dt><dd class="num">${money(s.spend12m ?? spend.spend12m)}</dd><dt>Open invoices</dt><dd class="num">${num(s.openInvoices ?? invoices.filter(i => i.status !== 'verified' && i.status !== 'paid').length)}</dd><dt>Overdue</dt><dd class="num">${num(spend.overdue ?? 0)}</dd><dt>Average days to pay</dt><dd class="num">${spend.avgDaysToPay != null ? num(spend.avgDaysToPay) : '—'}</dd></dl></div></section>
      <section class="card"><div class="chead"><h3>Details</h3></div><div class="cbody"><dl class="kv"><dt>Address</dt><dd>${esc(s.address || '—')}</dd><dt>Contact</dt><dd>${esc(s.contact?.name || '—')}</dd><dt>Email</dt><dd>${esc(s.contact?.email || '—')}</dd><dt>Phone</dt><dd>${esc(s.contact?.phone || '—')}</dd><dt>Since</dt><dd>${date(s.createdAt)}</dd></dl></div></section>
    </div>
    <section class="card"><div class="chead"><h3>Memos</h3><span class="sub">${memos.length}</span><div class="r">${ann('memos · POST /suppliers/:id/memos', 'kb')}</div></div><div class="cbody"><ol class="timeline">${memos.map(m => `<li class="${m.pinned ? 'k-stage' : ''}"><div class="t">${dateTime(m.at)} · <span class="chip out" style="font-size:.66rem">${esc(MEMO_KINDS[m.kind] || cap(m.kind || 'note'))}</span>${m.byStaffId ? ' · ' + esc(staff[m.byStaffId]?.name || m.byStaffId) : ''}${m.pinned ? ' · <b>Pinned</b>' : ''}${canWrite() ? ` · <button class="btn ghost sm" style="min-height:22px;padding:0 6px;font-size:.7rem" data-pin="${esc(m.id)}" data-pinned="${m.pinned ? 'true' : 'false'}">${m.pinned ? 'Unpin' : 'Pin'}</button>` : ''}</div><div class="n">${esc(m.text || '')}</div></li>`).join('') || '<li><span class="muted">No memos yet.</span></li>'}</ol></div></section>
    <section class="card"><div class="chead"><h3>Invoices</h3><span class="sub">${invoices.length}</span><div class="r">${ann('GET /documents?supplierId=&kind=supplier_invoice')}</div></div><div class="cbody">${invoices.length ? `<div class="datatable compact"><div class="scroll"><table><thead><tr><th>Invoice</th><th>Date</th><th>Due</th><th class="num">Total</th><th>Status</th><th></th></tr></thead><tbody>${invoices.map(i => { const e = i.extracted || {}; return `<tr><td><a class="mono" href="#/documents/${encodeURIComponent(i.id)}">${esc(e.invoiceNo || i.fileName || i.id)}</a></td><td>${date(e.invoiceDate || i.uploadedAt)}</td><td>${e.dueDate ? date(e.dueDate) : '—'}</td><td class="num">${money(e.total ?? i.total)}</td><td>${statusChip(i.status)}</td><td>${i.status === 'uploaded' && canWrite() ? `<a class="btn ghost sm" href="#/documents/${encodeURIComponent(i.id)}?process=1">Process</a>` : ''}</td></tr>`; }).join('')}</tbody></table></div></div>` : '<span class="muted" style="font-size:.85rem">No invoices. Upload a PDF; Progress Agentic RAG extracts the supplier, number, dates and totals.</span>'}</div></section>
    ${docs.length ? `<section class="card"><div class="chead"><h3>Documents</h3><span class="sub">${docs.length}</span></div><div class="cbody"><div class="stack" style="gap:8px">${docs.map(o => `<a class="row" href="#/documents/${encodeURIComponent(o.id)}">${icon('doc')}<span>${esc(o.fileName || o.id)}</span><span class="chip out">${esc(cap(o.kind || 'document'))}</span>${statusChip(o.status)}</a>`).join('')}</div></div></section>` : ''}
  </div><div class="stack">
    <section class="card aipanel"><div class="chead"><h3>Ask about this supplier</h3>${tagArag()}<div class="r">${ann('POST /dms/api/suppliers/' + s.id + '/ask', 'kb')}</div></div><div class="cbody stack" style="gap:10px">
      <p class="muted" style="font-size:.82rem">Answers come from this supplier’s resource: profile, memos and the invoices the agent has read, plus the supplier-terms policy.</p>
      <form class="row" id="askf"><input class="input" id="askq" placeholder="Are any invoices overdue, and what did we agree about delivery?" style="flex:1;min-width:160px" aria-label="Question"><button class="btn" id="askb">Ask</button></form>
      <div class="examples" id="askex">${['Are any invoices overdue?', 'What did we last agree about delivery times?', 'Summarise the quality issues on record', 'What are the payment terms and who is the contact?'].map(x => `<button type="button">${esc(x)}</button>`).join('')}</div>
      <div id="askout"></div></div></section>
    <section class="card"><div class="chead"><h3>Knowledge box</h3>${tagArag()}</div><div class="cbody" style="font-size:.84rem"><dl class="kv"><dt>Resource</dt><dd class="mono">${esc(x.kbResourceId || s.kbResourceId || 'not synced')}</dd><dt>Label</dt><dd class="mono">topic/supplier</dd></dl></div></section>
  </div></div>`;
  const on = (sel, fn) => { const b = root.querySelector(sel); if (b) b.onclick = fn; };
  root.querySelectorAll('[data-st]').forEach(b => b.onclick = async () => { const y = await api('/suppliers/' + encodeURIComponent(s.id), { method: 'PATCH', body: { status: b.dataset.st } }); if (y.ok) { toast('Updated'); ctx.rerender(); } else toast(`Couldn’t update: ${y.error}`); });
  root.querySelectorAll('[data-pin]').forEach(b => b.onclick = async () => { const y = await api('/memos/' + encodeURIComponent(b.dataset.pin), { method: 'PATCH', body: { pinned: b.dataset.pinned !== 'true' } }); if (y.ok) ctx.rerender(); else toast(`Couldn’t pin: ${y.error}`); });
  on('#addmemo', async () => {
    const f = await drawerForm('Add memo', `<div class="field"><label for="mk">Kind</label><select class="select" id="mk" name="kind">${Object.entries(MEMO_KINDS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></div><div class="field"><label for="mt">Memo</label><textarea class="textarea" id="mt" name="text" style="min-height:110px" required></textarea></div><label class="switch"><input type="checkbox" name="pinned"> Pin to the top</label>`, { submit: 'Add memo', sub: s.id, note: 'Memos are part of the supplier’s knowledge-box resource.' });
    if (!f) return; const y = await api(`/suppliers/${encodeURIComponent(s.id)}/memos`, { method: 'POST', body: { kind: f.values.kind, text: f.values.text.trim(), pinned: f.values.pinned === 'on' } }); if (!y.ok) return f.err(`Couldn’t add: ${y.error}`); f.close(); toast('Memo added'); ctx.rerender();
  });
  on('#upinv', () => root.querySelector('#invfile').click());
  const inv = root.querySelector('#invfile'); if (inv) inv.onchange = async () => {
    const file = inv.files[0]; if (!file) return; if (file.size > 6 * 1024 * 1024) return toast('That file is over 6 MB.');
    const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(file); });
    const y = await api(`/suppliers/${encodeURIComponent(s.id)}/documents`, { method: 'POST', body: { fileName: file.name, kind: 'supplier_invoice', contentType: 'application/pdf', contentBase64: b64 } });
    if (!y.ok) return toast(y.status === 404 ? 'POST /suppliers/:id/documents is not in this build yet' : `Upload failed (${y.status}): ${y.error}`);
    const doc = y.data?.document || y.data; toast('Invoice uploaded'); location.hash = '#/documents/' + encodeURIComponent(doc.id) + '?process=1';
  };
  const ask = async () => {
    const q = root.querySelector('#askq'), b = root.querySelector('#askb'), out = root.querySelector('#askout'); const text = q.value.trim(); if (!text) return;
    spinBtn(b, true, 'Asking…'); out.innerHTML = `<div class="thinking"><span class="dots"><i></i><i></i><i></i></span>Reading this supplier’s resource and memos…</div>`;
    const y = await api(`/suppliers/${encodeURIComponent(s.id)}/ask`, { method: 'POST', body: { question: text, lang: state.lang } }); spinBtn(b, false);
    out.innerHTML = y.ok ? answerBlock(y.data) : failState(y, { what: 'an answer', endpoint: `POST /suppliers/${s.id}/ask`, inline: true });
  };
  root.querySelector('#askf').onsubmit = e => { e.preventDefault(); ask(); };
  root.querySelectorAll('#askex button').forEach(b => b.onclick = () => { root.querySelector('#askq').value = b.textContent; ask(); });
}
