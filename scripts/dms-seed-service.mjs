#!/usr/bin/env node
// dms-seed-service.mjs — deterministic phase 2 seed for the Harbourline DMS
// (docs/DMS-PHASE2-SPEC.md §2): service job cards with memos, photos and documents,
// suppliers, customer memos, support tickets, service staff, and the simulated
// Infomedia data pack.
//
//   node scripts/dms-seed-service.mjs            # writes content/dms/data/{job_cards,memos,suppliers,support_tickets}.json,
//                                                # appends service staff to staff.json and image/invoice rows to documents.json,
//                                                # writes content/dms/infomedia/*.json
//   node scripts/dms-seed-service.mjs --images   # also renders the 12 sample photos (needs the headless Chromium; see renderImages)
//
// Idempotent: rows this script owns carry `seed: "service-v1"` and are replaced on re-run.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'content', 'dms', 'data');
const INFO = join(ROOT, 'content', 'dms', 'infomedia');
const IMG = join(ROOT, 'content', 'dms', 'samples', 'images');
const SEED_TAG = 'service-v1';
const NOW = Date.parse('2026-10-19T09:00:00+11:00');
const DAY = 86400000;

// ── PRNG ─────────────────────────────────────────────────────────────────────
function hash32(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(name) { let a = hash32(`harbourline-service:${name}`); const r = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; return { r, u: (x, y) => x + (y - x) * r(), int: (x, y) => x + Math.floor(r() * (y - x + 1)), chance: (p) => r() < p, pick: (arr) => arr[Math.floor(r() * arr.length)], w(e) { const es = Array.isArray(e) ? e : Object.entries(e); let tot = 0; for (const [, w] of es) tot += w; let x = r() * tot; for (const [v, w] of es) { x -= w; if (x < 0) return v; } return es[es.length - 1][0]; } }; }
const round = (x, s = 1) => Math.round(x / s) * s;
function tzOffset(ms) { const d = new Date(ms); const y = d.getUTCFullYear(); const first = (m) => { for (let k = 1; k <= 7; k++) if (new Date(Date.UTC(y, m - 1, k)).getUTCDay() === 0) return k; return 1; }; return ms < Date.UTC(y, 3, first(4), 3) || ms >= Date.UTC(y, 9, first(10), 2) ? '+11:00' : '+10:00'; }
const iso = (ms) => (ms == null ? null : `${new Date(Math.round(ms / 60000) * 60000).toISOString().slice(0, 19)}${tzOffset(ms)}`);
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
const bizHour = (R, dayMs, lo = 7.5, hi = 16.5) => dayMs - (dayMs % DAY) + Math.round(R.u(lo, hi) * 4) / 4 * 3600000 - 10 * 3600000; // Sydney morning-ish in UTC terms
const isSunday = (ms) => new Date(ms).getUTCDay() === 0;

// ── inputs ───────────────────────────────────────────────────────────────────
const rj = (f) => JSON.parse(readFileSync(join(DATA, f), 'utf8'));
const customers = rj('customers.json'); const deals = rj('deals.json'); const vehicles = rj('vehicles.json'); const staff = rj('staff.json'); const documents = rj('documents.json');
const catalog = JSON.parse(readFileSync(join(ROOT, 'content', 'catalog.json'), 'utf8'));
const MODEL = Object.fromEntries(catalog.models.map((m) => [m.id, m]));
const SITES = ['par', 'hor', 'pen', 'liv'];
const SITE_NAME = { par: 'Parramatta', hor: 'Hornsby', pen: 'Penrith', liv: 'Liverpool' };

// ── service staff ────────────────────────────────────────────────────────────
const SERVICE_STAFF = [
  { id: 'st-svm-par', name: 'Daniel Reyes', role: 'service_manager', title: 'Service manager, group', siteId: null, email: 'service@harbourline.demo' },
  { id: 'st-sa-par', name: 'Hannah Cole', role: 'service_advisor', title: 'Service advisor, Parramatta', siteId: 'par', email: 'hannah.cole@harbourline.demo' },
  { id: 'st-sa-hor', name: 'Marcus Bell', role: 'service_advisor', title: 'Service advisor, Hornsby', siteId: 'hor', email: 'marcus.bell@harbourline.demo' },
  { id: 'st-sa-pen', name: 'Leila Haddad', role: 'service_advisor', title: 'Service advisor, Penrith', siteId: 'pen', email: 'leila.haddad@harbourline.demo' },
  { id: 'st-sa-liv', name: 'Owen Price', role: 'service_advisor', title: 'Service advisor, Liverpool', siteId: 'liv', email: 'owen.price@harbourline.demo' },
  { id: 'st-tech-01', name: 'Sam Okoro', role: 'technician', title: 'Technician, Parramatta', siteId: 'par', email: 'tech1@harbourline.demo' },
  { id: 'st-tech-02', name: 'Yusuf Demir', role: 'technician', title: 'Hybrid specialist, Parramatta', siteId: 'par', email: 'yusuf.demir@harbourline.demo' },
  { id: 'st-tech-03', name: 'Chloe Barrett', role: 'technician', title: 'Technician, Hornsby', siteId: 'hor', email: 'chloe.barrett@harbourline.demo' },
  { id: 'st-tech-04', name: 'Ravi Pillai', role: 'technician', title: 'Technician, Hornsby', siteId: 'hor', email: 'ravi.pillai@harbourline.demo' },
  { id: 'st-tech-05', name: 'Tom Kaczmarek', role: 'technician', title: 'Technician, Penrith', siteId: 'pen', email: 'tom.kaczmarek@harbourline.demo' },
  { id: 'st-tech-06', name: 'Mei Zhang', role: 'technician', title: 'Diesel specialist, Penrith', siteId: 'pen', email: 'mei.zhang@harbourline.demo' },
  { id: 'st-tech-07', name: 'Liam Tuilagi', role: 'technician', title: 'Technician, Liverpool', siteId: 'liv', email: 'liam.tuilagi@harbourline.demo' },
  { id: 'st-tech-08', name: 'Nadia Farah', role: 'technician', title: 'Technician, Liverpool', siteId: 'liv', email: 'nadia.farah@harbourline.demo' },
];
const staffOut = staff.filter((s) => s.seed !== SEED_TAG).concat(SERVICE_STAFF.map((s) => ({ ...s, avatarInitials: s.name.split(' ').map((w) => w[0]).join(''), seed: SEED_TAG })));
const ADVISOR = (site) => `st-sa-${site}`; const TECHS = (site) => SERVICE_STAFF.filter((s) => s.role === 'technician' && s.siteId === site).map((s) => s.id);
const staffName = (id) => staffOut.find((s) => s.id === id)?.name || id;

// ── Infomedia pack (simulated) ───────────────────────────────────────────────
const LABOUR = { par: 189, hor: 185, pen: 179, liv: 182 };
const INTERVALS = [15000, 30000, 45000, 60000, 75000, 90000, 105000, 120000];
const PT = (prefix, n) => `${prefix}-${String(n).padStart(5, '0')}`;
function buildPack() {
  const R = rng('infomedia');
  const parts = []; const partIdx = {};
  const addPart = (partNo, desc, rrp, fits, category, supersedes = null) => { if (!partIdx[partNo]) { partIdx[partNo] = { partNo, desc, supersedes, rrp, dealerPrice: round(rrp * 0.68, 0.5), fits: [...fits], category }; parts.push(partIdx[partNo]); } else for (const f of fits) if (!partIdx[partNo].fits.includes(f)) partIdx[partNo].fits.push(f); return partNo; };
  const menus = [];
  for (const m of catalog.models) {
    const diesel = /diesel/i.test(m.powertrainLabel); const hybrid = m.powertrain === 'hybrid'; const ev = m.powertrain === 'ev' || /electric|kWh/i.test(m.powertrainLabel);
    const fam = m.id.replace(/[^a-z0-9]/g, '').slice(0, 4).toUpperCase(); const base = 1000 + hash32(m.id) % 8000;
    const oil = ev ? null : addPart(PT('04152', base + 1), `Oil filter cartridge, ${m.name}`, diesel ? 38.5 : 24.9, [m.id], 'filters');
    const engineOil = ev ? null : addPart(PT('08880', base + 2), diesel ? 'Engine oil 5W-30 diesel, 7 L' : 'Engine oil 0W-20 full synthetic, 4.5 L', diesel ? 112 : 78, [m.id], 'fluids');
    const cabin = addPart(PT('87139', base + 3), `Cabin air filter, ${m.name}`, 42, [m.id], 'filters');
    const air = ev ? null : addPart(PT('17801', base + 4), `Engine air filter, ${m.name}`, diesel ? 64 : 46, [m.id], 'filters');
    const plugs = ev || diesel ? null : addPart(PT('90919', base + 5), 'Iridium spark plugs, set of 4', 168, [m.id], 'ignition');
    const brakeFluid = addPart(PT('08823', base + 6), 'Brake fluid DOT 4, 1 L', 29, [m.id], 'fluids');
    const wipers = addPart(PT('85212', base + 7), `Wiper blade set, ${m.name}`, 58, [m.id], 'wipers');
    const fuelFilter = diesel ? addPart(PT('23390', base + 8), `Fuel filter, ${m.name} diesel`, 89, [m.id], 'filters') : null;
    const coolant = addPart(PT('08889', base + 9), hybrid || ev ? 'Super long life coolant, pre-mixed 5 L' : 'Long life coolant, pre-mixed 5 L', 54, [m.id], 'fluids');
    const padsF = addPart(PT('04465', base + 10), `Front brake pad set, ${m.name}`, hybrid ? 189 : 156, [m.id], 'brakes');
    const hvFilter = hybrid ? addPart(PT('G9252', base + 11), 'Hybrid battery cooling filter', 36, [m.id], 'hybrid') : null;
    const key = addPart(PT('89904', base + 12), `Smart key, ${m.name} (cut and programmed)`, 420, [m.id], 'keys');
    addPart(PT('PZQ70', base + 13), `Weather shields, ${m.name}, set of 4`, 237, [m.id], 'accessories');
    for (const km of INTERVALS) {
      const major = km % 60000 === 0; const mid = km % 30000 === 0 && !major;
      const ops = [];
      const op = (code, desc, hours) => ops.push({ code, desc, hours: Math.round(hours * 10) / 10 });
      if (ev) { op('EV-INSP', 'High-voltage system inspection and battery state-of-health report', 0.8); op('BRK-INSP', 'Brake inspection, measure pads and rotors', 0.4); op('CAB-FLT', 'Replace cabin air filter', 0.2); op('ROT', 'Rotate tyres, set pressures', 0.3); if (major) { op('COOL', 'Battery and motor coolant replacement', 1.0); op('BRK-FL', 'Brake fluid replacement', 0.6); } }
      else { op('OIL', 'Engine oil and filter replacement', diesel ? 0.6 : 0.5); op('MPI', `${major ? '60' : mid ? '40' : '30'}-point inspection and road test`, major ? 0.8 : 0.5); op('ROT', 'Rotate tyres, set pressures', 0.3); if (km % 30000 === 0) op('CAB-FLT', 'Replace cabin air filter', 0.2); if (km % 30000 === 0 && air) op('AIR-FLT', 'Replace engine air filter', 0.2); if (major) { op('BRK-FL', 'Brake fluid replacement', 0.6); if (plugs && km % 120000 === 0) op('PLUGS', 'Replace spark plugs', 0.8); if (fuelFilter && km % 30000 === 0) op('FUEL-FLT', 'Replace diesel fuel filter and prime', 0.5); if (hybrid) op('HV-CHK', 'Toyota hybrid battery health check', 0.4); } if (km % 90000 === 0) op('COOL', 'Coolant replacement', 0.9); if (diesel && km % 30000 === 0) op('DPF', 'DPF differential pressure check and forced regeneration if required', 0.5); }
      const partsList = [];
      const addP = (p, qty = 1) => p && partsList.push({ partNo: p, desc: partIdx[p].desc, qty, rrp: partIdx[p].rrp });
      if (!ev) { addP(oil); addP(engineOil); } if (km % 30000 === 0) { addP(cabin); if (air) addP(air); } if (major) { addP(brakeFluid); if (plugs && km % 120000 === 0) addP(plugs); if (fuelFilter && km % 30000 === 0) addP(fuelFilter); if (hvFilter) addP(hvFilter); } if (km % 90000 === 0 || (ev && major)) addP(coolant);
      const labourHours = Math.round(ops.reduce((s, o) => s + o.hours, 0) * 10) / 10;
      menus.push({ id: `SSM-${m.id}-${km / 1000}K`, modelId: m.id, make: 'Toyota', model: m.name, yearFrom: 2019, yearTo: 2026, intervalKm: km, intervalMonths: km / 15000 * 12, title: `${km.toLocaleString('en-AU')} km / ${km / 15000 * 12} month ${major ? 'major' : mid ? 'intermediate' : 'logbook'} service`, operations: ops, parts: partsList, labourHours, notes: [hybrid ? 'Hybrid: includes the Toyota Health Check report for the customer.' : null, diesel ? 'Diesel: DPF regeneration may extend the road test by 20 minutes.' : null, 'Toyota Service Advantage capped price applies to the first five services when booked within the schedule.'].filter(Boolean), source: 'Simulated Superservice Menus pack, Toyota Australia schedule (15,000 km / 12 months)' });
    }
  }
  // non-Toyota trade brands: generic menus
  for (const [mid, make, model] of [['mazda-cx-5', 'Mazda', 'CX-5'], ['ford-ranger', 'Ford', 'Ranger'], ['hyundai-i30', 'Hyundai', 'i30'], ['kia-sportage', 'Kia', 'Sportage'], ['subaru-forester', 'Subaru', 'Forester'], ['mitsubishi-outlander', 'Mitsubishi', 'Outlander']]) {
    const base = 1000 + hash32(mid) % 8000;
    const oil = addPart(PT('GEN-OF', base), `Oil filter, ${make} ${model}`, 29, [mid], 'filters'); const eo = addPart(PT('GEN-EO', base + 1), 'Engine oil 5W-30, 5 L', 82, [mid], 'fluids'); const cab = addPart(PT('GEN-CF', base + 2), `Cabin filter, ${make} ${model}`, 39, [mid], 'filters');
    for (const km of [10000, 20000, 30000, 40000, 50000, 60000]) menus.push({ id: `SSM-${mid}-${km / 1000}K`, modelId: mid, make, model, yearFrom: 2016, yearTo: 2024, intervalKm: km, intervalMonths: km / 10000 * 12, title: `${km.toLocaleString('en-AU')} km / ${km / 10000 * 12} month ${km % 40000 === 0 ? 'major' : 'logbook'} service`, operations: [{ code: 'OIL', desc: 'Engine oil and filter replacement', hours: 0.5 }, { code: 'MPI', desc: '30-point inspection and road test', hours: 0.5 }, { code: 'ROT', desc: 'Rotate tyres, set pressures', hours: 0.3 }, ...(km % 20000 === 0 ? [{ code: 'CAB-FLT', desc: 'Replace cabin air filter', hours: 0.2 }] : []), ...(km % 40000 === 0 ? [{ code: 'BRK-FL', desc: 'Brake fluid replacement', hours: 0.6 }] : [])], parts: [{ partNo: oil, desc: partIdx[oil].desc, qty: 1, rrp: partIdx[oil].rrp }, { partNo: eo, desc: partIdx[eo].desc, qty: 1, rrp: partIdx[eo].rrp }, ...(km % 20000 === 0 ? [{ partNo: cab, desc: partIdx[cab].desc, qty: 1, rrp: partIdx[cab].rrp }] : [])], labourHours: km % 40000 === 0 ? 2.1 : km % 20000 === 0 ? 1.5 : 1.3, notes: ['Non-franchise vehicle: menu built from the generic schedule, parts at aftermarket RRP.'], source: 'Simulated generic menu' });
  }
  const campaigns = [
    { id: 'CMP-2026-04', title: 'Fuel pump impeller inspection', kind: 'recall', make: 'Toyota', models: ['rav4', 'kluger', 'camry'], vinFrom: 'JTM', vinTo: 'JTN', yearFrom: 2021, yearTo: 2023, remedy: 'Inspect low-pressure fuel pump; replace if from the affected batch.', hours: 1.2, partsRrp: 0, openedAt: '2026-04-02', status: 'open' },
    { id: 'CMP-2026-07', title: 'Hybrid inverter software update', kind: 'service_campaign', make: 'Toyota', models: ['rav4', 'corolla', 'c-hr', 'corolla-cross'], vinFrom: 'JTM', vinTo: 'JTN', yearFrom: 2022, yearTo: 2024, remedy: 'Reflash the power management ECU to the latest calibration.', hours: 0.6, partsRrp: 0, openedAt: '2026-07-14', status: 'open' },
    { id: 'CMP-2025-11', title: 'DPF pressure sensor hose', kind: 'recall', make: 'Toyota', models: ['hilux', 'prado', 'fortuner'], vinFrom: 'MR0', vinTo: 'MR1', yearFrom: 2020, yearTo: 2022, remedy: 'Replace the DPF differential pressure sensor hose and clear codes.', hours: 0.8, partsRrp: 46, openedAt: '2025-11-20', status: 'open' },
    { id: 'CMP-2026-02', title: 'Rear seat belt pretensioner', kind: 'recall', make: 'Toyota', models: ['landcruiser-300'], vinFrom: 'JTE', vinTo: 'JTF', yearFrom: 2022, yearTo: 2025, remedy: 'Replace the second-row outboard pretensioners.', hours: 1.5, partsRrp: 310, openedAt: '2026-02-10', status: 'open' },
    { id: 'CMP-2025-06', title: 'Steering intermediate shaft', kind: 'service_campaign', make: 'Toyota', models: ['hilux'], vinFrom: 'MR0', vinTo: 'MR1', yearFrom: 2019, yearTo: 2021, remedy: 'Lubricate or replace the intermediate shaft if a clunk is reported.', hours: 1.0, partsRrp: 220, openedAt: '2025-06-01', status: 'closed' },
    { id: 'CMP-2026-09', title: 'Panoramic view monitor camera seal', kind: 'service_campaign', make: 'Toyota', models: ['kluger', 'prado'], vinFrom: 'JTE', vinTo: 'JTF', yearFrom: 2024, yearTo: 2026, remedy: 'Reseal the front camera housing; replace the camera if moisture is present.', hours: 0.7, partsRrp: 0, openedAt: '2026-09-05', status: 'open' },
  ];
  return { menus, parts, campaigns, labour: { gst: 0.1, rates: SITES.map((s) => ({ siteId: s, rate: LABOUR[s], effectiveFrom: '2026-07-01', currency: 'AUD' })) } };
}

// ── suppliers ────────────────────────────────────────────────────────────────
const SUPPLIERS = [
  ['SUP-101', 'Toyota Motor Corporation Australia, Parts', '64 009 686 097', 'parts', 'TMCA parts desk', 'parts.nsw@example.toyota', '(02) 9000 2000', '155 Bertie St, Port Melbourne VIC', '30 days', 5],
  ['SUP-102', 'Southern Cross Auto Accessories Pty Ltd', '53 004 821 000', 'accessories', 'Deb Nguyen', 'orders@example.sca', '(02) 9000 2101', '12 Industry Rd, Smithfield NSW', '30 days', 4],
  ['SUP-103', 'Coastline Tint & Protect Pty Ltd', '86 120 773 560', 'tint-protection', 'Mark Ellis', 'bookings@example.coastline', '(02) 9000 2202', '8 Bay St, Brookvale NSW', '14 days', 4],
  ['SUP-104', 'Bridgestone Select Parramatta', '61 007 516 841', 'tyres', 'Trade desk', 'trade@example.bridgestone', '(02) 9000 2303', '300 Church St, Parramatta NSW', '30 days', 4],
  ['SUP-105', 'Westside Windscreens', '42 611 220 118', 'sublet', 'Kerry Dunn', 'jobs@example.westside', '(02) 9000 2404', '21 Mill Rd, Wetherill Park NSW', '14 days', 3],
  ['SUP-106', 'Penrith Auto Electrical', '19 882 004 310', 'sublet', 'Dave Moore', 'dave@example.pae', '(02) 9000 2505', '5 Lawson St, Penrith NSW', '7 days', 4],
  ['SUP-107', 'Castrol Australia', '51 004 274 335', 'consumables', 'Account team', 'trade@example.castrol', '1300 000 001', 'Melbourne VIC', '30 days', 5],
  ['SUP-108', 'Repco Trade Hornsby', '40 000 040 111', 'parts', 'Trade counter', 'hornsby@example.repco', '(02) 9000 2606', '2 Pacific Hwy, Hornsby NSW', '30 days', 3],
  ['SUP-109', 'Hills Towing & Transport', '77 345 221 009', 'towing', 'Dispatch', 'dispatch@example.hillstow', '(02) 9000 2707', 'Castle Hill NSW', '14 days', 4],
  ['SUP-110', 'Paint Protect Sydney', '28 998 110 554', 'tint-protection', 'Tina Wu', 'tina@example.ppsyd', '(02) 9000 2808', 'Liverpool NSW', '14 days', 3],
  ['SUP-111', 'Hybrid Battery Services NSW', '33 554 870 219', 'sublet', 'Ahmed Saleh', 'service@example.hbs', '(02) 9000 2909', 'Silverwater NSW', '30 days', 5],
  ['SUP-112', 'Liverpool Smash Repairs', '60 123 876 003', 'sublet', 'Front office', 'office@example.lsr', '(02) 9000 3010', 'Moorebank NSW', '30 days', 3],
  ['SUP-113', 'Dunlop Super Dealer Penrith', '83 220 119 004', 'tyres', 'Trade desk', 'penrith@example.dunlop', '(02) 9000 3111', 'Penrith NSW', '30 days', 4],
  ['SUP-114', 'Narva Lighting (NSW distributor)', '21 004 303 410', 'parts', 'Account team', 'nsw@example.narva', '1300 000 002', 'Sydney NSW', '30 days', 4],
  ['SUP-115', 'Clean Fleet Detailing', '48 776 230 118', 'sublet', 'Jess Lane', 'jess@example.cleanfleet', '0400 000 003', 'Mobile, Western Sydney', '7 days', 4],
  ['SUP-116', 'AutoGlass Direct', '92 101 443 227', 'sublet', 'Bookings', 'book@example.autoglass', '1300 000 004', 'Blacktown NSW', '14 days', 3],
  ['SUP-117', 'Toyota Genuine Accessories (TMCA)', '64 009 686 097', 'accessories', 'TMCA accessories', 'accessories@example.toyota', '(02) 9000 2001', 'Port Melbourne VIC', '30 days', 5],
  ['SUP-118', 'Sydney Diesel Specialists', '70 334 992 180', 'sublet', 'Workshop', 'workshop@example.sds', '(02) 9000 3212', 'St Marys NSW', '30 days', 4],
  ['SUP-119', 'Bosch Car Service Hornsby', '15 003 120 097', 'sublet', 'Service desk', 'hornsby@example.bosch', '(02) 9000 3313', 'Hornsby NSW', '14 days', 3],
  ['SUP-120', 'Workshop Supplies Direct', '36 880 211 004', 'consumables', 'Online', 'orders@example.wsd', '1300 000 005', 'Online', '30 days', 4],
  ['SUP-121', 'Key & Lock Automotive', '58 220 390 117', 'parts', 'Counter', 'keys@example.keylock', '(02) 9000 3414', 'Parramatta NSW', '7 days', 4],
  ['SUP-122', 'Western Sydney Loan Cars', '44 219 008 331', 'sublet', 'Fleet desk', 'fleet@example.wslc', '(02) 9000 3515', 'Parramatta NSW', '30 days', 3],
];

// ── job cards ────────────────────────────────────────────────────────────────
const REQUESTS = ['Logbook service', 'Brake noise when stopping', 'Dash warning light on', 'Tyre pressure light keeps coming on', 'Air conditioning not cold', 'Rattle from rear on rough roads', 'Pre-holiday check', 'Windscreen chip repair', 'Wiper blades smearing', 'Battery went flat twice', 'Steering pulls left', 'Rear camera foggy', 'Key fob intermittent', 'Oil leak on driveway', 'Recall letter received', 'Roadworthy inspection for sale', 'Fit tow bar', 'Fit roof racks', 'Noise from engine bay on cold start', 'Check hybrid battery health'];
const FINDINGS = { 'Brake noise when stopping': ['Front pads at 2 mm, rotors within spec; replaced pads and machined rotors.', 'Pad wear indicator contacting; pads 3 mm, recommend replacement at next service.'], 'Dash warning light on': ['Stored code P0420 catalyst efficiency; cleared, road tested, no return. Monitor.', 'Low washer fluid sensor fault; sensor replaced under warranty.'], 'Tyre pressure light keeps coming on': ['Left rear tyre 24 psi, slow puncture from screw; repaired and reset TPMS.'], 'Air conditioning not cold': ['Refrigerant 40% low; dye test, no leak found; regassed and recorded for recheck in 3 months.'], 'Rattle from rear on rough roads': ['Loose cargo blind clip; replaced clip.', 'Exhaust heat shield loose; re-secured with clamp.'], 'Battery went flat twice': ['12V battery failed load test; replaced under warranty.', 'Dash cam hard-wired with no cut-off; advised customer; installed low-voltage cut-off.'], 'Steering pulls left': ['Wheel alignment out of spec after kerb strike; aligned.'], 'Rear camera foggy': ['Moisture in camera housing; replaced under campaign.'], 'Key fob intermittent': ['Fob battery replaced; second key programmed.'], 'Oil leak on driveway': ['Sump plug washer weeping; replaced washer, torqued, no leak after test.', 'Oil cooler O-ring seep; replaced O-ring.'], 'Noise from engine bay on cold start': ['Drive belt glazing; belt replaced.'], 'Check hybrid battery health': ['Toyota Health Check passed; all modules within 0.2 V.'], 'Windscreen chip repair': ['Resin repair completed by Westside Windscreens (sublet).'] };
const IMAGE_SET = [
  ['img-odometer', 'Odometer at check-in', 'odometer'], ['img-front-bumper', 'Front bumper scratch, left corner', 'damage'], ['img-dash-warning', 'Dash warning light (check engine)', 'dash'], ['img-tyre-tread', 'Tyre tread depth, left rear', 'tyre'],
  ['img-brake-pads', 'Front brake pads before replacement', 'before'], ['img-brake-pads-new', 'Front brake pads after replacement', 'after'], ['img-underbody', 'Underbody oil seep at sump plug', 'damage'], ['img-windscreen-chip', 'Windscreen chip, passenger side', 'damage'],
  ['img-battery-test', 'Battery load test printout', 'report'], ['img-alloy-rash', 'Kerb rash, front-left alloy', 'damage'], ['img-cargo', 'Cargo area at check-in', 'condition'], ['img-engine-bay', 'Engine bay inspection', 'condition'],
];

function buildCards(pack) {
  const R = rng('jobcards'); const RM = rng('memos'); const RD = rng('docs');
  const delivered = deals.filter((d) => d.stage === 'delivered' && d.deliveryDate).map((d) => ({ deal: d, veh: vehicles.find((v) => v.stockNo === d.stockNo) || null }));
  const cards = []; const memos = []; const docs = [];
  let n = 20481; let m = 30012; let dn = 2001;
  const start = Date.parse('2024-10-20T00:00:00Z'); const months = 24; const perMonth = 27;
  const memo = (entity, entityId, at, by, kind, text, pinned = false) => memos.push({ id: `M-${m++}`, entity, entityId, at: iso(at), byStaffId: by, kind, text, pinned, seed: SEED_TAG });
  const dayList = [];
  for (let i = 0; i < months * perMonth; i++) dayList.push(start + Math.floor((i / (months * perMonth)) * months * 30.4 * DAY) + R.int(0, 2) * DAY);
  for (let d = -6; d <= 3; d++) for (let k = 0; k < (d <= 0 ? 7 : 4); k++) dayList.push(NOW + d * DAY); // a busy workshop this week and bookings for the next days
  for (const day of dayList) {
    if (isSunday(day)) continue;
    const site = R.pick(SITES);
    const pickDeal = R.chance(0.78) ? R.pick(delivered.filter((x) => x.deal.siteId === site && Date.parse(x.deal.deliveryDate) < day) ) : null;
    let vehicle, customerId;
    if (pickDeal && pickDeal.veh) { const d = pickDeal.deal; const v = pickDeal.veh; const ageDays = (day - Date.parse(d.deliveryDate)) / DAY; vehicle = { vin: v.vin, rego: `${String.fromCharCode(65 + R.int(0, 25))}${String.fromCharCode(65, 65 + R.int(0, 25))[1]}${String.fromCharCode(65 + R.int(0, 25))}${R.int(10, 99)}${String.fromCharCode(65 + R.int(0, 25))}`, make: 'Toyota', model: MODEL[v.model]?.name || v.model, modelId: v.model, year: new Date(Date.parse(d.deliveryDate)).getUTCFullYear(), km: round(Math.max(1200, ageDays * R.u(28, 62)), 10) }; customerId = d.customerId; }
    else { const c = R.pick(customers); const tb = R.pick([['mazda-cx-5', 'Mazda', 'CX-5'], ['ford-ranger', 'Ford', 'Ranger'], ['hyundai-i30', 'Hyundai', 'i30'], ['kia-sportage', 'Kia', 'Sportage'], ['subaru-forester', 'Subaru', 'Forester'], ['mitsubishi-outlander', 'Mitsubishi', 'Outlander'], ['corolla', 'Toyota', 'Corolla'], ['hilux', 'Toyota', 'HiLux'], ['rav4', 'Toyota', 'RAV4']]); const yr = R.int(2016, 2023); vehicle = { vin: `${tb[1] === 'Toyota' ? 'JTM' : 'XX' + tb[1][0]}${hash32(c.id + day).toString(36).toUpperCase().padStart(14, '0').slice(0, 14)}`, rego: `${String.fromCharCode(65 + R.int(0, 25))}${String.fromCharCode(65 + R.int(0, 25))}${String.fromCharCode(65 + R.int(0, 25))}${R.int(10, 99)}${String.fromCharCode(65 + R.int(0, 25))}`, make: tb[1], model: tb[2], modelId: MODEL[tb[0]] ? tb[0] : tb[0], year: yr, km: round((2026 - yr) * R.u(9000, 22000) + R.int(500, 8000), 10) }; customerId = c.id; }
    const advisorId = ADVISOR(site); const technicianId = R.pick(TECHS(site));
    const menus = pack.menus.filter((x) => x.modelId === vehicle.modelId);
    const dueInterval = menus.length ? menus.reduce((best, x) => (Math.abs(x.intervalKm - vehicle.km) < Math.abs(best.intervalKm - vehicle.km) ? x : best), menus[0]) : null;
    const nReq = R.w([[1, 50], [2, 35], [3, 15]]);
    const reqs = []; if (R.chance(0.7) && dueInterval) reqs.push('Logbook service'); while (reqs.length < nReq) { const r = R.pick(REQUESTS); if (!reqs.includes(r)) reqs.push(r); }
    const waiting = R.chance(0.22); const loanCar = !waiting && R.chance(0.18);
    const bookedAt = bizHour(R, day - R.int(1, 9) * DAY, 8, 17); const checkIn = bizHour(R, day, 7.5, 9.5);
    const hoursPlanned = (dueInterval && reqs.includes('Logbook service') ? dueInterval.labourHours : 0) + reqs.filter((r) => r !== 'Logbook service').length * R.u(0.5, 1.6);
    const promisedAt = checkIn + (waiting ? Math.max(1.5, hoursPlanned + 0.5) : R.pick([7, 8, 8.5])) * 3600000;
    // status by age
    const age = (NOW - checkIn) / DAY; let status;
    if (age < 0) status = 'booked'; else if (age < 0.4) status = R.w({ checked_in: 40, in_progress: 60 }); else if (age < 2) status = R.w({ in_progress: 35, awaiting_parts: 20, awaiting_approval: 15, completed: 20, invoiced: 10 }); else if (age < 6) status = R.w({ awaiting_parts: 15, completed: 15, invoiced: 20, collected: 50 }); else status = R.w({ collected: 96, cancelled: 4 });
    const history = [{ status: 'booked', at: iso(bookedAt) }];
    const lines = []; let lid = 1;
    const addLine = (type, code, desc, qty, hours, unitPrice, source, menuId = null, approved = true) => lines.push({ id: `L${lid++}`, type, code, desc, qty, hours, unitPrice, total: round((hours ? hours * LABOUR[site] : unitPrice * qty), 0.01), source, menuId, approved });
    if (dueInterval && reqs.includes('Logbook service')) { addLine('menu', dueInterval.id, dueInterval.title, 1, dueInterval.labourHours, 0, 'menu', dueInterval.id); for (const p of dueInterval.parts) addLine('part', p.partNo, p.desc, p.qty, null, p.rrp, 'menu', dueInterval.id); }
    const findings = [];
    for (const r of reqs.filter((x) => x !== 'Logbook service')) { const f = FINDINGS[r] ? R.pick(FINDINGS[r]) : `${r}: inspected, no fault found; customer advised.`; if (['in_progress', 'awaiting_parts', 'awaiting_approval', 'completed', 'invoiced', 'collected'].includes(status)) findings.push(f); const hrs = Math.round(R.u(0.5, 1.8) * 10) / 10; addLine('labour', 'DIAG', `Diagnose and rectify: ${r}`, 1, hrs, 0, 'manual', null, status !== 'awaiting_approval'); if (/pads|battery|belt|O-ring|washer|clip|blade|sensor/i.test(f)) { const pp = R.pick(pack.parts.filter((p) => p.fits.includes(vehicle.modelId)) .concat(pack.parts.slice(0, 5))); addLine('part', pp.partNo, pp.desc, 1, null, pp.rrp, 'epc', null, status !== 'awaiting_approval'); } if (/sublet|Westside|regassed/i.test(f)) addLine('sublet', 'SUB', `Sublet: ${/Westside/.test(f) ? 'Westside Windscreens' : 'Air-conditioning regas'}`, 1, null, round(R.u(120, 380), 5), 'sublet'); }
    const recallsOpen = pack.campaigns.filter((c) => c.status === 'open' && c.models.includes(vehicle.modelId) && vehicle.year >= c.yearFrom && vehicle.year <= c.yearTo && R.chance(0.5)).map((c) => ({ campaign: c.id, title: c.title }));
    for (const rc of recallsOpen) addLine('labour', rc.campaign, `Campaign: ${rc.title}`, 1, pack.campaigns.find((c) => c.id === rc.campaign).hours, 0, 'manual');
    const labourTotal = round(lines.filter((l) => l.hours).reduce((s, l) => s + l.total, 0), 0.01); const partsTotal = round(lines.filter((l) => !l.hours).reduce((s, l) => s + l.total, 0), 0.01);
    const laborHours = Math.round(lines.reduce((s, l) => s + (l.hours || 0), 0) * 10) / 10;
    const seq = ['checked_in', 'in_progress', 'awaiting_parts', 'awaiting_approval', 'completed', 'invoiced', 'collected'];
    let t = checkIn; const reached = status === 'cancelled' ? ['checked_in'] : status === 'booked' ? [] : seq.slice(0, seq.indexOf(status) + 1).filter((s) => s === status || !['awaiting_parts', 'awaiting_approval'].includes(s) || R.chance(0.3));
    for (const s of reached) { history.push({ status: s, at: iso(t) }); t += (s === 'awaiting_parts' ? R.u(18, 60) : s === 'awaiting_approval' ? R.u(1, 5) : s === 'collected' ? R.u(2, 30) : R.u(0.5, 3)) * 3600000; }
    if (status === 'cancelled') history.push({ status: 'cancelled', at: iso(t) });
    const completedAt = history.find((h) => h.status === 'completed')?.at || null; const collectedAt = history.find((h) => h.status === 'collected')?.at || null;
    const id = `JC-${n++}`;
    const card = { id, siteId: site, customerId, vehicle, advisorId, technicianId: status === 'booked' ? null : technicianId, status, bookedAt: iso(bookedAt), promisedAt: iso(promisedAt), checkedInAt: status === 'booked' ? null : iso(checkIn), completedAt, collectedAt, customerRequests: reqs, findings, recallsOpen, lines, laborHours, partsTotal, labourTotal, total: round(labourTotal + partsTotal, 0.01), loanCar, waiting, infomediaMenuId: dueInterval && reqs.includes('Logbook service') ? dueInterval.id : null, statusHistory: history, createdAt: iso(bookedAt), updatedAt: history[history.length - 1].at, seed: SEED_TAG };
    cards.push(card);
    // memos
    memo('job_card', id, bookedAt, advisorId, 'customer_note', R.pick([`Customer asked for a call before any work over $${R.pick([300, 350, 500])}.`, 'Customer will wait in the lounge; needs the car by 1 pm for school pickup.', 'Customer dropping keys in the after-hours box; call mobile when ready.', 'Loan car requested; licence copy on file.', 'Customer mentioned a noise that only happens cold; try first thing.', 'Please check the spare tyre pressure as well.']), false);
    if (status !== 'booked') memo('job_card', id, checkIn + 600000, advisorId, 'advisor_note', `Checked in at ${vehicle.km.toLocaleString('en-AU')} km. ${waiting ? 'Customer waiting.' : loanCar ? 'Loan car issued.' : 'Customer to collect after 4 pm.'}${recallsOpen.length ? ` Open campaign added: ${recallsOpen[0].title}.` : ''}`);
    if (findings.length) memo('job_card', id, checkIn + 2.5 * 3600000, technicianId, 'tech_note', findings.join(' '), true);
    if (status === 'awaiting_parts') memo('job_card', id, checkIn + 3 * 3600000, advisorId, 'parts_note', `Part on back order with ${R.pick(['TMCA parts', 'Repco Trade', 'Bridgestone'])}; ETA ${R.pick(['tomorrow 10 am', 'Thursday', '2 days'])}. Customer informed by SMS.`);
    if (status === 'awaiting_approval') memo('job_card', id, checkIn + 3 * 3600000, advisorId, 'advisor_note', `Additional work quoted: ${lines.filter((l) => !l.approved).map((l) => l.desc).join('; ')}. Awaiting customer approval by phone.`);
    if (['completed', 'invoiced', 'collected'].includes(status)) memo('job_card', id, Date.parse(completedAt || history[history.length - 1].at), technicianId, 'quality', R.pick(['Road tested 6 km, all good. Wash and vac done.', 'Final check complete; all wheel nuts torqued to 103 Nm.', 'Service reminder sticker and reset done.', 'Customer declined wiper blades; noted for next visit.']));
    // images and documents
    if (status !== 'booked' && RD.chance(0.45)) { const k = RD.int(1, 3); const used = new Set(); for (let j = 0; j < k; j++) { const im = RD.pick(IMAGE_SET); if (used.has(im[0])) continue; used.add(im[0]); docs.push({ id: `DOC-${dn++}`, kind: 'image', dealId: null, customerId, siteId: site, stockNo: null, jobCardId: id, supplierId: null, fileName: `${im[0]}.png`, contentType: 'image/png', title: `${im[1]} (${vehicle.rego})`, caption: im[1], imageKind: im[2], uploadedAt: iso(checkIn + RD.u(0.2, 4) * 3600000), status: 'uploaded', filePath: `content/dms/samples/images/${im[0]}.png`, extracted: {}, confidence: null, verifyFields: [], aragResourceId: null, seed: SEED_TAG }); } }
    if (['completed', 'invoiced', 'collected'].includes(status) && RD.chance(0.3)) docs.push({ id: `DOC-${dn++}`, kind: 'inspection_report', dealId: null, customerId, siteId: site, stockNo: null, jobCardId: id, supplierId: null, fileName: `inspection-${id}.pdf`, contentType: 'application/pdf', title: `Multi-point inspection report ${id}`, uploadedAt: completedAt, status: 'uploaded', extracted: { tyresMm: { fl: RD.int(3, 8), fr: RD.int(3, 8), rl: RD.int(3, 8), rr: RD.int(3, 8) }, brakesPct: { front: RD.int(20, 95), rear: RD.int(30, 95) }, battery: RD.pick(['good', 'good', 'replace soon']) }, confidence: null, verifyFields: [], aragResourceId: null, seed: SEED_TAG });
  }
  return { cards, memos, docs };
}

// ── customer and supplier memos, tickets ─────────────────────────────────────
function extras(cards, memos) {
  const R = rng('extras'); let m = Math.max(...memos.map((x) => Number(x.id.slice(2)))) + 1;
  const memo = (entity, entityId, at, by, kind, text, pinned = false) => memos.push({ id: `M-${m++}`, entity, entityId, at: iso(at), byStaffId: by, kind, text, pinned, seed: SEED_TAG });
  const custIds = [...new Set(cards.map((c) => c.customerId))].filter(() => R.chance(0.5)).slice(0, 320);
  for (const cid of custIds) { const n = R.w([[1, 60], [2, 30], [3, 10]]); for (let i = 0; i < n; i++) { const at = NOW - R.int(2, 600) * DAY; const kind = R.w({ call: 50, credit: 15, sla: 15, advisor_note: 20 }); const text = { call: R.pick(['Called re service reminder; booked for next week.', 'Customer rang about a rattle; advised to bring in Thursday.', 'Left voicemail about recall letter.', 'Called to confirm loan car for Friday.']), credit: R.pick(['Goodwill credit $150 applied after repeat visit for same fault.', 'Credit note for wiper blades charged twice.']), sla: R.pick(['Promised time missed by 45 min on last visit; apologised, free wash next time.', 'Customer prefers SMS over calls.']), advisor_note: R.pick(['Fleet customer: three HiLux on 10,000 km intervals.', 'Prefers early drop-off, usually before 7:30.', 'Has a child seat fitted; do not remove.']) }[kind]; memo('customer', cid, at, R.pick(['st-sa-par', 'st-sa-hor', 'st-sa-pen', 'st-sa-liv']), kind, text, kind === 'sla'); } }
  for (const s of SUPPLIERS) { const n = R.int(2, 5); for (let i = 0; i < n; i++) { const at = NOW - R.int(3, 400) * DAY; const kind = R.w({ call: 45, credit: 20, sla: 20, quality: 15 }); const text = { call: R.pick(['Chased back order; promised Thursday.', 'Confirmed trade pricing for Q4.', 'Rep visit; new catalogue left with parts.']), credit: R.pick(['Credit requested for damaged carton (2 of 4 filters).', 'Short delivery on PO; credit raised.']), sla: R.pick(['Two late deliveries this month; escalated to account manager.', 'Delivery now 10:30 daily; works for the workshop.']), quality: R.pick(['Tint bubbling on one job; redone at no charge.', 'Sublet windscreen repair excellent; customer complimented.']) }[kind]; memo('supplier', s[0], at, 'st-svm-par', kind, text, kind === 'sla'); } }
  const suppliers = SUPPLIERS.map(([id, name, abn, category, contact, email, phone, address, terms, rating]) => ({ id, name, abn, category, contact: { name: contact, email, phone }, address, terms, rating, status: rating <= 3 && R.chance(0.3) ? 'on_hold' : 'active', spend12m: round(R.u(4000, 180000), 100), openInvoices: R.int(0, 6), createdAt: iso(NOW - R.int(200, 900) * DAY), seed: SEED_TAG }));
  const RT = rng('tickets'); const questions = ['How do I reset my password?', 'Why is this lead read-only for me?', 'Where did the document I uploaded go?', 'How do I move a job card back to in progress?', 'Where do I see the Domo signals?', 'The Infomedia quote does not match the invoice', 'How do I request a discount approval?', 'Can I delete a memo?', 'How do I give a customer a loan car on a job card?', 'Why does the finder show a different price?', 'How do I export leads to a spreadsheet?', 'Who can publish a promotion?', 'How do I add a second key to a stock unit?', 'How do I see which deals are stuck in finance?', 'What does "awaiting approval" mean on a job card?'];
  const tickets = Array.from({ length: 40 }, (_, i) => { const at = NOW - RT.int(1, 120) * DAY; const role = RT.pick(['salesperson', 'service_advisor', 'technician', 'finance', 'sales_manager']); return { id: `T-${1001 + i}`, userEmail: `${role}${RT.int(1, 9)}@harbourline.demo`, role, page: RT.pick(['#/leads', '#/deals', '#/job-cards', '#/documents', '#/promotions', '#/stock', '#/insights']), question: RT.pick(questions), answerId: null, status: RT.w({ closed: 80, answered: 15, open: 5 }), createdAt: iso(at), closedAt: iso(at + RT.u(0.5, 30) * 3600000), resolution: RT.pick(['Pointed to the manual chapter; no call needed.', 'Answered by the help assistant on the second try.', 'Needed a manager to change the permission.', 'Bug: fixed in the next deploy.']), seed: SEED_TAG }; });
  return { suppliers, tickets };
}

// ── images (SVG "photos", rendered with the headless Chromium if available) ──
function imageSvgs() {
  const R = rng('images');
  return IMAGE_SET.map(([id, caption, kind]) => { const hue = { odometer: 210, damage: 15, dash: 230, tyre: 30, before: 20, after: 140, report: 200, condition: 100 }[kind] ?? 200; const stamp = `2026-${String(R.int(1, 10)).padStart(2, '0')}-${String(R.int(1, 28)).padStart(2, '0')} ${String(R.int(7, 16)).padStart(2, '0')}:${String(R.int(0, 59)).padStart(2, '0')}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640"><defs><radialGradient id="g" cx="40%" cy="35%" r="80%"><stop offset="0" stop-color="hsl(${hue},40%,62%)"/><stop offset="1" stop-color="hsl(${hue},45%,18%)"/></radialGradient></defs><rect width="960" height="640" fill="url(#g)"/><g opacity=".25" fill="#000"><ellipse cx="480" cy="520" rx="380" ry="70"/></g>${kind === 'odometer' ? `<rect x="280" y="250" width="400" height="140" rx="16" fill="#101418" stroke="#2b3240" stroke-width="6"/><text x="480" y="340" font-family="monospace" font-size="72" fill="#9ff0a8" text-anchor="middle">${R.int(12000, 98000).toLocaleString('en-AU')} km</text>` : kind === 'dash' ? `<rect x="240" y="230" width="480" height="180" rx="24" fill="#0c0f14"/><text x="480" y="340" font-size="84" fill="#ffb020" text-anchor="middle">⚠ ⛽ ⚙</text>` : kind === 'tyre' ? `<circle cx="480" cy="330" r="190" fill="#1a1a1a"/><circle cx="480" cy="330" r="118" fill="#555"/><text x="480" y="560" font-family="sans-serif" font-size="44" fill="#fff" text-anchor="middle">tread ${R.int(3, 8)} mm</text>` : `<path d="M180 400 C 220 300, 320 240, 480 240 S 740 300, 780 400 L 780 440 L 180 440 Z" fill="hsl(${hue},25%,30%)" stroke="#fff" stroke-opacity=".4" stroke-width="4"/><circle cx="300" cy="440" r="48" fill="#111"/><circle cx="660" cy="440" r="48" fill="#111"/><circle cx="${R.int(330, 630)}" cy="${R.int(300, 400)}" r="34" fill="none" stroke="#ff3b3b" stroke-width="8"/>`}<text x="24" y="612" font-family="sans-serif" font-size="26" fill="#fff" fill-opacity=".85">${caption} · sample photo · ${stamp}</text><text x="936" y="36" font-family="sans-serif" font-size="20" fill="#fff" fill-opacity=".6" text-anchor="end">Harbourline Toyota · workshop</text></svg>`;
    return { id, caption, kind, svg }; });
}
async function renderImages() {
  mkdirSync(IMG, { recursive: true });
  const svgs = imageSvgs();
  for (const s of svgs) writeFileSync(join(IMG, `${s.id}.svg`), s.svg);
  const exe = process.env.CHROME_EXE; let rendered = 0;
  try {
    const { chromium } = await import(process.env.PLAYWRIGHT_DIR ? join(process.env.PLAYWRIGHT_DIR, 'playwright', 'index.mjs') : 'playwright');
    const browser = await chromium.launch(exe ? { executablePath: exe } : {}); const page = await (await browser.newContext({ viewport: { width: 960, height: 640 } })).newPage();
    for (const s of svgs) { await page.setContent(`<html><body style="margin:0">${s.svg}</body></html>`); await page.screenshot({ path: join(IMG, `${s.id}.png`), clip: { x: 0, y: 0, width: 960, height: 640 } }); rendered++; }
    await browser.close();
  } catch (e) { console.warn(`images: PNG render skipped (${e.message.split('\n')[0]}); SVGs written`); }
  writeFileSync(join(IMG, 'manifest.json'), JSON.stringify(svgs.map(({ svg, ...r }) => ({ ...r, file: `${r.id}.png`, svg: `${r.id}.svg`, note: 'Generated sample photo, not a real vehicle' })), null, 1) + '\n');
  return rendered;
}

// ── main ─────────────────────────────────────────────────────────────────────
const pack = buildPack();
const { cards, memos, docs } = buildCards(pack);
const { suppliers, tickets } = extras(cards, memos);
// documents: replace rows from this seed, link the two supplier invoices
const docsOut = documents.filter((d) => d.seed !== SEED_TAG).map((d) => (d.kind === 'supplier_invoice' ? { ...d, supplierId: /Southern Cross/.test(d.title || '') ? 'SUP-102' : /Coastline/.test(d.title || '') ? 'SUP-103' : d.supplierId || null, jobCardId: d.jobCardId || null } : { ...d, jobCardId: d.jobCardId || null, supplierId: d.supplierId || null })).concat(docs);
mkdirSync(INFO, { recursive: true });
writeFileSync(join(DATA, 'job_cards.json'), JSON.stringify(cards, null, 1) + '\n');
writeFileSync(join(DATA, 'memos.json'), JSON.stringify(memos, null, 1) + '\n');
writeFileSync(join(DATA, 'suppliers.json'), JSON.stringify(suppliers, null, 1) + '\n');
writeFileSync(join(DATA, 'support_tickets.json'), JSON.stringify(tickets, null, 1) + '\n');
writeFileSync(join(DATA, 'staff.json'), JSON.stringify(staffOut, null, 1) + '\n');
writeFileSync(join(DATA, 'documents.json'), JSON.stringify(docsOut, null, 1) + '\n');
writeFileSync(join(INFO, 'service_menus.json'), JSON.stringify({ pack: 'Simulated Infomedia Superservice Menus', refreshedAt: '2026-10-01', note: 'Our own shape; Infomedia does not publish its formats. Figures illustrative.', menus: pack.menus }, null, 1) + '\n');
writeFileSync(join(INFO, 'parts_prices.json'), JSON.stringify({ pack: 'Simulated Microcat EPC price file', refreshedAt: '2026-10-01', currency: 'AUD', parts: pack.parts }, null, 1) + '\n');
writeFileSync(join(INFO, 'labour_rates.json'), JSON.stringify(pack.labour, null, 1) + '\n');
writeFileSync(join(INFO, 'campaigns.json'), JSON.stringify({ pack: 'Simulated campaign and recall feed', refreshedAt: '2026-10-01', campaigns: pack.campaigns }, null, 1) + '\n');
writeFileSync(join(INFO, 'README.md'), `# Simulated Infomedia data pack\n\nWhat a Toyota dealer licenses from Infomedia, as we model it (see docs/DMS-PHASE2-SPEC.md §6). Infomedia does not publish its formats; this shape is ours and every figure is illustrative.\n\n- service_menus.json: ${pack.menus.length} VIN-era service menus (model × interval) with operations, labour hours and parts at RRP.\n- parts_prices.json: ${pack.parts.length} parts with RRP, dealer price, supersession and fitment.\n- labour_rates.json: retail labour rate per site and GST.\n- campaigns.json: ${pack.campaigns.length} campaigns and recalls by model, year and VIN prefix.\n\nIngested into the knowledge box with topic/infomedia and model labels by scripts/ingest-dms-phase2.mjs. Quote = menu hours × site rate + parts RRP + GST (server/dms/infomedia.mjs).\n`);
const rendered = process.argv.includes('--images') ? await renderImages() : 0;
const open = cards.filter((c) => !['collected', 'cancelled'].includes(c.status)).length;
console.log(`job cards ${cards.length} (${open} open; today's board: ${Object.entries(cards.filter((c) => !['collected', 'cancelled', 'booked'].includes(c.status)).reduce((a, c) => ((a[c.status] = (a[c.status] || 0) + 1), a), {})).map(([k, v]) => `${k} ${v}`).join(', ')}), memos ${memos.length}, suppliers ${suppliers.length}, tickets ${tickets.length}, documents +${docs.length} (images ${docs.filter((d) => d.kind === 'image').length}), staff +${SERVICE_STAFF.length}, pack: ${pack.menus.length} menus, ${pack.parts.length} parts, ${pack.campaigns.length} campaigns${process.argv.includes('--images') ? `, images rendered ${rendered}` : ''}`);
