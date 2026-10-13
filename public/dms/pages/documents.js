import { api, state, esc, pick, items, num, money, date, dateTime, pagehead, loading, failState, empty, tagArag, ann, statusChip, cap, bindRetry, spinBtn, toast, citations, icon, API } from '../core.js';
import { listView } from '../parts.js';

const KINDS = ['contract', 'trade_in_form', 'supplier_invoice', 'licence', 'insurance'];
const KIND_LABEL = { contract: 'Contract of sale', trade_in_form: 'Trade-in form', supplier_invoice: 'Supplier invoice', licence: 'Driver licence', insurance: 'Insurance certificate' };
const canWrite = () => (state.user?.caps || ['documents.write']).includes('documents.write');

export default async function documents(root, ctx) {
  if (ctx.params[0]) return detail(root, ctx, ctx.params[0]);
  root.innerHTML = pagehead({ title: 'Documents', tags: tagArag(), sub: 'Contracts, trade-in forms and supplier invoices. Upload a PDF, then Progress Agentic RAG ingests it into the knowledge box and extracts the fields with a per-kind schema, with a confidence for each and the ones a person should check.' }) +
    `<div class="split"><div id="lv"></div><aside class="stack">${canWrite() ? uploader(ctx.query) : ''}</aside></div>`;
  if (canWrite()) bindUpload(root, ctx);
  await listView(root.querySelector('#lv'), {
    endpoint: '/documents', count: 'documents', search: 'Search file name, deal, customer…', annText: 'GET /dms/api/documents', initial: ctx.query,
    filters: [{ key: 'kind', label: 'Any kind', options: KINDS.map(k => [k, KIND_LABEL[k]]) }, { key: 'status', label: 'Any status', options: ['uploaded', 'processing', 'extracted', 'verified'].map(s => [s, cap(s)]) }],
    href: d => '#/documents/' + encodeURIComponent(d.id),
    cols: [
      { label: 'Document', sort: 'fileName', render: d => `<span class="cell-title">${icon('doc', '')}${esc(d.fileName || d.id)}</span><span class="cell-sub mono">${esc(d.id)}</span>`.replace('<svg class=""', '<svg style="width:14px;height:14px;vertical-align:-2px;margin-right:4px"') },
      { label: 'Kind', render: d => `<span class="chip out">${esc(KIND_LABEL[d.kind] || cap(d.kind))}</span>` },
      { label: 'Deal', render: d => d.dealId ? `<a class="mono" href="#/deals/${encodeURIComponent(d.dealId)}">${esc(d.dealId)}</a>` : '<span class="subtle">—</span>' },
      { label: 'Status', sort: 'status', render: d => statusChip(d.status) },
      { label: 'Uploaded', sort: 'uploadedAt', render: d => date(d.uploadedAt) },
    ],
  });
}

const uploader = q => `<section class="card aipanel"><div class="chead"><h3>Upload a document</h3>${tagArag()}<div class="r">${ann('POST /dms/api/documents', 'dms')}</div></div><div class="cbody stack" style="gap:12px">
  <label class="dropzone" id="dz" for="file">${icon('upload')}<b>Choose a PDF</b><span style="font-size:.78rem">or drop it here · up to 10 MB</span><span id="fname" class="mono" style="font-size:.76rem"></span></label>
  <input type="file" id="file" accept="application/pdf,.pdf" class="sr">
  <div class="grid g2" style="gap:10px"><div class="field"><label for="kind">Kind</label><select class="select" id="kind">${KINDS.map(k => `<option value="${k}">${esc(KIND_LABEL[k])}</option>`).join('')}</select></div><div class="field"><label for="deal">Deal (optional)</label><input class="input mono" id="deal" placeholder="D-01234" value="${esc(q.dealId || '')}"></div></div>
  <button class="btn" id="up" disabled>${icon('upload')}Upload</button><div class="err" id="uperr"></div>
  <p class="subtle" style="font-size:.74rem">Try a sample: the six PDFs in <span class="mono">content/dms/samples/</span>. When the file name matches the sample manifest, the extracted values are shown beside the expected ones.</p>
</div></section>`;

function guessKind(name) { const n = name.toLowerCase(); return /invoice|inv[-_]/.test(n) ? 'supplier_invoice' : /trade/.test(n) ? 'trade_in_form' : /licen/.test(n) ? 'licence' : /insur/.test(n) ? 'insurance' : /contract|sale/.test(n) ? 'contract' : null; }
function bindUpload(root, ctx) {
  const input = root.querySelector('#file'), dz = root.querySelector('#dz'), up = root.querySelector('#up'), err = root.querySelector('#uperr');
  let file = null;
  const set = f => { if (!f) return; if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) { err.textContent = 'Only PDF files are accepted.'; return; } if (f.size > 10 * 1024 * 1024) { err.textContent = 'That file is over 10 MB.'; return; } err.textContent = ''; file = f; root.querySelector('#fname').textContent = `${f.name} · ${Math.round(f.size / 1024)} KB`; up.disabled = false; const k = guessKind(f.name); if (k) root.querySelector('#kind').value = k; };
  input.onchange = () => set(input.files[0]);
  ['dragenter', 'dragover'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', ev => set(ev.dataTransfer.files[0]));
  up.onclick = async () => {
    if (!file) return;
    spinBtn(up, true, 'Uploading…');
    const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(file); });
    const dealId = root.querySelector('#deal').value.trim() || undefined;
    const r = await api('/documents', { method: 'POST', body: { fileName: file.name, kind: root.querySelector('#kind').value, dealId, contentType: 'application/pdf', contentBase64: b64 } });
    spinBtn(up, false);
    if (!r.ok) { err.textContent = r.status === 413 ? 'The API refused the file as too large.' : r.status === 403 ? 'Your role can’t upload documents.' : `Upload failed (${r.status}): ${r.error}`; return; }
    const doc = r.data?.document || r.data;
    toast('Uploaded'); location.hash = '#/documents/' + encodeURIComponent(doc.id) + '?process=1';
  };
}

async function detail(root, ctx, id) {
  root.innerHTML = loading(8);
  const r = await api('/documents/' + encodeURIComponent(id));
  if (!r.ok) { root.innerHTML = pagehead({ title: id, crumbs: [['Documents', '#/documents'], [id]] }) + failState(r, { what: 'this document', endpoint: 'GET /dms/api/documents/' + id }); bindRetry(root, ctx.rerender); return; }
  let doc = r.data?.document || r.data || {};
  root.innerHTML = pagehead({
    title: doc.fileName || doc.id, crumbs: [['Documents', '#/documents'], [doc.id]], tags: `${statusChip(doc.status)} <span class="chip out">${esc(KIND_LABEL[doc.kind] || cap(doc.kind))}</span>`,
    sub: `Uploaded ${dateTime(doc.uploadedAt)}${doc.dealId ? ` · deal <a class="mono" href="#/deals/${encodeURIComponent(doc.dealId)}">${esc(doc.dealId)}</a>` : ''}${doc.aragResourceId ? ` · KB resource <span class="mono">${esc(String(doc.aragResourceId).slice(0, 12))}…</span>` : ''}`,
    actions: canWrite() ? `<button class="btn" id="proc">${icon('assistant')}${doc.extracted && Object.keys(doc.extracted).length ? 'Re-process' : 'Process'} with Progress Agentic RAG</button>${ann('POST /dms/api/documents/' + doc.id + '/process', 'kb')}` : '',
  }) + `<div class="split wide-r"><section class="card"><div class="chead"><h3>Document</h3><div class="r">${ann('GET /dms/api/documents/' + doc.id + '/file')}</div></div><div class="cbody" id="pv">${loading(4)}</div></section><section class="card aipanel" id="ex"><div class="chead"><h3>Extracted fields</h3>${tagArag()}</div><div class="cbody" id="exb"></div></section></div>`;

  preview(root.querySelector('#pv'), doc);
  const exb = root.querySelector('#exb');
  const show = d => { exb.innerHTML = renderFields(d); bindVerify(root, d, ctx); };
  if (doc.extracted && Object.keys(doc.extracted).length) show(doc);
  else exb.innerHTML = empty({ inline: true, ic: 'assistant', title: 'Not processed yet', body: 'Process the document to ingest it into the knowledge box and extract its fields.' });
  const pb = root.querySelector('#proc');
  const run = async () => {
    spinBtn(pb, true, 'Processing…');
    exb.innerHTML = `<div class="thinking"><span class="dots"><i></i><i></i><i></i></span>Uploading to the knowledge box, waiting for processing, then extracting with the ${esc(KIND_LABEL[doc.kind] || doc.kind)} schema. This can take up to a minute.</div>`;
    const y = await api(`/documents/${encodeURIComponent(doc.id)}/process`, { method: 'POST', body: { lang: state.lang }, timeout: 180000 });
    spinBtn(pb, false);
    if (!y.ok) { exb.innerHTML = failState(y, { what: 'document processing', endpoint: `POST /documents/${doc.id}/process`, inline: true }); return; }
    doc = { ...doc, ...(y.data?.document || {}), ...(y.data?.document ? {} : y.data) };
    show(doc); toast('Extraction complete');
  };
  if (pb) pb.onclick = run;
  if (pb && ctx.query.process && !(doc.extracted && Object.keys(doc.extracted).length)) run();
}

async function preview(host, doc) {
  try {
    const res = await fetch(`${API}/documents/${encodeURIComponent(doc.id)}/file`, { headers: { Authorization: 'Bearer ' + state.token } });
    if (!res.ok || !/pdf/.test(res.headers.get('content-type') || '')) throw new Error(res.status);
    const url = URL.createObjectURL(await res.blob());
    host.innerHTML = `<iframe class="pdfview" src="${url}" title="${esc(doc.fileName || 'Document')}"></iframe>`;
  } catch {
    host.innerHTML = empty({ inline: true, ic: 'doc', title: doc.fileName || 'No preview', body: doc.kind && !doc.aragResourceId && doc.status === 'uploaded' ? 'Preview not available for this record.' : 'This record has no stored PDF to preview (seeded documents carry extracted data only).' });
  }
}

const flat = (o, p = '') => Object.entries(o || {}).flatMap(([k, v]) => v && typeof v === 'object' && !Array.isArray(v) ? flat(v, p + k + '.') : [[p + k, v]]);
const fmtV = v => v == null || v === '' ? '<span class="subtle">—</span>' : Array.isArray(v) ? (v.length && typeof v[0] === 'object' ? `<span class="mono" style="font-size:.74rem">${v.length} line${v.length === 1 ? '' : 's'}</span>` : esc(v.join(', '))) : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : esc(v);
const norm = v => String(Array.isArray(v) ? v.length : v ?? '').toLowerCase().replace(/[\s,$]/g, '');

function renderFields(d) {
  const ex = d.extracted || {};
  const conf = d.confidence || ex._confidence || {};
  const expected = d.expected || d.sample?.expected || null;
  const verify = new Set(d.verifyFields || []);
  const rows = flat(Object.fromEntries(Object.entries(ex).filter(([k]) => !k.startsWith('_'))));
  const lines = Object.values(ex).find(v => Array.isArray(v) && v.length && typeof v[0] === 'object');
  if (!rows.length) return empty({ inline: true, title: 'No fields extracted', body: 'The agent didn’t return any fields for this document.' });
  const expFlat = expected ? Object.fromEntries(flat(expected)) : null;
  let matched = 0, compared = 0;
  const body = rows.map(([k, v]) => {
    const c = typeof conf === 'number' ? conf : conf[k] ?? conf[k.split('.').pop()];
    const cp = c == null ? null : c > 1 ? c : c * 100;
    const e = expFlat ? expFlat[k] ?? expFlat[k.split('.').pop()] : undefined;
    let cls = '';
    if (e !== undefined) { compared++; if (norm(e) === norm(v)) { cls = 'match'; matched++; } else cls = 'miss'; }
    const chk = verify.has(k) || verify.has(k.split('.').pop()) || (cp != null && cp < 70);
    return `<div class="fr${chk ? ' check' : ''}"><span class="k">${esc(cap(k.replace(/\./g, ' › ').replace(/([a-z])([A-Z])/g, '$1 $2')))}${chk ? ' <span class="chip warn" style="font-size:.62rem">Check</span>' : ''}</span>
      <span class="v">${d.status !== 'verified' && chk && canWrite() && !Array.isArray(v) ? `<input class="input" style="height:30px" data-vf="${esc(k)}" value="${esc(v ?? '')}">` : fmtV(v)}</span>
      ${expFlat ? `<span class="e ${cls}">${e === undefined ? '<span class="subtle">—</span>' : (cls === 'match' ? '✓ ' : '≠ ') + fmtV(e)}</span>` : '<span></span>'}
      <span class="conf">${cp == null ? '<span class="subtle">—</span>' : `<span>${Math.round(cp)}%</span><span class="bar"><i style="width:${cp}%;background:${cp >= 90 ? 'var(--accent-500)' : cp >= 70 ? 'var(--brand-500)' : '#E8A317'}"></i></span>`}</span></div>`;
  }).join('');
  return `<div class="stack" style="gap:12px">
    ${expFlat ? `<div class="notice info">${icon('check')}<div>Matched the sample manifest: <b>${matched} of ${compared}</b> fields agree with the expected values.</div></div>` : ''}
    <div class="fields"><div class="fr hd"><span>Field</span><span>Extracted</span><span>${expFlat ? 'Expected (manifest)' : ''}</span><span>Confidence</span></div>${body}</div>
    ${lines ? `<details><summary style="cursor:pointer;font-size:.82rem;font-weight:600">Line items (${lines.length})</summary><div class="datatable compact" style="margin-top:8px"><div class="scroll"><table><thead><tr>${Object.keys(lines[0]).map(k => `<th>${esc(cap(k))}</th>`).join('')}</tr></thead><tbody>${lines.map(l => `<tr>${Object.values(l).map(v => `<td>${esc(typeof v === 'number' && v > 50 ? money(v) : v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div></details>` : ''}
    ${(d.citations || d.sources || []).length ? `<div><span class="label">Grounded in</span>${citations(d.citations || d.sources)}</div>` : ''}
    <div class="row">${d.status === 'verified' ? `<span class="chip good">${icon('check').replace('<svg', '<svg style="width:12px;height:12px"')} Verified${d.verifiedBy ? ' by ' + esc(d.verifiedBy) : ''}${d.verifiedAt ? ' · ' + dateTime(d.verifiedAt) : ''}</span>` : canWrite() ? `<button class="btn accent" id="verify">${icon('check')}Verify ${verify.size ? `(${verify.size} to check)` : ''}</button>${ann('POST /dms/api/documents/' + d.id + '/verify')}` : ''}<span class="subtle" style="margin-left:auto;font-size:.72rem">${d.extractedAt ? 'extracted ' + dateTime(d.extractedAt) : ''}</span></div>
    <div class="json">${esc(JSON.stringify({ extracted: d.extracted, confidence: d.confidence, verifyFields: d.verifyFields }, null, 2))}</div>
  </div>`;
}
function bindVerify(root, d, ctx) {
  const b = root.querySelector('#verify'); if (!b) return;
  b.onclick = async () => {
    const corrections = {}; root.querySelectorAll('[data-vf]').forEach(i => { corrections[i.dataset.vf] = i.value; });
    spinBtn(b, true, 'Verifying…');
    const y = await api(`/documents/${encodeURIComponent(d.id)}/verify`, { method: 'POST', body: { fields: corrections, corrections } });
    spinBtn(b, false);
    if (!y.ok) { toast(`Couldn’t verify: ${y.error}`); return; }
    toast('Document verified'); ctx.rerender();
  };
}
