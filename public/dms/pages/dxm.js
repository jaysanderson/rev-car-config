import { api, esc, pick, items, num, money, pct, date, dateTime, ago, pagehead, loading, failState, empty, ann, statusChip, siteName, modelName, cap, bindRetry, tagDomo, tagArag, table, bindRows, staffMap, openDrawer } from '../core.js';
import { hbars, funnel } from '../charts.js';
import { handoverSheet } from '../parts.js';

const top = (o, n = 8) => Object.entries(o || {}).sort((a, b) => b[1] - a[1]).slice(0, n);
export default async function dxm(root, ctx) {
  root.innerHTML = pagehead({ title: 'Digital experience', tags: tagDomo(), sub: 'What customers do in the configurator, the test drives they book, the handover sheets salespeople get, and the offers published to the site. The configurator writes first-party events; Domo reads them as <span class="mono">configurator_events</span>.', actions: '<a class="btn secondary" href="/" target="_blank" rel="noopener">Open the configurator</a>' }) + `<div id="body">${loading(10)}</div>`;
  const [r, hv, staff] = await Promise.all([api('/dxm/overview'), api('/dxm/handovers', { query: { pageSize: 50 } }), staffMap()]);
  const body = root.querySelector('#body');
  if (!r.ok) { body.innerHTML = failState(r, { what: 'the digital-experience overview', endpoint: 'GET /dms/api/dxm/overview' }); bindRetry(root, ctx.rerender); return; }
  const o = r.data || {};
  const c = o.configurator || {};
  const b = o.bookings || {};
  const cl = o.configuratorLeads || {};
  const handovers = hv.ok ? items(hv.data) : [];
  const exposure = o.promotionExposure || [];
  const tile = (label, v, d) => `<div class="tile"><span class="label">${esc(label)}</span><span class="v">${v}</span>${d ? `<span class="d">${d}</span>` : ''}</div>`;
  const offersClicked = Object.values(c.offersClicked || {}).reduce((a, x) => a + x, 0), offersShown = Object.values(c.offersShown || {}).reduce((a, x) => a + x, 0);
  body.innerHTML = `
  <section class="card" style="margin-bottom:16px" data-src="GET /dxm/overview → configurator"><div class="chead"><div><h3>Configurator report</h3><div class="sub">last ${num(c.days || 30)} days · ${num(c.events)} events</div></div><div class="r">${tagDomo('Domo · configurator_events')}${ann('server/events.mjs configuratorReport()', 'domo')}</div></div><div class="cbody">
    ${c.sessions != null ? `<div class="tiles">
      ${tile('Sessions', num(c.sessions))}
      ${tile('Finder started', num(c.finderStarts), `${num(c.finderCompletions)} completed`)}
      ${tile('Offers clicked', num(offersClicked), `of ${num(offersShown)} shown`)}
      ${tile('Questions to the assistant', num(c.questionsAsked))}
      ${tile('Test drives booked', num(c.bookings?.count ?? b.total))}
      ${tile('Finder → booking', pct(c.conversion?.finderToBooking, 1), `offer click → booking ${pct(c.conversion?.offerClickToBooking, 1)}`)}
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div><div class="label" style="margin-bottom:6px">Models configured</div>${hbars(top(c.modelsConfigured).map(([k, v]) => ({ label: modelName(k), value: v })), { labelW: 140, rowH: 24 }) || '<span class="muted">No builds yet</span>'}</div>
      <div><div class="label" style="margin-bottom:6px">Configurator funnel</div>${funnel([{ label: 'Sessions', value: c.sessions || 0 }, { label: 'Finder started', value: c.finderStarts || 0 }, { label: 'Finder done', value: c.finderCompletions || 0 }, { label: 'Booked', value: c.bookings?.count || 0 }].filter(x => x.value))}</div>
    </div>` : empty({ inline: true, title: 'No configurator events yet', body: 'Events appear as customers use the configurator.' })}
  </div></section>
  <div class="grid g2" style="margin-bottom:16px">
    <section class="card"><div class="chead"><h3>Bookings</h3><span class="sub">${num(b.total)} total · ${num(b.answered)} answered the pre-drive questions</span><div class="r">${ann('dxm.overview.bookings')}</div></div><div class="cbody">
      ${(b.recent || []).length ? table([
        { label: 'Booking', render: x => `<span class="cell-title mono">${esc(x.bookingId)}</span><span class="cell-sub">${esc(x.whenLabel || dateTime(x.when))}</span>` },
        { label: 'Car', render: x => `${esc(modelName(x.modelId))}${x.unitId ? `<span class="cell-sub mono">${esc(x.unitId)}</span>` : ''}` },
        { label: 'Site', render: x => esc(siteName(x.siteId)) },
        { label: 'Lead', render: x => x.leadId ? `<a class="mono" href="#/leads/${encodeURIComponent(x.leadId)}">${esc(x.leadId)}</a>` : '—' },
        { label: '', render: x => x.answered ? '<span class="chip good">Answered</span>' : '<span class="chip neutral">Awaiting</span>' },
      ], b.recent, { compact: true, href: x => x.leadId ? '#/leads/' + x.leadId : '#/test-drives/' + x.bookingId }) : empty({ inline: true, title: 'No configurator bookings yet', body: 'Book a test drive in the configurator and it lands here as a lead.' })}
    </div></section>
    <section class="card"><div class="chead"><h3>Configurator leads</h3><div class="r">${ann('dxm.overview.configuratorLeads')}</div></div><div class="cbody"><div class="tiles">${tile('Leads', num(cl.total))}${tile('Open', num(cl.open))}${tile('Won', num(cl.won), `${pct(cl.conversion, 1)} conversion`)}</div>
      <div class="pills" style="margin-top:12px">${top(cl.byStatus, 10).map(([k, v]) => `${statusChip(k)}<span class="subtle" style="font-size:.76rem;margin-right:8px">${num(v)}</span>`).join('')}</div></div></section>
  </div>
  <section class="card" style="margin-bottom:16px"><div class="chead"><h3>Handover sheets</h3><span class="sub">what the salesperson sees before the drive</span><div class="r">${tagArag('Talking points · ARAG')}${ann('GET /dms/api/dxm/handovers')}</div></div><div class="cbody" id="hv">
    ${!hv.ok ? failState(hv, { what: 'handovers', inline: true }) : handovers.length ? table([
      { label: 'Test drive', render: h => `<span class="cell-title mono">${esc(h.id)}</span><span class="cell-sub">${dateTime(h.when)}</span>` },
      { label: 'Car', render: h => esc(modelName(h.modelId)) + (h.stockNo ? `<span class="cell-sub mono">${esc(h.stockNo)}</span>` : '') },
      { label: 'Salesperson', render: h => esc(staff[h.staffId]?.name || h.staffId || '—') + `<span class="cell-sub">${esc(siteName(h.siteId))}</span>` },
      { label: 'Channel', render: h => h.channel === 'configurator' ? '<span class="chip info">Configurator</span>' : esc(cap(h.channel || '—')) },
      { label: 'Status', render: h => statusChip(h.status) },
      { label: '', render: h => `<button class="btn ghost sm" data-hv="${esc(h.id)}">View sheet</button>` },
    ], handovers.slice(0, 15), { compact: true }) : empty({ inline: true, title: 'No handover sheets yet' })}
  </div></section>
  <section class="card"><div class="chead"><h3>Offers published to the configurator</h3><span class="sub">and how often they’re used in deals</span><div class="r"><a class="btn ghost sm" href="#/promotions">Manage promotions</a>${ann('dxm.overview.promotionExposure')}</div></div><div class="cbody">
    ${exposure.length ? table([
      { label: 'Promotion', render: p => `<span class="cell-title">${esc(p.title)}</span><span class="cell-sub mono">${esc(p.id)} · ${esc(cap(p.kind || ''))}</span>` },
      { label: 'Status', render: p => statusChip(p.status) },
      { label: 'Campaigns', num: true, render: p => num((p.campaigns || []).length) },
      { label: 'Deals using', num: true, render: p => num(p.dealsUsing) },
      { label: 'Delivered', num: true, render: p => num(p.delivered) },
      { label: 'Value given', num: true, render: p => money(p.valueGiven) },
    ], exposure.slice(0, 20), { compact: true }) : empty({ inline: true, title: 'No promotions yet' })}
  </div></section>`;
  bindRows(body);
  body.querySelectorAll('[data-hv]').forEach(btn => btn.onclick = () => { const h = handovers.find(x => x.id === btn.dataset.hv); openDrawer(`Handover · ${h.id}`, handoverSheet(h.handover, { title: modelName(h.modelId) }) + `<p style="margin-top:12px"><a href="#/test-drives/${encodeURIComponent(h.id)}">Open test drive</a>${h.leadId ? ` · <a href="#/leads/${encodeURIComponent(h.leadId)}">Open lead</a>` : ''}</p>`, dateTime(h.when)); });
}
