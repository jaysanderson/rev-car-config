import { api, state, esc, pick, items, money, date, dateTime, pagehead, loading, failState, empty, tagArag, tagDomo, ann, statusChip, modelName, cap, bindRetry, spinBtn, toast, citations, icon, siteName } from '../core.js';

const isLive = p => ['active', 'published', 'live'].includes(p.status) || p.published === true;

export default async function promotions(root, ctx) {
  const caps = state.user?.caps || [];
  const canCompose = caps.includes('promotions.compose');
  const canPublish = caps.includes('promotions.publish');
  root.innerHTML = pagehead({
    title: 'Promotions', tags: `${tagDomo()} ${tagArag()}`,
    sub: 'Domo picks what needs selling (aged units, the push model, target gaps). The Progress Agentic RAG agent composes each offer from the knowledge box: real accessory prices, service plans and finance terms, with the sources it used. Published offers show in the customer configurator.',
    actions: canCompose ? `<button class="btn" id="compose">${icon('assistant')}Compose from Domo targets</button>${ann('POST /dms/api/promotions/compose', 'kb')}` : '',
  }) + `<div class="row" style="margin-bottom:14px"><div class="segmented" role="group" aria-label="Filter"><button aria-pressed="true" data-f="">All</button><button aria-pressed="false" data-f="live">Published</button><button aria-pressed="false" data-f="draft">Not published</button><button aria-pressed="false" data-f="history">History</button></div><span class="subtle" style="font-size:.76rem" id="cnt"></span></div><div id="composed"></div><div id="plist">${loading(8)}</div>`;

  const [r, camps] = await Promise.all([api('/promotions', { query: { pageSize: 200 } }), api('/campaigns', { query: { pageSize: 100 } })]);
  const list = root.querySelector('#plist');
  if (!r.ok) { list.innerHTML = failState(r, { what: 'promotions', endpoint: 'GET /dms/api/promotions' }); bindRetry(root, ctx.rerender); return; }
  let rows = items(r.data);
  const campaigns = items(camps.data);
  let filter = '';
  const render = () => {
    const now = new Date().toISOString();
    const shown = rows.filter(p => !filter ? !(p.endsAt && p.endsAt < now && !isLive(p)) : filter === 'live' ? isLive(p) : filter === 'draft' ? !isLive(p) && !(p.endsAt && p.endsAt < now) : p.endsAt && p.endsAt < now);
    root.querySelector('#cnt').textContent = `${shown.length} of ${rows.length}`;
    list.innerHTML = shown.length ? `<div class="grid g2">${shown.map(p => card(p, campaigns, canPublish)).join('')}</div>` : empty({ title: 'No promotions here', body: canCompose ? 'Compose a fresh set from today’s Domo targets.' : 'Nothing matches this filter.' });
    bindCards(list);
  };
  const bindCards = host => host.querySelectorAll('[data-pub]').forEach(sw => sw.onchange = async () => {
    const id = sw.dataset.pub; const on = sw.checked;
    const y = await api(`/promotions/${encodeURIComponent(id)}/${on ? 'publish' : 'unpublish'}`, { method: 'POST' });
    if (!y.ok) { sw.checked = !on; toast(y.status === 403 ? 'Your role can’t publish promotions' : `Couldn’t ${on ? 'publish' : 'unpublish'}: ${y.error}`); return; }
    const upd = y.data?.promotion || y.data; const i = rows.findIndex(p => p.id === id);
    if (i >= 0) rows[i] = { ...rows[i], ...(upd && upd.id ? upd : { status: on ? 'active' : 'draft' }) };
    toast(on ? 'Published to the configurator' : 'Removed from the configurator'); render();
  });
  root.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f; root.querySelectorAll('[data-f]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); render(); });
  render();

  const cb = root.querySelector('#compose');
  if (cb) cb.onclick = async () => {
    const out = root.querySelector('#composed');
    spinBtn(cb, true, 'Composing…');
    out.innerHTML = `<section class="card aipanel" style="margin-bottom:16px"><div class="cbody"><div class="thinking"><span class="dots"><i></i><i></i><i></i></span>Reading Domo targets, then asking the agent to compose offers from the knowledge box…</div></div></section>`;
    const y = await api('/promotions/compose', { method: 'POST', body: { lang: state.lang, siteId: state.site || undefined } });
    spinBtn(cb, false);
    if (!y.ok) { out.innerHTML = `<div style="margin-bottom:16px">${failState(y, { what: 'promotion composition', endpoint: 'POST /promotions/compose', inline: true })}</div>`; return; }
    const got = items(y.data?.promotions || y.data);
    for (const p of got) { const i = rows.findIndex(x => x.id === p.id); if (i >= 0) rows[i] = p; else rows.unshift(p); }
    out.innerHTML = `<div class="notice info" style="margin-bottom:16px">${icon('check')}<div><b>${got.length} promotion${got.length === 1 ? '' : 's'} composed</b> from ${esc(String(y.data?.targets?.length ?? got.length))} Domo target${(y.data?.targets?.length ?? got.length) === 1 ? '' : 's'}${y.data?.composedBy ? ` · ${esc(y.data.composedBy)}` : ''}. They’re saved as not published; review and publish below.</div></div>`;
    render();
  };
}

function card(p, campaigns, canPublish) {
  const dm = p.source?.domo || p.domo || {};
  const kb = p.source?.kb || p.kb || {};
  const target = typeof dm === 'string' ? dm : pick(dm, 'target', 'reason', 'why', 'signal', 'label') || '';
  const dmFields = typeof dm === 'object' ? Object.entries(dm).filter(([k, v]) => !['target', 'reason', 'why', 'signal', 'label'].includes(k) && v != null && typeof v !== 'object').slice(0, 5) : [];
  const cites = Array.isArray(kb) ? kb : kb.citations || kb.sources || kb.documents || (kb.title ? [kb] : []);
  const used = campaigns.filter(c => (c.promotionIds || []).includes(p.id));
  const live = isLive(p);
  const val = typeof p.value === 'number' ? money(p.value) : esc(p.value || '');
  const applies = p.appliesTo ? (typeof p.appliesTo === 'string' ? p.appliesTo : [p.appliesTo.modelId && modelName(p.appliesTo.modelId), p.appliesTo.model && modelName(p.appliesTo.model), p.appliesTo.stockNo, p.appliesTo.unitId, p.appliesTo.siteId && siteName(p.appliesTo.siteId), p.appliesTo.bodyType].filter(Boolean).join(' · ') || JSON.stringify(p.appliesTo)) : '';
  return `<section class="card promo-card" data-src="promotions/${esc(p.id)}"><div class="chead"><div><h3>${esc(p.title)}</h3><div class="sub mono">${esc(p.id)} · ${esc(cap(p.kind || 'offer'))}</div></div><div class="r">${statusChip(p.status)}</div></div>
    <div class="cbody promo"><div class="flow">
      <div class="box dm"><span class="label" style="color:inherit">Domo target ${ann('source.domo', 'domo')}</span><b>${esc(target || 'Selected by Domo')}</b>${dmFields.map(([k, v]) => `<span style="font-size:.76rem">${esc(cap(k.replace(/([A-Z])/g, ' $1')))}: <b style="font-weight:600">${esc(typeof v === 'number' && /price|value|headroom|margin/i.test(k) ? money(v) : v)}</b></span>`).join('')}</div>
      <div class="arrow">${icon('arrow')}</div>
      <div class="box ar"><span class="label">Composed by the agent ${tagArag()}</span><div class="val">${val}</div>${applies ? `<div style="font-size:.8rem"><span class="muted">Applies to</span> ${esc(applies)}</div>` : ''}${p.terms || p.description ? `<div style="font-size:.8rem;color:var(--muted)">${esc(p.terms || p.description)}</div>` : ''}${cites.length ? `<div><span class="label">Provenance</span>${citations(cites)}</div>` : `<div class="subtle" style="font-size:.74rem">${esc(typeof kb === 'string' ? kb : 'Knowledge-box sources not recorded')}</div>`}</div>
    </div></div>
    <div class="cfoot"><span>${date(p.startsAt)} – ${date(p.endsAt)}</span>${used.length ? `<span>· in ${used.map(c => `<a href="#/campaigns">${esc(c.name)}</a>`).join(', ')}</span>` : '<span>· no campaign yet</span>'}<span style="margin-left:auto"></span>${canPublish ? `<label class="switch" title="Shows the offer in the customer configurator">${live ? 'Published' : 'Publish'}<input type="checkbox" ${live ? 'checked' : ''} data-pub="${esc(p.id)}"></label>${ann('POST /promotions/:id/publish|unpublish')}` : `<span class="chip ${live ? 'good' : 'neutral'}">${live ? 'In configurator' : 'Not published'}</span>`}</div></section>`;
}
