import { notInBuild, drawerForm, toast, empty } from '../core.js';
import { api, state, esc, dateTime, date, ago, pagehead, loading, failState, ann, statusChip, siteName, modelName, cap, staffMap, bindRetry, custName } from '../core.js';
import { listView, withCustomers, handoverSheet, qaList , gradeName} from '../parts.js';

const ST = ['booked', 'completed', 'no_show', 'cancelled'];

export default async function testDrives(root, ctx) {
  if (ctx.params[0]) return detail(root, ctx, ctx.params[0]);
  const staff = await staffMap();
  const view = ctx.query.view || 'today';
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const range = view === 'today' ? { from: d0.toISOString(), to: new Date(+d0 + 864e5 - 1).toISOString() } : view === 'week' ? { from: d0.toISOString(), to: new Date(+d0 + 7 * 864e5).toISOString() } : {};
  root.innerHTML = pagehead({ title: 'Test drives', sub: 'Bookings from the configurator and the showroom. Configurator bookings arrive with the customer’s questions and a handover sheet.',
    actions: `<div class="segmented" role="group" aria-label="View">${[['today', 'Today'], ['week', 'Week'], ['all', 'All']].map(([k, l]) => `<button aria-pressed="${view === k}" data-v="${k}">${l}</button>`).join('')}</div>${(state.user?.caps || []).includes('leads.write') ? '<button class="btn" id="newtd">New test drive</button>' : ''}` }) + '<div id="lv"></div>';
  root.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { location.hash = '#/test-drives?view=' + b.dataset.v; });
  const nt = root.querySelector('#newtd'); if (nt) nt.onclick = () => toast('Open the lead and click Book test drive (the drive is booked against a lead)');
  await listView(root.querySelector('#lv'), {
    endpoint: '/test-drives', count: 'test drives', search: 'Search TD id, model, customer…', annText: 'GET /dms/api/test-drives', initial: ctx.query,
    query: { ...range, sort: view === 'all' ? undefined : 'when' }, sort: view === 'all' ? '' : 'when',
    emptyHtml: view === 'today' ? empty({ inline: true, title: 'No test drives today', body: 'Nothing is booked for today at this site.', actions: '<a class="btn secondary sm" href="#/test-drives?view=week">Show this week</a>' }) : undefined,
    filters: [{ key: 'status', label: 'Any status', options: ST.map(s => [s, cap(s)]) }],
    enrich: rows => withCustomers(rows),
    href: t => '#/test-drives/' + encodeURIComponent(t.id),
    cols: [
      { label: 'When', sort: 'when', render: t => `<span class="cell-title">${dateTime(t.when)}</span><span class="cell-sub mono">${esc(t.id)}</span>` },
      { label: 'Customer', render: t => t.customer ? esc(custName(t.customer)) : `<span class="muted">${t.customerId ? esc(t.customerId) : 'Configurator session'}</span>` },
      { label: 'Car', render: t => `${esc(modelName(t.modelId))}${t.gradeId ? ` <span class="subtle">${esc(gradeName(t.gradeId))}</span>` : ''}${t.stockNo ? `<span class="cell-sub mono">${esc(t.stockNo)}</span>` : ''}` },
      { label: 'Status', sort: 'status', render: t => statusChip(t.status) },
      { label: 'Prep', render: t => t.handover ? `<span class="chip ${t.handover.prep?.length ? 'good' : 'info'}">${t.handover.prep?.length ? 'Prep list' : 'Sheet ready'}</span>` : '<span class="subtle">—</span>' },
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
  root.innerHTML = pagehead({ title: `Test drive ${t.id}`, crumbs: [['Test drives', '#/test-drives'], [t.id]], tags: statusChip(t.status), sub: `${esc(modelName(t.modelId))} · ${dateTime(t.when)} · ${esc(siteName(t.siteId))}`,
    actions: t.status === 'booked' && (state.user?.caps || []).includes('leads.write') ? `<button class="btn ghost" data-a="licence">Check licence</button><button class="btn accent" data-a="complete">Complete</button><button class="btn secondary" data-a="no_show">No show</button><button class="btn ghost" data-a="reschedule">Reschedule</button><button class="btn ghost" data-a="cancel">Cancel</button>` : '' }) +
    `<div class="split wide-r"><div class="stack">
      <section class="card"><div class="chead"><h3>Booking</h3><div class="r">${ann('GET /dms/api/test-drives/' + t.id)}</div></div><div class="cbody"><dl class="kv">
        <dt>Customer</dt><dd>${cust ? `<a href="#/customers/${encodeURIComponent(cust.id)}">${esc(custName(cust))}</a>` : '<span class="muted">Anonymous configurator session</span>'}</dd>
        <dt>Lead</dt><dd>${t.leadId ? `<a class="mono" href="#/leads/${encodeURIComponent(t.leadId)}">${esc(t.leadId)}</a>` : '—'}</dd>
        <dt>Car</dt><dd>${esc(modelName(t.modelId))} ${t.gradeId ? esc(gradeName(t.gradeId)) : ''} ${t.stockNo ? `<span class="mono">${esc(t.stockNo)}</span>` : ''}</dd>
        <dt>Salesperson</dt><dd>${esc(staff[t.staffId]?.name || t.staffId || '—')}</dd>
        <dt>When</dt><dd>${dateTime(t.when)} <span class="subtle">(${ago(t.when)})</span></dd>
        ${t.incentive ? `<dt>Incentive</dt><dd>${esc(t.incentive.title || JSON.stringify(t.incentive))}</dd>` : ''}
        ${t.outcome ? `<dt>Outcome</dt><dd>${esc(typeof t.outcome === 'string' ? t.outcome : JSON.stringify(t.outcome))}</dd>` : ''}
      </dl></div></section>
      ${(t.questions || []).length ? `<section class="card"><div class="chead"><h3>Questions</h3><span class="sub">asked in the configurator, with the answers given</span></div><div class="cbody">${qaList(t.questions)}</div></section>` : ''}
    </div><div class="stack">${t.handover ? `<section class="card"><div class="chead"><h3>Handover sheet</h3></div><div class="cbody">${handoverSheet(t.handover, { title: 'Pre-visit sheet' })}</div></section>` : `<section class="card"><div class="cbody muted">No handover sheet: this drive was booked in the showroom or by phone.</div></section>`}</div></div>`;
}

document.addEventListener('click', async e => {
  const b = e.target.closest('.page-test-drives [data-a]'); if (!b) return;
  const id = decodeURIComponent(location.hash.split('/')[2] || '').split('?')[0];
  const a = b.dataset.a;
  let body = null;
  if (a === 'complete') { const f = await drawerForm('Complete', `<div class="field"><label>Outcome</label><select class="select" name="outcome">${['Wants a quote', 'Thinking about it', 'Not suitable', 'Wants a different model'].map(x => `<option>${x}</option>`).join('')}</select></div><div class="field"><label>Notes</label><textarea class="textarea" name="notes" style="min-height:90px" placeholder="Trade-in, finance, timing…"></textarea></div>`, { submit: 'Save', sub: id }); if (!f) return; f.close(); body = { status: 'completed', outcome: f.values }; }
  else if (a === 'reschedule') { const f = await drawerForm('Reschedule', `<div class="field"><label>Date and time</label><input class="input" type="datetime-local" name="when" required></div>`, { submit: 'Save', sub: id }); if (!f) return; f.close(); body = { when: new Date(f.values.when).toISOString() }; }
  else if (a === 'cancel') { const f = await drawerForm('Cancel', `<div class="field"><label>Reason</label><input class="input" name="reason" required></div>`, { submit: 'Confirm', sub: id }); if (!f) return; f.close(); body = { status: 'cancelled', outcome: { reason: f.values.reason } }; }
  else if (a === 'licence') { const f = await drawerForm('Check licence', `<div class="grid g2" style="gap:10px"><div class="field"><label>Licence number · last four digits</label><input class="input mono" name="last4" maxlength="4" pattern="[0-9A-Za-z]{4}" required></div><div class="field"><label>Expiry</label><input class="input" type="date" name="expiry" required></div></div>`, { submit: 'Save', sub: id, note: 'Sight the licence. Don’t photograph or upload it unless this is an extended drive.' }); if (!f) return; f.close(); body = { licenceCheck: { ...f.values, at: new Date().toISOString() } }; }
  else body = { status: 'no_show' };
  const y = await api('/test-drives/' + encodeURIComponent(id), { method: 'PATCH', body });
  if (y.status === 404 || y.status === 405) return notInBuild(b.textContent, 'PATCH /dms/api/test-drives/:id');
  if (!y.ok) return toast(`Couldn’t save (${y.status}): ${y.error}`);
  toast('Saved'); window.dispatchEvent(new HashChangeEvent('hashchange'));
});
