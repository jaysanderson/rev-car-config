import { api, state, esc, pick, items, num, money, date, dateTime, pagehead, loading, failState, empty, tagArag, tagDomo, ann, statusChip, modelName, cap, bindRetry, spinBtn, toast, citations, icon, siteName, openDrawer } from '../core.js';

const LIVE = new Set(['published', 'active', 'live', 'scheduled']);
const isLive = p => LIVE.has(p.status);
const isDraft = p => !isLive(p) && !['expired', 'withdrawn', 'unpublished', 'ended'].includes(p.status);
const REASON = { aged_90d: '90+ days in stock', aged_60d: '60–89 days in stock', days_of_supply: 'Too many days of supply', model_year_change: 'Model year change' };

export default async function promotions(root, ctx) {
  const caps = state.user?.caps || [];
  const canCompose = caps.includes('promotions.compose');
  const canPublish = caps.includes('promotions.publish');
  root.innerHTML = pagehead({
    title: 'Promotions', tags: `${tagDomo()} ${tagArag()}`,
    sub: '1 · Domo selects the targets. 2 · Progress Agentic RAG composes the promotion from the knowledge box, within the headroom Domo supplied. 3 · A manager publishes it. Nothing reaches the configurator, a quote or a campaign until then.',
    actions: canCompose ? `<button class="btn" id="compose">${icon('assistant')}Compose promotions</button>${ann('POST /dms/api/promotions/compose', 'kb')}` : '',
  }) + `<div id="composed-note"></div><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr));align-items:start" id="cols">${['Domo targets', 'Composed', 'Published'].map(t => `<section class="card"><div class="chead"><h3>${t}</h3></div><div class="cbody">${loading(5)}</div></section>`).join('')}</div>`;

  const [r, camps, sig] = await Promise.all([api('/promotions', { query: { pageSize: 200 } }), api('/campaigns', { query: { pageSize: 100 } }), api('/domo/signals')]);
  const cols = root.querySelector('#cols');
  if (!r.ok) { cols.outerHTML = failState(r, { what: 'promotions', endpoint: 'GET /dms/api/promotions' }); bindRetry(root, ctx.rerender); return; }
  let rows = items(r.data);
  const campaigns = items(camps.data);

  const render = () => {
    const now = new Date().toISOString().slice(0, 10);
    const drafts = rows.filter(p => isDraft(p) && !(p.endsAt && p.endsAt < now));
    const live = rows.filter(isLive);
    const s = sig.data || {};
    const targets = (s.movePriorities || []).slice(0, 10);
    const push = s.priorities?.weights?.pushModel?.modelId;
    const gaps = (s.rows || []).filter(m => m.targetGap > 0 || m.daysOfSupply > 60).sort((a, b) => b.daysOfSupply - a.daysOfSupply).slice(0, 5);
    cols.innerHTML = `
    <section class="card" data-src="GET /domo/signals"><div class="chead"><div><h3>Domo targets</h3><div class="sub">refreshed ${dateTime(s.refreshed_at)}</div></div><div class="r">${tagDomo()}</div></div><div class="cbody">
      ${!sig.ok ? failState(sig, { what: 'Domo targets', inline: true }) : `
      ${s.priorities?.note ? `<p style="font-size:.82rem;margin-bottom:10px">${esc(s.priorities.note)}</p>` : ''}
      ${push ? `<div class="sig"><div class="h"><span class="chip info">Push model</span><b>${esc(modelName(push))}</b></div></div>` : ''}
      ${gaps.map(m => `<div class="sig"><div class="h"><span class="chip ${m.daysOfSupply > 60 ? 'warn' : ''}">Model</span><b>${esc(modelName(m.model))}</b><span class="subtle" style="margin-left:auto;font-size:.74rem">${money(m.marginHeadroomAvg)} avg headroom</span></div><div class="why">${num(m.daysOfSupply)} days of supply · target gap ${num(m.targetGap)} · ${num(m.unitsInStock)} in stock</div></div>`).join('')}
      ${targets.map(t => `<div class="sig"><div class="h"><span class="prio ${(t.movePriority || 9) <= 2 ? 'p1' : 'p2'}">P${t.movePriority ?? '–'}</span><b class="mono">${esc(t.stockNo)}</b><span>${esc(modelName(t.model))}</span><span class="subtle" style="margin-left:auto;font-size:.74rem">${esc(siteName(t.siteId))}</span></div><div class="why">${esc(REASON[t.reasonCode] || cap(t.reasonCode || ''))} · ${num(t.daysInStock)} days · headroom ${money(t.bonusHeadroom)}</div></div>`).join('') || (gaps.length ? '' : empty({ inline: true, title: 'No targets tonight' }))}`}
    </div></section>
    <section class="card aipanel"><div class="chead"><div><h3>Composed</h3><div class="sub">${drafts.length} draft${drafts.length === 1 ? '' : 's'} waiting for review</div></div><div class="r">${tagArag()}</div></div><div class="cbody stack" style="gap:10px">
      ${drafts.map(p => card(p, campaigns, canPublish)).join('') || empty({ inline: true, title: 'No drafts', body: canCompose ? 'Click Compose promotions to draft offers from tonight’s Domo targets.' : 'Nothing is waiting for review.' })}
    </div></section>
    <section class="card"><div class="chead"><div><h3>Published</h3><div class="sub">live in the configurator, quotes and campaigns</div></div><div class="r">${ann('promotions.status = published')}</div></div><div class="cbody stack" style="gap:10px">
      ${live.map(p => card(p, campaigns, canPublish)).join('') || empty({ inline: true, title: 'Nothing published', body: 'Publish a composed promotion to show it to customers.' })}
    </div></section>`;
    cols.querySelectorAll('[data-act]').forEach(b => b.onclick = () => act(b));
    cols.querySelectorAll('[data-prov]').forEach(b => b.onclick = () => provenance(rows.find(p => p.id === b.dataset.prov), s));
  };
  const act = async b => {
    const id = b.dataset.id, action = b.dataset.act;
    spinBtn(b, true, action === 'publish' ? 'Publishing…' : 'Withdrawing…');
    const y = await api(`/promotions/${encodeURIComponent(id)}/${action}`, { method: 'POST' });
    spinBtn(b, false);
    if (!y.ok) { toast(y.status === 403 ? 'Only a sales manager, general manager or digital experience manager can publish' : `Couldn’t ${action}: ${y.error}`); return; }
    const i = rows.findIndex(p => p.id === id); if (i >= 0) rows[i] = { ...rows[i], ...(y.data?.id ? y.data : { status: action === 'publish' ? 'published' : 'unpublished' }) };
    toast(action === 'publish' ? 'Published to the configurator' : 'Withdrawn from the configurator'); render();
  };
  render();

  const cb = root.querySelector('#compose');
  if (cb) cb.onclick = async () => {
    const note = root.querySelector('#composed-note');
    spinBtn(cb, true, 'Composing…');
    note.innerHTML = `<div class="notice info" style="margin-bottom:16px"><div class="thinking" style="padding:0"><span class="dots"><i></i><i></i><i></i></span>Reading Domo targets, then asking the agent to compose one promotion per target group…</div></div>`;
    const y = await api('/promotions/compose', { method: 'POST', body: { lang: state.lang }, timeout: 120000 });
    spinBtn(cb, false);
    if (!y.ok) { note.innerHTML = `<div style="margin-bottom:16px">${failState(y, { what: 'promotion composition', endpoint: 'POST /promotions/compose', inline: true })}</div>`; return; }
    const got = items(y.data?.promotions || y.data);
    for (const p of got) { const i = rows.findIndex(x => x.id === p.id); if (i >= 0) rows[i] = p; else rows.unshift(p); }
    note.innerHTML = `<div class="notice info" style="margin-bottom:16px">${icon('check')}<div><b>${got.length} promotion${got.length === 1 ? '' : 's'} composed</b>${y.data?.composedBy ? ` by ${esc(y.data.composedBy === 'arag' ? 'the Progress Agentic RAG agent' : y.data.composedBy)}` : ''}${y.data?.latencyMs ? ` in ${(y.data.latencyMs / 1000).toFixed(1)} s` : ''}. Drafts stay unpublished until a manager reviews them.</div></div>`;
    render();
  };
}

function card(p, campaigns, canPublish) {
  const dm = p.source?.domo || {};
  const used = campaigns.filter(c => (c.promotionIds || []).includes(p.id));
  const live = isLive(p);
  const val = typeof p.value === 'number' ? money(p.value) : esc(p.value || '');
  const aT = p.appliesTo; const applies = aT ? (typeof aT === 'string' ? aT : [aT.models && aT.models.map(modelName).join(', '), aT.units && aT.units.join(', '), aT.aged && 'aged units only', aT.bodies && aT.bodies.join(', '), aT.modelId && modelName(aT.modelId)].filter(Boolean).join(' · ')) : '';
  const target = typeof dm === 'string' ? dm : [dm.type && cap(String(dm.type).replace(/_/g, ' ')), dm.target, dm.signal && (typeof dm.signal === 'string' ? dm.signal : '')].filter(Boolean).join(' · ');
  return `<div class="tile" style="gap:6px" data-src="promotions/${esc(p.id)}">
    <div class="row" style="justify-content:space-between"><b style="font-size:.92rem">${esc(p.title)}</b>${statusChip(p.status)}</div>
    <div class="row" style="gap:6px"><span class="val" style="font-size:1.1rem;font-weight:700;color:var(--accent-fg)">${val}</span><span class="chip out">${esc(cap(String(p.kind || 'offer').replace(/-/g, ' ')))}</span></div>
    ${p.desc || p.description ? `<div style="font-size:.82rem">${esc(p.desc || p.description)}</div>` : ''}
    ${applies ? `<div style="font-size:.76rem" class="muted">Applies to ${esc(applies)}</div>` : ''}
    ${target ? `<div style="font-size:.76rem;color:var(--info-fg)">Domo · ${esc(target)}</div>` : !p.source?.domo ? '<div style="font-size:.74rem" class="subtle">Created manually (no Domo provenance)</div>' : ''}
    <div class="muted" style="font-size:.74rem">${p.startsAt ? date(p.startsAt) : ''}${p.endsAt ? ' – ' + date(p.endsAt) : ' · no end date'}${used.length ? ` · ${used.map(c => esc(c.name)).join(', ')}` : ''}</div>
    <div class="row" style="margin-top:4px"><button class="btn ghost sm" data-prov="${esc(p.id)}">Provenance</button>${canPublish ? (live ? `<button class="btn secondary sm" data-act="unpublish" data-id="${esc(p.id)}">Withdraw</button>` : `<button class="btn sm" data-act="publish" data-id="${esc(p.id)}">Publish</button>`) : ''}${ann('POST /promotions/:id/publish|unpublish')}</div>
  </div>`;
}

function provenance(p, s) {
  if (!p) return;
  const dm = p.source?.domo; const kb = p.source?.kb;
  const kbList = Array.isArray(kb) ? kb : kb ? (kb.citations || kb.sources || [kb]) : [];
  openDrawer(`Provenance · ${p.title}`, `<div class="stack" style="gap:16px">
    <section><div class="label" style="margin-bottom:6px">Domo rows that selected it ${tagDomo()}</div>${dm ? `<dl class="kv">${Object.entries(typeof dm === 'object' ? dm : { target: dm }).map(([k, v]) => `<dt>${esc(cap(k))}</dt><dd>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</dd>`).join('')}<dt>Dataset</dt><dd class="mono">dealer_signals · aged_stock_actions</dd><dt>Refreshed</dt><dd>${dateTime(s?.refreshed_at)}</dd></dl>` : '<p class="muted">No Domo provenance: this promotion was created manually.</p>'}</section>
    <section><div class="label" style="margin-bottom:6px">Knowledge-base passages cited ${tagArag()}</div>${kbList.length ? `<div class="stack" style="gap:8px">${kbList.map(c => typeof c === 'string' ? `<div class="tile">${esc(c)}</div>` : `<div class="tile"><b>${esc(c.title || c.name || c.resourceId || 'Source')}</b>${c.text || c.snippet ? `<span class="d">${esc((c.text || c.snippet).slice(0, 400))}</span>` : ''}</div>`).join('')}</div>` : '<p class="muted">No passages recorded.</p>'}${p.source?.composedBy ? `<p class="subtle" style="font-size:.76rem;margin-top:6px">Composed by ${esc(p.source.composedBy === 'arag' ? 'the Progress Agentic RAG agent' : p.source.composedBy)}${p.composedAt ? ' · ' + dateTime(p.composedAt) : ''}</p>` : ''}</section>
    <section><div class="label" style="margin-bottom:6px">Publishing</div><dl class="kv"><dt>Status</dt><dd>${statusChip(p.status)}</dd>${p.publishedAt ? `<dt>Published</dt><dd>${dateTime(p.publishedAt)} by ${esc(p.publishedBy || '—')}</dd>` : ''}${p.unpublishedAt ? `<dt>Withdrawn</dt><dd>${dateTime(p.unpublishedAt)} by ${esc(p.unpublishedBy || '—')}</dd>` : ''}</dl></section>
    <div class="json">${esc(JSON.stringify(p, null, 2))}</div>
  </div>`, p.id);
}
