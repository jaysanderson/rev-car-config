#!/usr/bin/env node
// used-seed.mjs — deterministic synthetic pre-owned stock for Harbourline Used.
//
//   node scripts/used-seed.mjs            # writes content/used/stock.json and
//                                         # content/domo/used_market_prices.json
//   node scripts/used-seed.mjs --check    # regenerate in memory and diff against disk
//
// 36 units across the four sites: 30 Toyotas (library photo of the model, colour
// matched to the photo) and 6 trade-in brands without a photo ("photos being taken").
// Every unit carries provenance the agent can read: service history on Toyota's
// 15,000 km / 12 month schedule, a 120-point inspection with repaired/noted items,
// a PPSR result, warranty, reconditioning lines, and (for some) the DMS trade-in it
// came from. All figures are illustrative demo data. Zero dependencies, Node 20+.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const TODAY = new Date('2026-10-17T09:00:00+11:00');

// ── PRNG (mulberry32) ────────────────────────────────────────────────────────
let seed = 20261017;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const round = (n, to) => Math.round(n / to) * to;
const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const ym = (d) => ymd(d).slice(0, 7);

// ── reference data ───────────────────────────────────────────────────────────
const catalog = JSON.parse(readFileSync(join(ROOT, 'content/catalog.json'), 'utf8'));
const credits = JSON.parse(readFileSync(join(ROOT, 'content/images/credits.json'), 'utf8'));
const tradeIns = JSON.parse(readFileSync(join(ROOT, 'content/dms/data/trade_ins.json'), 'utf8'));
const model = (id) => catalog.models.find((m) => m.id === id);
const creditOf = (id) => credits.find((c) => c.model === id);
const photoColour = { 'yaris-cross': ['Grayish Blue', 'saturn-blue'], corolla: ['Glacier White', 'glacier-white'], 'corolla-cross': ['Celestite Grey', 'graphite'], 'c-hr': ['Frosted White', 'frosted-white'], camry: ['Celestial Silver', 'silver-sky'], rav4: ['Urban Rock', null], kluger: ['Silver Sky', 'silver-sky'], prado: ['White Pearl', 'frosted-white'], 'landcruiser-300': ['Crystal Pearl', 'frosted-white'], fortuner: ['Glacier White', 'glacier-white'], hilux: ['Eclipse Black', 'eclipse-black'], bz4x: ['Graphite', 'graphite'], 'gr-yaris': ['Glacier White', 'glacier-white'], 'gr-corolla': ['Feverish Red', 'atomic-rush'], gr86: ['Halo White', 'glacier-white'] };

const SITES = ['par', 'par', 'par', 'hor', 'pen', 'liv'];
const STAFF = { par: ['Luke Harris', 'Mia Thompson'], hor: ['Grace Lin', 'Ben Kowalski'], pen: ['Tom Nguyen', 'Sarah Pike'], liv: ['Omar Haddad', 'Jess Carter'] };
const TOYOTA_DEALERS = ['Harbourline Toyota Parramatta', 'Harbourline Toyota Hornsby', 'Harbourline Toyota Penrith', 'Harbourline Toyota Liverpool', 'Toyota dealer (Sydney metro)', 'Toyota dealer (Newcastle)', 'Toyota dealer (Canberra)'];
const INSPECTION_POOL = [
  ['Body', 'Light scratch rear bumper, left corner', 'repaired'], ['Body', 'Stone chips on bonnet leading edge', 'noted'], ['Body', 'Small dent rear quarter, paintless repair', 'repaired'], ['Body', 'Kerb rash front-left alloy', 'repaired'],
  ['Interior', 'Driver seat bolster wear', 'noted'], ['Interior', 'Rear cargo liner scuffed', 'replaced'], ['Interior', 'Child-seat anchor marks rear seat', 'noted'], ['Interior', 'Steering wheel leather polished', 'noted'],
  ['Tyres', 'Front tyres replaced (Bridgestone Alenza)', 'replaced'], ['Tyres', 'Rear tyres 60% remaining', 'noted'], ['Brakes', 'Front pads and rotors replaced', 'replaced'], ['Brakes', 'Brake fluid flushed', 'replaced'],
  ['Mechanical', 'Cabin filter and engine air filter replaced', 'replaced'], ['Mechanical', '12V battery load-tested, passed', 'noted'], ['Mechanical', 'Wiper blades replaced', 'replaced'], ['Electrical', 'Infotainment software updated', 'repaired'],
  ['Glass', 'Windscreen chip passenger side, resin repaired', 'repaired'], ['Keys', 'Second key cut and programmed', 'replaced'], ['Hybrid', 'Hybrid battery health check passed (Toyota Health Check)', 'noted'],
];
const FEATURES = {
  common: ['Apple CarPlay and Android Auto', 'Reversing camera', 'Adaptive cruise control', 'Lane trace assist', 'Pre-collision safety system', 'Bluetooth', 'Alloy wheels'],
  upper: ['Leather-accented seats', 'Heated front seats', 'Power tailgate', 'Head-up display', 'JBL premium audio', 'Panoramic view monitor', 'Blind-spot monitor', 'Satellite navigation', 'Wireless phone charger'],
  ute: ['Tub liner', 'Tow bar and 7-pin wiring', 'Side steps', 'Hard tonneau cover', 'Downhill assist control', 'Rear diff lock'],
  offroad: ['Multi-terrain select', 'Crawl control', 'Low-range transfer case', 'Tow bar and 12-pin wiring', 'Roof racks'],
};

// ── unit templates: [modelId, year, grade, variantCode, kmLo, kmHi, price, drive, fuel, engine, extra] ──
const T = [
  ['rav4', 2024, 'GX', 'AXAH52R', 38000, 52000, 42888, 'AWD', 'Hybrid', '2.5L hybrid', { certified: true }],
  ['rav4', 2023, 'GXL', 'AXAH52R', 44000, 61000, 44990, '2WD', 'Hybrid', '2.5L hybrid', { certified: true }],
  ['rav4', 2025, 'Cruiser', 'AXAH54R', 9000, 16000, 55990, 'AWD', 'Hybrid', '2.5L hybrid', { certified: true, demo: true, acquiredVia: 'ex-demo' }],
  ['rav4', 2022, 'GX', 'MXAA52R', 68000, 84000, 33990, '2WD', 'Petrol', '2.0L petrol', { certified: true }],
  ['rav4', 2024, 'XSE', 'AXAH54R', 22000, 31000, 52490, 'AWD', 'Hybrid', '2.5L hybrid', { certified: true, status: 'arriving', etaDays: 6 }],
  ['corolla', 2021, 'Ascent Sport Hybrid', 'ZWE211R', 58000, 76000, 25888, '2WD', 'Hybrid', '1.8L hybrid', { certified: false, body: 'hatch' }],
  ['corolla', 2023, 'SX Hybrid', 'ZWE219R', 29000, 41000, 31990, '2WD', 'Hybrid', '1.8L hybrid', { certified: true, body: 'hatch' }],
  ['corolla', 2022, 'ZR Hybrid', 'ZWE219R', 36000, 49000, 33490, '2WD', 'Hybrid', '1.8L hybrid', { certified: true, body: 'hatch', was: 34990 }],
  ['camry', 2025, 'SL', 'AXVH80R', 11000, 15000, 50888, '2WD', 'Hybrid', '2.5L hybrid', { certified: true, body: 'sedan' }],
  ['camry', 2026, 'SL', 'AXVH80R', 12000, 14500, 51888, '2WD', 'Hybrid', '2.5L hybrid', { certified: true, body: 'sedan', demo: true, acquiredVia: 'ex-demo' }],
  ['camry', 2021, 'Ascent Hybrid', 'AXVH70R', 71000, 96000, 29990, '2WD', 'Hybrid', '2.5L hybrid', { certified: true, body: 'sedan', acquiredVia: 'ex-fleet', owners: 1 }],
  ['kluger', 2023, 'GX', 'AXUH78R', 41000, 56000, 49990, 'AWD', 'Hybrid', '2.5L hybrid', { certified: true, seats: 7 }],
  ['kluger', 2022, 'GXL', 'GSU70R', 52000, 69000, 47990, '2WD', 'Petrol', '3.5L V6 petrol', { certified: true, seats: 7 }],
  ['kluger', 2024, 'Grande', 'AXUH78R', 18000, 26000, 68990, 'AWD', 'Hybrid', '2.5L hybrid', { certified: true, seats: 7, status: 'reconditioning' }],
  ['hilux', 2023, 'SR5', 'GUN126R', 46000, 63000, 52990, '4x4', 'Diesel', '2.8L turbo-diesel', { certified: true, body: 'ute', features: 'ute' }],
  ['hilux', 2021, 'SR', 'GUN126R', 88000, 118000, 41990, '4x4', 'Diesel', '2.8L turbo-diesel', { certified: false, body: 'ute', features: 'ute', acquiredVia: 'ex-fleet' }],
  ['hilux', 2024, 'Rogue', 'GUN126R', 21000, 30000, 66990, '4x4', 'Diesel', '2.8L turbo-diesel', { certified: true, body: 'ute', features: 'ute' }],
  ['hilux', 2022, 'Workmate', 'TGN121R', 61000, 79000, 29990, '2WD', 'Petrol', '2.7L petrol', { certified: true, body: 'ute', features: 'ute', transmission: 'Manual' }],
  ['prado', 2022, 'GXL', 'GDJ150R', 59000, 77000, 62990, '4x4', 'Diesel', '2.8L turbo-diesel', { certified: true, seats: 7, features: 'offroad' }],
  ['prado', 2025, 'VX', 'TAJA250R', 12000, 18000, 94990, '4x4', 'Diesel', '2.8L turbo-diesel 48V', { certified: true, seats: 7, features: 'offroad' }],
  ['landcruiser-300', 2025, 'Sahara', 'FJA300R', 19000, 23000, 122512, '4x4', 'Diesel', '3.3L twin-turbo diesel V6', { certified: true, seats: 7, features: 'offroad' }],
  ['fortuner', 2022, 'GXL', 'GUN156R', 47000, 64000, 49990, '4x4', 'Diesel', '2.8L turbo-diesel', { certified: true, seats: 7, features: 'offroad' }],
  ['yaris-cross', 2022, 'Ascent Sport', 'MXPB10R', 33000, 47000, 24888, '2WD', 'Hybrid', '1.5L hybrid', { certified: true }],
  ['yaris-cross', 2024, 'Urban', 'MXPJ15R', 14000, 21000, 36990, 'AWD', 'Hybrid', '1.5L hybrid', { certified: true }],
  ['corolla-cross', 2023, 'GXL', 'MXGH10R', 31000, 44000, 38990, '2WD', 'Hybrid', '2.0L hybrid', { certified: true }],
  ['corolla-cross', 2024, 'Atmos', 'MXGH15R', 16000, 24000, 46990, 'AWD', 'Hybrid', '2.0L hybrid', { certified: true }],
  ['c-hr', 2024, 'GXL', 'MXPH10R', 17000, 25000, 41990, '2WD', 'Hybrid', '1.8L hybrid', { certified: true }],
  ['bz4x', 2024, 'FWD', 'XEAM10R', 19000, 27000, 49990, '2WD', 'Electric', '71.4 kWh battery, 150 kW', { certified: true }],
  ['gr-yaris', 2023, 'GTS', 'GXPA16R', 24000, 33000, 54990, 'AWD', 'Petrol', '1.6L turbo three-cylinder', { certified: true, body: 'hatch', transmission: 'Manual' }],
  ['gr86', 2023, 'GTS', 'ZN8', 20000, 29000, 44990, '2WD', 'Petrol', '2.4L flat-four', { certified: true, body: 'coupe', transmission: 'Manual' }],
  // trade-in brands (no library photo)
  [null, 2020, 'Maxx Sport', 'KF Series', 71000, 92000, 27990, 'AWD', 'Petrol', '2.5L petrol', { make: 'Mazda', model: 'CX-5', body: 'suv-mid', acquiredVia: 'trade-in' }],
  [null, 2021, 'XLT', 'PX MkIII', 84000, 109000, 46990, '4x4', 'Diesel', '2.0L bi-turbo diesel', { make: 'Ford', model: 'Ranger', body: 'ute', features: 'ute', acquiredVia: 'trade-in' }],
  [null, 2019, 'Active', 'PD', 92000, 124000, 17990, '2WD', 'Petrol', '2.0L petrol', { make: 'Hyundai', model: 'i30', body: 'hatch', acquiredVia: 'trade-in', status: 'reconditioning' }],
  [null, 2022, 'SX', 'NQ5', 38000, 52000, 34990, '2WD', 'Petrol', '2.0L petrol', { make: 'Kia', model: 'Sportage', body: 'suv-mid', acquiredVia: 'trade-in' }],
  [null, 2021, '2.5i Premium', 'S5', 54000, 73000, 33990, 'AWD', 'Petrol', '2.5L boxer petrol', { make: 'Subaru', model: 'Forester', body: 'suv-mid', acquiredVia: 'trade-in' }],
  [null, 2020, 'LS', 'ZL', 66000, 88000, 24990, '2WD', 'Petrol', '2.4L petrol', { make: 'Mitsubishi', model: 'Outlander', body: 'suv-mid', seats: 7, acquiredVia: 'trade-in' }],
];

const BODY_LABEL = { 'suv-small': 'SUV', 'suv-mid': 'SUV', 'suv-large': 'SUV', ute: 'Ute', sedan: 'Sedan', hatch: 'Hatch', coupe: 'Coupe' };
const plate = () => { const L = 'ABCDEFGHJKLMNPRSTUVWXYZ'; return `${pick(L)}${pick(L)}${pick(L)}${between(10, 99)}${pick(L)}`; };
const vin = (i, code) => `${pick(['JTM', 'JTN', 'MR0', '5TD', 'JTE', 'JT2', 'JM0', 'MNA', 'KMH', 'KNA', 'JF2', 'JMY'])}${code.replace(/[^A-Z0-9]/g, '').slice(0, 5).padEnd(5, 'X')}${String(8 + i).padStart(2, '0')}${between(100000, 999999)}${String(i).padStart(3, '0')}`;
const toyotaTradeIns = tradeIns.filter((t) => t.make === 'Toyota' && t.year >= 2021).sort((a, b) => b.appraisedAt.localeCompare(a.appraisedAt));

function serviceHistory(year, km, make) {
  const first = new Date(`${year}-${String(between(2, 11)).padStart(2, '0')}-${String(between(1, 28)).padStart(2, '0')}T10:00:00+10:00`);
  const out = []; const months = Math.max(6, Math.round((TODAY - first) / (30.44 * 86400000)));
  const perMonth = km / months; const interval = make === 'Toyota' ? 15000 : 10000;
  let dueKm = interval; let n = 1;
  while (dueKm <= km + interval * 0.15 && n <= 9) {
    const atKm = Math.min(km - between(100, 900), dueKm + between(-900, 1800));
    if (atKm <= 0) break;
    const when = addDays(first, Math.min(months * 30, Math.round(atKm / perMonth * 30.44)));
    if (when > TODAY) break;
    const by = make === 'Toyota' ? pick(TOYOTA_DEALERS) : pick(['Independent workshop', `${make} dealer (Sydney)`]);
    const work = n % 4 === 0 ? 'Major service: oil and filter, brake fluid, cabin filter, spark plugs inspected' : n % 2 === 0 ? 'Logbook service: oil and filter, brake inspection, tyre rotation' : 'Logbook service: oil and filter, multi-point inspection';
    out.push({ date: ymd(when), km: round(atKm, 10), by, work });
    dueKm += interval; n++;
  }
  // Harbourline pre-delivery service for every car
  out.push({ date: ymd(addDays(TODAY, -between(3, 40))), km: round(km - between(0, 60), 10), by: 'Harbourline Toyota (pre-delivery)', work: make === 'Toyota' ? 'Toyota Certified 120-point inspection and pre-delivery service' : 'Pre-delivery inspection and service' });
  return { first, out, interval };
}

function build() {
  const rows = [];
  T.forEach((t, i) => {
    const [modelId, year, grade, variantCode, kmLo, kmHi, price, drive, fuel, engine, x = {}] = t;
    const m = modelId ? model(modelId) : null;
    const make = x.make || 'Toyota'; const modelName = x.model || m.name;
    const km = round(between(kmLo, kmHi), 1);
    const siteId = SITES[(i * 7) % SITES.length];
    const body = x.body || m?.body || 'suv-mid';
    const status = x.status || 'on_lot';
    const daysInStock = status === 'arriving' ? 0 : between(3, i % 5 === 0 ? 95 : 48);
    const arrivedAt = status === 'arriving' ? null : ymd(addDays(TODAY, -daysInStock));
    const { first, out: history, interval } = serviceHistory(year, km, make);
    const lastKm = history.length > 1 ? history[history.length - 2].km : round(km * 0.8, 1000);
    const colourName = modelId ? photoColour[modelId][0] : pick(['Snowflake White', 'Machine Grey', 'Shadow Black', 'Steel Blue', 'Silver Metallic']);
    const certified = make === 'Toyota' ? x.certified !== false : false;
    const owners = x.owners ?? (year >= 2024 ? 1 : between(1, 2));
    const nItems = between(2, 5); const items = [];
    const pool = [...INSPECTION_POOL].filter(([a]) => fuel === 'Hybrid' || fuel === 'Electric' || a !== 'Hybrid');
    for (let k = 0; k < nItems; k++) { const it = pool.splice(Math.floor(rnd() * pool.length), 1)[0]; items.push({ area: it[0], note: it[1], action: it[2] }); }
    const recon = items.filter((it) => it.action !== 'noted').map((it) => ({ item: it.note, cost: it.action === 'replaced' ? between(12, 90) * 10 : between(8, 45) * 10 }));
    const acquiredVia = x.acquiredVia || (make === 'Toyota' ? pick(['trade-in', 'trade-in', 'buy-back', 'auction']) : 'trade-in');
    const ti = acquiredVia === 'trade-in' && make === 'Toyota' ? toyotaTradeIns.find((tr) => tr.model.toLowerCase().startsWith(modelName.toLowerCase().slice(0, 4)) && !rows.some((r) => r.tradeInId === tr.id)) : null;
    const feats = [...FEATURES.common.slice(0, 5), ...(x.features ? FEATURES[x.features].slice(0, 4) : []), ...(/Cruiser|Grande|VX|Sahara|ZR|SL|Rogue|Urban|Atmos|XSE|Premium|SX/i.test(grade) ? FEATURES.upper.slice(0, 6) : FEATURES.upper.slice(6, 8))];
    const warrantyUntil = addDays(first, 365 * 5);
    const warranty = certified ? { type: 'Toyota Certified Pre-Owned', until: ymd(addDays(TODAY, 365)), kmLimit: null, roadside: true, note: warrantyUntil > TODAY ? `plus balance of new-car warranty to ${ymd(warrantyUntil)}` : null }
      : warrantyUntil > TODAY && make === 'Toyota' ? { type: 'Balance of new-car warranty', until: ymd(warrantyUntil), kmLimit: null, roadside: false, note: null }
        : { type: 'Statutory (3 months / 5,000 km)', until: null, kmLimit: 5000, roadside: false, note: null };
    const stockNo = `U-${33000 + i * 3 + between(0, 2)}`;
    const unit = {
      stockNo, vin: vin(i, variantCode), siteId, make, model: modelName, modelId, variantCode, year, grade, gradeId: m?.grades?.find((g) => g.name.toLowerCase() === grade.toLowerCase().split(' ')[0])?.id || null,
      body, bodyLabel: BODY_LABEL[body], colour: colourName, colourId: modelId ? photoColour[modelId][1] : null, interior: /leather|Cruiser|Grande|VX|Sahara|ZR|SL|Rogue|Atmos|Premium/i.test(grade) ? 'Leather-accented, black' : 'Fabric, black',
      km, transmission: x.transmission || 'Automatic', drive, fuel, engine, seats: x.seats || m?.seats || 5, towKg: m?.towKg ?? (body === 'ute' ? 3500 : 1500),
      price, was: x.was || null, certified, demo: Boolean(x.demo), status, etaDays: x.etaDays ?? null, daysInStock, arrivedAt,
      acquiredVia, tradeInId: ti?.id || null, owners, firstRegistered: ymd(first), compliance: ym(addDays(first, -between(20, 70))), regoExpiry: ym(addDays(TODAY, between(60, 330))), plate: plate(), keys: items.some((it) => /Second key/.test(it.note)) ? 2 : between(1, 2), books: true,
      serviceHistory: history, nextServiceDue: { km: round(lastKm + interval, 1000), date: ymd(addDays(new Date(history[history.length - 2]?.date || history[0].date), 365)) },
      inspection: { date: history[history.length - 1].date, inspector: pick(STAFF[siteId]), points: certified ? 120 : 90, passed: true, items, tyresMm: { front: items.some((it) => /Front tyres/.test(it.note)) ? 8 : between(4, 7), rear: between(4, 7) }, brakesPct: { front: items.some((it) => /Front pads/.test(it.note)) ? 100 : between(45, 85), rear: between(50, 90) } },
      ppsr: { checkedAt: ymd(addDays(TODAY, -between(2, 30))), encumbrance: false, writtenOff: false, stolen: false, certificate: `PPSR-${between(10000000, 99999999)}` },
      warranty, features: feats, photo: modelId ? { src: `/api/images/${modelId}.jpg`, thumb: `/api/images/${modelId}/thumb.jpg`, credit: creditOf(modelId) ? `${creditOf(modelId).author}, Wikimedia Commons, ${creditOf(modelId).license}` : null, library: true } : null,
      video: null, reconditioning: recon,
    };
    rows.push(unit);
  });
  // Domo stand-in: market medians by model, grade tier and 2-year band (grade tier keeps
  // a GX from being compared with a Cruiser)
  const tier = (g) => (/Cruiser|Grande|VX|Sahara|ZR|Rogue|Urban|Atmos|XSE|Premium|GTS|Kakadu|SL\b/i.test(g) ? 'top' : /GXL|SX|SR5|XLT|Ascent Sport|Maxx|Active|Hybrid/i.test(g) ? 'mid' : 'base');
  const groups = {};
  for (const r of rows) { const k = `${r.make}|${r.model}|${r.year - (r.year % 2)}|${tier(r.grade)}`; (groups[k] ||= []).push(r); }
  const market = Object.entries(groups).map(([k, ps]) => { const [make, model, y, gradeTier] = k.split('|'); const avg = ps.reduce((s, p) => s + p.price, 0) / ps.length; const med = Math.round(avg * (0.99 + rnd() * 0.08) / 10) * 10; return { make, model, gradeTier, grades: [...new Set(ps.map((p) => p.grade))], yearFrom: Number(y), yearTo: Number(y) + 1, median: med, low: Math.round(med * 0.93 / 10) * 10, high: Math.round(med * 1.08 / 10) * 10, sample: between(6, 48) }; });
  return {
    stock: { generated: ymd(TODAY), priceNote: 'Prices exclude government charges (stamp duty, registration and CTP). Illustrative demo data, not a real offer.', rows },
    market: { dataset: 'used_market_prices', refreshed_at: TODAY.toISOString(), note: 'Stand-in for a Domo dataset of NSW private and dealer asking prices by model and model-year band (demo data).', rows: market },
  };
}

const { stock, market } = build();
const outStock = join(ROOT, 'content/used/stock.json'); const outMarket = join(ROOT, 'content/domo/used_market_prices.json');
if (CHECK) {
  const same = (p, v) => existsSync(p) && readFileSync(p, 'utf8') === JSON.stringify(v, null, 1) + '\n';
  const ok = same(outStock, stock) && same(outMarket, market);
  console.log(ok ? 'used seed: up to date' : 'used seed: DIFFERS from disk'); process.exit(ok ? 0 : 1);
}
mkdirSync(dirname(outStock), { recursive: true });
writeFileSync(outStock, JSON.stringify(stock, null, 1) + '\n');
writeFileSync(outMarket, JSON.stringify(market, null, 1) + '\n');
const bySite = stock.rows.reduce((a, r) => ((a[r.siteId] = (a[r.siteId] || 0) + 1), a), {});
console.log(`wrote ${stock.rows.length} used units (${stock.rows.filter((r) => r.certified).length} Toyota Certified, ${stock.rows.filter((r) => r.photo).length} with photos, ${stock.rows.filter((r) => r.tradeInId).length} linked to DMS trade-ins) by site ${JSON.stringify(bySite)}; ${market.rows.length} market rows`);
