// finder-fallback.mjs — deterministic 5-question "find my Toyota" engine.
//
// Used whenever the ARAG-driven finder fails validation, times out, or ARAG is not
// configured, so /api/finder/next always answers. Same response shapes as the
// ARAG path.
//
// Branching (question 1 is always `use`; the path is chosen by its answer):
//   family    → use, people,   towing,  power,      budget
//   commute   → use, distance, power,   priorities, budget
//   work      → use, worktype, towing,  terrain,    budget
//   adventure → use, towing,   terrain, people,     budget
// Some option sets also adapt to earlier answers (e.g. the budget bands shift up
// for 7 seats / heavy towing / work utes).
//
// Scoring: every catalogue model gets points per answer (seats, braked towing,
// body type, powertrain, tags, price vs budget) → fit. Then the dealer factor
// (server/dealer.mjs: stock on lot, aged stock, pushed model, promotions; capped at
// 12) is added and the top 3 by fit + dealerFactor win; grade = the best-equipped
// grade inside the budget (or the entry grade if none fits).
import { catalog, availability, modelById } from './data.mjs';
import { dealerFactorFor, priorities } from './dealer.mjs';

export const VOCAB = ['use', 'people', 'distance', 'towing', 'worktype', 'terrain', 'power', 'budget', 'when', 'priorities'];

const PATHS = {
  family: ['use', 'people', 'towing', 'power', 'budget'],
  commute: ['use', 'distance', 'power', 'priorities', 'budget'],
  work: ['use', 'worktype', 'towing', 'terrain', 'budget'],
  adventure: ['use', 'towing', 'terrain', 'people', 'budget'],
};

// Canonicalise answer values so ARAG-authored option ids ("towing-touring",
// "remote-tracks", "b-60-80k"…) still drive the deterministic engine.
const CANON = {
  use: [[/famil|kid|school/, 'family'], [/work|trade|farm|fleet|business/, 'work'], [/tow|tour|adventur|off|caravan|camp|beach/, 'adventure'], [/commut|city|daily/, 'commute']],
  people: [[/7|seven|six|6|third/, 'seven'], [/5|five|kid|family/, 'five'], [/1|2|two|solo|couple/, 'two']],
  distance: [[/long|400|motorway|high/, 'long'], [/short|local|under|150\b/, 'short'], [/./, 'medium']],
  towing: [[/none|nothing|no-?tow|^no/, 'none'], [/heavy|caravan|big|2[,.]?[05]00|3[,.]?500|large/, 'heavy'], [/medium|camper|boat|1[,.]?[05]00/, 'medium'], [/light|box|bike|trailer|750/, 'light']],
  worktype: [[/farm|rural/, 'farm'], [/fleet|sales|km/, 'fleet'], [/./, 'trade']],
  terrain: [[/off|remote|beach|bush|sand|low|4wd|track/, 'offroad'], [/gravel|dirt|unsealed|camp|regional/, 'gravel'], [/./, 'sealed']],
  power: [[/hybrid/, 'hybrid'], [/ev|electric|plug/, 'ev'], [/diesel/, 'diesel'], [/petrol|turbo/, 'petrol'], [/./, 'any']],
  priorities: [[/safe/, 'safety'], [/effic|fuel|cost|running/, 'efficiency'], [/tech|comfort|lux/, 'tech'], [/style|look|design/, 'style']],
};
export function canon(a) {
  const t = `${a.value} ${a.label || ''}`.toLowerCase();
  if (a.id === 'budget') {
    if (BUDGET[a.value]) return a.value;
    const nums = (t.match(/\d+/g) || []).map(Number).map((n) => (n < 1000 ? n * 1000 : n));
    const top = nums.length ? Math.max(...nums) : 0;
    if (!top) return a.value;
    return /under|below|<|up-?to/.test(t) || nums.length > 1 ? `max:${top}` : `max:${Math.round(top * 1.4)}`;
  }
  const rules = CANON[a.id];
  if (!rules || rules.some(([, v]) => v === a.value)) return a.value;
  return (rules.find(([re]) => re.test(t)) || [, a.value])[1];
}
const val = (answers, id) => { const a = answers.find((x) => x.id === id); return a ? canon(a) : undefined; };

export function questionFor(id, answers) {
  const use = val(answers, 'use');
  const people = val(answers, 'people');
  const towing = val(answers, 'towing');
  switch (id) {
    case 'use': return {
      text: 'What will this car mostly be doing?', why: 'Everything else branches from this: seats, towing, body type and powertrain.',
      options: [
        { id: 'family', label: 'Family duties', sub: 'School runs, weekends, road trips' },
        { id: 'commute', label: 'Commuting', sub: 'Daily driving, mostly city and motorway' },
        { id: 'work', label: 'Work', sub: 'Trade, farm or business use' },
        { id: 'adventure', label: 'Adventure', sub: 'Caravans, boats, beaches and dirt roads' },
      ] };
    case 'people': return {
      text: use === 'adventure' ? 'How many people usually come on the trip?' : 'How many seats do you need most weeks?',
      why: 'Five seats keeps you in RAV4/Corolla Cross territory; seven opens Kluger, Prado, Fortuner and LandCruiser.',
      options: [
        { id: 'two', label: '1-2 people', sub: 'Couples or solo' },
        { id: 'five', label: 'Up to 5', sub: 'Kids in the back' },
        { id: 'seven', label: '6-7', sub: 'Third row needed', note: 'Rules out 5-seat SUVs' },
      ] };
    case 'distance': return {
      text: 'How far do you drive in a typical week?', why: 'Distance decides how much a hybrid or EV pays back.',
      options: [
        { id: 'short', label: 'Under 150 km', sub: 'Mostly local' },
        { id: 'medium', label: '150-400 km', sub: 'Daily commute' },
        { id: 'long', label: '400 km+', sub: 'Long motorway runs', note: 'Hybrid efficiency pays back fastest here' },
      ] };
    case 'towing': {
      const opts = [
        { id: 'none', label: 'Nothing', sub: 'No tow bar needed' },
        { id: 'light', label: 'Box trailer or bikes', sub: 'Under 750 kg' },
        { id: 'medium', label: 'Camper or small boat', sub: '750-1,500 kg' },
        { id: 'heavy', label: 'Caravan or big boat', sub: '2,000 kg+', note: 'Needs a diesel 4x4 or Kluger' },
      ];
      return {
        text: use === 'work' ? 'What do you tow for work?' : 'Will you tow anything?',
        why: 'Braked towing capacity ranges from 400 kg (Camry) to 3,500 kg (HiLux, Prado, LandCruiser).',
        options: use === 'adventure' ? opts.slice(1) : opts,
      };
    }
    case 'worktype': return {
      text: 'What kind of work is it?', why: 'Payload, tray and cab style matter more than comfort for trade use.',
      options: [
        { id: 'trade', label: 'Trade / tools', sub: 'Ladders, toolboxes, site access' },
        { id: 'farm', label: 'Farm or rural', sub: 'Paddocks, stock, gravel' },
        { id: 'fleet', label: 'Sales / fleet', sub: 'Lots of kilometres, clients in the car' },
      ] };
    case 'terrain': return {
      text: 'Where does the road end?', why: 'Low-range 4x4 versus AWD versus 2WD is the biggest split in the range.',
      options: [
        { id: 'sealed', label: 'Sealed roads', sub: 'City and highway' },
        { id: 'gravel', label: 'Gravel and campsites', sub: 'AWD is plenty' },
        { id: 'offroad', label: 'Proper off-road', sub: 'Beaches, tracks, low range', note: 'Points to Prado, LandCruiser, HiLux, Fortuner' },
      ] };
    case 'power': return {
      text: 'Which powertrain feels right?', why: 'Toyota sells hybrid, diesel, petrol and EV; your answers so far narrow it down.',
      options: [
        { id: 'hybrid', label: 'Hybrid', sub: 'No plug, low fuel use' },
        { id: 'ev', label: 'Fully electric', sub: 'Home charging', note: towing === 'heavy' ? 'bZ4X tows 750 kg (1,500 kg AWD) only' : undefined },
        { id: 'diesel', label: 'Diesel', sub: 'Towing and long range' },
        { id: 'any', label: 'Not fussed', sub: 'Show me the best fit' },
      ].map((o) => (o.note ? o : (({ note, ...r }) => r)(o))) };
    case 'priorities': return {
      text: 'What matters most beyond the basics?', why: 'Tie-breaker between models that fit equally well.',
      options: [
        { id: 'safety', label: 'Safety tech', sub: 'Latest driver assists' },
        { id: 'efficiency', label: 'Running costs', sub: 'Fuel and servicing' },
        { id: 'tech', label: 'Tech and comfort', sub: 'Screens, leather, features' },
        { id: 'style', label: 'Style', sub: 'Something that stands out' },
      ] };
    case 'budget': {
      const high = people === 'seven' || towing === 'heavy' || use === 'work' || use === 'adventure';
      return {
        text: 'What drive-away budget are you working to?', why: 'We will pick the best-equipped grade that fits.',
        options: high ? [
          { id: 'b60', label: 'Under $60k', sub: 'Entry grades' },
          { id: 'b80', label: '$60-80k', sub: 'Mid grades' },
          { id: 'b110', label: '$80-110k', sub: 'Upper grades' },
          { id: 'b160', label: '$110k+', sub: 'LandCruiser territory' },
        ] : [
          { id: 'b40', label: 'Under $40k', sub: 'Yaris Cross, Corolla' },
          { id: 'b55', label: '$40-55k', sub: 'Corolla Cross, Camry, RAV4 GX' },
          { id: 'b75', label: '$55-75k', sub: 'Upper RAV4, bZ4X, C-HR' },
          { id: 'b100', label: '$75k+', sub: 'Kluger and up' },
        ],
      };
    }
    case 'when': return {
      text: 'When do you need it?', why: 'Decides between stock on the lot, a transfer, or a factory order.',
      options: [
        { id: 'now', label: 'This week', sub: 'Stock on hand' }, { id: 'month', label: 'Within a month', sub: 'Transfers and inbound' },
        { id: 'flexible', label: 'Flexible', sub: 'Factory order is fine' },
      ] };
    default: return null;
  }
}

const BUDGET = { b40: 40000, b55: 55000, b75: 75000, b100: 130000, b60: 60000, b80: 80000, b110: 110000, b160: 200000 };
const TOW_NEED = { none: 0, light: 750, medium: 1500, heavy: 2500 };
const budgetOf = (v) => BUDGET[v] || (String(v || '').startsWith('max:') ? Number(String(v).slice(4)) : undefined);

function scoreModel(m, answers) {
  let s = 50; const why = []; const watch = [];
  const a = (id) => val(answers, id);
  const tags = new Set(m.tags || []);
  switch (a('use')) {
    case 'family': if (tags.has('family') || m.seats >= 5 && /suv/.test(m.body)) { s += 12; why.push('Family-friendly SUV packaging'); } if (/coupe|hatch/.test(m.body) && m.seats < 5) s -= 30; break;
    case 'commute': if (tags.has('commute') || tags.has('efficiency')) { s += 12; why.push(`${m.powertrainLabel || m.powertrain} keeps commuting costs down`); } if (m.body === 'ute' || m.seats === 7) s -= 10; break;
    case 'work': if (m.body === 'ute' || tags.has('work')) { s += 25; why.push('Built for work: tray, payload and towing'); } else if (!tags.has('fleet')) s -= 15; break;
    case 'adventure': if (tags.has('off-road') || tags.has('touring') || tags.has('camping')) { s += 15; why.push('Made for touring and dirt roads'); } break;
    default: break;
  }
  if (a('people') === 'seven') { if (m.seats >= 7) { s += 18; why.push('Seven seats'); } else s -= 35; }
  if (a('people') === 'two' && m.seats >= 7) s -= 5;
  const need = TOW_NEED[a('towing')];
  if (need) { if ((m.towKg || 0) >= need) { s += 12; why.push(`Tows ${m.towKg.toLocaleString('en-AU')} kg braked`); } else { s -= 30; watch.push(`Braked towing is only ${m.towKg || 0} kg`); } }
  if (a('terrain') === 'offroad') { if (tags.has('off-road')) { s += 15; why.push('Genuine low-range off-roader'); } else s -= 20; }
  if (a('terrain') === 'gravel' && (tags.has('awd') || tags.has('off-road'))) s += 6;
  if (a('worktype') === 'fleet' && (tags.has('fleet') || tags.has('rideshare'))) { s += 15; why.push('Proven fleet and high-km choice'); }
  if (a('worktype') === 'farm' && tags.has('off-road')) s += 8;
  const power = a('power');
  if (power && power !== 'any') { if (m.powertrain === power) { s += 14; why.push(`${m.powertrainLabel || m.powertrain}`); } else s -= 12; }
  if (a('distance') === 'long' && m.powertrain === 'hybrid') { s += 8; why.push('Hybrid economy suits long weekly distances'); }
  if (a('distance') === 'short' && m.powertrain === 'ev') s += 4;
  const pr = a('priorities');
  if (pr && tags.has(pr)) { s += 8; why.push(`Strong on ${pr}`); }
  if (pr === 'style' && tags.has('style')) s += 4;
  if (tags.has('performance') || tags.has('enthusiast')) s -= a('use') === 'commute' && pr === 'style' ? 0 : 15;
  const budget = budgetOf(a('budget'));
  if (budget) {
    if (m.fromPrice <= budget) s += 10;
    else { s -= Math.min(30, Math.round((m.fromPrice - budget) / 1500)); watch.push(`Starts at $${m.fromPrice.toLocaleString('en-AU')}, above your budget`); }
  }
  return { s, why, watch };
}

function pickGrade(m, answers) {
  const budget = budgetOf(val(answers, 'budget')) || Infinity;
  const fits = m.grades.filter((g) => g.price <= budget);
  return (fits.length ? fits[fits.length - 1] : m.grades[0]);
}

export function nextQuestion(answers) {
  const use = val(answers, 'use');
  const path = PATHS[use] || PATHS.family;
  const asked = new Set(answers.map((a) => a.id));
  const id = answers.length === 0 ? 'use' : path.find((q) => !asked.has(q)) || VOCAB.find((q) => !asked.has(q));
  const q = questionFor(id, answers);
  return { step: answers.length + 1, of: 5, question: { id, ...q } };
}

export function recommend(answers, stockData, pr = priorities(stockData)) {
  const ranked = catalog().models.map((m) => ({ m, ...scoreModel(m, answers) })).sort((a, b) => b.s - a.s);
  const top = ranked[0]?.s || 1;
  const scored = ranked.map((x, i) => {
    const fit = Math.max(40, Math.min(97, Math.round(92 * (x.s / top)) - Math.min(i, 2) * 3));
    const df = stockData ? dealerFactorFor(x.m.id, stockData, pr) : { dealerFactor: 0, nudge: null };
    return { ...x, fit, dealerFactor: df.dealerFactor, nudge: df.nudge };
  }).sort((a, b) => (b.fit + b.dealerFactor) - (a.fit + a.dealerFactor) || b.fit - a.fit).slice(0, 3);
  const recommendations = scored.map(({ m, why, watch, fit, dealerFactor, nudge }) => {
    const g = pickGrade(m, answers);
    const availabilityInfo = stockData ? availability(stockData, m.id) : { onLot: 0, nearby: 0, inTransit: 0, soonest: 'Ask the team' };
    if (!availabilityInfo.onLot && !availabilityInfo.nearby && !availabilityInfo.inTransit) watch.push(`None in stock: ${availabilityInfo.soonest.toLowerCase()}`);
    return {
      modelId: m.id, gradeId: g.id,
      fit,
      why: [...new Set(why)].slice(0, 3).concat(why.length ? [] : [m.blurb]).slice(0, 3),
      watch: [...new Set(watch)].slice(0, 2),
      availability: availabilityInfo,
      dealerFactor, nudge,
    };
  });
  const lead = modelById(recommendations[0]?.modelId);
  const summary = `Based on your answers (${answers.map((a) => a.label || a.value).join(', ')}), the ${lead?.name || 'top pick'} is the strongest fit, with two alternatives worth a look.`;
  return { done: true, summary, recommendations };
}

/** Readable {question, answer} for a canonical finder answer (handover sheet). */
export function describeAnswer(a, answers = []) {
  const q = questionFor(a.id, answers);
  const opt = q?.options?.find((o) => o.id === a.value);
  let answer = opt?.label;
  if (!answer && a.id === 'budget' && String(a.value).startsWith('max:')) answer = `Up to $${Number(String(a.value).slice(4)).toLocaleString('en-AU')}`;
  return { question: q?.text || a.id, answer: answer || String(a.value).replace(/-/g, ' ') };
}
