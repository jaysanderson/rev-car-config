import { api, esc, date, dateTime, ago, money, pagehead, loading, failState, ann, statusChip, siteName, modelName, cap, custName, bindRetry, icon, state } from '../core.js';
import { listView, interestLabel, channelChip } from '../parts.js';

const SOURCES = ['web-configurator', 'walk-in', 'phone', 'referral', 'campaign', 'service'];
export default async function customers(root, ctx) {
  if (ctx.params[0]) return detail(root, ctx, ctx.params[0]);
  root.innerHTML = pagehead({ title: 'Customers', sub: 'People who have enquired, test-driven or bought. Configurator customers appear once they leave their details.' }) + '<div id="lv"></div>';
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
  const r = await api('/customers/' + encodeURIComponent(id));
  if (!r.ok) { root.innerHTML = pagehead({ title: id, crumbs: [['Customers', '#/customers'], [id]] }) + failState(r, { what: 'this customer', endpoint: 'GET /dms/api/customers/' + id }); bindRetry(root, ctx.rerender); return; }
  const x = r.data || {}; const c = x.customer || x;
  const leads = x.leads || c.leads || [], deals = x.deals || c.deals || [], drives = x.testDrives || x.test_drives || c.testDrives || [], docs = x.documents || c.documents || [];
  const sec = (t, n, body) => `<section class="card"><div class="chead"><h3>${t}</h3><span class="sub">${n}</span></div><div class="cbody">${n ? body : '<span class="muted" style="font-size:.85rem">None</span>'}</div></section>`;
  root.innerHTML = pagehead({ title: custName(c), crumbs: [['Customers', '#/customers'], [c.id]], sub: `${esc(c.email || '')}${c.phone ? ' · ' + esc(c.phone) : ''}${c.suburb ? ' · ' + esc(c.suburb) : ''} · customer since ${date(c.createdAt)}` }) +
  `<div class="split"><div class="stack">
    ${sec('Deals', deals.length, `<div class="stack" style="gap:8px">${deals.map(d => `<a class="row" href="#/deals/${encodeURIComponent(d.id)}">${icon('deals')}<span class="mono">${esc(d.id)}</span>${statusChip(d.stage)}<span class="muted">${money(d.driveAway)} · ${date(d.createdAt)}</span></a>`).join('')}</div>`)}
    ${sec('Leads', leads.length, `<div class="stack" style="gap:8px">${leads.map(l => `<a class="row" href="#/leads/${encodeURIComponent(l.id)}">${icon('leads')}<span class="mono">${esc(l.id)}</span>${statusChip(l.status)}${channelChip(l.channel)}<span class="muted">${esc(interestLabel(l.interest))} · ${date(l.createdAt)}</span></a>`).join('')}</div>`)}
    ${sec('Test drives', drives.length, `<div class="stack" style="gap:8px">${drives.map(t => `<a class="row" href="#/test-drives/${encodeURIComponent(t.id)}">${icon('drive')}<span class="mono">${esc(t.id)}</span>${statusChip(t.status)}<span class="muted">${esc(modelName(t.modelId))} · ${dateTime(t.when)}</span></a>`).join('')}</div>`)}
    ${sec('Documents', docs.length, `<div class="stack" style="gap:8px">${docs.map(o => `<a class="row" href="#/documents/${encodeURIComponent(o.id)}">${icon('doc')}${esc(o.fileName || o.id)}<span class="chip out">${esc(cap(o.kind))}</span>${statusChip(o.status)}</a>`).join('')}</div>`)}
  </div><div class="stack"><section class="card"><div class="chead"><h3>Profile</h3><div class="r">${ann('GET /dms/api/customers/' + c.id)}</div></div><div class="cbody"><dl class="kv">
    <dt>Name</dt><dd>${esc(custName(c))}</dd><dt>Email</dt><dd>${esc(c.email || '—')}</dd><dt>Phone</dt><dd>${esc(c.phone || '—')}</dd><dt>Address</dt><dd>${esc([c.suburb, c.postcode].filter(Boolean).join(' ') || '—')}</dd><dt>Source</dt><dd>${esc(cap(String(c.source || '—').replace('-', ' ')))}</dd><dt>Tags</dt><dd>${(c.tags || []).map(t => `<span class="chip neutral">${esc(t)}</span>`).join(' ') || '—'}</dd>${c.notes ? `<dt>Notes</dt><dd>${esc(c.notes)}</dd>` : ''}
  </dl></div></section></div></div>`;
}
