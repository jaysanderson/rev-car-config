// Shared renderers used by more than one page.
import { esc, pick, money, date, dateTime, modelName, siteName, custName, tagArag, tagDomo, ann, cap } from './core.js';

export const gradeName = g => { const x = String(g || '').replace(/-/g, ' '); return x.length <= 4 && !/\s/.test(x) ? x.toUpperCase() : x.replace(/\b\w/g, c => c.toUpperCase()); };
export const leadName = l => {
  if (!l) return '—';
  const c = l.customer || (l.customerName ? { name: l.customerName } : null);
  if (c && custName(c)) return custName(c);
  if (!l.customerId) return 'Anonymous configurator session';
  return l.customerId;
};
export const leadRef = l => {
  const r = l?.customerRef || l?.configuratorSessionId || l?.bookingId || '';
  return r ? String(r).replace(/-/g, '').slice(0, 6) : '';
};
export const interestLabel = i => {
  if (!i) return '—';
  const parts = [modelName(i.modelId || i.model)];
  if (i.gradeId || i.grade) parts.push(gradeName(i.gradeId || i.grade));
  return parts.filter(Boolean).join(' · ');
};
export const scoreBar = s => s == null ? '—' : `<span class="agebar" title="Lead score ${s}/100"><span style="display:inline-block;width:46px;height:5px;border-radius:999px;background:var(--hairline);overflow:hidden"><i style="display:block;height:100%;width:${s}%;background:${s >= 75 ? 'var(--accent-500)' : s >= 50 ? 'var(--brand-500)' : 'var(--subtle)'}"></i></span>${s}</span>`;
export const channelChip = c => c === 'configurator' ? `<span class="chip info">Configurator</span>` : c ? `<span class="chip out">${esc(cap(c))}</span>` : '';

const ANSWER = { b40: 'Up to $40k', b55: 'Up to $55k', b60: 'Up to $60k', b75: 'Up to $75k', b80: 'Up to $80k', b100: 'Up to $100k', b110: 'Up to $110k', b160: 'Up to $160k', two: '2 people', five: '5 seats', seven: '7 seats', none: 'None', ev: 'Electric', any: 'No preference', month: 'Within a month', };
const answerText = v => Array.isArray(v) ? v.map(answerText).join(', ') : (ANSWER[v] || (typeof v === 'string' ? v.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase()) : v));
const qaList = arr => {
  const rows = (arr || []).map(a => typeof a === 'string' ? { q: a, a: '' } : { q: pick(a, 'question', 'questionText', 'label', 'id', 'questionId') || '', a: pick(a, 'answer', 'value', 'label') });
  return rows.length ? `<div class="qa" data-src="finderAnswers">${rows.map(r => `<div><span>${esc(cap(String(r.q).replace(/-/g, ' ')))}</span><b>${esc(r.a == null ? '—' : typeof r.a === 'object' && !Array.isArray(r.a) ? JSON.stringify(r.a) : answerText(r.a))}</b></div>`).join('')}</div>` : '';
};
export { qaList };

// The salesperson's handover sheet (configurator /api/testdrive/handover shape, or the bridge's fallback)
export function handoverSheet(h, { title = 'Handover sheet' } = {}) {
  if (!h) return '';
  const car = h.car || h.build || {};
  const carLine = [car.name || [car.model || modelName(car.modelId), car.grade || gradeName(car.gradeId)].filter(Boolean).join(' '), car.colour || (car.colourId && cap(String(car.colourId).replace(/-/g, ' ')))].filter(Boolean).join(' · ');
  const tp = h.talkingPoints || [];
  const promos = h.promotionsToOffer || [];
  const prep = h.prep || [];
  const qs = (h.questions || []).filter(q => q && (q.answer != null || q.question));
  return `<div class="sheet" data-src="lead.handover">
    <div class="h"><b>${esc(title)}</b>${h.talkingPointsBy === 'arag' || /Agentic RAG/.test(h.preparedBy || '') ? tagArag('Talking points · ARAG') : ''}<span class="r subtle" style="margin-left:auto;font-size:.72rem">${esc(h.whenLabel || (h.when ? dateTime(h.when) : h.preparedAt ? 'prepared ' + dateTime(h.preparedAt) : ''))}</span></div>
    ${carLine ? `<div><span class="label">Car</span><div style="font-weight:600">${esc(carLine)}${car.unitId || car.stockNo ? ` <span class="mono subtle">${esc(car.unitId || car.stockNo)}</span>` : ''}${car.price ? ` · ${money(car.price)} <span class="subtle" style="font-size:.74rem">${esc(car.priceNote || 'drive-away')}</span>` : ''}</div>${car.transferFrom ? `<div class="subtle" style="font-size:.76rem">Transfer from ${esc(siteName(car.transferFrom))}</div>` : ''}</div>` : ''}
    ${(h.viewed || []).length ? `<div><span class="label">Viewed</span><div class="pills" style="margin-top:4px">${h.viewed.map(v => `<span class="chip out">${esc([modelName(v.modelId), v.gradeId && gradeName(v.gradeId)].filter(Boolean).join(' '))}${v.unitId ? ' · ' + esc(v.unitId) : ''}</span>`).join('')}</div></div>` : ''}
    ${(h.finderAnswers || []).length ? `<div><span class="label">Finder answers</span>${qaList(h.finderAnswers)}</div>` : ''}
    ${qs.length ? `<div><span class="label">Questions</span>${qaList(qs)}</div>` : ''}
    ${tp.length ? `<div><span class="label">Talking points</span><ul style="margin:4px 0 0;padding-left:18px">${tp.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
    ${promos.length ? `<div><span class="label">Promotions to offer ${tagDomo()}</span><ul style="margin:4px 0 0;padding-left:18px">${promos.map(p => typeof p === 'string' ? `<li>${esc(p)}</li>` : `<li><b>${esc(p.title || p.id)}</b>${p.why ? ` <span class="muted">· ${esc(p.why)}</span>` : ''}</li>`).join('')}</ul></div>` : ''}
    ${h.incentive ? `<div><span class="label">Test-drive incentive</span><div>${esc(h.incentive.title || h.incentive.name || JSON.stringify(h.incentive))}</div></div>` : ''}
    ${prep.length ? `<div><span class="label">Prep before they arrive</span><ul style="margin:4px 0 0;padding-left:18px">${prep.map(p => `<li>${esc(typeof p === 'string' ? p : p.text || p.label || JSON.stringify(p))}</li>`).join('')}</ul></div>` : ''}
    ${ann('configurator → /api/testdrive/handover → lead.handover', 'kb')}
  </div>`;
}

// Generic filterable, paged list bound to a /dms/api list endpoint ({items,total,page,pageSize}).
import { api, items as itemsOf, table, bindRows, pager, failState, bindRetry, icon as ic, num as n, state as st, loading as ld } from './core.js';
export async function listView(host, { endpoint, filters = [], cols, href, query = {}, pageSize = 25, sort, search = 'Search', enrich, count = 'records', annText, initial = {}, emptyHtml }) {
  const f = { q: initial.q || '', page: 1, sort: initial.sort || sort || '', ...Object.fromEntries(filters.map(x => [x.key, initial[x.key] || ''])) };
  host.innerHTML = `<div class="filterbar" role="search">
      <div class="search">${ic('search')}<input class="input" type="search" placeholder="${esc(search)}" value="${esc(f.q)}" data-f="q" aria-label="${esc(search)}"></div>
      ${filters.map(x => `<select class="select" data-f="${x.key}" aria-label="${esc(x.label)}"><option value="">${esc(x.label)}</option>${x.options.map(([v, l]) => `<option value="${esc(v)}" ${f[x.key] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`).join('')}
      <span class="spacer"></span><span class="count" data-count></span>${annText ? ann(annText) : ''}
    </div><div data-list>${ld(8)}</div>`;
  const listEl = host.querySelector('[data-list]'), countEl = host.querySelector('[data-count]');
  let seq = 0;
  async function load() {
    const my = ++seq;
    const dt = listEl.querySelector('.datatable'); if (dt) dt.setAttribute('aria-busy', 'true');
    const qy = { ...query, siteId: query.siteId ?? st.site, q: f.q, page: f.page, pageSize, sort: f.sort };
    for (const x of filters) if (f[x.key]) qy[x.param || x.key] = f[x.key];
    const r = await api(endpoint, { query: qy });
    if (my !== seq) return;
    if (!r.ok) { listEl.innerHTML = failState(r, { what: count, endpoint: 'GET /dms/api' + endpoint }); countEl.textContent = ''; bindRetry(listEl, load); return; }
    let rows = itemsOf(r.data);
    if (enrich) rows = await enrich(rows);
    if (my !== seq) return;
    countEl.textContent = `${n(r.data?.total ?? rows.length)} ${count}`;
    listEl.innerHTML = table(cols, rows, { href, empty: emptyHtml, sort: { key: f.sort.replace(/^-/, ''), dir: f.sort.startsWith('-') ? 'desc' : 'asc' } });
    const dtEl = listEl.querySelector('.datatable');
    if (dtEl && (r.data?.total ?? 0) > pageSize) dtEl.appendChild(pager(r.data, f.page, pageSize, p => { f.page = p; load(); }));
    listEl.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => { const k = b.dataset.sort; f.sort = f.sort === '-' + k ? k : '-' + k; f.page = 1; load(); });
    bindRows(listEl);
  }
  let tmr;
  host.querySelectorAll('[data-f]').forEach(el => el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', () => { f[el.dataset.f] = el.value; f.page = 1; clearTimeout(tmr); tmr = setTimeout(load, el.tagName === 'INPUT' ? 250 : 0); }));
  await load();
  return { reload: load, filters: f };
}

// Resolve customer names for rows that only carry customerId (cached per id).
const custCache = new Map();
export async function withCustomers(rows, key = 'customerId') {
  const need = [...new Set(rows.filter(r => !r.customer && !r.customerName && r[key]).map(r => r[key]))].filter(id => !custCache.has(id));
  await Promise.all(need.slice(0, 60).map(async id => { const r = await api('/customers/' + encodeURIComponent(id)); custCache.set(id, r.ok ? (r.data?.customer || r.data) : null); }));
  return rows.map(r => r.customer || r.customerName || !r[key] ? r : { ...r, customer: custCache.get(r[key]) || null });
}
