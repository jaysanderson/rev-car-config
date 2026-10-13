import { drawerForm, notInBuild, downloadCsv, openDrawer, closeDrawer } from '../core.js';
import { api, state, esc, pick, items, num, money, date, dateTime, pagehead, loading, failState, empty, tagDomo, ann, statusChip, siteName, modelName, cap, bindRetry, spinBtn, toast, SITES, icon } from '../core.js';
import { listView } from '../parts.js';
import { ageColor, AGE_BUCKETS } from '../charts.js';

const REASON = { aged_90d: '90+ days in stock', aged_60d: '60–89 days in stock', days_of_supply: 'Too many days of supply for the model', model_year_change: 'New model year arriving soon', high_dos: 'Too many days of supply for the model', target_gap: 'Model behind monthly target' };
const reasonText = c => REASON[c] || (c ? cap(String(c).replace(/_/g, ' ')) : '');
const age = d => `<span class="agebar"><i style="background:${ageColor(d || 0)}"></i>${num(d)}d</span>`;
const prio = p => p ? `<span class="prio ${p <= 2 ? 'p1' : p <= 5 ? 'p2' : 'p3'}" title="Move priority ${p}">P${p}</span>` : '<span class="subtle">—</span>';

export default async function stock(root, ctx) {
  const caps = state.user?.caps || [];
  const canRecompute = state.user?.role === 'gm' || caps.includes('domo.recompute');
  root.innerHTML = pagehead({
    title: 'Stock', tags: tagDomo(),
    sub: `Units on the lot, in transit and demonstrators across ${state.site ? siteName(state.site) : 'all four sites'}. Ageing is coloured by policy band; move priorities and push reasons come from Domo’s dealer_signals.${state.user?.role === 'salesperson' ? ' Read-only for your role.' : ''}`,
    actions: `<div class="segmented" role="group" aria-label="View"><button aria-pressed="${ctx.query.view !== 'heat'}" data-view="">List</button><button aria-pressed="${ctx.query.view === 'heat'}" data-view="heat">Heat map</button></div><button class="btn ghost" id="csv">Export CSV</button>${canRecompute ? `<button class="btn secondary" id="recomp">${icon('refresh')}Recompute Domo signals</button>${ann('POST /dms/api/domo/recompute-signals', 'domo')}` : ''}`,
  }) + `<div class="split"><div id="tbl"></div><aside class="stack"><section class="card" id="sig" data-src="GET /domo/signals"><div class="cbody">${loading(8)}</div></section></aside></div>`;

  const tabs = `<div class="tabs" role="tablist">${['', ...Object.keys(SITES)].map(s => `<button role="tab" aria-selected="${(ctx.query.site ?? state.site) === s}" data-site="${s}">${s ? esc(SITES[s]) : 'All sites'}</button>`).join('')}</div>`;
  const tbl = root.querySelector('#tbl');
  const siteNow = ctx.query.site ?? state.site;
  tbl.innerHTML = tabs + `<div class="legend" style="margin:-4px 0 10px">${AGE_BUCKETS.map(b => `<span><i style="background:${b.color}"></i>${b.label} days</span>`).join('')}</div><div id="lv"></div>`;
  tbl.querySelectorAll('[data-site]').forEach(b => b.onclick = () => { location.hash = '#/stock?site=' + b.dataset.site; });
  const lv = ctx.query.view === 'heat' ? Promise.resolve() : listView(tbl.querySelector('#lv'), {
    endpoint: '/vehicles', count: 'units', search: 'Search stock no, VIN, model, colour…', annText: 'GET /dms/api/vehicles', pageSize: 50, sort: '-daysInStock',
    query: { siteId: siteNow, aged: ctx.query.aged }, initial: { status: ctx.query.aged ? '' : (ctx.query.status || 'on_lot,demo,in_transit'), q: ctx.query.q || '' },
    filters: [{ key: 'status', label: 'Any status', options: [['on_lot,demo,in_transit', 'In stock (lot, demo, transit)'], ['on_lot', 'On lot'], ['demo', 'Demo'], ['in_transit', 'In transit'], ['allocated', 'Allocated'], ['ordered', 'Ordered'], ['sold', 'Sold']] }],
    href: v => '#/stock?unit=' + encodeURIComponent(v.stockNo) + (ctx.query.site ? '&site=' + ctx.query.site : ''),
    cols: [
      { label: 'Stock no', sort: 'stockNo', render: v => `<span class="cell-title mono">${esc(v.stockNo)}</span><span class="cell-sub mono">${esc(v.vin || '')}</span>` },
      { label: 'Vehicle', sort: 'model', render: v => `${esc(modelName(v.model))} <span class="subtle">${esc(cap(String(v.grade || '').replace(/-/g, ' ')))}</span><span class="cell-sub">${esc(cap(String(v.colour || '').replace(/-/g, ' ')))}${v.interior ? ' · ' + esc(cap(String(v.interior).replace(/-/g, ' '))) : ''}</span>` },
      { label: 'Site', render: v => esc(siteName(v.siteId)) },
      { label: 'Status', render: v => statusChip(v.status) + (v.hold || v.heldUntil ? ' <span class="chip warn">Held</span>' : '') },
      { label: 'Days in stock', sort: 'daysInStock', render: v => age(v.daysInStock) },
      { label: 'List', num: true, sort: 'listPrice', render: v => money(v.listPrice) },
      { label: 'Bonus headroom', num: true, sort: 'bonusHeadroom', render: v => v.bonusHeadroom ? money(v.bonusHeadroom) : '<span class="subtle">—</span>' },
      { label: 'Move priority', sort: 'movePriority', render: v => `${prio(v.movePriority)}${v.reasonCode ? `<span class="cell-sub">${esc(reasonText(v.reasonCode))}</span>` : ''}` },
    ],
  });

  root.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { location.hash = '#/stock' + (b.dataset.view ? '?view=heat' : ''); });
  root.querySelector('#csv').onclick = () => downloadCsv('vehicles', { siteId: siteNow });
  if (ctx.query.view === 'heat') { lv.then?.(() => {}); heat(tbl, siteNow); }
  if (ctx.query.unit) unitDrawer(ctx.query.unit, ctx);
  await Promise.all([lv, signals(root, ctx)]);
  const rb = root.querySelector('#recomp');
  if (rb) rb.onclick = async () => {
    spinBtn(rb, true, 'Recomputing…');
    const r = await api('/domo/recompute-signals', { method: 'POST' });
    spinBtn(rb, false);
    if (!r.ok) { toast(r.status === 403 ? 'Only the general manager can recompute Domo signals' : `Recompute failed: ${r.error}`); return; }
    toast(r.data?.written === false ? `Signals recomputed (${r.data.reason || 'not written'})` : 'Domo signals recomputed');
    await signals(root, ctx);
  };
}

async function signals(root, ctx) {
  const box = root.querySelector('#sig');
  box.innerHTML = `<div class="cbody">${loading(8)}</div>`;
  const r = await api('/domo/signals', { query: { siteId: state.site } });
  if (!r.ok) { box.innerHTML = failState(r, { what: 'Domo signals', endpoint: 'GET /dms/api/domo/signals', inline: true }); bindRetry(box, () => signals(root, ctx)); return; }
  const d = r.data || {};
  const models = d.models || d.rows || d.dealer_signals?.rows || d.signals?.rows || (Array.isArray(d) ? d : []);
  let pri = d.movePriorities || d.moves || (Array.isArray(d.priorities) ? d.priorities : []) || [];
  if (!Array.isArray(pri)) pri = items(pri);
  if (state.site) pri = pri.filter(p => !(p.siteId || p.site) || (p.siteId || p.site) === state.site);
  // push model: API value, else the model with the worst supply that is also behind target
  let push = pick(d, 'pushModel', 'priorities.weights.pushModel.modelId');
  const pushWhy = (d.priorities?.derivedFrom || []).find(x => /allocationNextMonth \+ targetGap/.test(x.signal))?.effect || pick(d, 'pushWhy');
  if (!push && models.length) push = [...models].sort((a, b) => ((b.daysOfSupply || 0) + (b.targetGap || 0) * 8) - ((a.daysOfSupply || 0) + (a.targetGap || 0) * 8))[0]?.model;
  const pm = models.find(m => (m.model || m.modelId) === (push?.modelId || push));
  const pushName = modelName(push?.modelId || push);
  const autoWhy = pm ? `${pm.unitsInStock ?? pm.onLot} in stock with ${num(pm.daysOfSupply)} days of supply${pm.targetGap > 0 ? `, ${pm.targetGap} units short of this month’s target` : ''}${pm.allocationNextMonth ? `, and ${pm.allocationNextMonth} more allocated next month` : ''}. Average incentive headroom ${money(pm.marginHeadroomAvg)} per unit.` : '';
  box.innerHTML = `<div class="chead"><div><h3>Domo signals</h3><div class="sub">${esc(d.month || '')} · refreshed ${dateTime(d.refreshed_at || d.refreshedAt || d.generatedAt)}</div></div><div class="r">${tagDomo()}${ann('GET /dms/api/domo/signals', 'domo')}</div></div>
  <div class="cbody">
    ${d.priorities?.note ? `<p style="font-size:.84rem;margin-bottom:10px"><b>Tonight’s signal:</b> ${esc(d.priorities.note)}</p>` : ''}
    ${push ? `<div class="notice info" style="margin-bottom:12px">${icon('bolt')}<div><b>Push model this month: ${esc(pushName)}</b><div style="margin-top:3px">${esc(pushWhy || autoWhy)}</div></div></div>` : ''}
    <div class="label" style="margin-bottom:2px">Move priorities</div>
    ${pri.length ? pri.slice(0, 12).map(p => {
      const stockNo = p.stockNo || p.unit_id || p.unitId || p.id;
      const hd = p.bonusHeadroom ?? p.incentive_headroom; const dd = p.daysInStock ?? p.days_in_stock; const rc = p.reasonCode || p.reason_code;
      const why = p.why || `${modelName(p.model)} ${cap(String(p.grade || '').replace(/-/g, ' '))} ${stockNo} at ${siteName(p.siteId || p.site)} has been in stock ${dd} days${rc ? ` (${rc})` : ''}. ${hd ? `Up to ${money(hd)} can be approved as a ready-now bonus.` : 'There is no bonus headroom on this unit.'}`;
      return `<div class="sig"><div class="h">${prio(p.movePriority || p.move_priority || p.priority)}<b><a class="mono" href="#/stock?q=${esc(stockNo)}">${esc(stockNo)}</a></b><span>${esc(modelName(p.model || p.modelId))} ${esc(cap(String(p.grade || p.gradeId || '').replace(/-/g, ' ')))}</span><span class="subtle" style="margin-left:auto;font-size:.74rem">${esc(siteName(p.siteId || p.site))}</span></div>
        <div class="row" style="gap:6px">${age(p.daysInStock ?? p.days_in_stock)}<span class="chip warn">${esc(reasonText(p.reasonCode || p.reason_code || p.reason))}</span>${(p.bonusHeadroom ?? p.incentive_headroom) ? `<span class="chip good">${money(p.bonusHeadroom ?? p.incentive_headroom)} headroom</span>` : ''}</div>
        <details class="why"><summary style="cursor:pointer;color:var(--brand-600);font-weight:600">Why this is being pushed</summary><div style="margin-top:4px">${esc(why)}</div></details></div>`;
    }).join('') : empty({ inline: true, title: 'Nothing to move', body: 'No aged or over-supplied units for this site.' })}
    ${models.length ? `<div class="label" style="margin:14px 0 6px">By model</div><div class="datatable compact"><div class="scroll"><table><thead><tr><th>Model</th><th class="num">Stock</th><th class="num">DoS</th><th class="num">Gap</th><th class="num">Age</th></tr></thead><tbody>${models.map(m => `<tr><td>${esc(modelName(m.model || m.modelId))}</td><td class="num">${num(m.unitsInStock ?? m.onLot)}</td><td class="num" style="color:${(m.daysOfSupply || 0) > 90 ? 'var(--danger-fg)' : (m.daysOfSupply || 0) > 60 ? 'var(--warn-fg)' : 'inherit'}">${num(m.daysOfSupply)}</td><td class="num">${num(m.targetGap)}</td><td class="num">${num(m.avgDaysInStock)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
  </div>`;
}

async function heat(tbl, siteNow) {
  const host = tbl.querySelector('#lv'); host.innerHTML = loading(6);
  const r = await api('/vehicles', { query: { status: 'on_lot', pageSize: 500 } });
  if (!r.ok) { host.innerHTML = failState(r, { what: 'stock', endpoint: 'GET /dms/api/vehicles' }); return; }
  const vs = items(r.data);
  const models = [...new Set(vs.map(v => v.model))].sort();
  const sites = Object.keys(SITES).filter(s => !siteNow || s === siteNow);
  host.innerHTML = `<div class="datatable"><div class="scroll"><table><thead><tr><th>Site</th>${models.map(m => `<th class="num">${esc(modelName(m))}</th>`).join('')}</tr></thead><tbody>${sites.map(s => `<tr><td><b>${esc(SITES[s])}</b></td>${models.map(m => { const u = vs.filter(v => v.siteId === s && v.model === m); const old = Math.max(0, ...u.map(v => v.daysInStock || 0)); return `<td class="num">${u.length ? `<a href="#/stock?site=${s}&q=${encodeURIComponent(m)}" data-tip="${esc(`<b>${esc(modelName(m))} · ${esc(SITES[s])}</b><br>${u.length} on lot<br><span class='k'>oldest</span> ${old} days`)}" style="display:inline-grid;place-items:center;min-width:34px;height:28px;border-radius:6px;background:${ageColor(old)};color:#fff;font-weight:700;text-decoration:none">${u.length}</a>` : '<span class="subtle">·</span>'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div></div><p class="subtle" style="font-size:.74rem;margin-top:6px">Each cell: on-lot units, coloured by the oldest unit. Click a cell to list the units.</p>`;
}
async function unitDrawer(stockNo, ctx) {
  const body = openDrawer(`Unit ${stockNo}`, loading(6));
  const r = await api('/vehicles/' + encodeURIComponent(stockNo));
  if (!r.ok) { body.innerHTML = failState(r, { what: 'this unit', inline: true }); return; }
  const v = r.data; const sig = v.signal;
  const ro = state.user?.role === 'salesperson' && !(state.user?.caps || []).includes('deals.write');
  body.innerHTML = `<div class="stack" style="gap:14px">
    <div><h3 style="font-size:1.05rem">${esc(modelName(v.model))} ${esc(cap(String(v.grade || '').replace(/-/g, ' ')))}</h3><div class="muted" style="font-size:.84rem">${esc(cap(String(v.colour || '').replace(/-/g, ' ')))} · ${esc(siteName(v.siteId))} · ${statusChip(v.status)}</div></div>
    <dl class="kv"><dt>Stock no</dt><dd class="mono">${esc(v.stockNo)}</dd><dt>VIN</dt><dd class="mono">${esc(v.vin || '—')}</dd><dt>Days in stock</dt><dd>${age(v.daysInStock)}</dd><dt>Arrived</dt><dd>${date(v.arrivedAt)}</dd><dt>List price</dt><dd>${money(v.listPrice)}</dd><dt>Bonus headroom</dt><dd>${v.bonusHeadroom ? money(v.bonusHeadroom) : '—'}</dd><dt>Move priority</dt><dd>${prio(v.movePriority)} ${esc(reasonText(v.reasonCode))}</dd>${(v.packs || []).length ? `<dt>Packs</dt><dd>${v.packs.map(p => `<span class="chip neutral">${esc(p)}</span>`).join(' ')}</dd>` : ''}${v.deal ? `<dt>Deal</dt><dd><a class="mono" href="#/deals/${encodeURIComponent(v.deal.id)}">${esc(v.deal.id)}</a> ${statusChip(v.deal.stage)}</dd>` : ''}</dl>
    ${sig ? `<div class="notice info">${tagDomo()}<div>${esc(modelName(sig.model))}: ${num(sig.daysOfSupply)} days of supply, ${num(sig.unitsInStock)} in stock, target gap ${num(sig.targetGap)}.</div></div>` : ''}
    ${['on_lot', 'in_transit', 'demo'].includes(v.status) && !ro ? `<div class="row"><button class="btn" id="hold">Hold 48 h</button><button class="btn secondary" id="xfer">Request transfer</button></div>` : ''}
  </div>`;
  const hb = body.querySelector('#hold'), xb = body.querySelector('#xfer');
  if (hb) hb.onclick = async () => {
    const f = await drawerForm(`Hold 48 h · ${v.stockNo}`, `<div class="field"><label>Customer or lead</label><input class="input mono" name="leadId" placeholder="L-01234 or C-01234" required></div>`, { submit: 'Confirm', note: 'One hold per customer at a time. If the unit is being transferred, the 48 hours start when it arrives.' });
    if (!f) return unitDrawer(stockNo, ctx);
    const y = await api(`/vehicles/${encodeURIComponent(v.stockNo)}/hold`, { method: 'POST', body: f.values });
    if (y.status === 404 || y.status === 405) { f.close(); return notInBuild('Hold 48 h', 'POST /dms/api/vehicles/:stockNo/hold'); }
    if (!y.ok) return f.err(`Couldn’t hold (${y.status}): ${y.error}`);
    f.close(); toast('Unit held for 48 hours'); ctx.rerender();
  };
  if (xb) xb.onclick = async () => {
    const RUN = { hor: 'Thursday', liv: 'Thursday', pen: 'Friday', par: 'Thursday' };
    const f = await drawerForm(`Request transfer · ${v.stockNo}`, `<div class="field"><label>Destination site</label><select class="select" name="toSiteId">${Object.entries(SITES).filter(([k]) => k !== v.siteId).map(([k, n]) => `<option value="${k}">${n} · next run ${RUN[k]}</option>`).join('')}</select></div>`, { submit: 'Submit', note: 'Scheduled runs: Hornsby and Liverpool on Thursday, Penrith on Friday. The unit becomes in_transit when the run departs.' });
    if (!f) return unitDrawer(stockNo, ctx);
    const y = await api(`/vehicles/${encodeURIComponent(v.stockNo)}/transfer`, { method: 'POST', body: f.values });
    if (y.status === 404 || y.status === 405) { f.close(); return notInBuild('Request transfer', 'POST /dms/api/vehicles/:stockNo/transfer'); }
    if (!y.ok) return f.err(`Couldn’t request (${y.status}): ${y.error}`);
    f.close(); toast('Transfer requested'); ctx.rerender();
  };
}
