#!/usr/bin/env node
// dms-seed.mjs — deterministic seed data for the Harbourline DMS (docs/DMS-SPEC.md §2).
//
//   node scripts/dms-seed.mjs            generate content/dms/data/*.json, README.md and content/dms/domo-datasets.json
//   node scripts/dms-seed.mjs --check    sanity report + integrity checks over the files on disk (no writes)
//   options: --seed=<string> (default harbourline-dms-v1), --quiet
//
// No dependencies. One seeded PRNG stream per generation phase (mulberry32 over a string
// hash), so the same seed and code always produce byte-identical files.
//
// How the history is simulated (all times are Sydney wall-clock, written as ISO with
// +10:00/+11:00 offsets that follow NSW daylight saving):
//   1. Leads arrive day by day from 15 Oct 2024 to 14 Oct 2026 per site, scaled by
//      month seasonality (June EOFY and December peaks, January dip), weekday shape
//      (Saturday heavy, Sunday web/phone only), a 7%/yr trend, campaigns and, from
//      March 2025, configurator test-drive bookings.
//   2. Each lead runs a funnel (contact → qualify → test drive → quote → desk → finance →
//      manager approval → contract → delivery) whose probabilities and durations depend
//      on channel and on the salesperson (close rate, discounting, speed, F&I attach).
//      Every planned timestamp is then observed at 14 Oct 2026 08:00, which is what
//      makes open leads/deals, booked test drives and pending finance fall out naturally.
//   3. Won deals are fulfilled from stock, from an allocated inbound unit or by factory
//      order (order-bank ETAs). From-stock retail deliveries in the last 90 days match
//      content/domo/dealer_signals.json sales90d per model exactly, so days-of-supply
//      maths agrees with the Domo stand-in. The 22 configurator units are copied unchanged.
//   4. Gross: front = vehiclePrice − discount − landedCost + accessory margin − promotion
//      cost − trade over-allowance; back = finance commission + insurance/warranty products.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDescriptors, readme } from './dms-schema.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'content', 'dms', 'data');
const ARGS = process.argv.slice(2);
const SEED = (ARGS.find((a) => a.startsWith('--seed=')) || '--seed=harbourline-dms-v1').slice(7);
const QUIET = ARGS.includes('--quiet');
const readJson = (p, fb) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fb);

if (ARGS.includes('--check')) {
  if (!existsSync(join(OUT, 'deals.json'))) { console.error('content/dms/data is empty: run `node scripts/dms-seed.mjs` first'); process.exit(2); }
  const { runCheck } = await import('./dms-check.mjs');
  process.exit((await runCheck(ROOT)) ? 1 : 0);
}

// ── PRNG ─────────────────────────────────────────────────────────────────────
function hash32(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function rng(name) {
  const r = mulberry32(hash32(`${SEED}:${name}`));
  const R = {
    r,
    u: (a, b) => a + (b - a) * r(),
    int: (a, b) => a + Math.floor(r() * (b - a + 1)),
    chance: (p) => r() < p,
    pick: (a) => a[Math.floor(r() * a.length)],
    w(entries) { // [[value, weight]] or {value: weight}
      const e = Array.isArray(entries) ? entries : Object.entries(entries);
      let tot = 0; for (const [, w] of e) tot += Math.max(0, w);
      let x = r() * tot; for (const [v, w] of e) { x -= Math.max(0, w); if (x < 0) return v; }
      return e[e.length - 1][0];
    },
    norm(m = 0, s = 1) { const u = 1 - r(), v = r(); return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); },
    logn(median, sigma) { return median * Math.exp(R.norm(0, sigma)); },
    poisson(l) { if (l <= 0) return 0; const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; },
    shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
    sample(a, n) { return R.shuffle(a.slice()).slice(0, n); },
    code(n, alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789') { let s = ''; for (let i = 0; i < n; i++) s += alpha[Math.floor(r() * alpha.length)]; return s; },
  };
  return R;
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const round = (x, step = 1) => Math.round(x / step) * step;

// ── time (local Sydney wall clock held as UTC ms) ───────────────────────────
const DAY = 864e5, HOUR = 36e5, MIN = 6e4;
const L = (y, m, d, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi);
const NOW = L(2026, 10, 14, 8, 0);
const START = L(2024, 10, 15);
const WARM = L(2024, 6, 1); // pipeline warm-up: leads from here so deliveries are at run-rate by 15 Oct 2024; pre-START records are dropped unless they close inside the window
const CONFIG_LAUNCH = L(2025, 3, 3);
function firstSunday(y, m) { for (let d = 1; d <= 7; d++) if (new Date(L(y, m, d)).getUTCDay() === 0) return d; return 1; }
function tzOffset(ms) { const y = new Date(ms).getUTCFullYear(); return ms < L(y, 4, firstSunday(y, 4), 3) || ms >= L(y, 10, firstSunday(y, 10), 2) ? '+11:00' : '+10:00'; }
const iso = (ms) => { if (ms == null) return null; const m = Math.round(ms / MIN) * MIN; return `${new Date(m).toISOString().slice(0, 19)}${tzOffset(m)}`; };
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
const ym = (ms) => ymd(ms).slice(0, 7);
const dow = (ms) => new Date(ms).getUTCDay();
const monthOf = (ms) => new Date(ms).getUTCMonth() + 1;
const yearOf = (ms) => new Date(ms).getUTCFullYear();
const dayStart = (ms) => ms - (((ms % DAY) + DAY) % DAY);
const hourOf = (ms) => (ms - dayStart(ms)) / HOUR;
const HOLIDAYS = new Set(['2024-12-25', '2024-12-26', '2025-01-01', '2025-01-27', '2025-04-18', '2025-04-21', '2025-04-25', '2025-06-09', '2025-10-06', '2025-12-25', '2025-12-26', '2026-01-01', '2026-01-26', '2026-04-03', '2026-04-06', '2026-06-08', '2026-10-05']);
const isOpen = (ms) => dow(ms) !== 0 && !HOLIDAYS.has(ymd(ms));
function bizClock(R, day, sat = dow(day) === 6) { // a showroom time on that day, 15-min grid
  const h = sat ? R.w([[8.5, 3], [9.5, 4], [10.5, 4], [11.5, 3], [12.5, 2], [13.5, 2], [14.5, 1.5], [15.5, 1]]) : R.w([[8.5, 1], [9.5, 2], [10.5, 3], [11.5, 3], [12.5, 2], [13.5, 3], [14.5, 3], [15.5, 2.5], [16.5, 1.5]]);
  return dayStart(day) + (h + R.int(0, 3) * 0.25) * HOUR;
}
function toBiz(R, ms) { // move a timestamp into showroom hours on an open day
  let d = dayStart(ms), h = hourOf(ms);
  if (isOpen(d) && h >= 8.5 && h < 17.25) return ms;
  if (h >= 17.25 || !isOpen(d)) d += DAY;
  while (!isOpen(d)) d += DAY;
  return bizClock(R, d);
}
const addDays = (R, ms, a, b) => toBiz(R, ms + R.u(a, b) * DAY);
const days = (a, b) => (b - a) / DAY;

// ── reference data ──────────────────────────────────────────────────────────
const CAT = readJson(join(ROOT, 'content', 'catalog.json'));
const STOCK = readJson(join(ROOT, 'content', 'domo', 'stock_by_site.json'));
// Calibration baseline: the Domo stand-in published with the configurator (dealer_signals.json as of
// 14 Oct 2026 02:00). Embedded so the seed is stable even after the API recomputes that file.
const SIGNALS = { month: '2026-10', rows: [
  ['rav4', 6, 9, 60, 5, 2, 52, 1500], ['kluger', 2, 3, 60, 14, 6, 61, 2400], ['prado', 2, 10, 18, 2, 1, 28, 0], ['landcruiser-300', 1, 3, 30, 1, 0, 44, 0],
  ['hilux', 2, 4, 45, 6, 5, 59, 1500], ['camry', 2, 3, 60, 3, 1, 58, 900], ['corolla-cross', 2, 8, 23, 4, 0, 10, 300], ['yaris-cross', 1, 5, 18, 3, -1, 15, 200],
  ['c-hr', 1, 1, 90, 2, 1, 60, 700], ['bz4x', 2, 2, 90, 2, 2, 35, 600], ['corolla', 1, 4, 23, 2, 0, 22, 250], ['fortuner', 0, 1, 0, 1, 1, 0, 0],
  ['gr-yaris', 0, 1, 0, 0, 0, 0, 0], ['gr-corolla', 0, 0, 0, 0, 0, 0, 0], ['gr86', 0, 1, 0, 1, 0, 0, 0],
].map(([model, unitsInStock, sales90d, daysOfSupply, allocationNextMonth, targetGap, avgDaysInStock, marginHeadroomAvg]) => ({ model, unitsInStock, sales90d, daysOfSupply, allocationNextMonth, targetGap, avgDaysInStock, marginHeadroomAvg })) };
const ORDER_BANK = readJson(join(ROOT, 'content', 'domo', 'order_bank_eta.json'), { rows: [] });
const PROMOS_NOW = readJson(join(ROOT, 'content', 'dealer', 'promotions.json'), { promotions: [] }).promotions;
const INCENTIVES = readJson(join(ROOT, 'content', 'dealer', 'incentives.json'), { incentives: [] }).incentives;
const CALENDAR = readJson(join(ROOT, 'content', 'dealer', 'calendar.json'), { sites: [] });
const LIVE_BOOKINGS = readJson(join(ROOT, 'content', 'dealer', 'bookings.json'), { bookings: [] }).bookings || [];
const LIVE_EVENTS = existsSync(join(ROOT, 'content', 'dealer', 'events.jsonl'))
  ? readFileSync(join(ROOT, 'content', 'dealer', 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];

const MODELS = Object.fromEntries(CAT.models.map((m) => [m.id, m]));
const COLOUR = Object.fromEntries(CAT.colours.map((c) => [c.id, c]));
const INTERIOR = Object.fromEntries(CAT.interiors.map((c) => [c.id, c]));
const PACK = Object.fromEntries(CAT.accessories.map((c) => [c.id, c]));
const gradeOf = (m, g) => MODELS[m].grades.find((x) => x.id === g);
const SIG = Object.fromEntries(SIGNALS.rows.map((r) => [r.model, r]));
const currentUnitsById = Object.fromEntries(STOCK.rows.map((u) => [u.id, u]));
const ETA = Object.fromEntries(ORDER_BANK.rows.map((r) => [r.model, r]));

const SITE_IDS = ['par', 'hor', 'pen', 'liv'];
const SITE_META = {
  par: { share: 0.34, gpuTarget: 4300 },
  hor: { share: 0.2, gpuTarget: 4500 },
  pen: { share: 0.24, gpuTarget: 4400 },
  liv: { share: 0.22, gpuTarget: 3900 },
};

const SUBURBS = {
  par: [['Parramatta', '2150', 6], ['Harris Park', '2150', 3], ['North Parramatta', '2151', 3], ['Westmead', '2145', 3], ['Wentworthville', '2145', 3], ['Granville', '2142', 3], ['Merrylands', '2160', 4], ['Northmead', '2152', 2], ['Rydalmere', '2116', 2], ['Ermington', '2115', 2], ['Toongabbie', '2146', 3], ['Baulkham Hills', '2153', 4], ['Castle Hill', '2154', 4], ['Seven Hills', '2147', 3], ['Carlingford', '2118', 2], ['Dundas', '2117', 1], ['Epping', '2121', 2], ['Kellyville', '2155', 3], ['Blacktown', '2148', 4]],
  hor: [['Hornsby', '2077', 6], ['Waitara', '2077', 3], ['Asquith', '2077', 2], ['Normanhurst', '2076', 2], ['Wahroonga', '2076', 3], ['Thornleigh', '2120', 3], ['Pennant Hills', '2120', 3], ['Westleigh', '2120', 1], ['Beecroft', '2119', 2], ['Cherrybrook', '2126', 3], ['Turramurra', '2074', 2], ['Mount Colah', '2079', 2], ['Berowra', '2081', 2], ['Dural', '2158', 1], ['Galston', '2159', 1], ['Epping', '2121', 2], ['Castle Hill', '2154', 2]],
  pen: [['Penrith', '2750', 6], ['Jamisontown', '2750', 2], ['Emu Plains', '2750', 3], ['Kingswood', '2747', 3], ['Cambridge Park', '2747', 2], ['Werrington', '2747', 2], ['Glenmore Park', '2745', 3], ['Mulgoa', '2745', 1], ['St Marys', '2760', 3], ['St Clair', '2759', 2], ['Erskine Park', '2759', 2], ['Mount Druitt', '2770', 3], ['Blaxland', '2774', 2], ['Springwood', '2777', 2], ['Richmond', '2753', 2], ['Windsor', '2756', 2], ['Jordan Springs', '2747', 2]],
  liv: [['Liverpool', '2170', 6], ['Casula', '2170', 3], ['Moorebank', '2170', 3], ['Prestons', '2170', 3], ['Chipping Norton', '2170', 2], ['Hoxton Park', '2171', 2], ['Green Valley', '2168', 3], ['Edmondson Park', '2174', 3], ['Cabramatta', '2166', 4], ['Fairfield', '2165', 3], ['Bonnyrigg', '2177', 3], ['Wetherill Park', '2164', 2], ['Leppington', '2179', 2], ['Austral', '2179', 2], ['Ingleburn', '2565', 2], ['Campbelltown', '2560', 2]],
};

// Name pools by background; weights per site reflect each catchment.
const NAMES = {
  anglo: { f: ['Olivia', 'Charlotte', 'Amelia', 'Isla', 'Mia', 'Ava', 'Grace', 'Chloe', 'Emily', 'Sophie', 'Lucy', 'Hannah', 'Jessica', 'Sarah', 'Rebecca', 'Kate', 'Megan', 'Tegan', 'Brooke', 'Kylie', 'Leanne', 'Michelle', 'Karen', 'Julie', 'Natalie', 'Ruby', 'Zoe', 'Georgia', 'Ellie', 'Tahlia'], m: ['Jack', 'Oliver', 'William', 'Noah', 'Thomas', 'James', 'Lachlan', 'Cooper', 'Riley', 'Mitchell', 'Ben', 'Liam', 'Ethan', 'Josh', 'Matt', 'Daniel', 'Luke', 'Ryan', 'Brendan', 'Craig', 'Shane', 'Darren', 'Scott', 'Glenn', 'Wayne', 'Hamish', 'Angus', 'Harrison', 'Toby', 'Callum'], l: ['Smith', 'Jones', 'Williams', 'Brown', 'Wilson', 'Taylor', 'Johnson', 'White', 'Martin', 'Anderson', 'Thompson', 'Walker', 'Harris', 'Ryan', 'Kelly', "O'Brien", 'Murphy', 'Mitchell', 'Campbell', 'Robinson', 'Clarke', 'Hughes', 'Cooper', 'Walsh', 'McDonald', 'Fraser', 'Gallagher', 'Doyle', 'Bennett', 'Henderson', 'Turner', 'Edwards', 'Morgan', 'Hayes', 'Byrne', 'Lynch'] },
  arabic: { f: ['Fatima', 'Layla', 'Maryam', 'Zainab', 'Rania', 'Nour', 'Sara', 'Yasmin', 'Hana', 'Amira', 'Lina', 'Rima'], m: ['Mohammed', 'Ahmad', 'Ali', 'Omar', 'Hassan', 'Bilal', 'Khaled', 'Jihad', 'Tony', 'Charbel', 'Elias', 'Sami', 'Youssef', 'Hussein', 'Rami', 'George'], l: ['Haddad', 'Khoury', 'Nassar', 'Saleh', 'Hamdan', 'El-Masri', 'Abboud', 'Fakhoury', 'Mansour', 'Rahme', 'Tannous', 'Habib', 'Chahine', 'Daher', 'Issa', 'Karam', 'Moussa', 'Sleiman'] },
  vietnamese: { f: ['Linh', 'Thao', 'Mai', 'Lan', 'Hoa', 'Ngoc', 'Trang', 'Huong', 'Anh', 'Vy'], m: ['Minh', 'Tuan', 'Duc', 'Hung', 'Khanh', 'Quang', 'Long', 'Bao', 'Thanh', 'Huy'], l: ['Nguyen', 'Tran', 'Le', 'Pham', 'Huynh', 'Vo', 'Dang', 'Bui', 'Do', 'Ngo', 'Truong', 'Ly'] },
  chinese: { f: ['Wei', 'Jing', 'Mei', 'Xin', 'Yan', 'Ling', 'Hui', 'Jenny', 'Grace', 'Vivian', 'Cindy', 'Angela'], m: ['Wei', 'Jun', 'Hao', 'Ming', 'Lei', 'Kevin', 'Jason', 'Eric', 'Peter', 'Michael', 'Tony', 'Zhi'], l: ['Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhao', 'Wu', 'Zhou', 'Lin', 'Chan', 'Wong', 'Lee', 'Cheung', 'Tan'] },
  indian: { f: ['Priya', 'Ananya', 'Deepa', 'Kavya', 'Sneha', 'Pooja', 'Divya', 'Harpreet', 'Simran', 'Neha', 'Lakshmi', 'Aisha'], m: ['Arjun', 'Rahul', 'Vikram', 'Sanjay', 'Amit', 'Rohan', 'Harpreet', 'Gurpreet', 'Karan', 'Nikhil', 'Suresh', 'Ravi', 'Aditya', 'Manish'], l: ['Sharma', 'Patel', 'Singh', 'Kumar', 'Gupta', 'Reddy', 'Iyer', 'Nair', 'Mehta', 'Kaur', 'Desai', 'Rao', 'Pillai', 'Chopra', 'Sandhu', 'Gill', 'Bhatt', 'Menon'] },
  filipino: { f: ['Maria', 'Kristine', 'Joy', 'Grace', 'Rowena', 'Cherry', 'Jasmine', 'Angelica'], m: ['Jose', 'Mark', 'Paolo', 'Rommel', 'Jerome', 'Carlo', 'Miguel', 'Ramon'], l: ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Garcia', 'Mendoza', 'Villanueva', 'Dela Cruz', 'Castillo', 'Aquino'] },
  mediterranean: { f: ['Sophia', 'Elena', 'Maria', 'Angela', 'Christina', 'Giulia', 'Despina', 'Francesca'], m: ['Nick', 'Con', 'George', 'Peter', 'Marco', 'Luca', 'Steve', 'Anthony', 'Dimitri', 'Sam'], l: ['Papadopoulos', 'Georgiou', 'Nikolaidis', 'Rossi', 'Russo', 'Romano', 'Costa', 'Ferraro', 'Esposito', 'Vlahos', 'Karras', 'Marino'] },
  pacific: { f: ['Losana', 'Mele', 'Ana', 'Sina', 'Litia', 'Sela'], m: ['Sione', 'Tevita', 'Viliami', 'Semisi', 'Iosefa', 'Malakai'], l: ['Fifita', 'Tupou', 'Vaipulu', 'Taufa', 'Faleolo', 'Leota', 'Mapu', 'Havili'] },
  korean: { f: ['Ji-woo', 'Soo-jin', 'Min-ji', 'Hye-jin', 'Eun-ji'], m: ['Min-jun', 'Ji-hoon', 'Dong-hyun', 'Sung-min', 'Hyun-woo'], l: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang'] },
};
const BACKGROUND = {
  par: { anglo: 30, arabic: 10, vietnamese: 4, chinese: 14, indian: 22, filipino: 6, mediterranean: 6, pacific: 3, korean: 5 },
  hor: { anglo: 46, arabic: 3, vietnamese: 2, chinese: 22, indian: 12, filipino: 3, mediterranean: 5, pacific: 1, korean: 6 },
  pen: { anglo: 56, arabic: 5, vietnamese: 3, chinese: 4, indian: 10, filipino: 8, mediterranean: 6, pacific: 7, korean: 1 },
  liv: { anglo: 26, arabic: 18, vietnamese: 16, chinese: 6, indian: 12, filipino: 7, mediterranean: 7, pacific: 7, korean: 1 },
};
const EMAIL_DOMAINS = [['example.com.au', 6], ['example.net.au', 3], ['example.com', 2], ['mail.example.org', 1]];

// Model demand: group weights and per-site skew (Penrith utes/4x4, Hornsby families/EV, Liverpool small cars).
const MODEL_W = { rav4: 22, hilux: 14, 'corolla-cross': 9, prado: 9, 'yaris-cross': 7, corolla: 7, kluger: 7, 'landcruiser-300': 5, camry: 5, 'c-hr': 3, bz4x: 3, fortuner: 3, gr86: 1.4, 'gr-yaris': 0.9, 'gr-corolla': 0.6 };
const SITE_SKEW = {
  par: { 'corolla-cross': 1.2, 'c-hr': 1.2, camry: 1.1 },
  hor: { kluger: 1.5, rav4: 1.15, bz4x: 1.9, camry: 1.1, hilux: 0.55, fortuner: 0.6, 'c-hr': 1.2 },
  pen: { hilux: 1.6, prado: 1.4, 'landcruiser-300': 1.4, fortuner: 1.6, bz4x: 0.5, corolla: 0.8, gr86: 1.3 },
  liv: { corolla: 1.4, camry: 1.3, hilux: 1.2, 'yaris-cross': 1.2, kluger: 0.9 },
};
const BUSINESS_MODEL_W = { hilux: 10, rav4: 3, 'corolla-cross': 1.5, camry: 2, corolla: 1, 'landcruiser-300': 1, prado: 1, kluger: 1 };
const GRADE_W = { hilux: { workmate: 2.2, sr: 2.4, sr5: 3.2, rogue: 1, 'rugged-x': 0.9 }, 'landcruiser-300': { gx: 0.8, gxl: 2.2, vx: 1.6, sahara: 1.2, 'sahara-zx': 0.5, 'gr-sport': 0.6 }, prado: { gx: 1, gxl: 2.6, vx: 1.8, altitude: 0.8, kakadu: 0.9 } };
const COLOUR_W = { 'glacier-white': 22, 'frosted-white': 14, 'silver-sky': 10, graphite: 18, 'eclipse-black': 14, 'saturn-blue': 8, 'atomic-rush': 6, 'jungle-khaki': 6, 'dusty-bronze': 5 };
const SEASON = { 1: 0.74, 2: 0.93, 3: 1.06, 4: 0.94, 5: 1.12, 6: 1.32, 7: 0.86, 8: 0.95, 9: 0.98, 10: 1.0, 11: 1.06, 12: 1.12 };
const WEEKDAY = [0.45, 1.0, 0.95, 0.95, 1.0, 0.97, 1.4];
const trend = (t) => 1 + 0.07 * (t - START) / (365 * DAY);
function seasonAt(t) { const m = monthOf(t), d = new Date(t).getUTCDate(); let s = SEASON[m]; if (m === 12 && d >= 22) s *= 0.5; if (m === 1 && d <= 5) s *= 0.6; if (m === 6 && d >= 20) s *= 1.15; return s; }
const priceFactor = (t) => 1 - 0.022 * (NOW - t) / (365 * DAY);

const VIN_PREFIX = { rav4: 'JTMW', kluger: '5TDB', prado: 'JTEB', hilux: 'MR0H', camry: 'JTNB', 'corolla-cross': 'JTDA', 'yaris-cross': 'JTDK', bz4x: 'JTMA', 'landcruiser-300': 'JTMH', corolla: 'JTDB', 'c-hr': 'JTPA', fortuner: 'MR0B', 'gr-yaris': 'JTNK', 'gr-corolla': 'JTNC', gr86: 'JF1Z' };

// ── staff ───────────────────────────────────────────────────────────────────
// close: deal/test-drive conversion multiplier · disc: discount multiplier · speed: first-response multiplier (lower = faster)
// fin: F&I attach multiplier · w: lead-allocation weight · since: start date
const STAFF_DEF = [
  ['st-gm', 'Rachel Moore', 'gm', 'par', 'gm@harbourline.demo'],
  ['st-sm-par', 'Luke Harris', 'sales_manager', 'par', 'sm.par@harbourline.demo'],
  ['st-sm-hor', 'Grace Lin', 'sales_manager', 'hor', 'sm.hor@harbourline.demo'],
  ['st-sm-pen', 'Tony Haddad', 'sales_manager', 'pen', 'sm.pen@harbourline.demo'],
  ['st-sm-liv', 'Linh Tran', 'sales_manager', 'liv', 'sm.liv@harbourline.demo'],
  ['st-sp-01', 'Josh Pereira', 'salesperson', 'par', 'sales1@harbourline.demo', { close: 1.05, disc: 1.1, speed: 0.8, fin: 1.0, w: 0.5, since: L(2026, 6, 1) }],
  ['st-sp-02', 'Priya Natarajan', 'salesperson', 'par', 'sales2@harbourline.demo', { close: 1.24, disc: 0.82, speed: 0.7, fin: 1.15, w: 1.15 }],
  ['st-sp-03', 'Ben Whitfield', 'salesperson', 'par', 'sales3@harbourline.demo', { close: 0.8, disc: 1.35, speed: 1.4, fin: 0.85, w: 0.9, since: L(2025, 7, 7) }],
  ['st-sp-04', 'Mia Thompson', 'salesperson', 'par', 'sales4@harbourline.demo', { close: 1.07, disc: 1.0, speed: 0.9, fin: 1.25, w: 1.0 }],
  ['st-sp-05', 'Samuel Adeyemi', 'salesperson', 'par', 'sales5@harbourline.demo', { close: 0.95, disc: 1.05, speed: 0.55, fin: 0.95, w: 1.0 }],
  ['st-sp-06', 'Sophie Gallagher', 'salesperson', 'hor', 'sales6@harbourline.demo', { close: 1.13, disc: 0.95, speed: 0.85, fin: 1.1, w: 1.0 }],
  ['st-sp-07', 'James Liu', 'salesperson', 'hor', 'sales7@harbourline.demo', { close: 1.0, disc: 0.78, speed: 1.0, fin: 1.0, w: 1.0 }],
  ['st-sp-08', 'Ben Kowalski', 'salesperson', 'hor', 'sales8@harbourline.demo', { close: 0.86, disc: 1.15, speed: 1.3, fin: 0.9, w: 0.95 }],
  ['st-sp-09', 'Jake Morrison', 'salesperson', 'pen', 'sales9@harbourline.demo', { close: 1.16, disc: 0.9, speed: 0.9, fin: 1.05, w: 1.1 }],
  ['st-sp-10', 'Aaron Fifita', 'salesperson', 'pen', 'sales10@harbourline.demo', { close: 0.9, disc: 1.2, speed: 1.1, fin: 0.9, w: 0.95, since: L(2025, 2, 3) }],
  ['st-sp-11', 'Kylie Brennan', 'salesperson', 'pen', 'sales11@harbourline.demo', { close: 1.02, disc: 1.0, speed: 0.75, fin: 1.2, w: 1.0 }],
  ['st-sp-12', 'Ali Hamdan', 'salesperson', 'liv', 'sales12@harbourline.demo', { close: 1.1, disc: 1.3, speed: 0.8, fin: 0.95, w: 1.05 }],
  ['st-sp-13', 'Grace Nguyen', 'salesperson', 'liv', 'sales13@harbourline.demo', { close: 1.05, disc: 0.9, speed: 0.9, fin: 1.1, w: 1.0 }],
  ['st-sp-14', 'Nick Papadopoulos', 'salesperson', 'liv', 'sales14@harbourline.demo', { close: 0.84, disc: 1.1, speed: 1.5, fin: 0.85, w: 0.95 }],
  ['st-dxm', 'Ella Marsh', 'dxm', 'par', 'marketing@harbourline.demo'],
  ['st-bm-par', 'Steven Park', 'finance', 'par', 'finance@harbourline.demo', { fin: 1.1 }],
  ['st-bm-hor', 'Bianca Russo', 'finance', 'hor', 'fin.hor@harbourline.demo', { fin: 1.0 }],
  ['st-bm-pen', 'Raj Mehta', 'finance', 'pen', 'fin.pen@harbourline.demo', { fin: 1.05 }],
  ['st-bm-liv', 'Fiona Walsh', 'finance', 'liv', 'fin.liv@harbourline.demo', { fin: 0.9 }],
];
const TITLES = { gm: 'General manager', sales_manager: 'Sales manager', salesperson: 'Sales consultant', dxm: 'Digital experience manager', finance: 'Business manager (F&I)' };
const STAFF = STAFF_DEF.map(([id, name, role, siteId, email, k = {}]) => ({ id, name, role, title: TITLES[role], siteId, email, avatarInitials: name.split(' ').map((p) => p[0]).join('').toUpperCase(), phone: null, startedAt: k.since || L(2019 + (hash32(id) % 5), 1 + (hash32(id) % 11), 3 + (hash32(name) % 20)), k: { close: 1, disc: 1, speed: 1, fin: 1, w: 1, ...k } }));
const STAFF_BY = Object.fromEntries(STAFF.map((s) => [s.id, s]));
const SALES = (site) => STAFF.filter((s) => s.role === 'salesperson' && s.siteId === site);
const MANAGER = (site) => STAFF.find((s) => s.role === 'sales_manager' && s.siteId === site);
const BM = (site) => STAFF.find((s) => s.role === 'finance' && s.siteId === site);
STAFF.forEach((s, i) => { s.phone = `(02) 9000 ${1100 + SITE_IDS.indexOf(s.siteId) * 100 + 10 + i}`; });

// ── promotions (history + the current register) ────────────────────────────
const PROMO_HISTORY = [
  ['promo-2024-summer-rav4', 'RAV4 Hybrid GX and GXL: $1,000 off drive-away', 'drive-away', 1000, '2024-11-01', '2025-01-31', { models: ['rav4'] }, 'dealer_signals: RAV4 days of supply 71 at Parramatta and Liverpool', 'policy/incentive-approval §2 drive-away offers'],
  ['promo-2024-xmas-servicing', 'Complimentary 3-year servicing on Camry and Corolla', 'servicing', 975, '2024-11-15', '2024-12-31', { models: ['camry', 'corolla'] }, 'aged_stock_actions: 7 sedans over 60 days', 'policy/incentive-approval §4 servicing'],
  ['promo-2025-q1-small-finance', 'Reduced-rate Toyota Finance on Corolla and Corolla Cross', 'finance', null, '2025-02-01', '2025-03-31', { models: ['corolla', 'corolla-cross'] }, 'dealer_signals: small-car target gap 9 units', 'policy/finance-offers §1'],
  ['promo-2025-eofy-hilux', 'EOFY HiLux SR5: $2,000 Genuine accessories', 'accessory-bundle', 2000, '2025-05-01', '2025-06-30', { models: ['hilux'] }, 'dealer_signals: HiLux target gap 14 units for June', 'policy/incentive-approval §3 accessory bundles'],
  ['promo-2025-eofy-tradein', 'EOFY trade-in bonus $1,500', 'trade-in', 1500, '2025-05-12', '2025-06-30', { models: null }, 'targets: group June target 98 units', 'policy/trade-in-appraisal §5 bonuses'],
  ['promo-2025-eofy-prado-tow', 'Prado: Towing Pack fitted free', 'accessory-bundle', 1650, '2025-05-01', '2025-06-30', { models: ['prado'] }, 'order_bank_eta: Prado allocation brought forward', 'policy/incentive-approval §3 accessory bundles'],
  ['promo-2025-winter-kluger', 'Kluger Hybrid: $1,000 accessories bundle', 'accessory-bundle', 1000, '2025-07-07', '2025-08-31', { models: ['kluger'] }, 'dealer_signals: Kluger avgDaysInStock 63', 'policy/incentive-approval §3 accessory bundles'],
  ['promo-2025-bz4x-charger', '$1,000 towards a home wallbox', 'accessory-bundle', 1000, '2025-08-01', '2025-10-31', { models: ['bz4x'] }, 'dealer_signals: bZ4X days of supply 120', 'policy/ev-sales §2 charging'],
  ['promo-2025-spring-camry', 'Camry: complimentary 3-year servicing', 'servicing', 975, '2025-09-01', '2025-10-31', { models: ['camry'] }, 'aged_stock_actions: Camry SL over 70 days', 'policy/incentive-approval §4 servicing'],
  ['promo-2025-xmas-yaris', 'Yaris Cross GX: $1,200 off drive-away', 'drive-away', 1200, '2025-11-10', '2025-12-24', { models: ['yaris-cross'] }, 'dealer_signals: Yaris Cross target gap 6', 'policy/incentive-approval §2 drive-away offers'],
  ['promo-2025-xmas-delivery', 'Delivered before Christmas or $500 fuel card', 'delivery', 500, '2025-11-17', '2025-12-23', { models: null }, 'targets: December target 92 units', 'policy/delivery-promise §1'],
  ['promo-2026-q1-aged-rav4', 'Aged RAV4: complimentary 3-year servicing', 'servicing', 975, '2026-01-12', '2026-03-31', { models: ['rav4'], aged: true }, 'aged_stock_actions: 5 RAV4 over 60 days', 'policy/incentive-approval §4 servicing'],
  ['promo-2026-gr86-track', 'GR86: Sydney Motorsport Park track day', 'experience', 600, '2026-03-01', '2026-05-31', { models: ['gr86', 'gr-yaris', 'gr-corolla'] }, 'dealer_signals: GR range days of supply 95', 'policy/incentive-approval §6 experiences'],
  ['promo-2026-eofy-hilux', 'EOFY HiLux: $2,500 Genuine accessories', 'accessory-bundle', 2500, '2026-05-01', '2026-06-30', { models: ['hilux'] }, 'dealer_signals: HiLux target gap 16 units for June', 'policy/incentive-approval §3 accessory bundles'],
  ['promo-2026-eofy-tradein', 'EOFY trade-in bonus $1,500', 'trade-in', 1500, '2026-05-11', '2026-06-30', { models: null }, 'targets: group June target 104 units', 'policy/trade-in-appraisal §5 bonuses'],
  ['promo-2026-winter-chr', 'C-HR Hybrid: reduced-rate Toyota Finance', 'finance', null, '2026-07-01', '2026-09-30', { models: ['c-hr'] }, 'dealer_signals: C-HR days of supply 90', 'policy/finance-offers §1'],
  ['promo-2026-xmas-delivery', 'Delivered before Christmas or $500 fuel card', 'delivery', 500, '2026-11-16', '2026-12-23', { models: null }, 'targets: December plan 96 units', 'policy/delivery-promise §1'],
];
const PROMO_DOMO_NOW = { 'promo-tsa-aged': 'aged_stock_actions: HL-2231 (94 d), HL-1941 (110 d), HL-2104 (67 d)', 'promo-kluger-accessories': 'dealer_signals: Kluger allocationNextMonth 14, targetGap 6', 'promo-tradein-aged': 'aged_stock_actions: 6 units over 60 days', 'promo-towing-pack': 'dealer_signals: HiLux targetGap 5, Prado and LandCruiser towing demand', 'promo-door-delivery': 'stock_by_site: 21 units on lot', 'promo-small-hybrid-finance': 'dealer_signals: small hybrid SUVs within target, finance support available', 'promo-bz4x-wallbox': 'stock_by_site: HL-2577 52 days at Hornsby', 'promo-hl2399-tub': 'aged_stock_actions: HL-2399 88 days, priority 4' };
const ld = (s, end = false) => { const [y, m, d] = s.split('-').map(Number); return end ? L(y, m, d, 23, 59) : L(y, m, d, 0, 0); };
const PROMOTIONS = [
  ...PROMO_HISTORY.map(([id, title, kind, value, s, e, ap, domo, kb]) => ({ id, title, kind, value, source: { domo, kb }, startsAt: ld(s), endsAt: ld(e, true), appliesTo: { models: ap.models ?? null, units: null, aged: !!ap.aged, bodies: null }, history: true })),
  ...PROMOS_NOW.map((p, i) => ({ id: p.id, title: p.title, kind: p.kind, value: p.value, source: { domo: PROMO_DOMO_NOW[p.id] || 'dealer_signals', kb: 'policy/incentive-approval' }, startsAt: L(2026, 9, 15 + (i % 3) * 7), endsAt: ld(p.validUntil, true), appliesTo: p.appliesTo, short: p.short, desc: p.desc, reason: p.reason })),
];
const promoCost = (p) => (p.value == null ? (p.kind === 'finance' ? 400 : 0) : p.kind === 'accessory-bundle' ? round(p.value * 0.62, 10) : p.kind === 'experience' ? round(p.value * 0.8, 10) : p.value);

// ── campaigns ───────────────────────────────────────────────────────────────
// [name, channel, audience, start, end, promoIds, sent, siteIds|null, budget, leadTarget]
const CAMPAIGN_DEF = [
  ['Spring RAV4 Hybrid drive-away', 'email', 'Prospects database: RAV4/Kluger enquirers in last 12 months', '2024-11-04', '2024-11-30', ['promo-2024-summer-rav4'], 14200, null, 3800, 34],
  ['Christmas sedan servicing offer', 'sms', 'Service customers with a 2016-2019 Camry or Corolla', '2024-11-25', '2024-12-20', ['promo-2024-xmas-servicing'], 3100, null, 1200, 16],
  ['New year, new hybrid', 'social', 'Meta lookalike: Western Sydney, 30-55, family interests', '2025-01-13', '2025-02-16', [], 0, null, 6500, 22],
  ['Corolla Cross finance offer', 'email', 'Small-car enquirers and service customers with cars 6+ years old', '2025-02-10', '2025-03-23', ['promo-2025-q1-small-finance'], 18800, null, 2900, 30],
  ['Configurator launch', 'web', 'harbourline.com.au visitors (site takeover + Google Ads)', '2025-03-03', '2025-04-13', [], 0, null, 9000, 26],
  ['EOFY tradie HiLux', 'email', 'ABN holders and fleet accounts', '2025-05-05', '2025-06-27', ['promo-2025-eofy-hilux', 'promo-2025-eofy-tradein'], 6400, ['pen', 'liv', 'par'], 4200, 44],
  ['EOFY trade-in bonus', 'sms', 'Service customers with cars 7+ years old', '2025-05-19', '2025-06-27', ['promo-2025-eofy-tradein'], 9200, null, 2600, 38],
  ['Winter Kluger family', 'social', 'Meta and YouTube: Hills and Hornsby families', '2025-07-07', '2025-08-24', ['promo-2025-winter-kluger'], 0, ['hor', 'par'], 7200, 24],
  ['bZ4X home charging', 'email', 'EV-interested prospects (finder power = ev, bZ4X viewers)', '2025-08-11', '2025-09-28', ['promo-2025-bz4x-charger'], 4100, null, 1500, 12],
  ['Spring Camry servicing', 'email', 'Rideshare and fleet contacts, Camry service customers', '2025-09-08', '2025-10-19', ['promo-2025-spring-camry'], 7300, ['liv', 'par'], 1400, 14],
  ['Delivered before Christmas', 'email', 'Open quotes and configurator bookers with no deal', '2025-11-17', '2025-12-19', ['promo-2025-xmas-delivery', 'promo-2025-xmas-yaris'], 11600, null, 2400, 36],
  ['Yaris Cross summer social', 'social', 'Instagram: first-car buyers and parents, 18-24 / 45-60', '2025-11-24', '2025-12-21', ['promo-2025-xmas-yaris'], 0, ['liv', 'par'], 5600, 18],
  ['Aged RAV4 servicing', 'sms', 'RAV4 enquirers with no deal in 90 days', '2026-01-19', '2026-03-15', ['promo-2026-q1-aged-rav4'], 2800, null, 900, 17],
  ['GR track day', 'social', 'Enthusiast interests, GR viewers in the configurator', '2026-03-09', '2026-05-17', ['promo-2026-gr86-track'], 0, null, 3800, 9],
  ['EOFY 2026 tradie HiLux', 'email', 'ABN holders and fleet accounts', '2026-05-04', '2026-06-26', ['promo-2026-eofy-hilux', 'promo-2026-eofy-tradein'], 7100, ['pen', 'liv', 'par'], 4600, 48],
  ['EOFY 2026 trade-in bonus', 'sms', 'Service customers with cars 7+ years old', '2026-05-18', '2026-06-26', ['promo-2026-eofy-tradein'], 10400, null, 2900, 40],
  ['C-HR finance winter', 'web', 'harbourline.com.au + configurator offer slot', '2026-07-06', '2026-09-27', ['promo-2026-winter-chr'], 0, null, 3200, 13],
  ['Aged stock: servicing and trade bonus', 'email', 'Configurator bookers and RAV4/Kluger enquirers, last 120 days', '2026-09-21', '2026-10-31', ['promo-tsa-aged', 'promo-tradein-aged'], 5200, null, 1100, 14],
];

// ── catalogue helpers ───────────────────────────────────────────────────────
function pickModel(R, site, business) {
  if (business) return R.w(BUSINESS_MODEL_W);
  return R.w(Object.entries(MODEL_W).map(([m, w]) => [m, w * (SITE_SKEW[site][m] || 1)]));
}
function pickGrade(R, model) {
  const gs = MODELS[model].grades;
  const ov = GRADE_W[model];
  return R.w(gs.map((g, i) => [g.id, ov ? (ov[g.id] ?? 1) : [1.1, 1.5, 1.0, 0.7, 0.5, 0.4][i] ?? 0.4]));
}
const pickColour = (R, model) => R.w(MODELS[model].colours.map((c) => [c, COLOUR_W[c] || 4]));
function pickInterior(R, model, grade) {
  const m = MODELS[model], g = gradeOf(model, grade);
  if (g.leather || !m.interiors.includes('fabric-black')) return m.interiors.includes('leather-tan') && R.chance(0.35) ? 'leather-tan' : 'leather-black';
  return 'fabric-black';
}
function pickPacks(R, model, business) {
  const a = MODELS[model].accessories, out = [];
  const towP = { hilux: 0.55, prado: 0.6, 'landcruiser-300': 0.55, fortuner: 0.5, kluger: 0.35, rav4: 0.15 }[model] ?? 0.05;
  if (a.includes('tow') && R.chance(business ? towP + 0.2 : towP)) out.push('tow');
  if (a.includes('protection') && R.chance(0.3)) out.push('protection');
  if (a.includes('roof') && R.chance(model === 'hilux' && business ? 0.3 : 0.08)) out.push('roof');
  return out;
}
const specPrice = (s) => gradeOf(s.model, s.grade).price + (COLOUR[s.colour]?.price || 0) + (INTERIOR[s.interior]?.price || 0) + s.packs.reduce((t, p) => t + (PACK[p]?.price || 0), 0);
// NSW on-road costs (stamp duty 3% to $45k then 5%, plus rego, CTP and plates)
const onRoad = (p) => round(0.03 * Math.min(p, 45000) + 0.05 * Math.max(0, p - 45000) + 1380, 10);
// vehicle price ex on-roads: the catalogue's drive-away estimate (dated by priceFactor) less on-roads
const listPriceAt = (s, t) => { const da = specPrice(s) * priceFactor(t); return round(da - onRoad(da * 0.955), 10); };
function landedFor(R, list) { // dealer cost: list less a model-scaled retail margin
  const margin = list <= 100000 ? 1050 + list * 0.031 : 1050 + 3100 + (list - 100000) * 0.012;
  return round(list - margin * R.u(0.93, 1.07), 10);
}
const DEMAND = { prado: 0.25, 'landcruiser-300': 0.15, 'gr-yaris': 0.4, 'gr-corolla': 0.3, gr86: 0.6, bz4x: 1.9, 'c-hr': 1.4, camry: 1.15, kluger: 1.1, hilux: 1.05 };

const DEALER_ACC = {
  _all: [['acc-tint', 'Window tint (35%)', 495, 3], ['acc-paint', 'Paint and interior protection', 1290, 3], ['acc-mats', 'Rubber floor mats', 210, 2], ['acc-dashcam', 'Front and rear dash cam', 450, 1.2], ['acc-weathershields', 'Weathershields', 320, 1]],
  hilux: [['acc-canopy', 'Aluminium tool canopy', 4800, 1.2], ['acc-tub', 'Tub liner and tie-down kit', 690, 2.5], ['acc-nudge', 'Nudge bar', 1450, 1.2], ['acc-bullbar', 'Steel bull bar', 2950, 0.8], ['acc-sidesteps', 'Side steps', 640, 1]],
  prado: [['acc-bullbar', 'Alloy bull bar', 3250, 1], ['acc-awning', 'Side awning', 890, 0.8], ['acc-tbrake', 'Electric brake controller', 520, 1.2]],
  'landcruiser-300': [['acc-bullbar', 'Alloy bull bar', 3450, 1], ['acc-tbrake', 'Electric brake controller', 520, 1.2], ['acc-awning', 'Side awning', 890, 0.6]],
  fortuner: [['acc-bullbar', 'Steel bull bar', 2950, 0.8], ['acc-tbrake', 'Electric brake controller', 520, 1]],
  kluger: [['acc-cargo', 'Cargo barrier', 790, 1.2], ['acc-tbrake', 'Electric brake controller', 520, 0.6]],
  rav4: [['acc-cargo', 'Cargo liner and barrier', 690, 1.2], ['acc-bike', 'Roof bike carrier', 380, 0.6]],
  bz4x: [['acc-wallbox', '7 kW home wallbox (installed)', 1950, 3]],
};

// ── people ──────────────────────────────────────────────────────────────────
const people = [];
function personName(R, site) {
  const bg = R.w(BACKGROUND[site]); const pool = NAMES[bg]; const female = R.chance(0.48);
  return { bg, first: R.pick(female ? pool.f : pool.m), last: R.pick(pool.l) };
}
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
const usedEmail = new Set(), usedPhone = new Set();
function emailFor(R, first, last, company) {
  for (let i = 0; i < 20; i++) {
    const f = slug(first), l = slug(last);
    const local = company ? R.pick(['accounts', 'fleet', 'admin', `${f}`, `${f}.${l}`]) : R.w([[`${f}.${l}`, 5], [`${f}${l}`, 2], [`${f[0]}${l}`, 2], [`${f}.${l}${R.int(1, 99)}`, 3], [`${f}_${l}`, 1], [`${l}.${f}`, 1], [`${f}${R.int(70, 99)}`, 1]]);
    const dom = company ? `${slug(company).slice(0, 18)}.example.com.au` : R.w(EMAIL_DOMAINS);
    const e = `${local}@${dom}`;
    if (!usedEmail.has(e)) { usedEmail.add(e); return e; }
  }
  const e = `${slug(first)}.${slug(last)}.${usedEmail.size}@example.com.au`; usedEmail.add(e); return e;
}
function phoneFor(R, landline) { // ACMA fiction ranges: mobiles 0491 57x xxx, Sydney landlines (02) 5550 xxxx
  for (;;) { const n = R.int(0, 9999); const p = landline ? `(02) 5550 ${String(n).padStart(4, '0')}` : `0491 57${R.int(0, 9)} ${String(R.int(0, 999)).padStart(3, '0')}`; if (!usedPhone.has(p)) { usedPhone.add(p); return p; } }
}
function newPerson(R, site, t, opts = {}) {
  const { bg, first, last } = personName(R, site);
  const [suburb, postcode] = R.w(SUBURBS[site].map(([s, p, w]) => [[s, p], w]));
  const p = { pid: people.length, site, bg, first, last, company: opts.company || null, business: !!opts.company, email: null, phone: null, suburb, postcode, firstAt: t, lastAt: t, busyUntil: t, delivered: 0, owner: null, anon: !!opts.anon, leads: [] };
  if (!p.anon) { p.email = emailFor(R, first, last, p.company); p.phone = p.business && R.chance(0.4) ? phoneFor(R, true) : phoneFor(R, false); }
  people.push(p); return p;
}
const BIZ_PLACE = ['Nepean', 'Hawkesbury', 'Cumberland', 'Hills District', 'Westside', 'Prospect', 'Georges River', 'Macarthur', 'Blue Mountains', 'Parra', 'Ku-ring-gai', 'Liverpool', 'Emu Plains', 'Two Rivers', 'Southern Cross', 'Greenway'];
const BIZ_TRADE = ['Plumbing', 'Electrical', 'Landscapes', 'Concreting', 'Roofing', 'Air Conditioning', 'Building Group', 'Fencing', 'Pest Control', 'Tiling', 'Earthmoving', 'Security Services', 'Property Maintenance', 'Community Care', 'Couriers', 'Glass & Glazing', 'Solar', 'Turf Supplies'];

// ── finder answers / configurator ───────────────────────────────────────────
function finderFor(R, model, grade, business) {
  const m = MODELS[model], tags = new Set(m.tags), price = gradeOf(model, grade).price;
  const a = {};
  a.use = business || model === 'hilux' && R.chance(0.6) ? 'work' : tags.has('off-road') && R.chance(0.6) ? 'adventure' : tags.has('performance') ? R.w({ commute: 1, adventure: 1 }) : tags.has('family') && R.chance(0.7) ? 'family' : 'commute';
  a.people = m.seats >= 7 ? (R.chance(0.7) ? 'seven' : 'five') : m.seats <= 4 ? 'two' : R.w({ five: 3, two: 1 });
  if (a.use === 'work') a.worktype = R.w({ trade: 5, farm: 1, fleet: 1 });
  if (a.use === 'adventure') a.terrain = R.w({ gravel: 2, offroad: tags.has('off-road') ? 3 : 0.2, sealed: 1 });
  a.distance = R.w({ short: 2, medium: 3, long: tags.has('touring') ? 2.5 : 1 });
  a.towing = m.towKg >= 3000 ? R.w({ heavy: 3, medium: 2, light: 1, none: 1 }) : m.towKg >= 1500 ? R.w({ medium: 1, light: 2, none: 3 }) : R.w({ light: m.towKg > 0 ? 1 : 0, none: 6 });
  a.power = m.powertrain === 'ev' ? 'ev' : m.powertrain === 'diesel' ? R.w({ diesel: 3, any: 1 }) : m.powertrain === 'hybrid' ? R.w({ hybrid: 3, any: 1 }) : 'any';
  a.priorities = R.w({ safety: 3, efficiency: m.powertrain === 'hybrid' ? 3 : 1, tech: 2, style: tags.has('style') || tags.has('performance') ? 3 : 1 });
  const high = a.people === 'seven' || a.towing === 'heavy' || a.use === 'work' || a.use === 'adventure';
  a.budget = high ? (price < 60000 ? 'b60' : price < 80000 ? 'b80' : price < 110000 ? 'b110' : 'b160') : (price < 40000 ? 'b40' : price < 55000 ? 'b55' : price < 75000 ? 'b75' : 'b100');
  a.when = R.w({ now: 3, month: 4, flexible: 2 });
  const order = ['use', 'people', 'worktype', 'terrain', 'distance', 'towing', 'power', 'priorities', 'budget', 'when'];
  return order.filter((k) => a[k] && (['use', 'budget', 'when'].includes(k) || R.chance(0.85))).map((id) => ({ id, value: a[id] }));
}
const SIMILAR = { rav4: ['kluger', 'corolla-cross', 'bz4x'], kluger: ['prado', 'rav4'], prado: ['landcruiser-300', 'fortuner', 'kluger'], 'landcruiser-300': ['prado'], hilux: ['fortuner', 'prado'], camry: ['corolla', 'rav4'], 'corolla-cross': ['rav4', 'yaris-cross', 'c-hr'], 'yaris-cross': ['corolla-cross', 'corolla'], corolla: ['yaris-cross', 'camry', 'corolla-cross'], 'c-hr': ['corolla-cross', 'rav4'], bz4x: ['rav4', 'c-hr'], fortuner: ['prado', 'hilux'], 'gr-yaris': ['gr-corolla', 'gr86'], 'gr-corolla': ['gr-yaris'], gr86: ['gr-yaris'] };
function pickIncentive(answers, modelIds) {
  const A = Object.fromEntries(answers.map((a) => [a.id, a.value]));
  const tags = new Set(modelIds.flatMap((m) => MODELS[m].tags)), pts = new Set(modelIds.map((m) => MODELS[m].powertrain));
  for (const inc of [...INCENTIVES].sort((a, b) => b.priority - a.priority)) {
    for (const r of inc.rules) {
      let ok = false, reason = r.reason;
      if (r.answer && A[r.answer] && r.values[A[r.answer]]) { ok = true; reason = reason.replace('{phrase}', r.values[A[r.answer]]); }
      else if (r.viewedTag && tags.has(r.viewedTag)) ok = true;
      else if (r.viewedPowertrain && pts.has(r.viewedPowertrain)) ok = true;
      else if (r.default) ok = true;
      if (ok) return { id: inc.id, title: inc.title, value: inc.value, reason: reason.replace('{model}', MODELS[modelIds[0]].name) };
    }
  }
  return { id: 'inc-detailing', title: 'Complimentary detail before delivery', value: 180, reason: 'Because you booked a test drive with us.' };
}
const QBANK = {
  'tow-load': ['What are you towing, and roughly how heavy?', ['Caravan, 2 t or more', 'Boat or camper, 1-2 t', 'Box trailer, under 750 kg', 'Nothing yet']],
  'ev-home-charge': ['Can you charge at home, in a garage or off-street spot?', ['Yes', 'No']],
  'three-child-seats': ['Do you need to fit three child seats across the back row?', ['Yes', 'No']],
  'third-row-who': ['Who will mostly sit in the third row?', ['Kids', 'Teens or adults', 'Rarely used']],
  'offroad-kind': ['What kind of off-road driving do you have in mind?', ['Beach and sand', 'Low-range tracks', 'Gravel and campsites']],
  'ute-tub-tray': ['Tub or tray: what do you need in the back?', ['Tub with a liner', 'Flat tray', 'Canopy for tools', 'Not sure yet']],
  'hybrid-first': ['Have you driven a Toyota hybrid before?', ['Yes', 'No']],
  'city-share': ['How much of your driving is stop-start city traffic?', ['Mostly', 'About half', 'Very little']],
  'tight-parking': ['Do you park somewhere tight, like an apartment car park or a narrow garage?', ['Yes', 'No']],
  'manual-ok': ['Are you comfortable driving a manual?', ['Yes', 'No']],
  'trade-in': ['Will you be trading in your current car?', ['Yes', 'No']],
  'finance-plan': ['How are you planning to pay?', ['Cash or savings', 'Toyota Finance', 'Novated lease', 'Not sure yet']],
};
function questionsFor(R, model, hasTrade, financed, answered) {
  const m = MODELS[model], tags = new Set(m.tags), pool = [];
  if (m.towKg >= 1500) pool.push('tow-load');
  if (m.powertrain === 'ev') pool.push('ev-home-charge');
  if (m.seats >= 7) pool.push('third-row-who'); else if (tags.has('family')) pool.push('three-child-seats');
  if (tags.has('off-road')) pool.push('offroad-kind');
  if (model === 'hilux') pool.push('ute-tub-tray');
  if (m.powertrain === 'hybrid') pool.push('hybrid-first', 'city-share');
  if (tags.has('city')) pool.push('tight-parking');
  if (tags.has('manual')) pool.push('manual-ok');
  const chosen = R.sample(pool, Math.min(pool.length, 1 + R.int(0, 1)));
  for (const f of ['trade-in', 'finance-plan']) if (chosen.length < 3) chosen.push(f);
  return chosen.slice(0, 3).map((id) => {
    const [q, opts] = QBANK[id];
    let ans = null;
    if (answered) ans = id === 'trade-in' ? (hasTrade ? 'Yes' : 'No') : id === 'finance-plan' ? (financed ? R.w({ 'Toyota Finance': 4, 'Not sure yet': 1 }) : R.w({ 'Cash or savings': 4, 'Novated lease': 1, 'Not sure yet': 1 })) : R.pick(opts);
    return { id, question: q, answer: ans };
  });
}

// ════════════════════════════════════════════════════════════════════════════
// 1. LEADS
// ════════════════════════════════════════════════════════════════════════════
const leads = [];
const RL = rng('leads');
const sessionIds = new Set();
const newSid = (R) => { for (;;) { const s = `s-${R.code(8, 'abcdefghijklmnopqrstuvwxyz0123456789')}`; if (!sessionIds.has(s)) { sessionIds.add(s); return s; } } };

const businesses = [];
{
  const R = rng('businesses');
  const used = new Set();
  for (let i = 0; i < 42; i++) {
    const site = R.w({ pen: 35, par: 25, liv: 25, hor: 15 });
    let name; do name = `${R.pick(BIZ_PLACE)} ${R.pick(BIZ_TRADE)} Pty Ltd`; while (used.has(name)); used.add(name);
    const p = newPerson(R, site, START - R.int(100, 900) * DAY, { company: name });
    p.fleetSize = R.w({ 2: 3, 3: 3, 4: 2, 6: 1, 9: 0.6 });
    businesses.push(p);
  }
}
const bySitePeople = { par: [], hor: [], pen: [], liv: [] };

function ownerFor(R, site, t, person) {
  const sp = SALES(site).filter((s) => s.startedAt <= t);
  if (person?.owner && STAFF_BY[person.owner].startedAt <= t && R.chance(person.business ? 0.85 : 0.6)) return person.owner;
  return R.w(sp.map((s) => [s.id, s.k.w]));
}
function choosePerson(R, site, t, channel) {
  if (channel !== 'configurator' && R.chance(0.055)) {
    const pool = businesses.filter((b) => (b.site === site || R.chance(0.15)) && b.busyUntil < t);
    if (pool.length) return R.pick(pool);
  }
  if (channel !== 'configurator' && R.chance(0.26)) {
    const pool = bySitePeople[site];
    for (let i = 0; i < 6 && pool.length; i++) {
      const p = pool[Math.floor(R.r() * pool.length)];
      if (p.anon || p.business) continue;
      if (p.delivered ? t > p.busyUntil + 150 * DAY : t > p.busyUntil + 40 * DAY) return p;
    }
  }
  const p = newPerson(R, site, t); bySitePeople[site].push(p); return p;
}
function leadTime(R, day, channel) {
  if (channel === 'walk-in') return bizClock(R, day);
  if (channel === 'phone') return dayStart(day) + R.w([[8.5, 2], [10, 3], [12, 2], [14, 3], [16, 2], [17.5, 1]]) * HOUR + R.int(0, 89) * MIN;
  return dayStart(day) + R.w([[6, 0.5], [7.5, 1], [9, 1.5], [11, 1.5], [12.5, 2], [14, 1.5], [16, 1.2], [18, 1.5], [19.5, 2.2], [21, 2], [22.5, 0.8]]) * HOUR + R.int(0, 89) * MIN;
}
function sourceFor(R, channel, person, campaign) {
  if (channel === 'configurator') return 'web-configurator';
  if (channel === 'campaign') return `${campaign.channel}-campaign`;
  if (person.delivered && R.chance(0.6)) return 'repeat-customer';
  if (channel === 'walk-in') return R.w({ showroom: 55, 'service-department': 15, referral: 15, 'drive-by': 10, 'repeat-customer': person.delivered ? 20 : 0 });
  if (channel === 'phone') return R.w({ google: 30, 'toyota.com.au': 20, referral: 20, 'service-department': 15, 'repeat-customer': 5 });
  return R.w({ 'toyota.com.au': 40, 'harbourline.com.au': 25, carsales: 20, 'google-ads': 10, facebook: 5 });
}
function addLead(R, t, site, channel, extra = {}) {
  const person = extra.person || choosePerson(R, site, t, channel);
  const owner = ownerFor(R, site, t, person);
  const model = extra.model || (person.delivered && !person.business && R.chance(0.7) ? R.pick(SIMILAR[pickModel(R, site, false)]) : pickModel(R, site, person.business));
  const grade = pickGrade(R, model), colour = pickColour(R, model);
  const lead = { t0: t, site, channel, person, owner, model, grade, colour, campaign: extra.campaign || null, source: null, touch: !!extra.touch, primary: extra.primary || null };
  lead.source = sourceFor(R, channel, person, lead.campaign);
  if (channel === 'configurator') {
    lead.sid = newSid(R);
    lead.finder = finderFor(R, model, grade, person.business);
    const others = R.sample(SIMILAR[model], R.int(0, 2));
    lead.viewed = [{ modelId: model, gradeId: grade, unitId: null }, ...others.map((m) => ({ modelId: m, gradeId: pickGrade(R, m), unitId: null }))];
  }
  person.lastAt = t; person.leads.push(lead); if (!person.owner) person.owner = owner;
  leads.push(lead);
  return lead;
}

// organic (walk-in / phone / web-form)
const ORGANIC_PER_DAY = 5.45;
for (let d = WARM; d <= dayStart(NOW); d += DAY) {
  const wd = dow(d), hol = HOLIDAYS.has(ymd(d));
  for (const site of SITE_IDS) {
    const lam = ORGANIC_PER_DAY * SITE_META[site].share * seasonAt(d) * WEEKDAY[wd] * trend(d) * (hol ? 0.35 : 1);
    const n = RL.poisson(lam);
    for (let i = 0; i < n; i++) {
      const channel = wd === 0 || hol ? RL.w({ phone: 25, 'web-form': 75 }) : RL.w({ 'walk-in': 36, phone: 24, 'web-form': 40 });
      const t = leadTime(RL, d, channel);
      if (t > NOW) continue;
      const lead = addLead(RL, t, site, channel);
      // a second touch from the same shopper (another channel, same week) — merged by the BDC
      if (!lead.person.business && RL.chance(0.2)) {
        const t2 = t + RL.u(0.3, 9) * DAY;
        if (t2 < NOW) {
          const ch2 = RL.pick(['phone', 'web-form', 'walk-in'].filter((c) => c !== channel));
          addLead(RL, ch2 === 'walk-in' ? toBiz(RL, t2) : t2, site, ch2, { person: lead.person, model: RL.chance(0.6) ? lead.model : RL.pick(SIMILAR[lead.model]), touch: true, primary: lead });
        }
      }
    }
  }
}
// configurator bookings (channel = configurator) from launch
for (let d = CONFIG_LAUNCH; d <= dayStart(NOW); d += DAY) {
  const prog = (d - CONFIG_LAUNCH) / (NOW - CONFIG_LAUNCH);
  const lam = (0.4 + 0.72 * prog) * seasonAt(d) * [1.25, 0.95, 0.9, 0.9, 0.95, 1.0, 1.3][dow(d)];
  const n = RL.poisson(lam);
  for (let i = 0; i < n; i++) {
    const t = leadTime(RL, d, 'configurator');
    if (t > NOW) continue;
    addLead(RL, t, RL.w({ par: 40, hor: 20, pen: 20, liv: 20 }), 'configurator');
  }
}
// campaigns
const CAMPAIGNS = CAMPAIGN_DEF.map(([name, channel, audience, s, e, promotionIds, sent, siteIds, budget, leadTarget], i) => ({ id: `CMP-${String(i + 1).padStart(3, '0')}`, name, channel, audience, startsAt: ld(s), endsAt: ld(e, true), promotionIds, sent, siteIds, budget, leadTarget }));
for (const c of CAMPAIGNS) {
  const R = rng(`campaign:${c.id}`);
  const n = R.poisson(c.leadTarget);
  for (let i = 0; i < n; i++) {
    const frac = Math.pow(R.r(), 1.6); // front-loaded after each send
    const d = dayStart(c.startsAt + frac * (Math.min(c.endsAt, NOW) - c.startsAt));
    const t = leadTime(R, d, 'web-form');
    if (t > NOW) continue;
    const site = c.siteIds ? R.pick(c.siteIds) : R.w(Object.fromEntries(SITE_IDS.map((s) => [s, SITE_META[s].share])));
    const promoModels = c.promotionIds.map((p) => PROMOTIONS.find((x) => x.id === p)?.appliesTo.models).filter(Boolean).flat();
    const lead = addLead(R, t, site, 'campaign', { campaign: c, model: promoModels.length && R.chance(0.75) ? R.pick(promoModels) : undefined });
    if (c.name.includes('tradie') && !lead.person.business && R.chance(0.3)) { lead.model = 'hilux'; lead.grade = pickGrade(R, 'hilux'); lead.colour = pickColour(R, 'hilux'); }
  }
}
// live configurator bookings already in content/dealer/bookings.json (bridge rows)
for (const b of LIVE_BOOKINGS) {
  if (!b?.bookingId || !MODELS[b.modelId]) continue;
  const t = Date.parse(String(b.createdAt || '').slice(0, 19) + 'Z') || NOW - HOUR;
  const R = rng(`live:${b.bookingId}`);
  const p = newPerson(R, b.site || 'par', t, { anon: true });
  const sid = LIVE_EVENTS.find((e) => e.type === 'booking' && e.data?.bookingId === b.bookingId)?.sid || null;
  leads.push({ t0: Math.min(t, NOW), site: b.site || 'par', channel: 'configurator', person: p, owner: ownerFor(R, b.site || 'par', t, null), model: b.modelId, grade: b.gradeId || MODELS[b.modelId].grades[0].id, colour: b.build?.colourId || MODELS[b.modelId].colours[0], source: 'web-configurator', sid: sid || newSid(R), finder: b.finderAnswers || [], viewed: b.viewed || [], live: b });
}
// configurator sessions that booked (content/dealer/events.jsonl `booking` events) become configurator leads
const utcToLocal = (isoUtc) => { const u = Date.parse(isoUtc); const c = u + 10 * HOUR; return tzOffset(c) === '+11:00' ? u + 11 * HOUR : c; };
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
function parseWhenLabel(label, ref) { // "Tue 22 Sept, 1:30 pm"
  const m = /(\d{1,2})\s+([A-Za-z]+),?\s+(\d{1,2}):(\d{2})\s*(am|pm)/i.exec(label || '');
  if (!m) return null;
  let h = +m[3] % 12; if (m[5].toLowerCase() === 'pm') h += 12;
  const mo = MONTHS[m[2].toLowerCase().slice(0, 4)] || MONTHS[m[2].toLowerCase().slice(0, 3)];
  let y = yearOf(ref); if (mo < monthOf(ref) - 6) y++;
  return L(y, mo, +m[1], h, +m[4]);
}
{
  const R = rng('live-sessions');
  const liveBookingIds = new Set(LIVE_BOOKINGS.map((b) => b?.bookingId));
  for (const e of LIVE_EVENTS.filter((x) => x.type === 'booking' && x.data?.bookingId && !liveBookingIds.has(x.data.bookingId))) {
    const d = e.data, t = utcToLocal(e.ts || e.at);
    if (t > NOW) continue;
    const sess = LIVE_EVENTS.filter((x) => x.sid === e.sid);
    const unit = currentUnitsById[d.unitId];
    const model = MODELS[d.modelId] ? d.modelId : unit?.model;
    if (!model) continue;
    const site = SITE_IDS.includes(d.site) ? d.site : unit?.site || 'par';
    const lead = addLead(R, t, site, 'configurator', { model });
    sessionIds.add(e.sid);
    lead.sid = e.sid; lead.fixedTdId = d.bookingId; lead.fixedWhen = parseWhenLabel(d.whenLabel, t); lead.unitId = unit ? unit.id : null; lead.liveSession = true;
    if (unit) { lead.grade = unit.grade; lead.colour = unit.colour; }
    const fa = []; for (const x of sess) if (x.type === 'finder_answer' && x.data?.questionId) { const i = fa.findIndex((f) => f.id === x.data.questionId); if (i >= 0) fa.splice(i, 1); fa.push({ id: x.data.questionId, value: x.data.value }); }
    lead.finder = fa;
    const seen = new Map(); for (const x of sess) if (x.type === 'build_change' && MODELS[x.data?.modelId]) seen.set(x.data.modelId, { modelId: x.data.modelId, gradeId: x.data.gradeId || null, unitId: null });
    for (const x of sess) if (x.type === 'offer_view' && currentUnitsById[x.data?.unitId]) { const u = currentUnitsById[x.data.unitId]; if (seen.has(u.model) && !seen.get(u.model).unitId) seen.get(u.model).unitId = u.id; else if (!seen.has(u.model)) seen.set(u.model, { modelId: u.model, gradeId: u.grade, unitId: u.id }); }
    lead.viewed = [...seen.values()].sort((a, b) => (b.modelId === model) - (a.modelId === model)).slice(0, 12);
    if (!lead.viewed.length) lead.viewed = [{ modelId: model, gradeId: lead.grade, unitId: lead.unitId }];
  }
}
leads.sort((a, b) => a.t0 - b.t0);

// ════════════════════════════════════════════════════════════════════════════
// 2. FUNNEL SIMULATION (planned timelines; observed at NOW later)
// ════════════════════════════════════════════════════════════════════════════
const P_CONTACT = { 'walk-in': 1, phone: 1, 'web-form': 0.9, campaign: 0.86, configurator: 0.97 };
const P_QUAL = { 'walk-in': 0.79, phone: 0.68, 'web-form': 0.6, campaign: 0.5 };
const P_TD = { 'walk-in': 0.56, phone: 0.5, 'web-form': 0.52, campaign: 0.45 };
const LEAD_LOST = {
  no_response: 'No response after 3 attempts', invalid: 'Invalid contact details', researching: 'Just researching', budget: 'Budget does not stretch', wait_time: 'Wait time too long', bought_elsewhere: 'Bought elsewhere', duplicate: 'Duplicate enquiry (merged)', used_car: 'Looking for a used car', not_suitable: 'Not suited after test drive', deferred: 'Deferred purchase',
};
const DEAL_LOST = {
  price: 'Price: bought cheaper elsewhere', other_toyota: 'Bought from another Toyota dealer', competitor: 'Chose a competitor brand', wait_time: 'Wait time too long', finance_declined: 'Finance declined', trade_gap: 'Trade-in valuation gap', deferred: 'Deferred purchase', no_response: 'Stopped responding',
};
const RF = rng('funnel');
const deals = []; // skeletons
const tds = []; // planned test drives

function tdSlot(R, from, sameVisit) {
  if (sameVisit && isOpen(from) && hourOf(from) < 16.5) return from + R.u(0.25, 1.2) * HOUR;
  let d = dayStart(from) + R.int(1, 6) * DAY; while (!isOpen(d)) d += DAY;
  return bizClock(R, d);
}
for (const lead of leads) {
  const R = RF, sp = STAFF_BY[lead.owner].k, ch = lead.channel, biz = lead.person.business;
  const tl = (lead.tl = { contactAt: null, qualAt: null, tdBookedAt: null, lostAt: null, lostCode: null });
  const t0 = lead.t0;
  if (lead.touch) { // merged duplicate touch
    tl.contactAt = ch === 'walk-in' || ch === 'phone' ? t0 : toBiz(R, t0 + R.logn(2, 0.8) * HOUR);
    tl.lostAt = toBiz(R, tl.contactAt + R.u(0.1, 2) * DAY); tl.lostCode = 'duplicate';
    continue;
  }
  if (lead.live) { tl.contactAt = null; tl.tdBookedAt = t0; const b = lead.live; tds.push({ lead, bookedAt: t0, when: Date.parse(String(b.when).slice(0, 19) + 'Z') || t0 + DAY, outcome: 'booked', live: b }); continue; }
  // first contact
  if (ch === 'walk-in' || ch === 'phone') tl.contactAt = t0;
  else if (R.chance(P_CONTACT[ch])) tl.contactAt = toBiz(R, t0 + R.logn(ch === 'configurator' ? 1.2 : 2.2, 0.9) * sp.speed * HOUR);
  else { tl.lostAt = toBiz(R, t0 + R.u(6, 12) * DAY); tl.lostCode = R.chance(0.8) ? 'no_response' : 'invalid'; continue; }
  // qualification
  let quals;
  if (ch === 'configurator') { quals = true; tl.qualAt = tl.contactAt; }
  else {
    quals = R.chance(clamp(P_QUAL[ch] * (biz ? 1.15 : 1) * (0.85 + 0.15 * sp.close), 0, 0.95));
    if (quals) tl.qualAt = ch === 'walk-in' ? t0 + R.u(10, 35) * MIN : toBiz(R, tl.contactAt + R.logn(0.8, 1) * DAY);
    else { tl.lostAt = toBiz(R, tl.contactAt + R.u(2, 21) * DAY); tl.lostCode = R.w({ researching: 34, budget: 16, wait_time: 12, bought_elsewhere: 14, deferred: 10, used_car: 7, no_response: 12 }); continue; }
  }
  // test drives
  let tdDone = null;
  const wantTd = ch === 'configurator' ? true : R.chance(clamp(P_TD[ch] * (biz ? 0.55 : 1) * (0.8 + 0.2 * sp.close), 0, 0.95));
  if (wantTd) {
    tl.tdBookedAt = ch === 'configurator' ? t0 : tl.qualAt;
    let when = lead.fixedWhen ? lead.fixedWhen : ch === 'configurator' ? (() => { let d = dayStart(t0) + R.w([[1, 4], [2, 3], [3, 2], [5, 1], [7, 1]]) * DAY; while (!isOpen(d)) d += DAY; return bizClock(R, d); })() : tdSlot(R, tl.qualAt, ch === 'walk-in' && R.chance(0.5));
    for (let attempt = 0; attempt < 2; attempt++) {
      const outcome = R.w({ completed: ch === 'configurator' ? 84 : 83, no_show: ch === 'configurator' ? 11 : 9, cancelled: ch === 'configurator' ? 5 : 8 });
      const td = { lead, bookedAt: attempt ? tds[tds.length - 1].when + R.u(0.1, 1) * DAY : tl.tdBookedAt, when, outcome };
      tds.push(td);
      if (outcome === 'completed') { tdDone = td; break; }
      if (!R.chance(0.45)) break;
      let d = dayStart(when) + R.int(2, 7) * DAY; while (!isOpen(d)) d += DAY; when = bizClock(R, d);
    }
    if (!tdDone) { tl.lostAt = toBiz(R, tds[tds.length - 1].when + R.u(3, 14) * DAY); tl.lostCode = R.w({ no_response: 6, deferred: 2, bought_elsewhere: 2 }); continue; }
  }
  // quote → deal
  const pDeal = tdDone ? (ch === 'configurator' ? 0.6 : 0.84) : 0.41;
  if (!R.chance(clamp(pDeal * (biz ? 1.25 : 1) * sp.close, 0, 0.97))) {
    tl.lostAt = toBiz(R, (tdDone ? tdDone.when : tl.qualAt) + R.u(2, 18) * DAY);
    tl.lostCode = tdDone ? R.w({ not_suitable: 30, budget: 18, researching: 12, bought_elsewhere: 18, deferred: 12, no_response: 10 }) : R.w({ budget: 20, bought_elsewhere: 25, deferred: 20, no_response: 20, wait_time: 15 });
    continue;
  }
  const createdAt = tdDone ? (R.chance(0.5) ? tdDone.when + R.u(0.5, 1.5) * HOUR : addDays(R, tdDone.when, 1, 4)) : addDays(R, tl.qualAt, 0.3, 5);
  const deal = { lead, createdAt, site: lead.site, owner: lead.owner, biz, td: tdDone };
  deals.push(deal); lead.deal = deal;
}

// deal plans: stages, finance path, loss
const LENDERS = { 'Toyota Finance': { share: 52, approve: 0.92, hours: 3, rate: 7.29 }, Macquarie: { share: 18, approve: 0.87, hours: 9, rate: 8.15 }, ANZ: { share: 15, approve: 0.83, hours: 26, rate: 8.55 }, Westpac: { share: 15, approve: 0.79, hours: 31, rate: 8.89 } };
function planFinance(R, deal, at, forced) {
  const apps = [];
  let lender = R.w(Object.entries(LENDERS).map(([k, v]) => [k, v.share]));
  let t = toBiz(R, at + R.u(0.5, 4) * HOUR);
  for (let i = 0; i < 2; i++) {
    const Lx = LENDERS[lender];
    const decisionAt = lender === 'Toyota Finance' ? t + R.logn(Lx.hours, 0.8) * HOUR : toBiz(R, t + R.logn(Lx.hours, 0.6) * HOUR);
    const approved = forced === 'approve' ? true : R.chance(Lx.approve);
    const app = { lender, submittedAt: t, decisionAt, result: approved ? 'approved' : 'declined', conditional: approved && R.chance(0.18), seq: i + 1 };
    if (app.conditional) app.clearedAt = toBiz(R, decisionAt + R.u(0.8, 4) * DAY);
    apps.push(app);
    if (approved) break;
    if (!R.chance(0.85)) break;
    lender = lender === 'Toyota Finance' ? 'Macquarie' : 'Toyota Finance';
    t = toBiz(R, decisionAt + R.u(0.3, 2) * DAY);
  }
  return apps;
}
function planDeal(R, deal) {
  const sp = STAFF_BY[deal.owner].k;
  deal.financed = R.chance(clamp((deal.biz ? 0.42 : 0.64) * sp.fin, 0.2, 0.9));
  deal.hasTrade = R.chance(deal.biz ? 0.3 : 0.5);
  const win = R.chance(clamp(0.8 * Math.pow(sp.close, 1.3), 0.55, 0.95));
  const stages = [['quote', deal.createdAt]];
  let t = toBiz(R, deal.createdAt + R.logn(0.9, 0.9) * DAY); stages.push(['negotiation', t]);
  let lossStage = null;
  if (!win) lossStage = R.w({ quote: 38, negotiation: 37, finance: deal.financed ? 12 : 0, approval: 6, contract: 5, delivery: 2 });
  if (lossStage === 'quote' || lossStage === 'negotiation') {
    deal.stages = lossStage === 'quote' ? stages.slice(0, 1) : stages;
    const from = lossStage === 'quote' ? deal.createdAt : t;
    deal.lostAt = toBiz(R, from + R.u(1, 12) * DAY);
    deal.lostCode = lossStage === 'quote' ? R.w({ price: 22, competitor: 22, other_toyota: 15, wait_time: ['prado', 'landcruiser-300'].includes(deal.lead.model) ? 26 : 10, deferred: 15, no_response: 14 }) : R.w({ price: 30, other_toyota: 20, competitor: 15, trade_gap: deal.hasTrade ? 22 : 4, deferred: 10, wait_time: 8 });
    deal.lossStage = lossStage; return;
  }
  if (deal.financed) {
    t = toBiz(R, t + R.logn(2.2, 0.6) * DAY); stages.push(['finance', t]);
    deal.apps = planFinance(R, deal, t);
    const last = deal.apps[deal.apps.length - 1];
    if (last.result === 'declined') { deal.stages = stages; deal.lostAt = toBiz(R, last.decisionAt + R.u(0.5, 4) * DAY); deal.lostCode = 'finance_declined'; deal.lossStage = 'finance'; return; }
    t = last.clearedAt || last.decisionAt;
    if (lossStage === 'finance') { deal.stages = stages; deal.lostAt = toBiz(R, t + R.u(1, 6) * DAY); deal.lostCode = R.w({ deferred: 5, price: 3, competitor: 2 }); deal.lossStage = 'finance'; return; }
  }
  t = toBiz(R, t + R.logn(0.5, 0.8) * DAY); stages.push(['approval', t]);
  if (lossStage === 'approval') { deal.stages = stages; deal.lostAt = toBiz(R, t + R.u(1, 5) * DAY); deal.lostCode = R.w({ price: 4, trade_gap: deal.hasTrade ? 3 : 0, deferred: 3 }); deal.lossStage = 'approval'; return; }
  t = toBiz(R, t + R.logn(0.6, 0.8) * DAY); stages.push(['contract', t]);
  deal.contractAt = t; deal.stages = stages; deal.win = true;
  if (lossStage === 'contract' || lossStage === 'delivery') { deal.cancel = lossStage; deal.win = false; }
}
for (const d of deals) planDeal(RF, d);

// ── demo-critical scenarios (spec + lead decisions) ─────────────────────────
// Deals stuck in finance >5 days (pen ≥3, par ≥2) and in approval >3 days (≥4 group-wide).
function rescheduleStuck(R, deal, stage, ageDays) {
  const at = toBiz(R, NOW - ageDays * DAY);
  const q = Math.min(deal.createdAt, at - R.u(3, 8) * DAY);
  deal.createdAt = q; deal.win = true; deal.cancel = null; deal.lostAt = null; deal.lostCode = null; deal.lossStage = null;
  deal.stuck = stage;
  const neg = toBiz(R, q + R.u(0.5, 2) * DAY);
  deal.stages = [['quote', q], ['negotiation', Math.min(neg, at - 0.5 * DAY)]];
  if (stage === 'finance') {
    deal.financed = true; deal.stages.push(['finance', at]);
    const lender = R.w({ Westpac: 3, ANZ: 3, Macquarie: 2, 'Toyota Finance': 1 });
    const sub = toBiz(R, at + R.u(1, 4) * HOUR);
    deal.apps = [R.chance(0.55)
      ? { lender, submittedAt: sub, decisionAt: sub + R.u(0.8, 2) * DAY, result: 'approved', conditional: true, clearedAt: NOW + R.u(2, 6) * DAY, seq: 1, stuckNote: R.pick(['Conditional approval: lender wants two recent payslips and 3 months of bank statements; customer has sent one payslip.', 'Conditional: lender needs proof of the ABN and last two BAS statements. Accountant on leave until next week.', 'Conditional on a valuation of the trade payout letter; financier still waiting on it.']) }
      : { lender, submittedAt: sub, decisionAt: NOW + R.u(1, 4) * DAY, result: 'approved', conditional: false, seq: 1, stuckNote: R.pick(['Application referred to credit: self-employed under 2 years. Chased the credit officer twice.', 'Lender still assessing: missing employer verification, HR not returning calls.', 'Credit asked for a co-borrower statement of position; customer’s partner yet to sign.']) }];
    deal.contractAt = NOW + R.u(3, 9) * DAY;
    deal.stages.push(['approval', deal.contractAt - DAY], ['contract', deal.contractAt]);
  } else {
    if (deal.financed) { deal.stages.push(['finance', at - R.u(2, 4) * DAY]); deal.apps = planFinance(R, deal, deal.stages[2][1], 'approve'); deal.apps.forEach((a) => { if (a.decisionAt > at) a.decisionAt = at - 2 * HOUR; if (a.clearedAt) a.clearedAt = at - HOUR; }); }
    deal.stages.push(['approval', at]);
    deal.stuckNote = R.pick(['Waiting on the dealer principal to sign off a $2,600 over-allowance on the trade.', 'Desk is under the minimum front gross; manager wants the customer to take paint protection before approving.', 'Approval held: customer asked for a second key and mats thrown in, manager reviewing.', 'Waiting on the fleet manager to approve the quote internally (business customer).']);
    deal.contractAt = NOW + R.u(2, 7) * DAY; deal.stages.push(['contract', deal.contractAt]);
  }
}
{
  const R = rng('scenarios');
  const cand = (site) => R.shuffle(deals.filter((d) => d.site === site && d.createdAt > NOW - 40 * DAY && d.createdAt < NOW - 9 * DAY && !d.stuck));
  for (const [site, n] of [['pen', 4], ['par', 3], ['hor', 1]]) cand(site).slice(0, n).forEach((d) => rescheduleStuck(R, d, 'finance', R.u(5.6, 12)));
  for (const site of ['par', 'pen', 'liv', 'hor', 'liv']) { const d = cand(site)[0]; if (d) rescheduleStuck(R, d, 'approval', R.u(3.4, 8)); }
}

// ── sales1 (Josh Pereira, Parramatta, started June 2026): ~40 leads / ~25 deals ─────
{
  const R = rng('sales1');
  const JOSH = 'st-sp-01', since = STAFF_BY[JOSH].startedAt;
  const parPrimary = leads.filter((l) => l.site === 'par' && !l.touch && l.t0 >= since && !l.live);
  const mine = () => parPrimary.filter((l) => l.owner === JOSH);
  const withDeal = R.shuffle(parPrimary.filter((l) => l.deal && l.deal.createdAt <= NOW && l.owner !== JOSH && !l.person.business));
  while (mine().filter((l) => l.deal && l.deal.createdAt <= NOW).length < 25 && withDeal.length) withDeal.pop().owner = JOSH;
  const noDeal = R.shuffle(mine().filter((l) => !l.deal || l.deal.createdAt > NOW));
  const others = SALES('par').filter((s) => s.id !== JOSH).map((s) => s.id);
  while (mine().length > 41 && noDeal.length) noDeal.pop().owner = R.pick(others);
  const spare = R.shuffle(parPrimary.filter((l) => !l.deal && l.owner !== JOSH));
  while (mine().length < 39 && spare.length) spare.pop().owner = JOSH;
  for (const l of leads) if (l.touch && l.primary) l.owner = l.primary.owner;
  for (const d of deals) d.owner = d.lead.owner;
}

// ════════════════════════════════════════════════════════════════════════════
// 3. FULFILMENT AND DELIVERY
// ════════════════════════════════════════════════════════════════════════════
const RFul = rng('fulfilment');
const won = deals.filter((d) => d.contractAt && d.contractAt <= NOW).sort((a, b) => a.contractAt - b.contractAt);
const W90 = NOW - 90 * DAY;
const recent = won.filter((d) => d.contractAt >= NOW - 88 * DAY && d.contractAt <= NOW - 3 * DAY);
const stockPick = new Set();
for (const [model, row] of Object.entries(SIG)) {
  const pool = RFul.shuffle(recent.filter((d) => d.lead.model === model && !d.cancel));
  pool.slice(0, row.sales90d).forEach((d) => stockPick.add(d));
  for (let i = pool.length; i < row.sales90d; i++) { // rare models: re-point a spare recent deal at this model
    const spare = recent.find((d) => !stockPick.has(d) && !d.cancel && !d.biz && !SIG[d.lead.model]?.sales90d);
    const alt = spare || recent.find((d) => !stockPick.has(d) && !d.cancel && !d.biz);
    if (!alt) break;
    alt.lead.model = model; alt.lead.grade = pickGrade(RFul, model); alt.lead.colour = pickColour(RFul, model);
    stockPick.add(alt);
  }
}
function factoryWeeks(R, model, t) { const e = ETA[model] || { eta_weeks_min: 10, eta_weeks_max: 14 }; return Math.round(R.u(e.eta_weeks_min, e.eta_weeks_max) * (t < L(2025, 7, 1) ? 1.2 : 1)); }
for (const d of won) {
  const R = RFul, model = d.lead.model, m = monthOf(d.contractAt);
  const inRecent = d.contractAt >= NOW - 88 * DAY;
  const push = (m === 5 || m === 6 || m === 11 || m === 12);
  if (stockPick.has(d)) d.fulfil = 'stock';
  else if (d.cancel) d.fulfil = R.w({ allocated: 1, factory: 1 });
  else if (inRecent) d.fulfil = R.w({ allocated: 55, factory: ['prado', 'landcruiser-300'].includes(model) ? 80 : 40 });
  else d.fulfil = R.w({ stock: ['prado', 'landcruiser-300', 'gr-corolla'].includes(model) ? 12 : push ? 30 : 25, allocated: push ? 56 : 47, factory: push ? 14 : ['prado', 'landcruiser-300'].includes(model) ? 45 : 26 });
  if (d.fulfil === 'stock' && !stockPick.has(d) && d.contractAt > W90 - 9 * DAY) d.fulfil = 'allocated'; // keep the 90-day stock window exact
  let del;
  if (d.fulfil === 'stock') {
    del = d.contractAt + R.u(2, 7) * DAY;
    if (inRecent) del = Math.min(del, NOW - R.u(2, 20) * HOUR); else del = Math.min(del, W90 - R.u(2, 30) * HOUR);
  } else if (d.fulfil === 'allocated') { del = d.contractAt + R.u(12, 48) * DAY; }
  else { d.etaWeeks = factoryWeeks(R, model, d.contractAt); del = d.contractAt + (d.etaWeeks * 7 + R.u(-6, 12)) * DAY; }
  if (d.fulfil !== 'factory' && (m === 5 || m === 6) && (d.biz || R.chance(0.6))) { const eofy = L(yearOf(d.contractAt), 6, 30, 16); if (del > eofy && d.contractAt < eofy - 4 * DAY) { del = eofy - R.u(0, 4) * DAY; d.eofy = true; } }
  if (d.fulfil !== 'factory' && (m === 11 || m === 12)) { const xmas = L(yearOf(d.contractAt), 12, 23, 16); if (del > xmas && d.contractAt < xmas - 4 * DAY && R.chance(0.6)) { del = xmas - R.u(0, 4) * DAY; d.xmas = true; } }
  let dd = dayStart(del); while (!isOpen(dd)) dd -= DAY; // deliver on the last open day
  if (dd <= dayStart(d.contractAt)) { dd = dayStart(d.contractAt) + DAY; while (!isOpen(dd)) dd += DAY; }
  const dhour = d.fulfil === 'stock' && inRecent ? Math.min(hourOf(del), 16) : R.w([[9, 1], [10.5, 2], [12, 1], [13.5, 2], [15, 2], [16, 1.5]]);
  d.deliveredAt = dd + Math.max(8.5, dhour) * HOUR;
  if (d.fulfil === 'stock' && inRecent && d.deliveredAt > NOW) d.deliveredAt = NOW - 3 * HOUR;
  if (d.fulfil === 'stock' && !inRecent && d.deliveredAt >= W90) d.deliveredAt = dayStart(W90) - DAY + 15 * HOUR;
  d.deliveryStageAt = Math.max(d.contractAt + HOUR, toBiz(R, d.deliveredAt - R.u(1, 4) * DAY));
  if (d.deliveryStageAt > d.deliveredAt) d.deliveryStageAt = d.deliveredAt - 2 * HOUR;
  if (d.cancel) { // contracted then cancelled before delivery
    const base = d.cancel === 'delivery' ? d.deliveryStageAt : d.contractAt;
    d.lostAt = toBiz(R, base + R.u(2, Math.max(3, days(base, d.deliveredAt) * 0.8)) * DAY);
    d.lostCode = d.fulfil === 'factory' ? R.w({ wait_time: 6, deferred: 2, finance_declined: 0.5 }) : R.w({ deferred: 3, price: 1.5, finance_declined: 0.5 });
    d.lossStage = d.cancel;
  }
}
// contracts still in the future are pre-contract open deals; they still need a proposed vehicle
const currentUnits = STOCK.rows;
for (const d of deals) {
  if (d.fulfil) continue;
  const R = RFul;
  const units = currentUnits.filter((u) => u.model === d.lead.model);
  if (d.createdAt > NOW - 120 * DAY && units.length && R.chance(0.55)) { const u = R.pick(units); d.proposedUnit = u; }
  else { d.etaWeeks = factoryWeeks(R, d.lead.model, d.createdAt); }
}

// ════════════════════════════════════════════════════════════════════════════
// 4. OBSERVE AT NOW, ASSIGN IDS, PRICE, BUILD RECORDS
// ════════════════════════════════════════════════════════════════════════════
const RB = rng('build');
const closeAt = (d) => (d.lostAt && (!d.win || d.cancel) ? d.lostAt : d.deliveredAt || Infinity);
const keepDeal = (d) => d.createdAt <= NOW && closeAt(d) >= START;
for (const l of leads) l.dropped = l.t0 < START && !(l.deal && keepDeal(l.deal)) || (l.touch && l.primary && l.primary.dropped);
for (const l of leads) if (l.dropped && l.deal) l.deal.dropped = true;
for (let i = leads.length - 1; i >= 0; i--) if (leads[i].dropped) { const p = leads[i].person; p.leads = p.leads.filter((x) => x !== leads[i]); leads.splice(i, 1); }
for (let i = tds.length - 1; i >= 0; i--) if (tds[i].lead.dropped) tds.splice(i, 1);
const live = deals.filter((d) => !d.dropped && keepDeal(d)).sort((a, b) => a.createdAt - b.createdAt);
// D-10482 and D-10517 are reserved for the two document-processing demo contracts (content/dms/samples)
const RESERVED_DEALS = new Set([10482, 10517]);
{ let n = 10530 - live.length - RESERVED_DEALS.size; for (const d of live) { while (RESERVED_DEALS.has(n)) n++; d.id = `D-${String(n++).padStart(5, '0')}`; } }
for (const d of deals) if (d.createdAt > NOW || !live.includes(d)) { d.lead.deal = null; }
leads.forEach((l, i) => { l.id = `L-${100001 + i}`; });

// customers: every named person with a lead; configurator bookers who never turned up stay anonymous
const tdIds = new Set();
const newTdId = (R) => { for (;;) { const id = `TD-${R.code(5)}`; if (!tdIds.has(id)) { tdIds.add(id); return id; } } };
for (const td of tds) if (td.lead.fixedTdId && !tdIds.has(td.lead.fixedTdId)) { td.id = td.lead.fixedTdId; tdIds.add(td.id); }
for (const td of tds) if (!td.id) td.id = newTdId(RB);
const tdByLead = new Map();
for (const td of tds) { if (!tdByLead.has(td.lead)) tdByLead.set(td.lead, []); tdByLead.get(td.lead).push(td); }
for (const l of leads) {
  if (l.channel !== 'configurator') continue;
  const mine = tdByLead.get(l) || [];
  const met = mine.some((t) => t.outcome === 'completed' && t.when <= NOW) || (l.deal && l.deal.createdAt <= NOW);
  if (!met && l.person.leads.length === 1) { l.person.anon = true; }
}
const custPeople = people.filter((p) => !p.anon && p.leads.length && p.leads.some((l) => l.t0 <= NOW)).sort((a, b) => Math.min(...a.leads.map((l) => l.t0)) - Math.min(...b.leads.map((l) => l.t0)));
custPeople.forEach((p, i) => { p.customerId = `C-${10001 + i}`; });
for (const p of people) if (p.anon) { p.email = null; p.phone = null; }

// ── vehicles ────────────────────────────────────────────────────────────────
const vehicles = [];
const usedStock = new Set(currentUnits.map((u) => u.id));
function vinFor(R, model, stockNo) { return `${VIN_PREFIX[model] || 'JTXX'}${String(R.int(0, 99999)).padStart(5, '0')}${stockNo.slice(3)}${'ABCDEFGH'[R.int(0, 7)]}00${R.int(0, 9)}`; }
for (const u of currentUnits) { // the 22 configurator units, unchanged ids/specs/ages
  const spec = { model: u.model, grade: u.grade, colour: u.colour, interior: u.interior, packs: u.packs };
  const arrivedAt = u.status === 'in_transit' ? null : dayStart(NOW) - u.days_in_stock * DAY + 10 * HOUR;
  const list = listPriceAt(spec, NOW);
  vehicles.push({ vin: u.vin, stockNo: u.id, siteId: u.site, model: u.model, grade: u.grade, colour: u.colour, interior: u.interior, packs: [...u.packs], status: u.status, daysInStock: u.days_in_stock, landedCost: landedFor(RB, list), listPrice: list, arrivedAt: iso(arrivedAt), soldAt: null, dealId: null, bonusHeadroom: u.bonus, movePriority: u.priority ?? null, reasonCode: u.reason_code, etaDays: u.eta_days ?? null, source: 'configurator' });
}
// historic sold units (from-stock deliveries) + demonstrators get HL-1000..HL-1899 in arrival order
const DEMO_DEF = [['par', 'rav4', 'gxl'], ['par', 'corolla-cross', 'gxl'], ['par', 'hilux', 'sr5'], ['par', 'kluger', 'gxl'], ['hor', 'rav4', 'edge'], ['hor', 'kluger', 'grande'], ['hor', 'bz4x', 'fwd'], ['pen', 'hilux', 'sr5'], ['pen', 'prado', 'gxl'], ['pen', 'rav4', 'gxl'], ['liv', 'corolla', 'sx'], ['liv', 'camry', 'ascent-sport'], ['liv', 'hilux', 'sr'], ['liv', 'yaris-cross', 'gxl']];
const histUnits = [];
for (const d of live) {
  if (d.fulfil !== 'stock' || d.deliveredAt > NOW || d.cancel) continue; // (deals closed before START were dropped above)
  const R = RB, model = d.lead.model;
  const recentSale = d.deliveredAt >= W90;
  let dis = clamp(Math.round(R.logn(34, 0.65)), 3, 165);
  if (['prado', 'landcruiser-300'].includes(model)) dis = clamp(Math.round(R.logn(12, 0.6)), 2, 60);
  if (['kluger', 'rav4', 'c-hr', 'bz4x', 'camry'].includes(model) && recentSale) dis = clamp(Math.round(R.logn(48, 0.5)), 8, 140); // keeps RAV4/Kluger skewing aged
  const spec = { model, grade: d.lead.grade, colour: d.lead.colour, interior: pickInterior(R, model, d.lead.grade), packs: pickPacks(R, model, d.biz) };
  histUnits.push({ deal: d, spec, arrivedAt: d.deliveredAt - dis * DAY - R.u(1, 7) * HOUR, soldAt: d.deliveredAt, dis });
}
for (const [site, model, grade] of DEMO_DEF) {
  const R = RB; const dis = R.int(45, 260);
  histUnits.push({ demo: true, site, spec: { model, grade, colour: pickColour(R, model), interior: pickInterior(R, model, grade), packs: model === 'hilux' ? ['tow'] : [] }, arrivedAt: dayStart(NOW) - dis * DAY + 10 * HOUR, dis });
}
histUnits.sort((a, b) => a.arrivedAt - b.arrivedAt);
histUnits.forEach((h, i) => {
  const no = `HL-${1000 + Math.floor((i * 899) / Math.max(1, histUnits.length - 1))}`;
  h.stockNo = usedStock.has(no) ? `HL-${1000 + i}` : no; usedStock.add(h.stockNo);
});
const unitByDeal = new Map();
for (const h of histUnits) {
  const R = RB;
  const list = listPriceAt(h.spec, h.arrivedAt);
  const v = { vin: vinFor(R, h.spec.model, h.stockNo), stockNo: h.stockNo, siteId: h.demo ? h.site : h.deal.site, model: h.spec.model, grade: h.spec.grade, colour: h.spec.colour, interior: h.spec.interior, packs: h.spec.packs, status: h.demo ? 'demo' : 'sold', daysInStock: h.demo ? h.dis : Math.round(days(h.arrivedAt, h.soldAt)), landedCost: landedFor(R, list), listPrice: list, arrivedAt: iso(h.arrivedAt), soldAt: h.demo ? null : iso(h.soldAt), dealId: h.demo ? null : h.deal.id, bonusHeadroom: 0, movePriority: null, reasonCode: null, etaDays: null, source: h.demo ? 'demonstrator' : 'dms' };
  if (!h.demo) {
    const dis = v.daysInStock;
    v.bonusHeadroom = dis > 90 ? round(R.u(1500, 2600), 100) : dis > 60 ? round(R.u(700, 1500), 100) : 0;
    v.reasonCode = dis > 90 ? 'aged_90d' : dis > 60 ? 'aged_60d' : null;
    unitByDeal.set(h.deal, v);
  }
  vehicles.push(v);
}
// allocated (open deals waiting on an inbound unit) and ordered (stock orders = November allocation) — HL-2801+
let nextNo = 2801;
const openAllocated = live.filter((d) => d.fulfil === 'allocated' && d.deliveredAt > NOW && !(d.lostAt && d.lostAt <= NOW));
for (const d of openAllocated) {
  const R = RB, model = d.lead.model;
  const spec = { model, grade: d.lead.grade, colour: d.lead.colour, interior: pickInterior(R, model, d.lead.grade), packs: pickPacks(R, model, d.biz) };
  const stockNo = `HL-${nextNo++}`, list = listPriceAt(spec, d.contractAt);
  const v = { vin: vinFor(R, model, stockNo), stockNo, siteId: d.site, model, grade: spec.grade, colour: spec.colour, interior: spec.interior, packs: spec.packs, status: 'allocated', daysInStock: 0, landedCost: landedFor(R, list), listPrice: list, arrivedAt: null, soldAt: null, dealId: d.id, bonusHeadroom: 0, movePriority: null, reasonCode: null, etaDays: Math.max(1, Math.round(days(NOW, d.deliveredAt)) - 2), source: 'allocation' };
  vehicles.push(v); unitByDeal.set(d, v);
}
{
  const R = RB;
  for (const row of SIGNALS.rows) {
    const already = openAllocated.filter((d) => d.lead.model === row.model).length;
    const n = row.allocationNextMonth; void already;
    for (let i = 0; i < n; i++) {
      const model = row.model, grade = pickGrade(R, model);
      const spec = { model, grade, colour: pickColour(R, model), interior: pickInterior(R, model, grade), packs: pickPacks(R, model, false) };
      const stockNo = `HL-${nextNo++}`, list = listPriceAt(spec, NOW);
      vehicles.push({ vin: vinFor(R, model, stockNo), stockNo, siteId: R.w(Object.fromEntries(SITE_IDS.map((s) => [s, SITE_META[s].share * (SITE_SKEW[s][model] || 1)]))), model, grade, colour: spec.colour, interior: spec.interior, packs: spec.packs, status: 'ordered', daysInStock: 0, landedCost: landedFor(R, list), listPrice: list, arrivedAt: null, soldAt: null, dealId: null, bonusHeadroom: 0, movePriority: null, reasonCode: null, etaDays: R.int(18, 48), source: 'allocation' });
    }
  }
}
const vehicleByStock = Object.fromEntries(vehicles.map((v) => [v.stockNo, v]));

// ── pricing, trade-ins, finance, gross ───────────────────────────────────────
const TRADE_CARS = [['Toyota', 'Corolla', 32000, 9], ['Toyota', 'Camry', 40000, 6], ['Toyota', 'RAV4', 42000, 7], ['Toyota', 'HiLux SR5', 62000, 7], ['Toyota', 'Kluger GX', 55000, 3], ['Toyota', 'Prado GXL', 75000, 3], ['Toyota', 'Yaris', 24000, 3], ['Mazda', 'CX-5', 42000, 6], ['Mazda', '3', 32000, 5], ['Hyundai', 'i30', 28000, 6], ['Hyundai', 'Tucson', 40000, 4], ['Mitsubishi', 'Outlander', 40000, 4], ['Mitsubishi', 'Triton', 48000, 4], ['Ford', 'Ranger XLT', 65000, 4], ['Ford', 'Territory', 42000, 2], ['Holden', 'Commodore', 42000, 3], ['Holden', 'Captiva', 34000, 2], ['Nissan', 'X-Trail', 40000, 4], ['Nissan', 'Navara', 50000, 3], ['Honda', 'CR-V', 40000, 3], ['Honda', 'Civic', 32000, 3], ['Kia', 'Cerato', 28000, 4], ['Kia', 'Sportage', 40000, 3], ['Subaru', 'Forester', 42000, 3], ['Subaru', 'Outback', 46000, 2], ['Volkswagen', 'Golf', 36000, 2], ['Isuzu', 'D-Max', 52000, 2], ['Suzuki', 'Swift', 22000, 2]];
const COMPETITORS = { rav4: ['Hyundai Tucson', 'Kia Sportage', 'Mazda CX-5', 'Mitsubishi Outlander', 'Nissan X-Trail', 'BYD Sealion 6', 'Honda CR-V'], hilux: ['Ford Ranger', 'Isuzu D-Max', 'Mitsubishi Triton', 'BYD Shark 6', 'GWM Cannon'], prado: ['Ford Everest', 'Isuzu MU-X', 'GWM Tank 300'], 'landcruiser-300': ['Nissan Patrol', 'Ford Everest Platinum'], kluger: ['Kia Sorento', 'Hyundai Santa Fe', 'Mazda CX-90', 'Ford Everest'], fortuner: ['Isuzu MU-X', 'Ford Everest', 'Mitsubishi Pajero Sport'], camry: ['Hyundai Sonata', 'Honda Accord', 'Skoda Octavia'], corolla: ['Mazda3', 'Hyundai i30', 'Kia Cerato'], 'corolla-cross': ['Mazda CX-30', 'Kia Seltos', 'Hyundai Kona', 'BYD Atto 3'], 'yaris-cross': ['MG ZS', 'Mazda CX-3', 'Hyundai Venue'], 'c-hr': ['Mazda CX-30', 'Hyundai Kona Hybrid'], bz4x: ['Tesla Model Y', 'BYD Atto 3', 'Hyundai Ioniq 5', 'Kia EV6'], 'gr-yaris': ['Hyundai i20 N', 'VW Polo GTI'], 'gr-corolla': ['Honda Civic Type R', 'VW Golf R'], gr86: ['Subaru BRZ', 'Mazda MX-5'] };
const RIVAL_DEALERS = ['Rouse Hill Toyota', 'Castle Hill Toyota', 'Campbelltown Toyota', 'Blacktown Toyota', 'Penrith Ford', 'Parramatta Hyundai', 'Liverpool Kia', 'Hornsby Mazda', 'Blacktown BYD', 'Penrith Mitsubishi', 'Five Dock Nissan'];

const tradeIns = [], financeApps = [];
const activePromos = (t, model, aged) => PROMOTIONS.filter((p) => p.startsAt <= t && p.endsAt >= t && (!p.appliesTo.models || p.appliesTo.models.includes(model)) && (!p.appliesTo.aged || aged) && (!p.appliesTo.units) && !(p.appliesTo.onLot && false));

for (const d of live) {
  const R = RB, model = d.lead.model, sp = STAFF_BY[d.owner].k;
  const priceAt = d.contractAt && d.contractAt <= NOW ? d.contractAt : d.createdAt;
  // vehicle
  let unit = unitByDeal.get(d) || null;
  if (!unit && d.proposedUnit) unit = vehicleByStock[d.proposedUnit.id];
  const spec = unit ? { model: unit.model, grade: unit.grade, colour: unit.colour, interior: unit.interior, packs: unit.packs } : { model, grade: d.lead.grade, colour: d.lead.colour, interior: pickInterior(R, model, d.lead.grade), packs: pickPacks(R, model, d.biz) };
  d.spec = spec; d.unit = unit;
  const list = unit && unit.status === 'sold' ? unit.listPrice : listPriceAt(spec, priceAt);
  const landed = unit ? unit.landedCost : landedFor(R, list);
  const aged = unit ? (unit.status === 'sold' ? unit.daysInStock : (unit.daysInStock || 0)) : 0;
  // accessories
  const accPool = [...DEALER_ACC._all, ...(DEALER_ACC[model] || [])];
  const nAcc = R.w({ 0: 30, 1: 35, 2: 22, 3: 13 });
  d.accessories = R.sample(accPool.map((a) => a).filter((a) => R.chance(a[3] / 3.2 + 0.1)), nAcc).map(([id, name, price]) => ({ id, name, price: round(price * priceFactor(priceAt), 5) }));
  const accTotal = d.accessories.reduce((t, a) => t + a.price, 0);
  const accGross = round(d.accessories.reduce((t, a) => t + a.price * (a.id === 'acc-paint' ? 0.7 : a.id === 'acc-canopy' || a.id === 'acc-bullbar' ? 0.28 : 0.4), 0), 1);
  // promotions
  const promos = activePromos(priceAt, model, aged > 60).filter((p) => R.chance(p.kind === 'delivery' ? 0.3 : 0.55)).slice(0, 2);
  d.promotions = promos.map((p) => ({ id: p.id, title: p.title, value: p.value }));
  const promoCostTotal = promos.reduce((t, p) => t + promoCost(p), 0);
  // discount
  const m = monthOf(priceAt);
  const seasonal = m === 6 ? 1.35 : m === 12 ? 1.25 : m === 1 ? 0.85 : 1;
  const agedF = aged > 45 ? 1 + (aged - 45) / 55 : 1;
  // ready-now / aged bonus: drawn from the unit's manager-approvable headroom
  const bonus = unit && unit.bonusHeadroom && aged > 45 ? round(unit.bonusHeadroom * R.u(0.5, 1), 100) : 0;
  let discount = list * 0.0115 * sp.disc * seasonal * (DEMAND[model] || 1) * agedF * R.logn(1, 0.45) * (d.biz ? 1.3 : 1) * (bonus ? 0.35 : 1);
  discount = round(clamp(discount, 0, list * 0.06), 50);
  // trade-in
  let overAllowance = 0;
  if (d.hasTrade && (d.stages.length >= 2 && d.stages[1][1] <= NOW)) {
    const [make, tmodel, newP] = R.w(TRADE_CARS.map((c) => [c, c[3]]));
    const year = clamp(yearOf(priceAt) - Math.round(R.logn(7, 0.45)), 2005, yearOf(priceAt) - 1);
    const age = yearOf(priceAt) - year + 0.5;
    const km = Math.max(4000, round(age * R.logn(14500, 0.3), 100));
    const condition = R.w({ excellent: 12, good: 50, fair: 30, poor: 8 });
    const kmAdj = 1 - clamp((km - 14500 * age) / 220000, -0.08, 0.25);
    const resale = make === 'Toyota' && /HiLux|Prado|RAV4/.test(tmodel) ? 1.1 : make === 'Holden' ? 0.85 : 1;
    const valuation = Math.max(1500, round(newP * 0.8 * Math.pow(0.885, age) * kmAdj * { excellent: 1.06, good: 1, fair: 0.9, poor: 0.76 }[condition] * resale, 100));
    const bonus = promos.filter((p) => p.kind === 'trade-in').reduce((t, p) => t + p.value, 0);
    const over = round(clamp(R.norm(250, 450), -400, 1500), 100);
    const offered = round(valuation + over + bonus, 100);
    overAllowance = Math.max(0, offered - valuation - bonus);
    const appraisedAt = toBiz(R, d.stages[1][1] - R.u(0, 0.5) * DAY);
    const reconditioning = round({ excellent: R.u(150, 600), good: R.u(400, 1400), fair: R.u(1200, 2800), poor: R.u(2500, 4800) }[condition], 10);
    const ti = { dealId: d.id, customerId: null, siteId: d.site, make, model: tmodel, year, km, condition, valuation, reconditioning, offered, overAllowance, appraisedAt: iso(Math.min(appraisedAt, NOW)), appraisedBy: MANAGER(d.site).id, rego: `${R.code(3, 'ABCDEFGHJKLMNPRSTUVWXYZ')}${R.int(10, 99)}${R.code(1, 'ABCDEFGHJKLMNPRSTUVWXYZ')}`, documents: ['rego-certificate.pdf', ...(R.chance(0.7) ? ['service-history.pdf'] : []), `photos-${R.int(6, 14)}.zip`, ...(R.chance(0.25) ? ['payout-letter.pdf'] : [])], payout: R.chance(0.25) ? round(valuation * R.u(0.2, 0.7), 100) : 0 };
    tradeIns.push(ti); d.trade = ti;
  }
  // finance
  const onRoadCosts = onRoad(list);
  const driveAway = list + onRoadCosts + accTotal - bonus - discount;
  const deposit = d.contractAt && d.contractAt <= NOW ? round(R.w({ 500: 2, 1000: 4, 2000: 2, 5000: 1 }) * (d.biz ? 2 : 1), 100) : 0;
  d.appsOut = [];
  for (const a of d.apps || []) {
    if (a.submittedAt > NOW) continue;
    const L0 = LENDERS[a.lender];
    const tradeEq = d.trade ? d.trade.offered - d.trade.payout : 0;
    const cashIn = R.chance(0.45) ? round(R.u(1000, 15000), 500) : 0;
    const amount = Math.max(8000, driveAway - deposit - tradeEq - cashIn);
    const promoRate = d.promotions.some((p) => PROMOTIONS.find((x) => x.id === p.id)?.kind === 'finance') && a.lender === 'Toyota Finance';
    const rate = Math.round((promoRate ? R.u(4.49, 5.49) : L0.rate + R.norm(0, 0.55) + (priceAt < L(2025, 6, 1) ? 0.55 : 0) + (d.biz ? 0.35 : 0)) * 100) / 100;
    let status = a.result === 'declined' ? 'declined' : a.conditional ? 'conditional' : 'approved';
    let decisionAt = a.decisionAt;
    if (decisionAt > NOW) { status = 'submitted'; decisionAt = null; }
    else if (status === 'conditional' && a.clearedAt <= NOW) status = 'approved';
    let settledAt = null;
    if (status === 'approved' && d.deliveredAt && !d.cancel && d.deliveredAt + DAY <= NOW) { settledAt = toBiz(R, d.deliveredAt + R.u(0.5, 3) * DAY); if (settledAt <= NOW) status = 'settled'; else settledAt = null; }
    const fa = { dealId: d.id, customerId: null, siteId: d.site, businessManagerId: BM(d.site).id, lender: a.lender, amount, termMonths: R.w({ 36: 10, 48: 20, 60: 50, 72: 15, 84: 5 }), rate: Math.max(3.99, rate), balloon: R.chance(0.3) ? round(amount * R.u(0.2, 0.35), 100) : 0, status, submittedAt: iso(a.submittedAt), decisionAt: iso(decisionAt), conditionsClearedAt: a.conditional && a.clearedAt <= NOW ? iso(a.clearedAt) : null, settledAt: iso(settledAt), conditions: a.conditional ? (a.stuckNote || R.pick(['Two recent payslips', 'Proof of address', '3 months of bank statements', 'Employer letter confirming permanent role'])) : null, sequence: a.seq, _a: a };
    financeApps.push(fa); d.appsOut.push(fa);
  }
  // gross
  const financeUsed = d.appsOut.find((f) => ['approved', 'settled', 'conditional', 'submitted'].includes(f.status));
  const bm = STAFF_BY[BM(d.site).id].k.fin;
  let back = 0;
  if (financeUsed) back = financeUsed.amount * R.u(0.011, 0.021) * bm + (R.chance(0.45 * bm) ? R.u(320, 680) : 0) + (R.chance(0.25) ? R.u(380, 900) : 0);
  else back = (R.chance(0.55) ? R.u(150, 450) : 0) + (R.chance(0.18) ? R.u(380, 850) : 0);
  back = round(financeUsed ? clamp(back, 600, 2800) : back, 1);
  const front = Math.round(list - discount - bonus - landed + accGross - promoCostTotal - overAllowance);
  Object.assign(d, { list, landed, discount, bonus, onRoadCosts, accTotal, driveAway, deposit, accGross, promoCostTotal, overAllowance, front, back, gross: front + back, financeUsed });
}
// finance & trade-in ids in time order
financeApps.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)).forEach((f, i) => { f.id = `FA-${30001 + i}`; });
{ const RES = new Set([30418, 30441]); let n = 30440 - tradeIns.length; tradeIns.sort((a, b) => a.appraisedAt.localeCompare(b.appraisedAt)).forEach((t) => { while (RES.has(n)) n++; t.id = `TI-${n++}`; }); }

// ════════════════════════════════════════════════════════════════════════════
// 5. DEAL EVENTS (human notes)
// ════════════════════════════════════════════════════════════════════════════
const RE = rng('events');
const money = (n) => `$${Math.round(n).toLocaleString('en-AU')}`;
const fmtDate = (ms) => new Date(ms).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtTime = (ms) => { const h = Math.floor(hourOf(ms)), m = Math.round((hourOf(ms) - h) * 60); return `${h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`; };
const nm = (d) => `${MODELS[d.spec.model].name} ${gradeOf(d.spec.model, d.spec.grade).name}`;
const first = (id) => STAFF_BY[id].name.split(' ')[0];
function quoteNotes(R, d) {
  const p = d.lead.person, m = d.spec.model, notes = [];
  const mo = monthOf(d.createdAt);
  if (d.biz) notes.push(R.pick([`Fleet account (${p.company}). ${p.first} wants ${R.int(1, 3) > 1 ? 'two' : 'one'} ${MODELS[m].name} on the same spec as the last order.`, `${p.company}: needs it on the road for a new apprentice starting next month.`, `ABN holder, asked for the quote on company letterhead and itemised for the accountant.`]));
  if ((mo === 5 || mo === 6) && (d.biz || R.chance(0.4))) notes.push('Needs it delivered before 30 June for the instant asset write-off.');
  if (mo === 11 || (mo === 12 && new Date(d.createdAt).getUTCDate() < 15)) notes.push(R.pick(['Wants it before Christmas for the drive to see family in Brisbane.', 'Customer wants delivery before school holidays.', 'Heading to the South Coast on Boxing Day; delivery before Christmas is a must.']));
  if ((mo === 3 || mo === 9) && R.chance(0.4)) notes.push('Customer wants delivery before school holidays.');
  if (MODELS[m].seats >= 7) notes.push(R.pick(['Three kids, the eldest is 13; third row needs to work for school pick-ups with friends.', 'Brought the in-laws to check the third row access.', 'Family of six, currently squeezing into a Corolla wagon.']));
  if (m === 'bz4x') notes.push(R.pick(['Asked about home charging; sent the wallbox info and the electrician contact.', 'Lives in a unit; checked the strata rules on charging with them.']));
  if (MODELS[m].towKg >= 2500 && R.chance(0.5)) notes.push(R.pick([`Towing a ${R.int(18, 22)}ft Jayco; confirmed ${MODELS[m].towKg.toLocaleString('en-AU')} kg braked capacity and the brake controller.`, 'Tows a 5.2 m boat to Port Hacking most weekends.', 'Wants the tow pack and a brake controller fitted before pickup.']));
  if (d.td) notes.push(R.pick(['Loved the drive, partner needs to see it before committing; bringing them Saturday.', 'Test drive went well. Very focused on fuel economy versus their current car.', 'Drove it on the M4, happy with the noise levels. Asked for a written quote.', 'Kids approved the back seat. Wants to compare colours in the sun.', 'Liked it but wants to sit in the grade above before deciding.']));
  if (R.chance(0.15)) notes.push(`Has been looking since ${R.pick([mo >= 5 ? 'Easter' : 'Christmas', mo >= 3 ? 'the start of the year' : 'the spring', 'last month', 'the school holidays'])}; ready to move if the numbers work.`);
  notes.push(R.pick([`Quoted ${money(d.driveAway)} drive-away. Customer comparing with a ${R.pick(COMPETITORS[m] || ['Mazda CX-5'])}.`, `Quoted ${money(d.driveAway)} drive-away; colour must be ${COLOUR[d.spec.colour].name}.`, `Sent written quote, ${money(d.driveAway)} drive-away including accessories and on-roads.`, `Emailed quote for ${nm(d)}: ${money(d.driveAway)} drive-away.`]));
  return notes;
}
function buildEvents(d) {
  const R = RE, ev = [], sp = d.owner, mgr = MANAGER(d.site).id, bm = BM(d.site).id, p = d.lead.person;
  const add = (at, type, note, staffId = sp) => { if (at <= NOW) ev.push({ at, type, note, staffId }); };
  const st = Object.fromEntries(d.stages);
  add(d.createdAt, 'created', `Deal opened from ${d.lead.id} (${d.lead.channel}) for ${nm(d)}.`);
  const qn = quoteNotes(R, d);
  add(d.createdAt + 20 * MIN, 'quote_sent', qn.pop());
  qn.forEach((n, i) => add(d.createdAt + (40 + i * 25) * MIN, 'note', n));
  if (st.negotiation) {
    add(st.negotiation, 'stage_change', 'Moved to negotiation.');
    add(st.negotiation + 30 * MIN, R.pick(['call', 'note']), R.pick([`Customer came back with a ${R.pick(RIVAL_DEALERS)} quote ${money(round(R.u(600, 2500), 100))} cheaper. Sent to ${first(mgr)} for a desk.`, `Agreed ${money(d.discount)} off; customer to sleep on it.`, `${first(mgr)} desked it at ${money(d.driveAway)} drive-away. Customer asked for mats and tint thrown in.`, `Customer happy with the price, just confirming the colour with their partner.`, `Followed up by SMS, customer at work until 5; call booked for tonight.`]));
    if (d.trade) add(st.negotiation + 50 * MIN, 'trade_appraisal', `Appraised ${d.trade.year} ${d.trade.make} ${d.trade.model}, ${d.trade.km.toLocaleString('en-AU')} km, ${d.trade.condition} condition${d.trade.condition === 'fair' ? ' (needs tyres and a windscreen)' : d.trade.condition === 'poor' ? ' (panel damage on the rear quarter, overdue service)' : ''}. Valued ${money(d.trade.valuation)}, offered ${money(d.trade.offered)}.`, mgr);
    if (d.promotions.length) add(st.negotiation + 70 * MIN, 'note', `Applied ${d.promotions.map((x) => x.title).join(' and ')} to close the gap.`);
  }
  if (st.finance) {
    add(st.finance, 'stage_change', 'Handed to finance.', bm);
    for (const f of d.appsOut) {
      const a = f._a;
      add(a.submittedAt, 'finance_submitted', `Submitted to ${f.lender} for ${money(f.amount)} over ${f.termMonths} months${f.balloon ? ` with a ${money(f.balloon)} balloon` : ''}.`, bm);
      if (a.decisionAt <= NOW) {
        if (a.result === 'declined') add(a.decisionAt, 'finance_decision', `Declined by ${f.lender}${R.pick([': credit file has a default from 2022', ': serviceability, too many credit cards', ': casual employment under 6 months', ''])}.${a.seq === 1 && d.appsOut.length > 1 ? ` Resubmitting with ${d.appsOut[1].lender}.` : ''}`, bm);
        else if (a.conditional) add(a.decisionAt, 'finance_decision', a.stuckNote || `Conditional approval from ${f.lender}: needs ${f.conditions.toLowerCase()}.`, bm);
        else add(a.decisionAt, 'finance_decision', `Approved by ${f.lender} at ${f.rate.toFixed(2)}% over ${f.termMonths} months.`, bm);
      } else if (a.stuckNote) add(a.submittedAt + R.u(1.2, 3) * DAY, 'note', a.stuckNote, bm);
      if (a.conditional && a.clearedAt <= NOW) add(a.clearedAt, 'finance_decision', `Conditions met, ${f.lender} approved at ${f.rate.toFixed(2)}%.`, bm);
      if (a.conditional && a.clearedAt > NOW) add(Math.min(NOW - 2 * HOUR, a.decisionAt + R.u(2, 4) * DAY), 'call', `Chased ${p.first || 'the customer'} for the outstanding documents; promised by end of week.`, bm);
    }
  }
  if (st.approval) {
    add(st.approval, 'stage_change', 'Sent to the sales manager for approval.');
    if (d.stuck === 'approval') add(st.approval + R.u(0.5, 2) * DAY, 'note', d.stuckNote, mgr);
    else add(st.approval + R.u(1, 5) * HOUR, 'manager_approval', d.overAllowance > 900 ? `${first(mgr)} approved, including ${money(d.overAllowance)} over-allowance on the trade to hold the deal.` : `${first(mgr)} approved the desk at ${money(d.front)} front gross.`, mgr);
  }
  if (d.contractAt && d.contractAt <= NOW && !d.stuck) {
    add(d.contractAt, 'contract_signed', `Contract signed, ${money(d.deposit)} deposit taken by ${R.pick(['card', 'bank transfer', 'card'])}.`);
    if (d.fulfil === 'factory') add(d.contractAt + HOUR, 'order_placed', `Factory order placed: ${nm(d)} in ${COLOUR[d.spec.colour].name}, ETA ${d.etaWeeks} weeks.`);
    if (d.fulfil === 'allocated') add(d.contractAt + HOUR, 'order_placed', `Allocated inbound ${d.unit?.stockNo || 'unit'} (${COLOUR[d.spec.colour].name}), due ${fmtDate(d.deliveredAt - 3 * DAY)}.`);
    if (d.fulfil === 'stock' && d.unit) add(d.contractAt + HOUR, 'note', `${d.unit.stockNo} sold off the lot${d.unit.daysInStock > 60 ? ` after ${d.unit.daysInStock} days; aged bonus used` : ''}.`);
    if (d.eofy) add(d.contractAt + 2 * HOUR, 'note', 'EOFY: must be delivered and registered by 30 June. Prioritised in the delivery schedule.');
    if (d.xmas) add(d.contractAt + 2 * HOUR, 'note', 'Delivery promised before Christmas.');
    if (d.fulfil === 'factory' && days(d.contractAt, Math.min(d.deliveredAt, NOW)) > 40) {
      add(d.contractAt + R.u(25, 40) * DAY, 'eta_update', R.pick(['Customer called for an ETA update; still on track.', `Vessel delayed at port, customer informed; new ETA ${fmtDate(d.deliveredAt - 2 * DAY)}.`, 'Build slot confirmed by the factory; told the customer.']));
    }
  }
  if (d.deliveryStageAt && d.deliveryStageAt <= NOW && !(d.lostAt && d.lostAt < d.deliveryStageAt)) add(d.deliveryStageAt, 'delivery_booked', `Delivery booked for ${fmtDate(d.deliveredAt)} at ${fmtTime(d.deliveredAt)}. Car in for detail${d.accessories.some((a) => a.id === 'acc-tint') ? ' and tint' : ''}.`);
  if (d.deliveredAt && d.deliveredAt <= NOW && !d.cancel) {
    add(d.deliveredAt, 'delivered', R.pick([`Delivered by ${first(sp)}. Walked through the Toyota Connected app and paired phones.`, 'Handover done, customer very happy; asked them for a Google review.', `Delivered. Customer referred their ${R.pick(['brother', 'neighbour', 'workmate', 'sister'])} who is after a ${MODELS[R.pick(Object.keys(MODELS).slice(0, 12))].name}.`, 'Delivered; first service booked at 6 months, explained capped-price servicing.', 'Delivered with the family; photo for the showroom wall.']));
  }
  if (d.lostAt && d.lostAt <= NOW) {
    const comp = R.pick(COMPETITORS[d.spec.model] || ['Mazda CX-5']);
    const map = {
      price: `Bought elsewhere, ${money(round(R.u(500, 2200), 100))} cheaper drive-away. ${first(mgr)} would not go lower.`,
      other_toyota: `Bought the same car from ${R.pick(RIVAL_DEALERS.slice(0, 4))}; they had one in ${COLOUR[d.spec.colour].name} on the lot.`,
      competitor: `Chose a ${comp} instead${R.chance(0.5) ? '; liked the warranty' : '; cheaper to buy'}.`,
      wait_time: `Couldn't wait ${d.etaWeeks || ETA[d.spec.model]?.eta_weeks_min || 12} weeks for the ${MODELS[d.spec.model].name}.`,
      finance_declined: `Finance declined${d.appsOut.length > 1 ? ' by two lenders' : ''}. Customer will save a bigger deposit and come back.`,
      trade_gap: d.trade ? `Trade gap too big: they wanted ${money(d.trade.offered + round(R.u(2000, 5000), 500))} for the ${d.trade.make} ${d.trade.model}.` : 'Wanted more for their trade than we could do.',
      deferred: R.pick(['Decided to keep the current car another year.', 'Job uncertainty, putting it off until the new year.', 'Spent the money on a renovation instead.']),
      no_response: 'Stopped responding after the second quote. 3 calls, 2 emails, 1 SMS.',
    };
    add(d.lostAt, 'lost', map[d.lostCode] || 'Lost.');
  }
  ev.sort((a, b) => a.at - b.at);
  return ev.map((e) => ({ at: iso(e.at), type: e.type, note: e.note, staffId: e.staffId }));
}

// ── deal records ────────────────────────────────────────────────────────────
const dealsOut = [];
for (const d of live) {
  const lostDone = d.lostAt && d.lostAt <= NOW;
  const delivered = !d.cancel && d.deliveredAt && d.deliveredAt <= NOW;
  const hist = d.stages.filter(([, t]) => t <= NOW).map(([stage, at]) => ({ stage, at }));
  if (d.contractAt && d.deliveryStageAt && d.deliveryStageAt <= NOW && !(lostDone && d.lostAt < d.deliveryStageAt)) hist.push({ stage: 'delivery', at: d.deliveryStageAt });
  if (delivered) hist.push({ stage: 'delivered', at: d.deliveredAt });
  if (lostDone) hist.push({ stage: 'lost', at: d.lostAt });
  hist.sort((a, b) => a.at - b.at);
  const stage = hist[hist.length - 1].stage;
  d.stage = stage;
  const isOrder = !d.unit || d.unit.status === 'allocated';
  const events = buildEvents(d);
  const fa = d.appsOut.length ? d.appsOut[d.appsOut.length - 1] : null;
  d.out = {
    id: d.id, leadId: d.lead.id, customerId: d.lead.person.customerId || null, siteId: d.site, salespersonId: d.owner, businessManagerId: d.appsOut.length ? BM(d.site).id : null,
    modelId: d.spec.model, gradeId: d.spec.grade, colourId: d.spec.colour,
    stockNo: d.unit ? d.unit.stockNo : null,
    order: isOrder && (d.fulfil !== 'stock') ? { modelId: d.spec.model, gradeId: d.spec.grade, colourId: d.spec.colour, etaWeeks: d.fulfil === 'allocated' ? Math.max(1, Math.round(days(d.contractAt || d.createdAt, d.deliveredAt) / 7)) : d.etaWeeks || factoryWeeks(RB, d.spec.model, d.createdAt) } : null,
    fulfilment: d.fulfil && d.contractAt <= NOW ? d.fulfil : null,
    stage, createdAt: iso(d.createdAt), updatedAt: events.length ? events[events.length - 1].at : iso(d.createdAt),
    closedAt: delivered ? iso(d.deliveredAt) : lostDone ? iso(d.lostAt) : null,
    contractAt: d.contractAt && d.contractAt <= NOW && !(lostDone && d.lostAt < d.contractAt) ? iso(d.contractAt) : null,
    vehiclePrice: d.list, onRoadCosts: d.onRoadCosts, landedCost: d.landed, accessories: d.accessories, accessoriesTotal: d.accTotal, accessoriesGross: d.accGross, promotions: d.promotions, promotionCost: d.promoCostTotal, tradeInId: null, tradeOverAllowance: d.overAllowance,
    bonus: d.bonus, discount: d.discount, driveAway: d.driveAway, deposit: d.deposit, financeAppId: fa ? null : null,
    frontGross: d.front, backGross: d.back, grossProfit: d.gross, grossStatus: delivered ? 'realised' : lostDone ? 'lost' : 'projected',
    deliveryDate: delivered || (d.contractAt && d.contractAt <= NOW && !lostDone) ? iso(d.deliveredAt) : null,
    lostReason: lostDone ? DEAL_LOST[d.lostCode] : null, lostReasonCode: lostDone ? d.lostCode : null, lostStage: lostDone ? d.lossStage : null,
    stageHistory: hist.map((h) => ({ stage: h.stage, at: iso(h.at) })),
    events,
  };
  if (d.trade) d.out.tradeInId = d.trade.id;
  if (fa) d.out.financeAppId = fa.id;
  if (d.out.order && d.unit && d.unit.status === 'allocated') d.out.order.stockNo = d.unit.stockNo;
  if (!d.contractAt || d.contractAt > NOW) { // pre-contract: proposed vehicle only
    d.out.fulfilment = null;
    if (d.proposedUnit) { d.out.stockNo = d.proposedUnit.id; d.out.order = null; }
    else d.out.order = { modelId: d.spec.model, gradeId: d.spec.grade, colourId: d.spec.colour, etaWeeks: d.etaWeeks || factoryWeeks(RB, d.spec.model, d.createdAt) };
  }
  dealsOut.push(d.out);
}
for (const t of tradeIns) t.customerId = live.find((d) => d.id === t.dealId)?.lead.person.customerId || null;
const dealById = Object.fromEntries(live.map((d) => [d.id, d]));
for (const f of financeApps) { f.customerId = dealById[f.dealId].lead.person.customerId || null; delete f._a; }
for (const p of people) p.delivered = 0;
for (const d of live) if (d.out.stage === 'delivered') d.lead.person.delivered++;

// ── test drive records ──────────────────────────────────────────────────────
const RT = rng('testdrives');
const demoBy = (site, model) => vehicles.find((v) => v.status === 'demo' && v.siteId === site && v.model === model);
const testDrives = [];
for (const td of tds.sort((a, b) => a.when - b.when)) {
  const l = td.lead; if (l.t0 > NOW || td.bookedAt > NOW) continue;
  const R = RT, done = td.when <= NOW;
  let status = done ? td.outcome : 'booked';
  if (td.live) status = td.live.status || 'booked';
  const deal = l.deal && l.deal.createdAt <= NOW ? l.deal : null;
  const cur = currentUnits.filter((u) => u.model === l.model && u.site === l.site && u.status === 'on_lot' && dayStart(NOW) - u.days_in_stock * DAY <= td.when);
  const stockNo = demoBy(l.site, l.model)?.stockNo || (cur.length && td.when > NOW - 120 * DAY ? R.pick(cur).id : null);
  const answered = l.channel === 'configurator' ? R.chance(0.7) : status === 'completed';
  const questions = questionsFor(R, l.model, !!deal?.hasTrade, !!deal?.financed, answered);
  const modelsSeen = l.viewed ? [...new Set(l.viewed.map((v) => v.modelId))] : [l.model];
  const incentive = l.channel === 'configurator' ? pickIncentive(l.finder || [], modelsSeen) : null;
  let handover = null;
  if (l.channel === 'configurator') {
    const promosToOffer = activePromos(td.bookedAt, l.model, false).map((p) => p.id).slice(0, 3);
    const A = Object.fromEntries((l.finder || []).map((a) => [a.id, a.value]));
    const tp = [];
    if (A.towing === 'heavy') tp.push(`Show the ${MODELS[l.model].towKg.toLocaleString('en-AU')} kg braked rating and walk through the brake controller.`);
    if (A.people === 'seven') tp.push('Fold the third row in front of them; check access with a child seat fitted.');
    if (A.power === 'ev') tp.push('Cover home charging and public DC charging around Western Sydney.');
    if (A.when === 'now') tp.push('Wants a car this week: have the on-lot match ready and the transfer option if needed.');
    if (A.budget) tp.push(`Budget answer ${A.budget}: quote the grade that fits before showing the one above.`);
    tp.push(questions.find((q) => q.id === 'trade-in')?.answer === 'Yes' ? 'Has a trade: book the appraisal during the visit.' : 'Ask about finance early; Toyota Finance comparison ready.');
    handover = { preparedBy: 'Progress Agentic RAG (configurator)', preparedAt: iso(td.bookedAt + 2 * MIN), car: { modelId: l.model, gradeId: l.grade, colourId: l.colour, stockNo: l.interestStock || stockNo || null, name: `${MODELS[l.model].name} ${gradeOf(l.model, l.grade).name}` }, viewed: l.viewed || [], finderAnswers: l.finder || [], promotionsToOffer: promosToOffer, incentive: incentive ? { id: incentive.id, title: incentive.title } : null, talkingPoints: tp.slice(0, 4) };
  }
  const outcome = status === 'completed' ? (deal && deal.createdAt - td.when < 5 * DAY ? R.w({ quoted: 7, second_drive_requested: 1 }) : R.w({ considering: 5, not_for_them: 3, second_drive_requested: 1 })) : status === 'no_show' ? 'no_show' : status === 'cancelled' ? R.pick(['cancelled_by_customer', 'rescheduled', 'cancelled_by_customer']) : null;
  testDrives.push({ id: td.id, leadId: l.id, customerId: status === 'completed' || !l.person.anon ? l.person.customerId || null : null, siteId: l.site, staffId: l.owner, stockNo, modelId: l.model, gradeId: l.grade, when: iso(td.when), bookedAt: iso(td.bookedAt), status, channel: l.channel, questions, incentive, handover, outcome });
  if (!l.bookingId && l.channel === 'configurator') l.bookingId = td.id;
}

// ── lead records ────────────────────────────────────────────────────────────
const leadsOut = [];
const CH_SOURCE = { configurator: 'web-configurator', 'walk-in': 'walk-in', phone: 'phone', 'web-form': 'web-form', campaign: 'campaign' };
for (const l of leads) {
  if (l.t0 > NOW) continue;
  const tl = l.tl, deal = l.deal && l.deal.createdAt <= NOW ? l.deal : null;
  const steps = [['new', l.t0]];
  if (tl.contactAt && tl.contactAt <= NOW) steps.push(['contacted', tl.contactAt]);
  if (tl.qualAt && tl.qualAt <= NOW) steps.push(['qualified', Math.max(tl.qualAt, tl.contactAt || 0)]);
  if (tl.tdBookedAt && tl.tdBookedAt <= NOW) steps.push(['test_drive_booked', tl.tdBookedAt]);
  if (deal) {
    steps.push(['quoted', deal.createdAt]);
    if (deal.out.contractAt && deal.out.stage !== 'lost') steps.push(['won', Date.parse(deal.out.contractAt.slice(0, 19) + 'Z')]);
    else if (deal.out.stage === 'lost' && deal.out.contractAt) steps.push(['won', Date.parse(deal.out.contractAt.slice(0, 19) + 'Z')], ['lost', deal.lostAt]);
    else if (deal.out.stage === 'lost') steps.push(['lost', deal.lostAt]);
  } else if (tl.lostAt && tl.lostAt <= NOW) steps.push(['lost', tl.lostAt]);
  if (l.channel === 'configurator' && steps.length >= 2 && steps[1][0] === 'contacted') { /* configurator leads start at test_drive_booked */ }
  steps.sort((a, b) => a[1] - b[1]);
  let status = steps[steps.length - 1][0];
  if (l.channel === 'configurator' && status === 'new') status = 'test_drive_booked';
  const lostReason = status === 'lost' ? (deal ? DEAL_LOST[deal.lostCode] : LEAD_LOST[tl.lostCode]) : null;
  const lostReasonCode = status === 'lost' ? (deal ? deal.lostCode : tl.lostCode) : null;
  // score: channel intent + progress + recency for open leads
  const R = RB;
  let score = { configurator: 62, 'walk-in': 55, phone: 45, 'web-form': 38, campaign: 32 }[l.channel];
  score += { new: 0, contacted: 5, qualified: 12, test_drive_booked: 18, quoted: 25, won: 40, lost: -30 }[status];
  if (l.finder?.some((a) => a.id === 'when' && a.value === 'now')) score += 8;
  if (!['won', 'lost'].includes(status)) score -= Math.min(25, days(l.t0, NOW) / 3);
  score = clamp(Math.round(score + R.norm(0, 5)), 1, 99);
  const cust = l.person.customerId || null;
  const rec = {
    id: l.id, customerId: cust, customerRef: cust ? null : l.sid || null, siteId: l.site, ownerId: l.owner, source: l.source, channel: l.channel, status,
    createdAt: iso(l.t0), updatedAt: iso(steps[steps.length - 1][1]),
    interest: { modelId: l.model, gradeId: l.grade, colourId: l.colour, stockNo: null },
    configuratorSessionId: l.sid || null, finderAnswers: l.finder || [], viewed: l.viewed || [], bookingId: l.bookingId || null,
    campaignId: l.campaign?.id || null, mergedIntoLeadId: l.touch && l.primary ? l.primary.id : null,
    lostReason, lostReasonCode, score,
    statusHistory: steps.map(([s, t]) => ({ status: s, at: iso(t) })),
  };
  if (l.unitId) { const u = currentUnitsById[l.unitId]; rec.interest = { modelId: u.model, gradeId: u.grade, colourId: u.colour, stockNo: u.id }; }
  else if (l.channel === 'configurator') {
    const units = currentUnits.filter((u) => u.model === l.model && u.status === 'on_lot' && dayStart(NOW) - u.days_in_stock * DAY <= l.t0);
    if (units.length && RB.chance(0.5)) { const u = RB.pick(units); rec.interest = { modelId: u.model, gradeId: u.grade, colourId: u.colour, stockNo: u.id }; rec.viewed = [{ modelId: u.model, gradeId: u.grade, unitId: u.id }, ...rec.viewed.slice(1)]; }
  } else if (deal?.out.stockNo && !deal.out.order) rec.interest.stockNo = deal.out.stockNo;
  leadsOut.push(rec);
}

// ── customers ───────────────────────────────────────────────────────────────
const RC = rng('customers');
const CUST_NOTES = ['Prefers SMS, works night shift.', 'Call after 5pm, teacher.', 'Contact via the office manager for fleet orders.', 'Has a Toyota serviced with us since 2017.', 'Speaks Vietnamese at home; daughter usually comes along.', 'Very price-focused, has three quotes going.', 'Referred by a past customer.', 'Wife makes the final call on colour.', 'Owns a caravan, towing is the priority.', 'Prefers email, travels for work Mon-Thu.', 'Interested in an EV next time.', 'Asked not to be called on Saturdays.', 'Uber driver, wants hybrid running costs.', 'Second car for a P-plater in the family.', ''];
const customers = custPeople.map((p) => {
  const R = RC, ls = p.leads.filter((l) => l.t0 <= NOW).sort((a, b) => a.t0 - b.t0);
  const firstLead = ls[0];
  let source = CH_SOURCE[firstLead.channel];
  if (firstLead.source === 'referral') source = 'referral'; else if (firstLead.source === 'service-department') source = 'service';
  const dels = live.filter((d) => d.lead.person === p && d.out.stage === 'delivered');
  const tags = new Set();
  if (p.business) { tags.add('fleet'); tags.add('abn-holder'); }
  if (dels.length >= 2) tags.add('repeat-buyer');
  if (dels.length) tags.add('owner');
  if (ls.some((l) => l.channel === 'configurator')) tags.add('configurator');
  if (live.some((d) => d.lead.person === p && d.appsOut.length)) tags.add('finance-customer');
  if (live.some((d) => d.lead.person === p && d.trade)) tags.add('trade-in');
  if (firstLead.source === 'service-department') tags.add('service-customer');
  if (ls.some((l) => l.model === 'bz4x')) tags.add('ev-interest');
  if (ls.some((l) => MODELS[l.model].seats >= 7)) tags.add('family');
  if (ls.some((l) => l.model === 'hilux') && !p.business && R.chance(0.5)) tags.add('tradie');
  if (ls.some((l) => l.campaign)) tags.add('campaign-responder');
  return { id: p.customerId, firstName: p.first, lastName: p.last, company: p.company, email: p.email, phone: p.phone, suburb: p.suburb, postcode: p.postcode, state: 'NSW', siteId: p.site, source, createdAt: iso(firstLead.t0), tags: [...tags], notes: p.business ? `Fleet account, ${p.fleetSize} vehicles. ${R.pick(['Invoices to accounts payable.', 'Prefers to deal with the same consultant.', 'Pays by EFT on delivery.'])}` : R.pick(CUST_NOTES), unitsPurchased: dels.length, marketingConsent: R.chance(0.68) };
});

// ════════════════════════════════════════════════════════════════════════════
// 5b. DOCUMENT-PROCESSING DEMO DEALS (exact records that match content/dms/samples/*.pdf)
// ════════════════════════════════════════════════════════════════════════════
const MANIFEST = readJson(join(ROOT, 'content', 'dms', 'samples', 'manifest.json'), []);
{
  const R = rng('demo-deals');
  const t = (s) => Date.parse(`${s}Z`); // local wall clock
  const nextCust = () => `C-${10001 + customers.length}`;
  let faN = 30001 + financeApps.length;
  const DEMO = [
    { dealId: 'D-10482', site: 'par', sp: 'st-sp-04', bm: 'st-bm-par', mgr: 'st-sm-par', stockNo: 'HL-2231', modelId: 'rav4', gradeId: 'cruiser', colourId: 'graphite',
      cust: { firstName: 'Priya', lastName: 'Raman', suburb: 'Westmead', postcode: '2145', bg: 'indian', notes: 'Booked through the configurator for the aged RAV4 Cruiser; wants the car before her new job starts on 26 October.' },
      leadAt: '2026-10-03T19:42:00', channel: 'configurator', tdAt: '2026-10-06T10:30:00', quoteAt: '2026-10-06T11:40:00', negAt: '2026-10-07T16:10:00', finAt: '2026-10-09T10:15:00', apprAt: '2026-10-10T12:20:00', contractAt: '2026-10-12T14:30:00', delivery: '2026-10-21T15:00:00',
      vehiclePrice: 59240, onRoadCosts: 3550, accessories: [{ id: 'protection', name: 'Protection Pack (fitted)', price: 890 }, { id: 'tow', name: 'Towing Pack', price: 1650 }], promotions: [], bonus: 1800, discount: 0, driveAway: 63530, deposit: 1000,
      trade: { id: 'TI-30418', make: 'Mazda', model: 'CX-5 Maxx Sport', year: 2017, km: 98450, condition: 'good', valuation: 14500, reconditioning: 1000, rego: 'EKP42L', vin: 'JM0KF4W7A00381624', appraisedBy: 'st-sm-par', at: '2026-10-07T15:20:00' },
      fin: { lender: 'Toyota Finance', amount: 48030, termMonths: 60, rate: 6.99, submittedAt: '2026-10-09T10:40:00', decisionAt: '2026-10-09T13:05:00' } },
    { dealId: 'D-10517', site: 'hor', sp: 'st-sp-08', bm: 'st-bm-hor', mgr: 'st-sm-hor', stockNo: 'HL-1941', modelId: 'kluger', gradeId: 'grande', colourId: 'graphite',
      cust: { firstName: 'Daniel', lastName: 'Okafor', suburb: 'Thornleigh', postcode: '2120', bg: 'other', notes: 'Family of five plus a dog; replacing a hail-damaged Territory. Prefers email.' },
      leadAt: '2026-10-08T10:05:00', channel: 'walk-in', tdAt: '2026-10-08T10:40:00', quoteAt: '2026-10-08T12:10:00', negAt: '2026-10-09T17:30:00', finAt: '2026-10-10T09:50:00', apprAt: '2026-10-12T11:15:00', contractAt: '2026-10-13T16:20:00', delivery: '2026-10-24T10:00:00',
      vehiclePrice: 88640, onRoadCosts: 3950, accessories: [{ id: 'roof', name: 'Roof & Cargo Pack', price: 1290 }], promotions: ['promo-tsa-aged'], bonus: 2400, discount: 500, driveAway: 90980, deposit: 2000,
      trade: { id: 'TI-30441', make: 'Ford', model: 'Territory TS', year: 2015, km: 162300, condition: 'poor', valuation: 9800, reconditioning: 3920, rego: 'CWR18H', vin: '6FPAAAJGSWFA41277', appraisedBy: 'st-sm-hor', at: '2026-10-09T16:45:00' },
      fin: { lender: 'Macquarie', amount: 79180, termMonths: 48, rate: 8.29, submittedAt: '2026-10-10T10:20:00', decisionAt: '2026-10-11T09:35:00' } },
  ];
  for (const x of DEMO) {
    const v = vehicleByStock[x.stockNo];
    v.dealId = x.dealId; v.listPrice = x.vehiclePrice; v.landedCost = landedFor(R, x.vehiclePrice);
    const custId = nextCust();
    const email = `${slug(x.cust.firstName)}.${slug(x.cust.lastName)}@example.com.au`;
    customers.push({ id: custId, firstName: x.cust.firstName, lastName: x.cust.lastName, company: null, email, phone: phoneFor(R, false), suburb: x.cust.suburb, postcode: x.cust.postcode, state: 'NSW', siteId: x.site, source: x.channel === 'configurator' ? 'web-configurator' : 'walk-in', createdAt: iso(t(x.leadAt)), tags: ['finance-customer', 'trade-in', ...(x.channel === 'configurator' ? ['configurator'] : ['family'])], notes: x.cust.notes, unitsPurchased: 0, marketingConsent: true });
    const leadId = `L-${100001 + leadsOut.length}`;
    const tdId = newTdId(R);
    const sid = x.channel === 'configurator' ? newSid(R) : null;
    const finder = x.channel === 'configurator' ? [{ id: 'use', value: 'family' }, { id: 'people', value: 'five' }, { id: 'towing', value: 'light' }, { id: 'power', value: 'hybrid' }, { id: 'priorities', value: 'safety' }, { id: 'budget', value: 'b75' }, { id: 'when', value: 'now' }] : [];
    const viewed = x.channel === 'configurator' ? [{ modelId: 'rav4', gradeId: 'cruiser', unitId: 'HL-2231' }, { modelId: 'kluger', gradeId: 'gxl', unitId: 'HL-2310' }] : [];
    leadsOut.push({ id: leadId, customerId: custId, customerRef: null, siteId: x.site, ownerId: x.sp, source: x.channel === 'configurator' ? 'web-configurator' : 'showroom', channel: x.channel, status: 'won', createdAt: iso(t(x.leadAt)), updatedAt: iso(t(x.contractAt)), interest: { modelId: x.modelId, gradeId: x.gradeId, colourId: x.colourId, stockNo: x.stockNo }, configuratorSessionId: sid, finderAnswers: finder, viewed, bookingId: x.channel === 'configurator' ? tdId : null, campaignId: null, mergedIntoLeadId: null, lostReason: null, lostReasonCode: null, score: 96, statusHistory: [{ status: 'new', at: iso(t(x.leadAt)) }, { status: 'contacted', at: iso(t(x.leadAt) + (x.channel === 'configurator' ? 14 * HOUR : 0)) }, { status: 'qualified', at: iso(t(x.leadAt) + (x.channel === 'configurator' ? 14.2 * HOUR : 20 * MIN)) }, { status: 'test_drive_booked', at: iso(t(x.leadAt) + (x.channel === 'configurator' ? 0 : 25 * MIN)) }, { status: 'quoted', at: iso(t(x.quoteAt)) }, { status: 'won', at: iso(t(x.contractAt)) }].sort((a, b) => a.at.localeCompare(b.at)) });
    const questions = questionsFor(R, x.modelId, true, true, true);
    testDrives.push({ id: tdId, leadId, customerId: custId, siteId: x.site, staffId: x.sp, stockNo: x.stockNo, modelId: x.modelId, gradeId: x.gradeId, when: iso(t(x.tdAt)), bookedAt: iso(t(x.leadAt)), status: 'completed', channel: x.channel, questions, incentive: x.channel === 'configurator' ? pickIncentive(finder, ['rav4']) : null, handover: x.channel === 'configurator' ? { preparedBy: 'Progress Agentic RAG (configurator)', preparedAt: iso(t(x.leadAt) + 2 * MIN), car: { modelId: 'rav4', gradeId: 'cruiser', colourId: 'graphite', stockNo: 'HL-2231', name: 'RAV4 Cruiser' }, viewed, finderAnswers: finder, promotionsToOffer: ['promo-tsa-aged', 'promo-tradein-aged', 'promo-door-delivery'], incentive: null, talkingPoints: ['Wants a car this week: HL-2231 is on the lot at Parramatta with a $1,800 ready-now bonus.', 'Light towing (bike trailer): Towing Pack rated 1,500 kg braked.', 'Has a trade: book the appraisal during the visit.'] } : null, outcome: 'quoted' });
    const tr = x.trade;
    tradeIns.push({ id: tr.id, dealId: x.dealId, customerId: custId, siteId: x.site, make: tr.make, model: tr.model, year: tr.year, km: tr.km, condition: tr.condition, valuation: tr.valuation, reconditioning: tr.reconditioning, offered: tr.valuation, overAllowance: 0, appraisedAt: iso(t(tr.at)), appraisedBy: tr.appraisedBy, rego: tr.rego, vin: tr.vin, documents: ['rego-certificate.pdf', 'service-history.pdf', 'photos-12.zip'], payout: 0 });
    const f = x.fin, faId = `FA-${faN++}`;
    financeApps.push({ id: faId, dealId: x.dealId, customerId: custId, siteId: x.site, businessManagerId: x.bm, lender: f.lender, amount: f.amount, termMonths: f.termMonths, rate: f.rate, balloon: 0, status: 'approved', submittedAt: iso(t(f.submittedAt)), decisionAt: iso(t(f.decisionAt)), conditionsClearedAt: null, settledAt: null, conditions: null, sequence: 1 });
    const promos = x.promotions.map((id) => PROMOTIONS.find((p) => p.id === id));
    const accGross = Math.round(x.accessories.reduce((s2, a) => s2 + a.price * 0.4, 0));
    const promoCostTotal = promos.reduce((s2, p) => s2 + promoCost(p), 0);
    const front = x.vehiclePrice - x.discount - x.bonus - v.landedCost + accGross - promoCostTotal;
    const back = Math.round(f.amount * 0.016 + 480);
    const at = (s2) => iso(t(s2));
    const mgrN = first(x.mgr), spN = first(x.sp), bmN = first(x.bm);
    const events = x.dealId === 'D-10482' ? [
      { at: at(x.quoteAt), type: 'created', note: `Deal opened from ${leadId} (configurator) for RAV4 Cruiser HL-2231.`, staffId: x.sp },
      { at: iso(t(x.quoteAt) + 20 * MIN), type: 'quote_sent', note: 'Quoted HL-2231 with the $1,800 ready-now bonus, $63,530 drive-away with Protection and Towing Packs.', staffId: x.sp },
      { at: iso(t(x.quoteAt) + 45 * MIN), type: 'note', note: 'Starts a new job in Norwest on 26 October and needs the car before then. Tows a small bike trailer.', staffId: x.sp },
      { at: at(x.negAt), type: 'stage_change', note: 'Moved to negotiation.', staffId: x.sp },
      { at: at(x.trade.at), type: 'trade_appraisal', note: `Appraised 2017 Mazda CX-5 Maxx Sport, 98,450 km. Scratch on rear bumper, stone chips, seat bolster wear. Recon $1,000. Valued $14,500.`, staffId: x.mgr },
      { at: iso(t(x.negAt) + 40 * MIN), type: 'call', note: 'Customer accepted $14,500 for the CX-5 after checking two online valuations.', staffId: x.sp },
      { at: at(x.finAt), type: 'stage_change', note: 'Handed to finance.', staffId: x.bm },
      { at: at(f.submittedAt), type: 'finance_submitted', note: 'Submitted to Toyota Finance for $48,030 over 60 months.', staffId: x.bm },
      { at: at(f.decisionAt), type: 'finance_decision', note: `Approved by Toyota Finance at ${f.rate.toFixed(2)}% over 60 months.`, staffId: x.bm },
      { at: at(x.apprAt), type: 'stage_change', note: 'Sent to the sales manager for approval.', staffId: x.sp },
      { at: iso(t(x.apprAt) + 2 * HOUR), type: 'manager_approval', note: `${mgrN} approved: $1,800 bonus is within the unit's aged headroom.`, staffId: x.mgr },
      { at: at(x.contractAt), type: 'contract_signed', note: 'Contract signed, $1,000 deposit taken by card. Signed contract scanned for processing.', staffId: x.sp },
      { at: iso(t(x.contractAt) + 50 * MIN), type: 'delivery_booked', note: 'Delivery booked for Wednesday 21 Oct at 3:00pm. Tow bar fitting Monday (PO HL-PO-7731).', staffId: x.sp },
    ] : [
      { at: at(x.quoteAt), type: 'created', note: `Deal opened from ${leadId} (walk-in) for Kluger Grande HL-1941.`, staffId: x.sp },
      { at: iso(t(x.quoteAt) + 15 * MIN), type: 'quote_sent', note: 'Quoted HL-1941 at $91,480 drive-away with the Roof & Cargo Pack and 3 years Toyota Service Advantage.', staffId: x.sp },
      { at: iso(t(x.quoteAt) + 35 * MIN), type: 'note', note: 'Territory was hail-damaged in the September storm; insurer paid out the excess only. Needs seven seats for school carpool.', staffId: x.sp },
      { at: at(x.negAt), type: 'stage_change', note: 'Moved to negotiation.', staffId: x.sp },
      { at: at(x.trade.at), type: 'trade_appraisal', note: 'Appraised 2015 Ford Territory TS, 162,300 km: ~40 hail dents, windscreen chip, front tyres due, one key. Recon $3,920. Valued $9,800.', staffId: x.mgr },
      { at: iso(t(x.negAt) + 60 * MIN), type: 'call', note: `Customer wanted $12,000 for the Territory. Offered $500 off instead; ${spN} to confirm with the manager.`, staffId: x.sp },
      { at: at(x.finAt), type: 'stage_change', note: 'Handed to finance.', staffId: x.bm },
      { at: at(f.submittedAt), type: 'finance_submitted', note: 'Submitted to Macquarie for $79,180 over 48 months.', staffId: x.bm },
      { at: at(f.decisionAt), type: 'finance_decision', note: `Approved by Macquarie at ${f.rate.toFixed(2)}% over 48 months.`, staffId: x.bm },
      { at: at(x.apprAt), type: 'stage_change', note: 'Sent to the sales manager for approval.', staffId: x.sp },
      { at: iso(t(x.apprAt) + 40 * MIN), type: 'note', note: `Concession is $2,900 ($2,400 aged bonus + $500 discount), above ${mgrN}'s $2,500 limit. Escalated to the GM.`, staffId: x.mgr },
      { at: iso(t(x.apprAt) + 5 * HOUR), type: 'manager_approval', note: 'GM approval: $2,900 concession approved on HL-1941 (110 days in stock, Domo move priority 2).', staffId: 'st-gm' },
      { at: at(x.contractAt), type: 'contract_signed', note: 'Contract signed, $2,000 deposit taken by bank transfer. Signed contract scanned for processing.', staffId: x.sp },
      { at: iso(t(x.contractAt) + 40 * MIN), type: 'delivery_booked', note: 'Delivery booked for Saturday 24 Oct at 10:00am. Tint and protection with Coastline (PO HL-PO-7764).', staffId: x.sp },
    ];
    dealsOut.push({ id: x.dealId, leadId, customerId: custId, siteId: x.site, salespersonId: x.sp, businessManagerId: x.bm, modelId: x.modelId, gradeId: x.gradeId, colourId: x.colourId, stockNo: x.stockNo, order: null, fulfilment: 'stock', stage: 'contract', createdAt: at(x.quoteAt), updatedAt: events[events.length - 1].at, closedAt: null, contractAt: at(x.contractAt), vehiclePrice: x.vehiclePrice, onRoadCosts: x.onRoadCosts, landedCost: v.landedCost, accessories: x.accessories, accessoriesTotal: x.accessories.reduce((s2, a) => s2 + a.price, 0), accessoriesGross: accGross, promotions: promos.map((p) => ({ id: p.id, title: p.title, value: p.value })), promotionCost: promoCostTotal, tradeInId: x.trade.id, tradeOverAllowance: 0, bonus: x.bonus, discount: x.discount, driveAway: x.driveAway, deposit: x.deposit, financeAppId: faId, frontGross: front, backGross: back, grossProfit: front + back, grossStatus: 'projected', deliveryDate: at(x.delivery), lostReason: null, lostReasonCode: null, lostStage: null, stageHistory: [['quote', x.quoteAt], ['negotiation', x.negAt], ['finance', x.finAt], ['approval', x.apprAt], ['contract', x.contractAt]].map(([stage, a]) => ({ stage, at: at(a) })), events, demo: 'document-processing' });
  }
  dealsOut.sort((a, b) => a.id.localeCompare(b.id));
}

// ════════════════════════════════════════════════════════════════════════════
// 6. SITES, TARGETS, PROMOTIONS, CAMPAIGNS, DOCUMENTS, STAFF
// ════════════════════════════════════════════════════════════════════════════
const months = []; for (let y = 2024, m = 10; y < 2027; m++) { if (m > 12) { m = 1; y++; } if (y === 2027) break; months.push(`${y}-${String(m).padStart(2, '0')}`); }
const delivByMonth = {};
for (const d of dealsOut) if (d.stage === 'delivered') { const k = `${d.siteId}|${d.closedAt.slice(0, 7)}`; delivByMonth[k] = (delivByMonth[k] || 0) + 1; }
const targets = [];
{
  const R = rng('targets');
  for (const site of SITE_IDS) {
    const full = months.filter((mo) => mo > '2024-10' && mo < '2026-10');
    const shape = (mo) => { const [y, m] = mo.split('-').map(Number); return SEASON[m] * trend(L(y, m, 15)); };
    const k = full.reduce((t, mo) => t + (delivByMonth[`${site}|${mo}`] || 0), 0) / full.reduce((t, mo) => t + shape(mo), 0);
    for (const mo of months) {
      let units = Math.max(4, Math.round(k * shape(mo) * R.u(1.0, 1.09)));
      if (mo === '2024-10') units = Math.round(units * 17 / 31);
      targets.push({ siteId: site, month: mo, units, grossTarget: round(units * SITE_META[site].gpuTarget, 1000) });
    }
  }
}
const sites = SITE_IDS.map((id) => {
  const c = CALENDAR.sites.find((s) => s.id === id) || {}; const st = STOCK.sites.find((s) => s.id === id) || {};
  return { id, name: c.name || st.name, legalName: `Harbourline Toyota ${c.name || st.name}`, address: c.address, phone: c.phone, home: !!st.home, distanceKm: st.distance_km ?? null, transferRun: st.transfer_run ?? null, managerId: MANAGER(id).id, salesTarget: Object.fromEntries(targets.filter((t) => t.siteId === id).map((t) => [t.month, t.units])) };
});
const promotionsOut = PROMOTIONS.map((p) => ({ id: p.id, title: p.title, kind: p.kind, value: p.value, source: p.source, startsAt: iso(p.startsAt), endsAt: iso(p.endsAt), appliesTo: p.appliesTo, status: p.startsAt > NOW ? 'scheduled' : p.endsAt < NOW ? 'expired' : 'active', ...(p.desc ? { short: p.short, desc: p.desc, reason: p.reason } : {}), dealsApplied: dealsOut.filter((d) => d.promotions.some((x) => x.id === p.id)).length }));
const campaignsOut = CAMPAIGNS.map((c) => {
  const R = rng(`campaign-stats:${c.id}`);
  const cl = leadsOut.filter((l) => l.campaignId === c.id);
  const sent = c.sent || (c.channel === 'social' ? R.int(48000, 160000) : R.int(30000, 90000)); // impressions for social/web
  const openRate = { email: R.u(0.27, 0.38), sms: R.u(0.88, 0.96), social: R.u(0.012, 0.02), web: R.u(0.02, 0.035) }[c.channel];
  const opened = Math.round(sent * openRate);
  const clicked = Math.max(cl.length * 3, Math.round(opened * { email: R.u(0.06, 0.11), sms: R.u(0.025, 0.05), social: R.u(0.35, 0.6), web: R.u(0.3, 0.5) }[c.channel]));
  const wonDeals = cl.filter((l) => l.status === 'won' || dealsOut.some((d) => d.leadId === l.id && d.stage === 'delivered')).length;
  return { id: c.id, name: c.name, channel: c.channel, audience: c.audience, siteIds: c.siteIds || SITE_IDS, startsAt: iso(c.startsAt), endsAt: iso(c.endsAt), status: c.startsAt > NOW ? 'scheduled' : c.endsAt < NOW ? 'completed' : 'live', promotionIds: c.promotionIds, sent, sentMetric: c.sent ? 'messages' : 'impressions', opened, clicked, leads: cl.length, deals: wonDeals, budget: c.budget, costPerLead: cl.length ? Math.round(c.budget / cl.length) : null };
});

// documents: 60 (6 point at synthetic sample PDFs that the content team renders from these rows)
const documents = [];
{
  const R = rng('documents');
  const recentDeals = dealsOut.filter((d) => d.createdAt >= '2026-07-01' && d.customerId);
  const contracts = R.sample(recentDeals.filter((d) => d.contractAt && !d.demo), 16);
  const trades = R.sample(tradeIns.filter((t) => t.appraisedAt >= '2026-06-01' && t.customerId && !['TI-30418', 'TI-30441'].includes(t.id)), 10);
  const vehs = R.sample(vehicles.filter((v) => v.arrivedAt && v.arrivedAt >= '2026-06-15'), 8);
  const lic = R.sample(recentDeals, 12), ins = R.sample(dealsOut.filter((d) => d.stage === 'delivered' && d.closedAt >= '2026-08-01'), 8);
  const custBy = Object.fromEntries(customers.map((c) => [c.id, c]));
  const SUPPLIERS = [['Southern Cross Vehicle Distribution Pty Ltd', 'vehicle'], ['Nepean Tint & Protect Pty Ltd', 'tint'], ['Hills Towbars & Racks Pty Ltd', 'tow'], ['Cumberland Auto Detailing Pty Ltd', 'detail']];
  const abn = () => { for (;;) { const d = Array.from({ length: 11 }, (_, i) => (i === 0 ? R.int(1, 9) : R.int(0, 9))); const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]; const s = d.reduce((t, x, i) => t + (i === 0 ? x - 1 : x) * w[i], 0); if (s % 89 === 0) return `${d.slice(0, 2).join('')} ${d.slice(2, 5).join('')} ${d.slice(5, 8).join('')} ${d.slice(8).join('')}`; } };
  const supplierAbn = Object.fromEntries(SUPPLIERS.map(([n]) => [n, abn()]));
  const at = (s, h = 0) => iso(Date.parse(s.slice(0, 19) + 'Z') + h * HOUR);
  const conf = () => Math.round(R.u(0.86, 0.99) * 100) / 100;
  const push = (doc) => documents.push(doc);
  contracts.forEach((d, i) => { const c = custBy[d.customerId]; push({ kind: 'contract', dealId: d.id, customerId: d.customerId, fileName: `contract-${d.id}.pdf`, uploadedAt: at(d.contractAt, 2), extracted: { dealNo: d.id, vin: d.stockNo ? vehicleByStock[d.stockNo]?.vin || null : null, customerName: `${c.firstName} ${c.lastName}`, vehicle: `${MODELS[d.modelId].name} ${gradeOf(d.modelId, d.gradeId).name}`, vehiclePrice: d.vehiclePrice, discount: d.discount, driveAway: d.driveAway, deposit: d.deposit, contractDate: d.contractAt.slice(0, 10), deliveryDate: d.deliveryDate?.slice(0, 10) || null, signaturesPresent: { customer: true, dealer: R.chance(0.92) } } }); });
  trades.forEach((t, i) => { const c = custBy[t.customerId]; push({ kind: 'trade_in_form', dealId: t.dealId, customerId: t.customerId, fileName: `trade-in-${t.id}.pdf`, uploadedAt: at(t.appraisedAt, 1), extracted: { rego: t.rego, vin: `${'6T1BF3FK'}${R.int(10000000, 99999999)}X`.slice(0, 17), make: t.make, model: t.model, year: t.year, km: t.km, condition: t.condition, owner: `${c.firstName} ${c.lastName}`, valuation: t.valuation } }); });
  vehs.forEach((v, i) => { const sup = SUPPLIERS[0][0]; const no = `SCVD-${R.int(400000, 499999)}`; const lines = [{ description: `${MODELS[v.model].name} ${gradeOf(v.model, v.grade).name} ${COLOUR[v.colour].name}, VIN ${v.vin}`, amount: Math.round(v.landedCost / 1.1) }, { description: 'Pre-delivery and freight', amount: round(R.u(900, 1400), 10) }]; const ex = lines.reduce((t, l) => t + l.amount, 0); push({ kind: 'supplier_invoice', dealId: v.dealId, customerId: null, stockNo: v.stockNo, fileName: `supplier-invoice-${no}.pdf`, uploadedAt: at(v.arrivedAt, -24 * R.int(2, 6)), extracted: { supplier: sup, abn: supplierAbn[sup], invoiceNo: no, invoiceDate: v.arrivedAt.slice(0, 10), stockNo: v.stockNo, vin: v.vin, lines, subtotal: ex, gst: Math.round(ex * 0.1), total: Math.round(ex * 1.1) } }); });
  lic.forEach((d) => { const c = custBy[d.customerId]; push({ kind: 'licence', dealId: d.id, customerId: d.customerId, fileName: `licence-${d.customerId}.pdf`, uploadedAt: at(d.createdAt, 1), extracted: { name: `${c.firstName} ${c.lastName}`, licenceNo: String(R.int(10000000, 99999999)), state: 'NSW', expiry: `${R.int(2027, 2031)}-${String(R.int(1, 12)).padStart(2, '0')}-${String(R.int(1, 28)).padStart(2, '0')}`, class: d.modelId === 'hilux' && R.chance(0.2) ? 'LR' : 'C', suburb: c.suburb } }); });
  ins.forEach((d) => { const c = custBy[d.customerId]; push({ kind: 'insurance', dealId: d.id, customerId: d.customerId, fileName: `insurance-cover-note-${d.id}.pdf`, uploadedAt: at(d.closedAt, -20), extracted: { insurer: R.pick(['Harbour Mutual Insurance (demo)', 'Westway Insurance (demo)', 'Toyota Insurance (demo)']), policyNo: `POL-${R.int(1000000, 9999999)}`, insured: `${c.firstName} ${c.lastName}`, vehicle: `${MODELS[d.modelId].name} ${gradeOf(d.modelId, d.gradeId).name}`, startDate: d.closedAt.slice(0, 10), sumInsured: d.driveAway } }); });
  documents.sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
  // the 6 synthetic sample PDFs (content/dms/samples/manifest.json) come first: DOC-1001..DOC-1006, status uploaded
  const samples = MANIFEST.map((m) => {
    const ex = m.expected || {};
    const dealId = m.dealNo || (ex.lines || []).map((l) => /D-\d{5}/.exec(l.description)?.[0]).find(Boolean) || null;
    const deal = dealsOut.find((d) => d.id === dealId);
    const uploaded = m.kind === 'supplier_invoice' ? `${ex.invoiceDate}T15:10:00` : m.kind === 'contract' ? `${ex.contractDate}T17:05:00` : `${tradeIns.find((t) => t.id === ex.appraisalNo)?.appraisedAt.slice(0, 19) || '2026-10-10T12:00:00'}`;
    const ms = Date.parse(`${uploaded.slice(0, 19)}Z`) + (m.kind === 'trade_in_form' ? 40 * MIN : 0);
    return { id: null, kind: m.kind, dealId, customerId: m.kind === 'supplier_invoice' ? null : deal?.customerId || null, siteId: deal?.siteId || (/Hornsby/.test(ex.billTo || '') ? 'hor' : 'par'), stockNo: deal?.stockNo || null, fileName: m.file, title: m.title, uploadedAt: iso(ms), status: 'uploaded', samplePdf: `content/dms/samples/${m.file}`, expected: ex, extracted: {}, confidence: null, verifyFields: [], aragResourceId: null };
  });
  documents.unshift(...samples);
  documents.forEach((doc, i) => {
    doc.id = `DOC-${String(1001 + i)}`;
    if (i < samples.length) return;
    {
      doc.status = R.w({ verified: 70, extracted: 22, processing: 3 }); doc.aragResourceId = doc.status === 'processing' ? null : R.code(32, '0123456789abcdef');
      if (doc.status === 'processing') { doc.confidence = null; doc.verifyFields = []; doc.extracted = {}; }
      else { doc.confidence = Object.fromEntries(Object.keys(doc.extracted).map((k) => [k, conf()])); doc.verifyFields = Object.entries(doc.confidence).filter(([, v]) => v < 0.9).map(([k]) => k); if (doc.status === 'verified') { doc.verifiedAt = at(doc.uploadedAt, R.u(1, 30)); doc.verifiedBy = BM(dealsOut.find((d) => d.id === doc.dealId)?.siteId || 'par').id; } }
    }
  });
}

const staffOut = STAFF.map(({ k, startedAt, ...s }) => ({ ...s, startedAt: ymd(startedAt), active: true, demoLogin: ['gm@harbourline.demo', 'sm.par@harbourline.demo', 'sales1@harbourline.demo', 'marketing@harbourline.demo', 'finance@harbourline.demo'].includes(s.email) }));

// trim internal-only fields in vehicles; final ordering
vehicles.sort((a, b) => (a.arrivedAt || '9').localeCompare(b.arrivedAt || '9') || a.stockNo.localeCompare(b.stockNo));
const idFirst = (rows) => rows.map(({ id, ...r }) => ({ id, ...r }));
const tables = {
  sites, staff: staffOut, customers, vehicles, leads: leadsOut, test_drives: testDrives, deals: dealsOut, trade_ins: idFirst(tradeIns).sort((a, b) => a.id.localeCompare(b.id)), finance_apps: idFirst(financeApps).sort((a, b) => a.id.localeCompare(b.id)),
  promotions: promotionsOut, campaigns: campaignsOut, documents, targets,
};

// ════════════════════════════════════════════════════════════════════════════
// 7. WRITE
// ════════════════════════════════════════════════════════════════════════════
mkdirSync(OUT, { recursive: true });
const counts = {};
for (const [name, rows] of Object.entries(tables)) {
  writeFileSync(join(OUT, `${name}.json`), `${JSON.stringify(rows)}\n`);
  counts[name] = rows.length;
}
const meta = { generatedBy: 'scripts/dms-seed.mjs', seed: SEED, asOf: iso(NOW), historyFrom: iso(START), counts, signalsBaseline: SIGNALS.rows, liveBookingsImported: LIVE_BOOKINGS.length, liveEventsSeen: LIVE_EVENTS.length };
writeFileSync(join(OUT, '_meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
const { DERIVED } = await import('../server/dms/derive.mjs');
const tview = { ...tables, meta, domo_signals: readJson(join(ROOT, 'content', 'domo', 'dealer_signals.json'), SIGNALS), configurator_events: LIVE_EVENTS, bookings: LIVE_BOOKINGS };
const derivedCounts = Object.fromEntries(Object.entries(DERIVED).map(([k, f]) => [k, f(tview).length]));
writeFileSync(join(ROOT, 'content', 'dms', 'domo-datasets.json'), `${JSON.stringify(buildDescriptors(counts, derivedCounts), null, 2)}\n`);
writeFileSync(join(OUT, 'README.md'), readme(counts, meta, derivedCounts));
if (!QUIET) console.log(`[dms-seed] wrote ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ')} → content/dms/data (as of ${iso(NOW)})`);
