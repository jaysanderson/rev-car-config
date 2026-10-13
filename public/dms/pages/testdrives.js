import { api, state, esc, dateTime, date, ago, pagehead, loading, failState, ann, statusChip, siteName, modelName, cap, staffMap, bindRetry, custName } from '../core.js';
import { listView, withCustomers, handoverSheet, qaList } from '../parts.js';

const ST = ['booked', 'completed', 'no_show', 'cancelled'];

export default async function testDrives(root, ctx) {
  if (ctx.params[0]) return detail(root, ctx, ctx.params[0]);
  const staff = await staffMap();
  root.innerHTML = pagehead({ title: 'Test drives', sub: 'Bookings from the configurator and the showroom. Configurator bookings arrive with the customer’s answers and a handover sheet.' }) + '<div id="lv"></div>';
  await listView(root.querySelector('#lv'), {
    endpoint: '/test-drives', count: 'test drives', search: 'Search TD id, model, customer…', annText: 'GET /dms/api/test-drives', initial: ctx.query,
    filters: [{ key: 'status', label: 'Any status', options: ST.map(s => [s, cap(s)]) }],
    enrich: rows => withCustomers(rows),
    href: t => '#/test-drives/' + encodeURIComponent(t.id),
    cols: [
      { label: 'When', sort: 'when', render: t => `<span class="cell-title">${dateTime(t.when)}</span><span class="cell-sub mono">${esc(t.id)}</span>` },
      { label: 'Customer', render: t => t.customer ? esc(custName(t.customer)) : `<span class="muted">${t.customerId ? esc(t.customerId) : 'Configurator session'}</span>` },
      { label: 'Car', render: t => `${esc(modelName(t.modelId))}${t.gradeId ? ` <span class="subtle">${esc(cap(String(t.gradeId).replace(/-/g, ' ')))}</span>` : ''}${t.stockNo ? `<span class="cell-sub mono">${esc(t.stockNo)}</span>` : ''}` },
      { label: 'Status', sort: 'status', render: t => statusChip(t.status) },
      { label: 'Handover', render: t => t.handover ? '<span class="chip info">Sheet ready</span>' : '<span class="subtle">—</span>' },
      { label: 'Salesperson', render: t => esc(staff[t.staffId]?.name || t.staffId || '—') + `<span class="cell-sub">${esc(siteName(t.siteId))}</span>` },
    ],
  });
}

async function detail(root, ctx, id) {
  root.innerHTML = loading(8);
  const [r, staff] = await Promise.all([api('/test-drives/' + encodeURIComponent(id)), staffMap()]);
  if (!r.ok) { root.innerHTML = pagehead({ title: id, crumbs: [['Test drives', '#/test-drives'], [id]] }) + failState(r, { what: 'this test drive', endpoint: 'GET /dms/api/test-drives/' + id }); bindRetry(root, ctx.rerender); return; }
  const t = r.data?.testDrive || r.data || {};
  const cust = r.data?.customer || t.customer;
  root.innerHTML = pagehead({ title: `Test drive ${t.id}`, crumbs: [['Test drives', '#/test-drives'], [t.id]], tags: statusChip(t.status), sub: `${esc(modelName(t.modelId))} · ${dateTime(t.when)} · ${esc(siteName(t.siteId))}` }) +
    `<div class="split wide-r"><div class="stack">
      <section class="card"><div class="chead"><h3>Booking</h3><div class="r">${ann('GET /dms/api/test-drives/' + t.id)}</div></div><div class="cbody"><dl class="kv">
        <dt>Customer</dt><dd>${cust ? `<a href="#/customers/${encodeURIComponent(cust.id)}">${esc(custName(cust))}</a>` : '<span class="muted">Anonymous configurator session</span>'}</dd>
        <dt>Lead</dt><dd>${t.leadId ? `<a class="mono" href="#/leads/${encodeURIComponent(t.leadId)}">${esc(t.leadId)}</a>` : '—'}</dd>
        <dt>Car</dt><dd>${esc(modelName(t.modelId))} ${t.gradeId ? esc(cap(String(t.gradeId).replace(/-/g, ' '))) : ''} ${t.stockNo ? `<span class="mono">${esc(t.stockNo)}</span>` : ''}</dd>
        <dt>Salesperson</dt><dd>${esc(staff[t.staffId]?.name || t.staffId || '—')}</dd>
        <dt>When</dt><dd>${dateTime(t.when)} <span class="subtle">(${ago(t.when)})</span></dd>
        ${t.incentive ? `<dt>Incentive</dt><dd>${esc(t.incentive.title || JSON.stringify(t.incentive))}</dd>` : ''}
        ${t.outcome ? `<dt>Outcome</dt><dd>${esc(typeof t.outcome === 'string' ? t.outcome : JSON.stringify(t.outcome))}</dd>` : ''}
      </dl></div></section>
      ${(t.questions || []).length ? `<section class="card"><div class="chead"><h3>Customer’s answers</h3><span class="sub">asked by the configurator after booking</span></div><div class="cbody">${qaList(t.questions)}</div></section>` : ''}
    </div><div class="stack">${t.handover ? `<section class="card"><div class="chead"><h3>Salesperson handover</h3></div><div class="cbody">${handoverSheet(t.handover, { title: 'Pre-visit sheet' })}</div></section>` : `<section class="card"><div class="cbody muted">No handover sheet: this drive was booked in the showroom or by phone.</div></section>`}</div></div>`;
}
