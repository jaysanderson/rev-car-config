// testdrive-fallback.mjs — deterministic test-drive preparation logic.
//
//  • pickQuestions(ctx, n)  — 3 pre-drive questions from a bank keyed by the viewed
//    cars' tags / body / powertrain and the finder answers. Used when the ARAG agent
//    is unavailable or returns fewer than 3 valid questions (it tops up the agent's).
//    Each bank entry scores itself against the context; 0 = not relevant. Questions
//    whose topic the finder already answered are excluded (`skipIf`), and only one
//    question per `group` is picked.
//  • pickIncentive(ctx, incentives) — one incentive from content/dealer/incentives.json,
//    by descending priority, first matching rule wins; `reason` names what it was
//    based on ("Because you told us you tow a caravan or a big boat.").
//  • prepFor(booking, answers) — up to 3 short items the dealer will prepare.
//
// ctx = { models:[catalogue model], primary: model, unit, answers:[{id,value}] (canonical),
//         answered:Set(ids), site, siteName, whenLabel, time }
import { modelById, gradeOf } from './data.mjs';

const YES_NO = [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }];
const has = (ctx, pred) => ctx.models.some(pred);
const tag = (t) => (m) => (m.tags || []).includes(t);
const ans = (ctx, id) => ctx.answers.find((a) => a.id === id)?.value;
const names = (ctx, pred) => ctx.models.filter(pred).map((m) => m.name);

const BANK = [
  {
    id: 'tow-load', group: 'tow', type: 'choice',
    text: (ctx) => (ans(ctx, 'towing') && ans(ctx, 'towing') !== 'none' ? 'Roughly how heavy is what you tow once it is loaded?' : 'What are you towing, and roughly how heavy?'),
    options: (ctx) => (ans(ctx, 'towing') === 'heavy'
      ? [{ id: 'under-2500', label: '2,000-2,500 kg' }, { id: '2500-3000', label: '2,500-3,000 kg' }, { id: '3000-3500', label: '3,000-3,500 kg' }, { id: 'not-sure', label: 'Not sure yet' }]
      : [{ id: 'caravan', label: 'Caravan, 2 t or more' }, { id: 'boat-camper', label: 'Boat or camper, 1-2 t' }, { id: 'trailer', label: 'Box trailer, under 750 kg' }, { id: 'nothing-yet', label: 'Nothing yet' }]),
    why: (ctx) => `So we fit the right tow bar and load the ${names(ctx, (m) => (m.towKg || 0) >= 2000)[0] || 'car'} to match on the drive.`,
    score: (ctx) => (ans(ctx, 'towing') === 'none' ? 0 : (ans(ctx, 'towing') ? 95 : 0) + (has(ctx, (m) => (m.towKg || 0) >= 2000) ? 60 : 0)),
    prep: { caravan: 'Towing Pack demo unit and ball-weight scales ready', 'boat-camper': 'Towing Pack fitted and wiring explained', '3000-3500': 'Towing guide printout for 3,000-3,500 kg vans', '2500-3000': 'Towing guide printout for 2,500-3,000 kg vans' },
  },
  {
    id: 'ev-home-charge', group: 'ev', type: 'yesno', skipIf: [],
    text: () => 'Can you charge at home, in a garage or off-street spot?',
    why: (ctx) => `Home charging decides how easy the ${names(ctx, (m) => m.powertrain === 'ev')[0] || 'EV'} is to live with.`,
    score: (ctx) => (has(ctx, (m) => m.powertrain === 'ev') ? 98 : 0),
    prep: { yes: 'Home-charger options and a wallbox quote to go through', no: 'Public charging map for your suburb' },
  },
  {
    id: 'ev-longest-trip', group: 'ev-range', type: 'choice', skipIf: ['distance'],
    text: () => "What's the longest drive you do regularly?",
    options: () => [{ id: 'under-100', label: 'Under 100 km' }, { id: '100-300', label: '100-300 km' }, { id: 'over-300', label: 'Over 300 km' }],
    why: () => 'We can plan a realistic range and charging stop for the drive.',
    score: (ctx) => (has(ctx, (m) => m.powertrain === 'ev') ? 80 : 0),
    prep: { 'over-300': 'Charging-stop plan for your longest regular trip' },
  },
  {
    id: 'three-child-seats', group: 'seats', type: 'yesno', skipIf: [],
    text: () => 'Do you need to fit three child seats across the back row?',
    why: (ctx) => `Three seats across is tight in some cars; we can test it in the ${names(ctx, (m) => m.seats === 5 && /suv|sedan/.test(m.body))[0] || 'car'}.`,
    score: (ctx) => (has(ctx, (m) => m.seats === 5 && /suv|sedan/.test(m.body)) && (ans(ctx, 'use') === 'family' || ans(ctx, 'people') === 'five' || has(ctx, tag('family'))) ? 90 : 0),
    prep: { yes: 'Three child seats fitted in the back row for a test fit' },
  },
  {
    id: 'third-row-who', group: 'seats', type: 'choice', skipIf: [],
    text: () => 'Who will mostly sit in the third row?',
    options: () => [{ id: 'kids', label: 'Kids' }, { id: 'teens-adults', label: 'Teens or adults' }, { id: 'rarely', label: 'Rarely used' }],
    why: (ctx) => `Third-row space differs a lot between the ${names(ctx, (m) => m.seats >= 7).join(' and ') || 'seven-seaters'}.`,
    score: (ctx) => (has(ctx, (m) => m.seats >= 7) ? 85 + (ans(ctx, 'people') === 'seven' ? 10 : 0) : 0),
    prep: { kids: 'Third row set up with a booster seat to try', 'teens-adults': 'Third row set up for an adult sit-in' },
  },
  {
    id: 'offroad-kind', group: 'offroad', type: 'choice', skipIf: ['terrain'],
    text: () => 'What kind of off-road driving do you have in mind?',
    options: () => [{ id: 'beach', label: 'Beach and sand' }, { id: 'low-range', label: 'Low-range tracks' }, { id: 'gravel', label: 'Gravel and campsites' }],
    why: (ctx) => `So we can show you the right drive modes on the ${names(ctx, tag('off-road'))[0] || 'car'}.`,
    score: (ctx) => (has(ctx, tag('off-road')) ? 70 + (ans(ctx, 'use') === 'adventure' ? 10 : 0) : 0),
    prep: { beach: 'Sand-driving tips and tyre pressure guide', 'low-range': 'Walk-through of low range and the rear diff lock' },
  },
  {
    id: 'ute-tub-tray', group: 'ute', type: 'choice', skipIf: [],
    text: () => 'Tub or tray: what do you need in the back?',
    options: () => [{ id: 'tub', label: 'Tub with a liner' }, { id: 'tray', label: 'Flat tray' }, { id: 'canopy', label: 'Canopy for tools' }, { id: 'unsure', label: 'Not sure yet' }],
    why: () => 'Tray and canopy options change payload and lead time.',
    score: (ctx) => (has(ctx, (m) => m.body === 'ute') ? 88 : 0),
    prep: { tray: 'Tray-back pricing and lead times', canopy: 'Canopy options and fitting times', tub: 'Tub liner and tie-down options' },
  },
  {
    id: 'hybrid-first', group: 'hybrid', type: 'yesno', skipIf: [],
    text: () => 'Have you driven a Toyota hybrid before?',
    why: () => "If not, we'll show you how the hybrid system and EV mode work on the drive.",
    score: (ctx) => (has(ctx, (m) => m.powertrain === 'hybrid') ? 45 + (ans(ctx, 'power') === 'hybrid' ? 10 : 0) : 0),
    prep: { no: 'Quick hybrid walk-through before you set off' },
  },
  {
    id: 'city-share', group: 'commute', type: 'choice', skipIf: ['distance'],
    text: () => 'How much of your driving is stop-start city traffic?',
    options: () => [{ id: 'mostly', label: 'Mostly' }, { id: 'half', label: 'About half' }, { id: 'little', label: 'Very little' }],
    why: () => 'We will plan the route so you feel the car in the traffic you actually drive in.',
    score: (ctx) => (has(ctx, (m) => m.powertrain === 'hybrid' && (m.tags || []).includes('commute')) ? 50 : 0),
    prep: { mostly: 'Test route through Parramatta CBD traffic', little: 'Test route that includes the M4' },
  },
  {
    id: 'tight-parking', group: 'size', type: 'yesno', skipIf: [],
    text: (ctx) => `Do you park somewhere tight, like an apartment car park or a narrow garage?`,
    why: (ctx) => `The ${names(ctx, (m) => /suv-large|ute/.test(m.body))[0] || 'car'} is long; we'll check it fits and try the cameras.`,
    score: (ctx) => (has(ctx, (m) => /suv-large|ute/.test(m.body)) ? 55 : 0),
    prep: { yes: 'Parking-camera demo and exact length and height measurements' },
  },
  {
    id: 'manual-ok', group: 'gr', type: 'yesno', skipIf: [],
    text: () => 'Are you comfortable driving a manual?',
    why: (ctx) => `The ${names(ctx, tag('manual'))[0] || 'GR car'} is a manual; we'll plan the route around that.`,
    score: (ctx) => (has(ctx, tag('manual')) ? 92 : 0),
    prep: { no: 'A quiet start to the route to get used to the clutch' },
  },
  {
    id: 'track-days', group: 'gr-use', type: 'choice', skipIf: [],
    text: () => 'Will it see track days or motorsport events?',
    options: () => [{ id: 'regularly', label: 'Regularly' }, { id: 'maybe', label: 'Maybe once or twice' }, { id: 'road-only', label: 'Road only' }],
    why: () => 'Track use changes the warranty, tyre and brake conversation.',
    score: (ctx) => (has(ctx, tag('performance')) ? 75 : 0),
    prep: { regularly: 'Track-day warranty and tyre notes' },
  },
  {
    id: 'back-to-back', group: 'compare', type: 'choice', skipIf: [],
    text: () => 'Which would you like to drive back to back?',
    options: (ctx) => [...ctx.models.slice(0, 3).map((m) => ({ id: m.id, label: m.name })), { id: 'just-one', label: 'Just the one' }],
    why: () => 'We can line up two cars so you can compare them on the same roads.',
    score: (ctx) => (ctx.models.length >= 2 ? 65 : 0),
    prep: {},
    prepDynamic: (ctx, value) => (modelById(value) && value !== ctx.primary?.id ? `${modelById(value).name} ready as well for a back-to-back drive` : null),
  },
  {
    id: 'trade-in', group: 'trade', type: 'yesno', skipIf: [],
    text: () => 'Will you be trading in your current car?',
    why: () => 'We can have it valued while you are out on the drive.',
    score: () => 30,
    prep: { yes: 'Trade-in valuation on arrival' },
  },
  {
    id: 'finance-plan', group: 'finance', type: 'choice', skipIf: [],
    text: () => 'How are you planning to pay?',
    options: () => [{ id: 'cash', label: 'Cash or savings' }, { id: 'toyota-finance', label: 'Toyota Finance' }, { id: 'novated', label: 'Novated lease' }, { id: 'undecided', label: 'Not sure yet' }],
    why: () => 'We will have the right numbers ready, with no obligation.',
    score: (ctx) => 25 + (has(ctx, (m) => m.powertrain === 'ev') ? 10 : 0),
    prep: { 'toyota-finance': 'Toyota Finance repayment examples', novated: 'Novated lease estimate (EVs can be FBT-exempt)' },
  },
];

const materialise = (q, ctx) => ({
  id: q.id, text: q.text(ctx), type: q.type,
  options: q.type === 'yesno' ? YES_NO : q.options(ctx),
  why: q.why(ctx),
});

/** n questions from the bank, highest score first, one per group, skipping answered topics and `exclude` ids/groups. */
export function pickQuestions(ctx, n = 3, exclude = []) {
  const ex = new Set(exclude);
  const picked = []; const groups = new Set();
  const ranked = BANK.map((q) => ({ q, s: q.score(ctx) })).filter(({ q, s }) => s > 0 && !ex.has(q.id) && !ex.has(q.group) && !(q.skipIf || []).some((id) => ctx.answered.has(id)))
    .sort((a, b) => b.s - a.s);
  for (const { q } of ranked) {
    if (groups.has(q.group)) continue;
    groups.add(q.group); picked.push(materialise(q, ctx));
    if (picked.length === n) break;
  }
  return picked;
}
/** One specific bank question, materialised for this context. */
export const bankQuestion = (id, ctx) => materialise(BANK.find((q) => q.id === id), ctx);
/** Bank group of a question id (for de-duplicating agent + bank questions). */
export const bankGroup = (id) => BANK.find((q) => q.id === id)?.group;

/** One incentive; reason references the answer or car it was based on. */
export function pickIncentive(ctx, incentives) {
  const list = [...(incentives || [])].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  for (const inc of list) {
    for (const rule of inc.rules || []) {
      let reason = null;
      if (rule.answer) {
        const v = ans(ctx, rule.answer);
        if (v && rule.values && rule.values[v]) reason = rule.reason.replace('{phrase}', rule.values[v]);
      } else if (rule.viewedTag) {
        const m = ctx.models.find(tag(rule.viewedTag));
        if (m) reason = rule.reason.replace('{model}', m.name);
      } else if (rule.viewedPowertrain) {
        const m = ctx.models.find((x) => x.powertrain === rule.viewedPowertrain);
        if (m) reason = rule.reason.replace('{model}', m.name);
      } else if (rule.default) reason = rule.reason;
      if (reason) return { id: inc.id, title: inc.title, desc: inc.desc, value: inc.value ?? null, reason };
    }
  }
  return { id: 'inc-detailing', title: 'Complimentary detail before delivery', desc: 'A full interior and exterior detail before you collect.', value: 180, reason: 'Because you booked a test drive with us.' };
}

// Keyword prep for questions the agent wrote (no prep map).
const KEYWORD_PREP = [
  [/tow|caravan|trailer|boat/i, (yes) => (yes !== false ? 'Towing Pack fitted and towing capacities printed for your rig' : null)],
  [/trade.?in|trading/i, (yes) => (yes ? 'Trade-in valuation on arrival' : null)],
  [/charg/i, (yes) => (yes ? 'Home-charger options and a wallbox quote to go through' : yes === false ? 'Public charging map for your suburb' : null)],
  [/child seat|car seat|booster/i, (yes) => (yes !== false ? 'Child seats fitted in the back row for a test fit' : null)],
  [/third row|7 seat|seven/i, () => 'Third row set up for a sit-in'],
  [/financ|pay|lease|repayment/i, () => 'Finance and repayment examples ready, no obligation'],
  [/park|garage/i, (yes) => (yes ? 'Parking-camera demo and exact measurements' : null)],
  [/off.?road|beach|sand|low.?range/i, () => 'Walk-through of the off-road drive modes'],
];

/** Up to 3 prep items: the car ready at the time, then answer-driven items. */
export function prepFor(booking, answers) {
  const m = modelById(booking.modelId); const g = gradeOf(booking.modelId, booking.gradeId);
  const items = [];
  const towing = answers.some((a) => /tow|caravan|trailer/i.test(`${a.questionText} ${a.label}`) && !/nothing|^no$/i.test(a.label));
  const car = `${m?.name || 'Your car'}${g ? ` ${g.name}` : ''}`;
  const unitBit = booking.unitId ? ` (${booking.unitId}${booking.transferFrom ? `, brought over from ${booking.transferFrom}` : ''})` : '';
  items.push(`${car}${unitBit}${towing ? ' with the Towing Pack fitted' : ''} ready at ${booking.time}`);
  for (const a of answers) {
    const q = BANK.find((x) => x.id === a.id);
    let item = null;
    if (q && q.prepDynamic) item = q.prepDynamic({ primary: m }, a.value);
    if (!item && q && q.prep) item = q.prep[a.value] || null;
    if (!item && !q) {
      const yes = a.value === 'yes' ? true : a.value === 'no' ? false : undefined;
      for (const [re, f] of KEYWORD_PREP) if (re.test(a.questionText)) { item = f(yes); if (item) break; }
    }
    if (item && !items.includes(item) && !(towing && /Towing Pack fitted/.test(item))) items.push(item);
    if (items.length === 3) break;
  }
  if (items.length < 3 && booking.incentive) items.push(`Your ${booking.incentive.title.charAt(0).toLowerCase()}${booking.incentive.title.slice(1)} confirmed in writing`);
  return items.slice(0, 3);
}

/** Deterministic two-sentence salesperson reply. */
export function replyFor(booking, answers, prep) {
  const m = modelById(booking.modelId);
  const ack = answers.length === 1 ? 'that answer' : `those ${answers.length} answers`;
  const extra = prep.slice(1).map((p) => p.charAt(0).toLowerCase() + p.slice(1));
  return `Thanks for ${ack}, it helps me get the ${m?.name || 'car'} set up properly for you. I'll have it ready at ${booking.time} on ${String(booking.whenLabel).split(',')[0]}${extra.length ? `, along with ${extra.join(' and ')}` : ''}.`;
}

