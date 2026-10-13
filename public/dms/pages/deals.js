import { drawerForm, notInBuild } from '../core.js';
import { api, state, esc, pick, items, num, money, kmoney, date, dateTime, ago, pagehead, loading, failState, empty, tagArag, ann, statusChip, siteName, modelName, cap, custName, staffMap, bindRetry, spinBtn, toast, citations, prose, icon, LANGS } from '../core.js';
import { listView, withCustomers } from '../parts.js';

export const STAGES = ['quote', 'negotiation', 'finance', 'approval', 'contract', 'delivery', 'delivered', 'lost'];
const OPEN = STAGES.slice(0, 6);
const vehLabel = d => d.vehicle ? [modelName(d.vehicle.model), d.vehicle.grade && cap(String(d.vehicle.grade).replace(/-/g, ' '))].filter(Boolean).join(' · ') : d.order ? `${modelName(d.order.modelId)} (factory order${d.order.etaWeeks ? `, ${d.order.etaWeeks} wk` : ''})` : d.stockNo || '—';
const daysIn = d => { if (d.daysInStage != null) return d.daysInStage; const at = (d.events || []).reduce((m, e) => (e.at && e.at > m ? e.at : m), d.createdAt || ''); return at ? Math.max(0, Math.floor((Date.now() - new Date(at)) / 864e5)) : null; };
export const STUCK = { quote: 7, negotiation: 5, finance: 5, approval: 2, contract: 3, delivery: 10 };
const NEXT = { quote: ['negotiation'], negotiation: ['finance', 'approval'], finance: ['approval'], contract: ['delivery'], delivery: ['delivered'] };
const isMgr = () => ['gm', 'sales_manager'].includes(state.user?.role);

export default async function deals(root, ctx) {
  if (ctx.params[0]) return detail(root, ctx, ctx.params[0]);
  const mode = ctx.query.view === 'list' || ctx.query.stage || ctx.query.q ? 'list' : 'board';
  root.innerHTML = pagehead({
    title: 'Deals', sub: `Open pipeline for ${state.site ? siteName(state.site) : 'the group'}${state.user?.role === 'salesperson' ? ' (your deals)' : ''}. Click a deal to open it.`,
    actions: `<div class="segmented" role="group" aria-label="View"><button aria-pressed="${mode === 'board'}" data-v="board">Board</button><button aria-pressed="${mode === 'list'}" data-v="list">List</button></div>`,
  }) + '<div id="dv"></div>';
  root.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { location.hash = '#/deals' + (b.dataset.v === 'list' ? '?view=list' : ''); });
  const host = root.querySelector('#dv');
  const staff = await staffMap();
  if (mode === 'list') {
    await listView(host, {
      endpoint: '/deals', count: 'deals', search: 'Search deal, customer, stock no…', annText: 'GET /dms/api/deals', initial: ctx.query,
      filters: [{ key: 'stage', label: 'Any stage', options: STAGES.map(s => [s, cap(s)]) }],
      enrich: rows => withCustomers(rows),
      href: d => '#/deals/' + encodeURIComponent(d.id),
      cols: [
        { label: 'Deal', sort: 'createdAt', render: d => `<span class="cell-title">${esc(d.customer ? custName(d.customer) : d.customerId)}</span><span class="cell-sub mono">${esc(d.id)} · ${date(d.createdAt)}</span>` },
        { label: 'Vehicle', render: d => `${esc(vehLabel(d))}${d.stockNo ? `<span class="cell-sub mono">${esc(d.stockNo)}</span>` : ''}` },
        { label: 'Stage', sort: 'stage', render: d => statusChip(d.stage) },
        { label: 'Drive-away', num: true, sort: 'driveAway', render: d => money(d.driveAway) },
        { label: 'Gross', num: true, sort: 'grossProfit', render: d => money(d.grossProfit) },
        { label: 'Salesperson', render: d => esc(staff[d.salespersonId]?.name || d.salespersonId || '—') + `<span class="cell-sub">${esc(siteName(d.siteId))}</span>` },
      ],
    });
    return;
  }
  host.innerHTML = loading(6);
  const r = await api('/deals', { query: { siteId: state.site, stage: OPEN.join(','), pageSize: 500, sort: '-createdAt' } });
  if (!r.ok) { host.innerHTML = failState(r, { what: 'the deal pipeline', endpoint: 'GET /dms/api/deals' }); bindRetry(host, ctx.rerender); return; }
  const rows = await withCustomers(items(r.data).slice(0, 240));
  if (!rows.length) { host.innerHTML = empty({ title: 'No open deals', body: 'Nothing is in the pipeline for this site and role.', actions: '<a class="btn secondary sm" href="#/deals?view=list">See all deals</a>' }); return; }
  const by = Object.fromEntries(OPEN.map(s => [s, []])); rows.forEach(d => by[d.stage]?.push(d));
  host.innerHTML = `<div class="board" data-src="GET /deals?stage=open">${OPEN.map(s => {
    const list = by[s]; const val = list.reduce((n, d) => n + (d.driveAway || 0), 0);
    return `<div class="col"><div class="h"><b>${esc(cap(s))}</b><span class="n">${list.length}</span><span class="s">${kmoney(val)}</span></div><div class="list">${list.slice(0, 40).map(d => { const dd = daysIn(d); const stuck = dd != null && dd > STUCK[s];
      return `<a class="dcard${stuck ? ' stuck' : ''}" href="#/deals/${encodeURIComponent(d.id)}"><div class="t"><b>${esc(d.customer ? custName(d.customer) : d.customerId)}</b><span class="id">${esc(d.id)}</span></div><div class="m">${esc(vehLabel(d))}</div><div class="f"><span class="subtle">${esc(staff[d.salespersonId]?.avatarInitials || '')} · ${dd != null ? dd + 'd in stage' : ''}</span><span class="p">${money(d.driveAway)}</span></div></a>`; }).join('') || '<div class="subtle" style="font-size:.76rem;padding:8px">No deals</div>'}${list.length > 40 ? `<a class="btn ghost sm" href="#/deals?stage=${s}">+${list.length - 40} more</a>` : ''}</div></div>`;
  }).join('')}</div><p class="subtle" style="font-size:.74rem;margin-top:8px">Amber edge: <b>Stuck</b>, in this stage longer than quote 7 days, negotiation 5, finance 5, approval 2, contract 3, delivery 10. ${ann('GET /dms/api/deals?stage=quote,…,delivery')}</p>`;
}

async function detail(root, ctx, id) {
  root.innerHTML = loading(10);
  const [r, staff] = await Promise.all([api('/deals/' + encodeURIComponent(id)), staffMap()]);
  if (!r.ok) { root.innerHTML = pagehead({ title: 'Deal ' + id, crumbs: [['Deals', '#/deals'], [id]] }) + failState(r, { what: 'this deal', endpoint: 'GET /dms/api/deals/' + id }); bindRetry(root, ctx.rerender); return; }
  const x = r.data || {};
  const d = x.deal || x;
  const cust = x.customer || d.customer;
  const ti = x.tradeIn || x.trade_in || d.tradeIn;
  const fa = x.financeApp || x.finance_app || d.financeApp;
  const docs = x.documents || d.documents || [];
  const veh = x.vehicle || d.vehicle;
  const lead = x.lead || d.lead;
  const events = [...(d.events || [])].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const sp = staff[d.salespersonId];
  const canWrite = (state.user?.caps || ['deals.write']).includes('deals.write');
  const accTotal = (d.accessories || []).reduce((n, a) => n + (a.price || 0), 0);
  const promoTotal = (d.promotions || []).reduce((n, p) => n + (p.value || 0), 0);
  const stIdx = STAGES.indexOf(d.stage);

  root.innerHTML = pagehead({
    title: cust ? custName(cust) : d.customerId, crumbs: [['Deals', '#/deals'], [d.id]],
    tags: statusChip(d.stage) + (OPEN.includes(d.stage) && daysIn(x) > STUCK[d.stage] ? ' <span class="chip warn">Stuck · ' + daysIn(x) + ' days</span>' : ''),
    sub: `<span class="mono">${esc(d.id)}</span> · ${esc(vehLabel({ ...d, vehicle: veh }))} · ${esc(siteName(d.siteId))} · ${esc(sp?.name || d.salespersonId || '')} · opened ${date(d.createdAt)}`,
    actions: canWrite && OPEN.includes(d.stage) ? [
      ...(NEXT[d.stage] || []).map(n => `<button class="btn ${n === (NEXT[d.stage] || [])[0] ? '' : 'secondary'}" data-move="${n}">Move to ${esc(n)}</button>`),
      d.stage === 'approval' ? `<button class="btn secondary" id="reqap">Request approval</button>` : '',
      d.stage === 'approval' && isMgr() ? `<button class="btn accent" id="apdeal">Approve deal</button>` : '',
      `<button class="btn ghost" id="lostbtn">Mark lost</button>`,
    ].join('') : '',
  }) + `
  <div class="card" style="margin-bottom:16px"><div class="cbody" style="display:flex;gap:4px;overflow-x:auto">${STAGES.filter(s => s !== 'lost').map((s, i) => `<div style="flex:1;min-width:84px"><div style="height:5px;border-radius:999px;background:${d.stage === 'lost' ? 'var(--hairline)' : i <= stIdx ? 'var(--accent-500)' : 'var(--hairline)'}"></div><div style="font-size:.72rem;margin-top:5px;color:${s === d.stage ? 'var(--text)' : 'var(--muted)'};font-weight:${s === d.stage ? 700 : 500}">${esc(cap(s))}</div></div>`).join('')}${d.stage === 'lost' ? `<span class="chip bad" style="align-self:center">Lost${d.lostReason ? ': ' + esc(d.lostReason) : ''}</span>` : ''}</div></div>
  <div class="split">
    <div class="stack">
      <div class="grid g2">
        <section class="card"><div class="chead"><h3>Pricing</h3><div class="r">${canWrite && OPEN.includes(d.stage) ? '<button class="btn ghost sm" id="bonus">Add ready-now bonus</button>' : ''}${ann('deals.vehiclePrice…driveAway')}</div></div><div class="cbody"><dl class="kv">
          <dt>Vehicle</dt><dd class="num">${money(d.vehiclePrice)}</dd>
          ${(d.accessories || []).map(a => `<dt>${esc(a.name)}</dt><dd class="num">${money(a.price)}</dd>`).join('')}
          ${(d.promotions || []).map(p => `<dt>${esc(p.title)}</dt><dd class="num" style="color:var(--accent-fg)">−${money(p.value).replace('$', '$')}</dd>`).join('')}
          ${d.discount ? `<dt>Discount</dt><dd class="num" style="color:var(--accent-fg)">−${money(d.discount)}</dd>` : ''}
          ${ti ? `<dt>Trade-in allowance</dt><dd class="num">${money(ti.offered)}</dd>` : ''}
          <dt style="font-weight:700;color:var(--text)">Drive-away</dt><dd class="num" style="font-weight:700;font-size:1.05rem">${money(d.driveAway)}</dd>
        </dl></div><div class="cfoot">Gross ${money(d.grossProfit)} · front ${money(d.frontGross)} · back ${money(d.backGross)}</div></section>
        <section class="card"><div class="chead"><h3>Vehicle</h3></div><div class="cbody"><dl class="kv">
          ${veh ? `<dt>Stock no</dt><dd><a class="mono" href="#/stock?q=${esc(veh.stockNo)}">${esc(veh.stockNo)}</a></dd><dt>VIN</dt><dd class="mono">${esc(veh.vin || '—')}</dd><dt>Model</dt><dd>${esc(modelName(veh.model))} ${esc(cap(String(veh.grade || '').replace(/-/g, ' ')))}</dd><dt>Colour</dt><dd>${esc(cap(String(veh.colour || '—').replace(/-/g, ' ')))}</dd><dt>Status</dt><dd>${statusChip(veh.status)} ${veh.daysInStock != null ? `${veh.daysInStock} days in stock` : ''}</dd>`
            : d.order ? `<dt>Factory order</dt><dd>${esc(modelName(d.order.modelId))} ${esc(d.order.gradeId || '')}</dd><dt>Colour</dt><dd>${esc(d.order.colourId || '—')}</dd><dt>ETA</dt><dd>${d.order.etaWeeks ? d.order.etaWeeks + ' weeks' : '—'}</dd>`
            : `<dt>Stock no</dt><dd class="mono">${esc(d.stockNo || '—')}</dd>`}
          ${d.deliveryDate ? `<dt>Delivery</dt><dd>${date(d.deliveryDate)}</dd>` : ''}
          ${lead || d.leadId ? `<dt>Lead</dt><dd><a class="mono" href="#/leads/${encodeURIComponent(d.leadId || lead.id)}">${esc(d.leadId || lead.id)}</a></dd>` : ''}
        </dl></div></section>
      </div>
      <div class="grid g2">
        <section class="card"><div class="chead"><h3>Finance</h3><div class="r">${ann('finance_apps')}</div></div><div class="cbody">${fa ? `<dl class="kv"><dt>Lender</dt><dd>${esc(fa.lender)}</dd><dt>Amount</dt><dd>${money(fa.amount)} over ${fa.termMonths} mo at ${fa.rate}%</dd><dt>Status</dt><dd>${statusChip(fa.status)}</dd><dt>Submitted</dt><dd>${date(fa.submittedAt)} <span class="subtle">${ago(fa.submittedAt)}</span></dd>${fa.decisionAt ? `<dt>Decision</dt><dd>${date(fa.decisionAt)}</dd>` : ''}</dl>` : d.financeAppId ? `<span class="mono">${esc(d.financeAppId)}</span>` : '<p class="muted" style="font-size:.85rem">Cash or customer-arranged finance.</p>'}</div></section>
        <section class="card"><div class="chead"><h3>Trade-in</h3><div class="r">${ann('trade_ins')}</div></div><div class="cbody">${ti ? `<dl class="kv"><dt>Vehicle</dt><dd>${esc([ti.year, ti.make, ti.model].filter(Boolean).join(' '))}</dd><dt>Odometer</dt><dd>${num(ti.km)} km</dd><dt>Condition</dt><dd>${esc(cap(ti.condition || '—'))}</dd><dt>Valuation</dt><dd>${money(ti.valuation)}</dd><dt>Offered</dt><dd>${money(ti.offered)} ${ti.valuation && ti.offered ? `<span class="subtle">(${ti.offered > ti.valuation ? 'over' : 'under'} by ${money(Math.abs(ti.offered - ti.valuation))})</span>` : ''}</dd></dl>` : '<p class="muted" style="font-size:.85rem">No trade-in on this deal.</p>'}</div></section>
      </div>
      <section class="card"><div class="chead"><h3>Documents</h3><span class="sub">${docs.length}</span><div class="r"><a class="btn ghost sm" href="#/documents?dealId=${encodeURIComponent(d.id)}">Upload</a></div></div><div class="cbody">${docs.length ? `<div class="stack" style="gap:8px">${docs.map(o => `<a class="row" href="#/documents/${encodeURIComponent(o.id)}">${icon('doc')}<span>${esc(o.fileName || o.id)}</span><span class="chip out">${esc(cap(o.kind))}</span>${statusChip(o.status)}</a>`).join('')}</div>` : '<p class="muted" style="font-size:.85rem">No documents yet.</p>'}</div></section>
      <section class="card"><div class="chead"><h3>Timeline</h3><span class="sub">${events.length} events</span><div class="r">${ann('deals.events · POST /deals/:id/events')}</div></div><div class="cbody">
        ${canWrite ? `<form id="evf" class="row" style="margin-bottom:14px"><select class="select" name="type" style="width:auto" aria-label="Event type"><option value="note">Note</option><option value="call">Call</option><option value="email">Email</option><option value="visit">Customer visit</option><option value="finance">Finance update</option></select><input class="input" name="note" placeholder="What happened?" style="flex:1;min-width:200px" required aria-label="Note"><button class="btn sm">Add event</button></form>` : ''}
        <ol class="timeline" id="tl">${events.map(e => tlItem(e, staff)).join('') || '<li><span class="muted">No events.</span></li>'}</ol>
      </div></section>
    </div>
    <div class="stack">
      <section class="card aipanel" id="ai"><div class="chead"><h3>AI summary</h3>${tagArag()}<div class="r">${ann('POST /dms/api/deals/' + d.id + '/summary', 'kb')}</div></div><div class="cbody stack" style="gap:12px">
        <p class="muted" style="font-size:.82rem">Reads the deal, its timeline, customer, finance, trade-in and dealer policy, then writes a grounded summary, the next best action and risks, with citations.</p>
        <button class="btn" id="sumbtn">${icon('assistant')}Summarise deal</button>
        <div id="sumout"></div>
      </div></section>
      ${cust ? `<section class="card"><div class="chead"><h3>Customer</h3></div><div class="cbody"><dl class="kv"><dt>Name</dt><dd><a href="#/customers/${encodeURIComponent(cust.id)}">${esc(custName(cust))}</a></dd><dt>Email</dt><dd>${esc(cust.email || '—')}</dd><dt>Phone</dt><dd>${esc(cust.phone || '—')}</dd><dt>Suburb</dt><dd>${esc([cust.suburb, cust.postcode].filter(Boolean).join(' ') || '—')}</dd><dt>Source</dt><dd>${esc(cap(cust.source || '—'))}</dd></dl></div></section>` : ''}
    </div>
  </div>`;

  const move = async (stage, note) => { const y = await api('/deals/' + encodeURIComponent(d.id), { method: 'PATCH', body: { stage, ...(note ? { note } : {}) } }); if (y.ok) { toast(`Moved to ${stage}`); ctx.rerender(); } else toast(y.status === 403 ? 'Your role can’t move this deal' : `Move blocked: ${y.error}`); return y; };
  root.querySelectorAll('[data-move]').forEach(b => b.onclick = () => move(b.dataset.move));
  const ev = (type, note) => api(`/deals/${encodeURIComponent(d.id)}/events`, { method: 'POST', body: { type, note } });
  const on = (sel, fn) => { const b = root.querySelector(sel); if (b) b.onclick = fn; };
  on('#reqap', async () => { const y = await ev('approval_requested', `Approval requested by ${state.user?.name || 'salesperson'} (discount ${money(d.discount || 0)}, front gross ${money(d.frontGross)})`); toast(y.ok ? 'Approval requested; the approver is notified' : `Couldn’t request: ${y.error}`); if (y.ok) ctx.rerender(); });
  on('#apdeal', async () => { const y = await ev('approved', `Deal approved by ${state.user?.name || 'manager'}`); if (!y.ok) return toast(`Couldn’t approve: ${y.error}`); await move('contract', 'Approved → contract issued for signature'); });
  on('#lostbtn', async () => {
    const f = await drawerForm('Mark lost', `<div class="field"><label for="dlr">Lost reason</label><select class="select" id="dlr" name="lostReason">${['Bought elsewhere', 'Price', 'Finance declined', 'Timing', 'No response', 'Other'].map(x => `<option>${x}</option>`).join('')}</select></div><div class="field"><label for="dln">Note</label><textarea class="textarea" id="dln" name="note" style="min-height:80px"></textarea></div>`, { submit: 'Confirm', sub: d.id, note: 'A held stock unit is released back to on_lot.' });
    if (!f) return;
    const y = await api('/deals/' + encodeURIComponent(d.id), { method: 'PATCH', body: { stage: 'lost', lostReason: f.values.lostReason, note: f.values.note || `Lost: ${f.values.lostReason}` } });
    if (!y.ok) return f.err(`Couldn’t save (${y.status}): ${y.error}`);
    f.close(); toast('Deal marked lost'); ctx.rerender();
  });
  on('#bonus', async () => {
    const head = veh?.bonusHeadroom;
    const f = await drawerForm('Add ready-now bonus', `<div class="field"><label for="bamt">Bonus amount (AUD)</label><input class="input" id="bamt" name="amount" type="number" min="0" step="50" required></div>${head != null ? `<p class="muted" style="font-size:.84rem">Headroom on ${esc(veh.stockNo)}: <b>${money(head)}</b>. Within headroom the sales manager approves; above it the general manager.</p>` : '<p class="muted" style="font-size:.84rem">This deal has no stock unit with headroom (factory order).</p>'}`, { submit: 'Save', sub: d.id, note: 'The bonus appears on the quote as its own line.' });
    if (!f) return;
    const amt = Number(f.values.amount) || 0;
    const y = await ev('bonus', `Ready-now bonus ${money(amt)} requested${head != null ? ` (headroom ${money(head)}; ${amt > head ? 'needs general manager' : 'sales manager can approve'})` : ''}`);
    if (!y.ok) return f.err(`Couldn’t save: ${y.error}`);
    f.close(); toast('Ready-now bonus requested for approval'); ctx.rerender();
  });
  const evf = root.querySelector('#evf');
  if (evf) evf.onsubmit = async e => {
    e.preventDefault(); const body = Object.fromEntries(new FormData(evf).entries());
    const y = await api(`/deals/${encodeURIComponent(d.id)}/events`, { method: 'POST', body });
    if (!y.ok) { toast(`Couldn’t add: ${y.error}`); return; }
    const ev = y.data?.event || { at: new Date().toISOString(), staffId: state.user?.staffId, ...body };
    root.querySelector('#tl').insertAdjacentHTML('afterbegin', tlItem(ev, staff)); evf.reset();
  };
  root.querySelector('#sumbtn').onclick = async () => {
    const b = root.querySelector('#sumbtn'), out = root.querySelector('#sumout');
    spinBtn(b, true, 'Summarising…'); out.innerHTML = `<div class="thinking"><span class="dots"><i></i><i></i><i></i></span>Retrieving the deal, policy and history…</div>`;
    const y = await api(`/deals/${encodeURIComponent(d.id)}/summary`, { method: 'POST', body: { lang: state.lang } });
    spinBtn(b, false);
    if (!y.ok) { out.innerHTML = failState(y, { what: 'the deal summary', endpoint: `POST /deals/${d.id}/summary`, inline: true }); return; }
    const s = y.data || {};
    const nba = pick(s, 'nextBestAction', 'next_best_action', 'nextAction');
    const risks = s.risks || [];
    out.innerHTML = `<div class="ai-out">
      <div><h4>Summary</h4><div class="prose">${prose(pick(s, 'summary', 'answer', 'text') || '')}</div></div>
      ${nba ? `<div><h4>Next best action</h4><div class="nba">${icon('bolt')}<div>${esc(typeof nba === 'string' ? nba : nba.action || nba.text || JSON.stringify(nba))}${nba.why ? `<div style="font-weight:400;font-size:.8rem;margin-top:3px;opacity:.85">${esc(nba.why)}</div>` : ''}</div></div></div>` : ''}
      ${risks.length ? `<div><h4>Risks</h4><div class="stack" style="gap:6px">${risks.map(k => { const sev = (typeof k === 'object' && (k.severity || k.level)) || 'medium'; return `<div class="risk"><span class="sev chip ${/high/i.test(sev) ? 'bad' : /low/i.test(sev) ? 'neutral' : 'warn'}">${esc(cap(sev))}</span><span>${esc(typeof k === 'string' ? k : k.risk || k.text || k.title)}</span></div>`; }).join('')}</div></div>` : ''}
      ${(s.citations || s.sources || []).length ? `<div><h4>Sources</h4>${citations(s.citations || s.sources)}</div>` : ''}
      <div class="subtle" style="font-size:.72rem">${esc(LANGS[state.lang] || '')}${s.generatedAt ? ' · ' + dateTime(s.generatedAt) : ''}${s.mode || s.by ? ' · ' + esc(s.mode || s.by) : ''}</div>
      <div class="json">${esc(JSON.stringify(s, null, 2))}</div>
    </div>`;
  };
}
function tlItem(e, staff) {
  const t = String(e.type || 'note');
  const k = /deliver/.test(t) ? 'k-delivered' : /lost/.test(t) ? 'k-lost' : /stage/.test(t) ? 'k-stage' : '';
  return `<li class="${k}"><div class="t">${dateTime(e.at)} · ${esc(cap(t))}${e.staffId ? ' · ' + esc(staff[e.staffId]?.name || e.staffId) : ''}</div><div class="n">${esc(e.note || '')}</div></li>`;
}
