// dms-check.mjs — sanity report + integrity checks for content/dms/data (run via `node scripts/dms-seed.mjs --check`).
import { loadTables, DERIVED, localMs } from '../server/dms/derive.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '-');
const k$ = (n) => `$${Math.round(n).toLocaleString('en-AU')}`;
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const DAY = 864e5;

export async function runCheck(root) {
  const t = loadTables(root);
  const now = localMs(t.meta.asOf || '2026-10-14T08:00:00');
  const out = [];
  const p = (...a) => out.push(a.join(''));
  const problems = [];
  const fail = (m) => problems.push(m);

  p(`Harbourline DMS seed — sanity report (as of ${t.meta.asOf}, seed ${t.meta.seed})`);
  p('');
  p('ROW COUNTS');
  for (const [k, v] of Object.entries(t)) if (Array.isArray(v)) p(`  ${pad(k, 20)}${lpad(v.length, 7)}`);
  const derivedCounts = Object.fromEntries(Object.entries(DERIVED).map(([k, f]) => [k, f(t).length]));
  for (const [k, v] of Object.entries(derivedCounts)) p(`  ${pad(`${k}*`, 20)}${lpad(v, 7)}`);
  p('  (* derived, server/dms/derive.mjs)');

  const deals = t.deals, del = deals.filter((d) => d.stage === 'delivered'), lost = deals.filter((d) => d.stage === 'lost'), open = deals.filter((d) => !['delivered', 'lost'].includes(d.stage));
  p('');
  p(`DEALS  delivered ${del.length} · lost ${lost.length} · open ${open.length}   open by stage: ${['quote', 'negotiation', 'finance', 'approval', 'contract', 'delivery'].map((s) => `${s} ${open.filter((d) => d.stage === s).length}`).join(', ')}`);
  p(`       fulfilment of deliveries: ${['stock', 'allocated', 'factory'].map((f) => `${f} ${del.filter((d) => d.fulfilment === f).length}`).join(', ')}`);

  // deliveries per month
  p('');
  p('DELIVERIES PER MONTH (vs target)');
  p(`  ${pad('month', 9)}${['par', 'hor', 'pen', 'liv'].map((s) => lpad(s, 7)).join('')}${lpad('group', 8)}${lpad('target', 8)}${lpad('attain', 8)}  gross/unit`);
  const months = [...new Set(t.targets.map((x) => x.month))].filter((m) => m <= t.meta.asOf.slice(0, 7));
  for (const m of months) {
    const by = (s) => del.filter((d) => d.siteId === s && d.closedAt.startsWith(m));
    const all = del.filter((d) => d.closedAt.startsWith(m));
    const tg = t.targets.filter((x) => x.month === m).reduce((a, x) => a + x.units, 0);
    const bar = '#'.repeat(Math.round(all.length / 4));
    p(`  ${pad(m, 9)}${['par', 'hor', 'pen', 'liv'].map((s) => lpad(by(s).length, 7)).join('')}${lpad(all.length, 8)}${lpad(tg, 8)}${lpad(pct(all.length, tg), 8)}  ${lpad(k$(all.reduce((a, d) => a + d.grossProfit, 0) / (all.length || 1)), 7)} ${bar}`);
  }

  // gross by site (last 12 months)
  const from12 = now - 365 * DAY;
  const d12 = del.filter((d) => localMs(d.closedAt) >= from12);
  p('');
  p('GROSS PER UNIT BY SITE (deliveries, last 12 months)');
  p(`  ${pad('site', 6)}${lpad('units', 7)}${lpad('front', 9)}${lpad('back', 9)}${lpad('total', 9)}${lpad('disc+bonus', 12)}${lpad('F&I pen', 9)}${lpad('trade %', 9)}`);
  for (const s of ['par', 'hor', 'pen', 'liv', null]) {
    const x = s ? d12.filter((d) => d.siteId === s) : d12;
    const n = x.length || 1;
    p(`  ${pad(s || 'group', 6)}${lpad(x.length, 7)}${lpad(k$(x.reduce((a, d) => a + d.frontGross, 0) / n), 9)}${lpad(k$(x.reduce((a, d) => a + d.backGross, 0) / n), 9)}${lpad(k$(x.reduce((a, d) => a + d.grossProfit, 0) / n), 9)}${lpad(k$(x.reduce((a, d) => a + d.discount + d.bonus, 0) / n), 12)}${lpad(pct(x.filter((d) => d.financeAppId).length, x.length), 9)}${lpad(pct(x.filter((d) => d.tradeInId).length, x.length), 9)}`);
  }
  const fr = d12.map((d) => d.frontGross), bk = d12.filter((d) => d.financeAppId).map((d) => d.backGross);
  p(`  front gross p10/p50/p90: ${[0.1, 0.5, 0.9].map((q) => k$([...fr].sort((a, b) => a - b)[Math.floor(q * fr.length)])).join(' / ')}   back (financed) p10/p50/p90: ${[0.1, 0.5, 0.9].map((q) => k$([...bk].sort((a, b) => a - b)[Math.floor(q * bk.length)])).join(' / ')}`);

  // conversion by channel
  const leads = t.leads.filter((l) => !l.mergedIntoLeadId);
  const tdDone = new Set(t.test_drives.filter((x) => x.status === 'completed').map((x) => x.leadId));
  const dealLeads = new Set(deals.map((d) => d.leadId)), delLeads = new Set(del.map((d) => d.leadId));
  p('');
  p(`CONVERSION BY CHANNEL (leads excl. ${t.leads.length - leads.length} merged duplicates)`);
  p(`  ${pad('channel', 14)}${lpad('leads', 7)}${lpad('→TD', 8)}${lpad('→quote', 8)}${lpad('→deliv', 8)}${lpad('lost', 8)}${lpad('open', 7)}`);
  for (const ch of ['walk-in', 'phone', 'web-form', 'campaign', 'configurator', null]) {
    const x = ch ? leads.filter((l) => l.channel === ch) : leads;
    p(`  ${pad(ch || 'all', 14)}${lpad(x.length, 7)}${lpad(pct(x.filter((l) => tdDone.has(l.id)).length, x.length), 8)}${lpad(pct(x.filter((l) => dealLeads.has(l.id)).length, x.length), 8)}${lpad(pct(x.filter((l) => delLeads.has(l.id)).length, x.length), 8)}${lpad(pct(x.filter((l) => l.status === 'lost').length, x.length), 8)}${lpad(x.filter((l) => !['won', 'lost'].includes(l.status)).length, 7)}`);
  }
  const closed = deals.filter((d) => ['delivered', 'lost'].includes(d.stage) || d.contractAt);
  p(`  deal win rate (contracted / (contracted + lost before contract)): ${pct(deals.filter((d) => d.contractAt).length, deals.filter((d) => d.contractAt || d.stage === 'lost').length)}`);

  // salesperson leaderboard
  p('');
  p('SALESPERSON LEADERBOARD (all history)');
  p(`  ${pad('name', 20)}${pad('site', 5)}${lpad('leads', 6)}${lpad('deals', 6)}${lpad('deliv', 6)}${lpad('open', 5)}${lpad('lead→deliv', 11)}${lpad('win %', 7)}${lpad('front/u', 9)}${lpad('total/u', 9)}`);
  for (const s of t.staff.filter((x) => x.role === 'salesperson')) {
    const L = leads.filter((l) => l.ownerId === s.id), D = deals.filter((d) => d.salespersonId === s.id), V = D.filter((d) => d.stage === 'delivered');
    p(`  ${pad(s.name, 20)}${pad(s.siteId, 5)}${lpad(L.length, 6)}${lpad(D.length, 6)}${lpad(V.length, 6)}${lpad(D.filter((d) => !['delivered', 'lost'].includes(d.stage)).length, 5)}${lpad(pct(V.length, L.length), 11)}${lpad(pct(D.filter((d) => d.contractAt).length, D.filter((d) => d.contractAt || d.stage === 'lost').length), 7)}${lpad(k$(V.reduce((a, d) => a + d.frontGross, 0) / (V.length || 1)), 9)}${lpad(k$(V.reduce((a, d) => a + d.grossProfit, 0) / (V.length || 1)), 9)}`);
  }

  // stage durations
  p('');
  p('MEDIAN STAGE DURATIONS (days, deals that left the stage)');
  const dur = {};
  for (const d of deals) { const h = d.stageHistory; for (let i = 0; i < h.length - 1; i++) (dur[h[i].stage] ||= []).push((localMs(h[i + 1].at) - localMs(h[i].at)) / DAY); }
  p(`  ${Object.entries(dur).map(([k, v]) => `${k} ${median(v).toFixed(1)} (n=${v.length})`).join(' · ')}`);
  const l2q = deals.map((d) => { const l = t.leads.find((x) => x.id === d.leadId); return l ? (localMs(d.createdAt) - localMs(l.createdAt)) / DAY : null; }).filter((x) => x != null);
  p(`  lead→quote ${median(l2q).toFixed(1)} d · quote→delivered ${median(del.map((d) => (localMs(d.closedAt) - localMs(d.createdAt)) / DAY)).toFixed(1)} d (stock ${median(del.filter((d) => d.fulfilment === 'stock').map((d) => (localMs(d.closedAt) - localMs(d.contractAt)) / DAY)).toFixed(1)} d, allocated ${median(del.filter((d) => d.fulfilment === 'allocated').map((d) => (localMs(d.closedAt) - localMs(d.contractAt)) / DAY)).toFixed(1)} d, factory ${median(del.filter((d) => d.fulfilment === 'factory').map((d) => (localMs(d.closedAt) - localMs(d.contractAt)) / DAY)).toFixed(1)} d contract→delivery)`);

  // finance
  p('');
  p('FINANCE BY LENDER (decided applications)');
  for (const lender of ['Toyota Finance', 'Macquarie', 'ANZ', 'Westpac']) {
    const a = t.finance_apps.filter((f) => f.lender === lender), dec = a.filter((f) => f.status !== 'submitted');
    const ok = dec.filter((f) => ['approved', 'settled', 'conditional'].includes(f.status));
    p(`  ${pad(lender, 16)}${lpad(a.length, 5)} apps · approval ${lpad(pct(ok.length, dec.length), 6)} · median rate ${median(ok.map((f) => f.rate)).toFixed(2)}% · median decision ${median(dec.filter((f) => f.decisionAt).map((f) => (localMs(f.decisionAt) - localMs(f.submittedAt)) / 36e5)).toFixed(1)} h · avg ${k$(a.reduce((s, f) => s + f.amount, 0) / (a.length || 1))}`);
  }

  // lost reasons
  const lr = (rows, key) => { const c = {}; for (const r of rows) c[r[key]] = (c[r[key]] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v, rows.length)}`).join(' · '); };
  p('');
  p(`LOST REASONS  deals (${lost.length}): ${lr(lost, 'lostReasonCode')}`);
  p(`              leads lost before a deal (${leads.filter((l) => l.status === 'lost' && !dealLeads.has(l.id)).length}): ${lr(leads.filter((l) => l.status === 'lost' && !dealLeads.has(l.id)), 'lostReasonCode')}`);

  // trade-ins
  p('');
  p('TRADE-INS  valuation by age band (median): ' + [[0, 4], [4, 7], [7, 10], [10, 30]].map(([a, b]) => { const x = t.trade_ins.filter((ti) => { const age = 2026 - ti.year; return age >= a && age < b; }); return `${a}-${b} yrs ${k$(median(x.map((ti) => ti.valuation)))} @ ${Math.round(median(x.map((ti) => ti.km)) / 1000)}k km (n=${x.length})`; }).join(' · '));

  // days of supply
  p('');
  p('DAYS OF SUPPLY BY MODEL (stock = on_lot + in_transit; rate = from-stock deliveries last 90 days; Domo = dealer_signals baseline)');
  p(`  ${pad('model', 17)}${lpad('stock', 6)}${lpad('aged>60', 8)}${lpad('stk90', 6)}${lpad('DoS', 6)}${lpad('Domo DoS', 9)}${lpad('all90', 7)}${lpad('inbound', 8)}${lpad('alloc', 6)}  oldest`);
  for (const r of DERIVED.dealer_signals(t)) {
    const sig = (t.meta.signalsBaseline || t.domo_signals.rows).find((x) => x.model === r.model) || {};
    p(`  ${pad(r.model, 17)}${lpad(r.erpUnitsOnLot + r.erpUnitsInTransit, 6)}${lpad(r.agedUnits, 8)}${lpad(r.erpStockDeliveries90d, 6)}${lpad(r.erpDaysOfSupply, 6)}${lpad(sig.daysOfSupply ?? '-', 9)}${lpad(r.erpAllDeliveries90d, 7)}${lpad(r.erpUnitsInbound, 8)}${lpad(sig.allocationNextMonth ?? '-', 6)}  ${r.oldestStockNo || ''}`);
    if (sig.sales90d != null && sig.sales90d !== r.erpStockDeliveries90d) fail(`sales90d mismatch for ${r.model}: signals ${sig.sales90d}, ERP ${r.erpStockDeliveries90d}`);
    if (sig.unitsInStock != null && sig.unitsInStock !== r.erpUnitsOnLot + r.erpUnitsInTransit) fail(`unitsInStock mismatch for ${r.model}`);
  }

  // targets
  p('');
  p('TARGET ATTAINMENT, LAST 6 FULL MONTHS (units delivered / target)');
  const last6 = months.filter((m) => m < t.meta.asOf.slice(0, 7)).slice(-6);
  for (const s of t.sites) p(`  ${pad(s.id, 5)}${last6.map((m) => { const tg = t.targets.find((x) => x.siteId === s.id && x.month === m); const n = del.filter((d) => d.siteId === s.id && d.closedAt.startsWith(m)).length; return `${m.slice(2)} ${lpad(pct(n, tg.units), 6)}`; }).join('  ')}`);

  // demo scenarios
  const ageIn = (d) => (now - localMs(d.stageHistory[d.stageHistory.length - 1].at)) / DAY;
  const fin5 = (s) => open.filter((d) => d.stage === 'finance' && d.siteId === s && ageIn(d) > 5);
  const appr3 = open.filter((d) => d.stage === 'approval' && ageIn(d) > 3);
  p('');
  p('DEMO SCENARIOS');
  p(`  open deals in finance > 5 days: pen ${fin5('pen').length} (${fin5('pen').map((d) => d.id).join(', ')}), par ${fin5('par').length}, hor ${fin5('hor').length}, liv ${fin5('liv').length}`);
  p(`  open deals in approval > 3 days: ${appr3.length} (${appr3.map((d) => `${d.id}/${d.siteId}`).join(', ')})`);
  if (fin5('pen').length < 3) fail('fewer than 3 Penrith deals stuck in finance > 5 days');
  if (fin5('par').length < 2) fail('fewer than 2 Parramatta deals stuck in finance > 5 days');
  if (appr3.length < 4) fail('fewer than 4 deals waiting in approval > 3 days');
  const josh = t.staff.find((s) => s.email === 'sales1@harbourline.demo');
  const jl = t.leads.filter((l) => l.ownerId === josh.id), jd = deals.filter((d) => d.salespersonId === josh.id);
  p(`  sales1@harbourline.demo (${josh.name}, ${josh.id}): ${jl.length} leads, ${jd.length} deals (${jd.filter((d) => !['delivered', 'lost'].includes(d.stage)).length} open, ${jd.filter((d) => d.stage === 'delivered').length} delivered)`);
  p(`  anonymous configurator leads (customerId null, customerRef = session id): ${t.leads.filter((l) => !l.customerId).length}`);
  for (const id of ['D-10482', 'D-10517']) { const d = deals.find((x) => x.id === id); p(`  ${id}: ${d ? `${d.stage}, ${d.stockNo}, drive-away ${k$(d.driveAway)}, finance ${d.financeAppId}, trade ${d.tradeInId}` : 'MISSING'}`); if (!d) fail(`${id} missing`); }
  p(`  documents 1-6: ${t.documents.slice(0, 6).map((d) => `${d.id} ${d.fileName}`).join(', ')}`);

  // integrity
  const ids = (rows, k = 'id') => new Set(rows.map((r) => r[k]));
  const dup = (rows, k = 'id', name) => { const s = new Set(); for (const r of rows) { if (s.has(r[k])) fail(`duplicate ${name}.${k} ${r[k]}`); s.add(r[k]); } };
  dup(t.customers, 'id', 'customers'); dup(t.leads, 'id', 'leads'); dup(t.deals, 'id', 'deals'); dup(t.test_drives, 'id', 'test_drives'); dup(t.vehicles, 'stockNo', 'vehicles'); dup(t.vehicles, 'vin', 'vehicles'); dup(t.trade_ins, 'id', 'trade_ins'); dup(t.finance_apps, 'id', 'finance_apps'); dup(t.documents, 'id', 'documents');
  const C = ids(t.customers), Lx = ids(t.leads), D = ids(t.deals), S = ids(t.staff), V = ids(t.vehicles, 'stockNo'), TI = ids(t.trade_ins), FA = ids(t.finance_apps), P = ids(t.promotions);
  let fk = 0; const chk = (ok, m) => { if (!ok) { fk++; if (fk < 15) fail(m); } };
  for (const l of t.leads) { chk(!l.customerId || C.has(l.customerId), `lead ${l.id} customer`); chk(S.has(l.ownerId), `lead ${l.id} owner`); chk(l.customerId || l.customerRef, `lead ${l.id} has neither customerId nor customerRef`); }
  for (const d of t.deals) { chk(Lx.has(d.leadId), `deal ${d.id} lead`); chk(C.has(d.customerId), `deal ${d.id} customer`); chk(S.has(d.salespersonId), `deal ${d.id} sp`); chk(!d.stockNo || V.has(d.stockNo), `deal ${d.id} stock ${d.stockNo}`); chk(!d.tradeInId || TI.has(d.tradeInId), `deal ${d.id} trade`); chk(!d.financeAppId || FA.has(d.financeAppId), `deal ${d.id} fin`); for (const pr of d.promotions) chk(P.has(pr.id), `deal ${d.id} promo ${pr.id}`); chk(d.stockNo || d.order, `deal ${d.id} has neither stockNo nor order`);
    const front = d.vehiclePrice - d.discount - d.bonus - d.landedCost + d.accessoriesGross - d.promotionCost - d.tradeOverAllowance; chk(Math.abs(front - d.frontGross) <= 1, `deal ${d.id} front gross identity`); chk(d.grossProfit === d.frontGross + d.backGross, `deal ${d.id} gross sum`);
    chk(d.driveAway === d.vehiclePrice + d.onRoadCosts + d.accessoriesTotal - d.bonus - d.discount, `deal ${d.id} drive-away identity`);
    if (d.stage === 'delivered' && d.fulfilment === 'stock') { const v = t.vehicles.find((x) => x.stockNo === d.stockNo); chk(v && v.status === 'sold' && v.dealId === d.id, `deal ${d.id} sold vehicle link`); }
    for (const e of d.events) chk(localMs(e.at) <= now, `deal ${d.id} future event`);
  }
  for (const x of t.test_drives) { chk(Lx.has(x.leadId), `td ${x.id} lead`); chk(!x.stockNo || V.has(x.stockNo), `td ${x.id} stock`); }
  for (const x of t.trade_ins) chk(D.has(x.dealId), `trade ${x.id} deal`);
  for (const x of t.finance_apps) chk(D.has(x.dealId), `fin ${x.id} deal`);
  for (const x of t.documents) { chk(!x.dealId || D.has(x.dealId), `doc ${x.id} deal`); chk(!x.customerId || C.has(x.customerId), `doc ${x.id} cust`); }
  for (const v of t.vehicles) { chk(!v.dealId || D.has(v.dealId), `vehicle ${v.stockNo} deal`); chk(v.vin.length === 17, `vehicle ${v.stockNo} VIN length`); const n = +v.stockNo.slice(3); if (v.source === 'dms' || v.source === 'demonstrator' || v.source === 'allocation') chk(n < 1900 || n > 2800, `vehicle ${v.stockNo} in configurator stock range`); }
  // configurator units unchanged
  const stock = JSON.parse(readFileSync(join(root || join(import.meta.dirname, '..'), 'content', 'domo', 'stock_by_site.json'), 'utf8')).rows;
  for (const u of stock) { const v = t.vehicles.find((x) => x.stockNo === u.id); chk(v && v.vin === u.vin && v.siteId === u.site && v.model === u.model && v.grade === u.grade && v.colour === u.colour && v.interior === u.interior && JSON.stringify(v.packs) === JSON.stringify(u.packs) && v.status === u.status && v.daysInStock === u.days_in_stock && v.bonusHeadroom === u.bonus && (v.movePriority ?? null) === (u.priority ?? null) && v.reasonCode === u.reason_code, `configurator unit ${u.id} changed`); }
  if (fk) fail(`${fk} foreign-key / identity problems in total`);
  const stamps = JSON.stringify([t.leads.slice(0, 50), t.deals.slice(0, 50)]).match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}/g) || [];
  p('');
  p(`OFFSETS  sample timestamps: ${[...new Set(stamps.map((s) => s.slice(-6)))].join(', ')} (NSW DST aware)`);
  p('');
  p(problems.length ? `INTEGRITY: ${problems.length} problem(s)\n  - ${problems.join('\n  - ')}` : 'INTEGRITY: OK (unique ids, foreign keys, gross and drive-away identities, configurator units unchanged, no future events)');
  console.log(out.join('\n'));
  return problems.length;
}
