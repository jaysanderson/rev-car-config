import { api, esc, items, num, money, kmoney, pct, date, pagehead, loading, failState, empty, ann, statusChip, cap, bindRetry, tagDomo, table } from '../core.js';
import { hbars, legend } from '../charts.js';

export default async function campaigns(root, ctx) {
  root.innerHTML = pagehead({ title: 'Campaigns', sub: 'Email, SMS, web and social campaigns with the promotions they carry, and what they produced. Rates are against messages sent.' }) + `<div id="body">${loading(8)}</div>`;
  const [r, pr] = await Promise.all([api('/campaigns', { query: { pageSize: 100 } }), api('/promotions', { query: { pageSize: 200 } })]);
  const body = root.querySelector('#body');
  if (!r.ok) { body.innerHTML = failState(r, { what: 'campaigns', endpoint: 'GET /dms/api/campaigns' }); bindRetry(root, ctx.rerender); return; }
  const rows = items(r.data);
  if (!rows.length) { body.innerHTML = empty({ title: 'No campaigns yet', body: 'Campaigns appear here once marketing schedules one.' }); return; }
  const promos = Object.fromEntries(items(pr.data).map(p => [p.id, p]));
  const now = new Date().toISOString();
  const s = k => rows.reduce((n, c) => n + (c[k] || 0), 0);
  const live = rows.filter(c => c.startsAt <= now && (!c.endsAt || c.endsAt >= now));
  body.innerHTML = `<div class="statstrip">
    <div><div class="label">Campaigns</div><div class="value">${num(rows.length)}</div><div class="sub">${live.length} running now</div></div>
    <div><div class="label">Sent</div><div class="value">${num(s('sent'))}</div></div>
    <div><div class="label">Open rate</div><div class="value">${pct(s('opened') / (s('sent') || 1), 1)}</div></div>
    <div><div class="label">Click rate</div><div class="value">${pct(s('clicked') / (s('sent') || 1), 1)}</div></div>
    <div><div class="label">Leads</div><div class="value">${num(s('leads'))}</div></div>
    <div><div class="label">Cost per lead</div><div class="value">${money(s('budget') / (s('leads') || 1))}</div><div class="sub">${kmoney(s('budget'))} spend</div></div>
  </div>
  <div class="split"><div>${table([
    { label: 'Campaign', sort: 'startsAt', render: c => `<span class="cell-title">${esc(c.name)}</span><span class="cell-sub">${esc(c.audience || '')}</span>` },
    { label: 'Channel', render: c => `<span class="chip out">${esc(cap(c.channel))}</span>` },
    { label: 'Dates', render: c => `${date(c.startsAt, { day: 'numeric', month: 'short' })} – ${date(c.endsAt)}${c.startsAt <= now && (!c.endsAt || c.endsAt >= now) ? ' <span class="chip good">Live</span>' : ''}` },
    { label: 'Promotions', render: c => (c.promotionIds || []).map(id => `<span class="chip ${promos[id] ? '' : 'neutral'}" title="${esc(promos[id]?.title || id)}">${esc((promos[id]?.title || id).slice(0, 26))}</span>`).join(' ') || '<span class="subtle">—</span>' },
    { label: 'Sent', num: true, render: c => num(c.sent) },
    { label: 'Open', num: true, render: c => pct((c.opened || 0) / (c.sent || 1), 1) },
    { label: 'Click', num: true, render: c => pct((c.clicked || 0) / (c.sent || 1), 1) },
    { label: 'Leads', num: true, render: c => num(c.leads) },
    { label: 'CPL', num: true, render: c => c.leads ? money(c.budget / c.leads) : '—' },
  ], rows)}<p style="margin-top:6px">${ann('GET /dms/api/campaigns · GET /dms/api/promotions')}</p></div>
  <section class="card domocard"><div class="chead"><div><h3>Leads by campaign</h3><div class="dsrc">Domo card · campaigns</div></div><div class="r">${tagDomo()}</div></div><div class="cbody">${hbars([...rows].sort((a, b) => (b.leads || 0) - (a.leads || 0)).slice(0, 10).map(c => ({ label: c.name.length > 22 ? c.name.slice(0, 21) + '…' : c.name, value: c.leads || 0, sub: `${cap(c.channel)} · ${c.leads ? money(c.budget / c.leads) + ' per lead' : 'no leads'}` })), { labelW: 170, rowH: 26 })}</div></section></div>`;
}
