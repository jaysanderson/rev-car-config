import { api, state, items, fetchCsv, esc, num, money, kmoney, pct, pagehead, loading, failState, empty, tagDomo, ann, siteName, modelName, bindRetry, initials, SITES } from '../core.js';
import { unitsVsTarget, hbars, funnel, histogram, AGE_BUCKETS, legend } from '../charts.js';

const monthLabel = (m, short) => { const [y, mm] = m.split('-').map(Number); return new Date(Date.UTC(y, mm - 1, 1)).toLocaleDateString('en-AU', short ? { month: 'short' } : { month: 'long', year: 'numeric', timeZone: 'UTC' }); };
const addMonths = (m, n) => { const [y, mm] = m.split('-').map(Number); return new Date(Date.UTC(y, mm - 1 + n, 1)).toISOString().slice(0, 7); };
const isoWeek = d => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const y = t.getUTCFullYear(); const w1 = new Date(Date.UTC(y, 0, 4)); const wk = 1 + Math.round(((t - w1) / 864e5 - 3 + ((w1.getUTCDay() + 6) % 7)) / 7); return `${y}-W${String(wk).padStart(2, '0')}`; };
const ratio = v => v == null ? null : v > 1.5 ? v / 100 : v;

function domoCard({ id, title, dataset, insight, endpoint, body, foot = '', ask = '' }) {
  return `<section class="card domocard" id="${id}" data-src="${esc(endpoint)}">
    <div class="chead"><div><h3>${esc(title)}</h3></div><div class="r">${tagDomo()}${ann(endpoint, 'domo')}</div></div>
    <div class="cbody">${body}</div>
    ${foot ? `<div class="cfoot" style="border-top:0;padding-top:0">${foot}</div>` : ''}
    <div class="cfoot"><span class="dsrc">Domo card · dataset <span class="mono">${esc(dataset)}</span></span><span style="margin-left:auto"></span>${ask ? `<a class="btn ghost sm" href="#/assistant?mode=erp&q=${encodeURIComponent(ask)}">Ask about this</a>` : ''}<a class="btn ghost sm" href="#/insights?dataset=${encodeURIComponent(insight || dataset)}">Open in Insights</a></div></section>`;
}

export default async function dashboard(root, ctx) {
  const site = state.site;
  const now = new Date().toISOString().slice(0, 7);
  const month = ctx.query.month || now;
  const months = Array.from({ length: 12 }, (_, i) => addMonths(now, -i));
  root.innerHTML = pagehead({
    title: 'Sales dashboard', tags: tagDomo(),
    sub: `${site ? siteName(site) : 'All four Harbourline sites'} · ${monthLabel(month)}${month === now ? ' month to date' : ''}. KPIs come from the DMS; the cards are the same datasets Domo reads.`,
    actions: `<select class="select" id="mon" style="width:auto">${months.map(m => `<option value="${m}" ${m === month ? 'selected' : ''}>${monthLabel(m)}</option>`).join('')}</select>`,
  }) + `<div id="kpis">${loading(3)}</div><div class="domocards" id="cards">${['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map(i => `<section class="card" id="${i}"><div class="cbody">${loading(5)}</div></section>`).join('')}</div>`;
  root.querySelector('#mon').onchange = e => { location.hash = '#/dashboard?month=' + e.target.value; };

  const q = { siteId: site, month };
  const ov = await api('/kpi/overview', { query: q });
  const kp = root.querySelector('#kpis');
  if (!ov.ok) { kp.innerHTML = failState(ov, { what: 'the KPI overview', endpoint: 'GET /dms/api/kpi/overview' }); root.querySelector('#cards').innerHTML = ''; bindRetry(root, ctx.rerender); return; }
  const o = ov.data || {};
  const t = o.target || {};
  const att = ratio(t.unitsAttainment);
  const prev = o.previous || {};
  const delta = (a, b) => b ? Math.round(((a - b) / b) * 100) : null;
  const d1 = delta(o.monthToDate ? (t.projectedUnits ?? o.unitsDelivered) : o.unitsDelivered, prev.unitsDelivered);
  const aged = o.agedStockCount ?? 0;
  kp.innerHTML = `<div class="statstrip" data-src="GET /kpi/overview">
    <a href="#/deals?stage=delivered"><div class="label">Units delivered</div><div class="value">${num(o.unitsDelivered)}<small>/ ${num(t.units)}</small></div><div class="meter ${att >= 1 ? 'good' : att >= .7 ? '' : 'warn'}"><i style="width:${Math.min(100, (att || 0) * 100)}%"></i></div><div class="sub">${att != null ? Math.round(att * 100) + '% target attainment' : 'no target set'}${t.projectedUnits && o.monthToDate ? ` · pace ${num(t.projectedUnits)}` : ''}</div></a>
    <div><div class="label">Gross</div><div class="value">${kmoney(o.gross)}</div><div class="sub">front ${kmoney(o.frontGross)} · back ${kmoney(o.backGross)}</div></div>
    <div><div class="label">Avg gross / unit</div><div class="value">${o.unitsDelivered ? money(o.avgGrossPerUnit) : '—'}</div><div class="sub">${d1 != null ? `<span class="delta ${d1 >= 0 ? 'up' : 'down'}">${d1 >= 0 ? '▲' : '▼'} ${Math.abs(d1)}%</span> ${o.monthToDate ? 'pace' : 'units'} vs ${esc(monthLabel(prev.month || addMonths(month, -1), true))}` : ''}</div></div>
    <a href="#/leads"><div class="label">Leads</div><div class="value">${num(o.leads)}</div><div class="sub">all channels</div></a>
    <div><div class="label">Conversion</div><div class="value">${pct(ratio(o.conversion), 1)}</div><div class="sub">units ÷ leads</div></div>
    <a href="#/test-drives"><div class="label">Test-drive rate</div><div class="value">${pct(ratio(o.testDriveRate))}</div><div class="sub">${num(o.testDrives)} drives</div></a>
    <div><div class="label">Days to close</div><div class="value">${o.unitsDelivered ? num(o.daysToClose, 1) : '—'}</div><div class="sub">lead → delivery</div></div>
    <a href="#/deals"><div class="label">Open pipeline</div><div class="value">${num(o.openDeals)}</div><div class="sub">${kmoney(o.pipelineValue)} drive-away</div></a>
    <a href="#/stock?aged=1"><div class="label">Aged stock</div><div class="value" style="${aged ? 'color:var(--danger-fg)' : ''}">${num(aged)}</div><div class="sub">of ${num(o.onLotCount)} on lot ${tagDomo()}</div></a>
  </div>`;

  // ---------- cards ----------
  const from12 = addMonths(month, -11);
  const end = `${month}-31`;
  const [ser, sites, lb, veh, leadsS, drivesS, dealsN, ...siteOv] = await Promise.all([
    api('/kpi/series', { query: { metric: 'units', by: 'month', siteId: site, from: from12 + '-01', to: end } }),
    api('/sites'),
    api('/kpi/leaderboard', { query: { siteId: site, month } }),
    api('/vehicles', { query: { siteId: site, status: 'on_lot,demo', pageSize: 500 } }),
    api('/kpi/series', { query: { metric: 'leads', by: 'month', siteId: site, from: addMonths(month, -2) + '-01', to: end } }),
    api('/kpi/series', { query: { metric: 'test_drives', by: 'month', siteId: site, from: addMonths(month, -2) + '-01', to: end } }),
    api('/deals', { query: { siteId: site, from: addMonths(month, -2) + '-01', to: end, pageSize: 1 } }),
    ...Object.keys(SITES).map(s => api('/kpi/overview', { query: { siteId: s, month } })),
  ]);

  // 1 units vs target
  const c1 = root.querySelector('#c1');
  if (ser.ok) {
    const siteRows = items(sites.data);
    const tgtFor = m => siteRows.filter(s => !site || s.id === site).reduce((n, s) => n + (Number(s.salesTarget?.[m]) || 0), 0);
    const own = state.user?.role === 'salesperson';
    const byP = Object.fromEntries((ser.data?.points || items(ser.data)).map(p => [p.period, p.value]));
    const pts = Array.from({ length: 12 }, (_, i) => addMonths(month, i - 11)).map(m => ({ label: monthLabel(m), short: monthLabel(m, true), value: byP[m] || 0, target: own ? 0 : (tgtFor(m) || (m === month ? t.units : 0)) }));
    const hit = pts.filter(p => p.target && p.value >= p.target).length;
    c1.outerHTML = domoCard({ id: 'c1', title: 'Units delivered vs target', dataset: 'sales_daily', ask: `Why is ${site ? siteName(site) : 'the group'} ${att != null && att < 1 ? 'below' : 'tracking against'} target in ${monthLabel(month)}?`, endpoint: 'GET /kpi/series?metric=units', body: pts.some(p => p.value) ? (own ? '' : legend([['var(--c-series)', 'Units delivered'], ['var(--c-target)', 'Target', true]])) + unitsVsTarget(pts) : empty({ inline: true, title: 'No deliveries in range' }), foot: own ? 'Your delivered units by month. Targets are set per site, so they are not drawn here.' : `Target met in ${hit} of ${pts.filter(p => p.target).length} months. Faded bars missed target. June (EOFY) and December peak.` });
  } else c1.outerHTML = `<section class="card" id="c1">${failState(ser, { what: 'the units series', inline: true })}</section>`;

  // 2 gross by site
  const c2 = root.querySelector('#c2');
  const scoped = ['salesperson', 'sales_manager'].includes(state.user?.role) && state.user?.siteId;
  const gs = Object.keys(SITES).map((s, i) => ({ s, r: siteOv[i] })).filter(x => x.r.ok && (!scoped || x.s === state.user.siteId));
  if (gs.length) {
    const rows = gs.map(({ s, r }) => ({ label: SITES[s], value: r.data.gross || 0, units: r.data.unitsDelivered, avg: r.data.avgGrossPerUnit, target: r.data.target?.gross || 0, sel: s === site }));
    c2.outerHTML = domoCard({ id: 'c2', title: 'Gross profit by site', dataset: 'deals', ask: `Which site has the lowest average gross per unit in ${monthLabel(month)} and why?`, endpoint: 'GET /kpi/overview?siteId=…', body: (rows.some(r => r.target) ? legend([['var(--c-series)', 'Gross'], ['var(--c-target)', 'Gross target', true]]) : '') + hbars(rows, { fmt: kmoney, labelW: 96, color: d => site && !d.sel ? 'var(--c-series-2)' : 'var(--c-series)', tipFn: d => `<b>${esc(d.label)}</b><br>${money(d.value)} gross<br><span class="k">units</span> ${num(d.units)} · <span class="k">avg</span> ${money(d.avg)}${d.target ? `<br><span class="k">target</span> ${money(d.target)}` : ''}` }) + `<div class="datatable compact" style="margin-top:12px;box-shadow:none"><div class="scroll"><table><thead><tr><th>Site</th><th class="num">Units</th><th class="num">Avg gross</th><th class="num">Front</th><th class="num">Back</th></tr></thead><tbody>${gs.map(({ s: sid, r }) => `<tr><td>${esc(SITES[sid])}</td><td class="num">${num(r.data.unitsDelivered)}</td><td class="num">${money(r.data.avgGrossPerUnit)}</td><td class="num">${kmoney(r.data.frontGross)}</td><td class="num">${kmoney(r.data.backGross)}</td></tr>`).join('')}</tbody></table></div></div>`, foot: `${monthLabel(month)}${month === now ? ' to date' : ''}. Front + back gross on delivered deals; ticks are the month’s gross target.` });
  } else c2.outerHTML = `<section class="card" id="c2">${failState(siteOv[0] || { status: 503 }, { what: 'gross by site', inline: true })}</section>`;

  const sumPts = r => (r.data?.points || []).reduce((n, p) => n + (p.value || 0), 0);
  // 3 funnel: funnel_weekly, last 12 weeks
  const c3 = root.querySelector('#c3');
  const fw = await fetchCsv('funnel_weekly');
  if (fw.ok && fw.rows.length) {
    const weeks = [...new Set(fw.rows.map(r => r.week))].sort().filter(w => w <= isoWeek(month === now ? new Date() : new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)))).slice(-12);
    const rs = fw.rows.filter(r => weeks.includes(r.week) && (!site || r.siteId === site));
    const sum = k => rs.reduce((n, r) => n + (Number(r[k]) || 0), 0);
    const st = [{ label: 'Leads', value: sum('leads') }, { label: 'Contacted', value: sum('contacted') }, { label: 'Test drive', value: sum('testDrives') }, { label: 'Quoted', value: sum('deals') }, { label: 'Won', value: sum('delivered') }];
    c3.outerHTML = domoCard({ id: 'c3', title: 'Funnel', dataset: 'funnel_weekly', endpoint: 'GET /domo/export/funnel_weekly.csv', ask: `Why did leads not convert to test drives over the last 12 weeks${site ? ' at ' + siteName(site) : ''}?`, body: funnel(st), foot: `Leads → contacted → test drive → quoted → won, ${weeks[0] || ''} to ${weeks[weeks.length - 1] || ''} (12 weeks).` });
  } else if (leadsS.ok) {
    const units3 = (ser.data?.points || []).filter(p => p.period >= addMonths(month, -2)).reduce((n, p) => n + p.value, 0);
    const st = [{ label: 'Leads', value: sumPts(leadsS) }, { label: 'Test drive', value: sumPts(drivesS) }, { label: 'Quoted', value: dealsN.ok ? (dealsN.data?.total ?? 0) : 0 }, { label: 'Won', value: units3 }];
    c3.outerHTML = domoCard({ id: 'c3', title: 'Funnel', dataset: 'funnel_weekly', endpoint: 'GET /kpi/series', body: funnel(st), foot: fw.status === 403 ? 'Your role can’t read the funnel_weekly export; showing the KPI series for the last three months.' : 'Last three months from the KPI series.' });
  } else c3.outerHTML = `<section class="card" id="c3">${failState(leadsS, { what: 'the funnel', inline: true })}</section>`;

  // 4 ageing histogram
  const c4 = root.querySelector('#c4');
  if (veh.ok) {
    const vs = items(veh.data);
    const b = AGE_BUCKETS.map(x => ({ ...x, value: 0 }));
    vs.forEach(v => { const d = v.daysInStock || 0; (b.find(x => d <= x.max) || b[4]).value++; });
    c4.outerHTML = domoCard({ id: 'c4', title: 'Stock ageing', dataset: 'stock_ageing_daily', ask: `How many on-lot units are over 60 days old${site ? ' at ' + siteName(site) : ''}, and which models are they?`, endpoint: 'GET /vehicles?status=on_lot,demo', body: vs.length ? histogram(b) : empty({ inline: true, title: 'No units on the lot' }), foot: `${num(vs.length)} units on the lot (incl. demonstrators). 60–89 days: eligible for a ready-now bonus. 90+: move priority. <a href="#/stock?aged=1">Open aged stock</a>` });
  } else c4.outerHTML = `<section class="card" id="c4">${failState(veh, { what: 'stock', inline: true })}</section>`;

  // 5 days of supply
  const c5 = root.querySelector('#c5');
  const dos = (o.daysOfSupply || []).filter(d => d.onLot || d.sold90d);
  const dsColor = d => d.value > 60 ? 'var(--c-age-4)' : d.value < 30 ? 'var(--c-age-2)' : 'var(--c-series)';
  c5.outerHTML = domoCard({ id: 'c5', title: 'Days of supply by model', dataset: 'dealer_signals', ask: 'Which models have more than 60 days of supply and how many units are on the lot?', endpoint: 'GET /kpi/overview → daysOfSupply', body: dos.length ? legend([['var(--c-age-2)', 'Under 30 days · tight'], ['var(--c-series)', '30–60'], ['var(--c-age-4)', 'Over 60 · long']]) + hbars(dos.slice(0, 12).map(d => ({ label: modelName(d.modelId), value: Math.min(d.daysOfSupply, 365), raw: d })), { labelW: 130, rowH: 26, ref: 60, refLabel: '60 days', color: dsColor, fmt: v => v >= 365 ? '365+' : num(v), tipFn: d => `<b>${esc(d.label)}</b><br>${d.raw.daysOfSupply >= 999 ? 'no sales in 90 days' : num(d.raw.daysOfSupply) + ' days of supply'}<br><span class="k">on lot</span> ${d.raw.onLot} · <span class="k">sold 90d</span> ${d.raw.sold90d}<br><span class="k">avg age</span> ${d.raw.avgDaysInStock} days` }) : empty({ inline: true, title: 'No stock to measure' }), foot: 'Units in stock ÷ average daily sales over 90 days. Under 30: protect gross, no ready-now bonuses. Over 60: Domo flags the model (days_of_supply).' });

  // 6 leaderboard
  const c6 = root.querySelector('#c6');
  if (lb.ok) {
    const rows = (lb.data?.rows || items(lb.data)).slice(0, 8);
    const max = Math.max(1, ...rows.map(r => r.units || 0));
    c6.outerHTML = domoCard({ id: 'c6', title: 'Salesperson leaderboard', dataset: 'deals', ask: `Who has the highest average gross per unit in ${monthLabel(month)}?`, endpoint: 'GET /kpi/leaderboard', body: rows.length ? `<div class="lb">${rows.map(r => `<div class="r" data-tip="${esc(`<b>${esc(r.name)}</b><br>${num(r.units)} units · ${money(r.gross)} gross<br><span class="k">leads</span> ${num(r.leads)} · <span class="k">close</span> ${pct(ratio(r.conversion), 1)}<br><span class="k">open deals</span> ${num(r.openDeals)}`)}"><span class="rk">${r.rank}</span><span class="av">${esc(r.avatarInitials || initials(r.name))}</span><div style="min-width:0"><div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.name)} <span class="subtle" style="font-weight:400;font-size:.74rem">${esc(siteName(r.siteId))}</span></div><div class="bar"><i style="width:${(r.units / max) * 100}%"></i></div></div><div class="v">${num(r.units)} <small>${kmoney(r.gross)} · ${pct(ratio(r.conversion))}</small></div></div>`).join('')}</div>` : empty({ inline: true, title: 'No salespeople in scope' }), foot: `${monthLabel(month)}. Units, gross and close rate.` });
  } else c6.outerHTML = `<section class="card" id="c6">${failState(lb, { what: 'the leaderboard', inline: true })}</section>`;
  bindRetry(root, ctx.rerender);
}
