import { esc, money, num, date, ago, pagehead, statusChip, cap, state } from '../core.js';
import { listView } from '../parts.js';

export default async function finance(root, ctx) {
  const tab = ctx.query.tab === 'trade-ins' ? 'trade-ins' : 'finance';
  root.innerHTML = pagehead({ title: 'Finance & trade-ins', sub: 'Applications by lender and status, and trade-in valuations against what was offered. Open the deal to see the whole picture.' }) +
    `<div class="tabs" role="tablist"><a href="#/finance" role="tab" aria-selected="${tab === 'finance'}">Finance applications</a><a href="#/finance?tab=trade-ins" role="tab" aria-selected="${tab === 'trade-ins'}">Trade-ins</a></div><div id="lv"></div>`;
  const lv = root.querySelector('#lv');
  if (tab === 'finance') return listView(lv, {
    endpoint: '/finance-apps', count: 'applications', search: 'Search deal, lender…', annText: 'GET /dms/api/finance-apps', initial: ctx.query,
    filters: [{ key: 'status', label: 'Any status', options: ['submitted', 'approved', 'conditional', 'declined', 'settled'].map(s => [s, cap(s)]) }, { key: 'lender', label: 'Any lender', options: ['Toyota Finance', 'Macquarie', 'ANZ', 'Westpac'].map(s => [s, s]) }],
    href: f => '#/deals/' + encodeURIComponent(f.dealId),
    cols: [
      { label: 'Application', sort: 'submittedAt', render: f => `<span class="cell-title mono">${esc(f.id)}</span><span class="cell-sub">Deal ${esc(f.dealId)}</span>` },
      { label: 'Lender', render: f => esc(f.lender) },
      { label: 'Amount', num: true, sort: 'amount', render: f => money(f.amount) },
      { label: 'Term', num: true, render: f => `${num(f.termMonths)} mo` },
      { label: 'Rate', num: true, render: f => `${f.rate}%` },
      { label: 'Status', sort: 'status', render: f => statusChip(f.status) },
      { label: 'Submitted', render: f => `${date(f.submittedAt)}<span class="cell-sub">${f.status === 'submitted' ? ago(f.submittedAt) + ' waiting' : f.decisionAt ? 'decided ' + date(f.decisionAt) : ''}</span>` },
    ],
  });
  return listView(lv, {
    endpoint: '/trade-ins', count: 'trade-ins', search: 'Search make, model, deal…', annText: 'GET /dms/api/trade-ins', initial: ctx.query,
    href: t => '#/deals/' + encodeURIComponent(t.dealId),
    cols: [
      { label: 'Vehicle', render: t => `<span class="cell-title">${esc([t.year, t.make, t.model].filter(Boolean).join(' '))}</span><span class="cell-sub mono">${esc(t.id)} · deal ${esc(t.dealId)}</span>` },
      { label: 'Odometer', num: true, sort: 'km', render: t => `${num(t.km)} km` },
      { label: 'Condition', render: t => esc(cap(t.condition || '—')) },
      { label: 'Valuation', num: true, sort: 'valuation', render: t => money(t.valuation) },
      { label: 'Offered', num: true, sort: 'offered', render: t => money(t.offered) },
      { label: 'Over/under', num: true, render: t => t.valuation && t.offered ? `<span style="color:${t.offered > t.valuation ? 'var(--danger-fg)' : 'var(--accent-fg)'}">${t.offered > t.valuation ? '+' : '−'}${money(Math.abs(t.offered - t.valuation)).replace('−', '')}</span>` : '—' },
    ],
  });
}
