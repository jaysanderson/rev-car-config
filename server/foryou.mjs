// foryou.mjs — Spotify-style "For you" rows, built with ARAG /find.
//
// ROW-GENERATION RULES
// Inputs: model, grade, colour, answers ("id:value,id:value"), packs (optional).
// Each candidate row composes ONE semantic query from the inputs, runs ARAG /find
// (hybrid semantic+keyword, reranked), and maps every paragraph hit back to a
// catalogue model through the resource's `model` label (resources labelled `all`,
// e.g. the catalogue, are mapped by model names mentioned in the paragraph text).
//
//  1. "Because you chose a {Model}"     — when `model` is given.
//     query: "{body} {powertrain} alternatives to the {Model} {Grade}: {tags}"
//     keep:  models of the same or adjacent body type, EXCLUDING the chosen model.
//  2. "Because you value {theme}"        — when an answer/priority implies a value:
//     safety (use:family, priorities:safety), running costs (efficiency, commute,
//     distance:long), off-road ability (terrain:offroad, use:adventure), tech
//     (priorities:tech), work (use:work). First match wins.
//     query: theme keywords (+ topic label filter for safety → `safety`).
//  3. "Because you like {colour family}" — when `colour` is given.
//     query: "{Colour name} paint colour {family}"; keep models whose catalogue
//     colour list contains that colour; stock units IN that colour lead the row,
//     and items only carry a unitId when the unit is that colour.
//  4. "Because you tow"                  — when answers towing ∈ {light,medium,heavy,
//     caravan,boat,trailer…} or packs include `tow`.
//     query: "braked towing capacity {need} kg tow pack caravan"; topic filter
//     `towing`; keep models whose towKg ≥ need.
// Items: {modelId, gradeId?, unitId?, title, blurb, citation:{title,resourceId}}.
//  • blurb = the best hit paragraph when it is clean prose from that model's own
//    resource, else the catalogue blurb (trimmed to ~180 chars).
//  • A topic-filtered query with zero hits is retried unfiltered.
//  • unitId/gradeId = the best matching Domo stock unit (colour → grade → home site
//    → move priority); omitted when nothing is in stock.
//  • De-duplication: a model appears once per row; a stock unit appears once across
//    all rows; rows with no items are dropped; max 6 items per row.
//  • If /find fails, the row falls back to catalogue order with citation
//    {title:"Harbourline catalogue", resourceId:null}.
import * as arag from './arag.mjs';
import { catalog, modelById, gradeOf, colourById, modelsMentioned, bestUnit } from './data.mjs';

const COLOUR_FAMILY = { 'atomic-rush': 'red', 'saturn-blue': 'blue', 'glacier-white': 'white', 'frosted-white': 'white', 'silver-sky': 'silver', graphite: 'grey', 'eclipse-black': 'black', 'jungle-khaki': 'khaki green', 'dusty-bronze': 'bronze' };
const BODY_ADJ = { 'suv-small': ['suv-small', 'suv-mid'], 'suv-mid': ['suv-mid', 'suv-small', 'suv-large'], 'suv-large': ['suv-large', 'suv-mid', 'ute'], ute: ['ute', 'suv-large'], sedan: ['sedan', 'hatch', 'suv-small'], hatch: ['hatch', 'sedan', 'suv-small'], coupe: ['coupe', 'hatch'] };
const TOW_NEED = { light: 750, trailer: 750, medium: 1500, camper: 1500, boat: 1500, heavy: 2500, caravan: 2500 };

const THEMES = [
  { key: 'safety', title: 'safety', match: (a) => a.priorities === 'safety' || a.use === 'family', query: 'Toyota Safety Sense ANCAP rating airbags driver assist autonomous emergency braking', topic: 'safety' },
  { key: 'efficiency', title: 'low running costs', match: (a) => a.priorities === 'efficiency' || a.use === 'commute' || a.distance === 'long', query: 'hybrid fuel economy L/100km running costs capped price servicing', topic: null },
  { key: 'offroad', title: 'off-road ability', match: (a) => a.terrain === 'offroad' || a.use === 'adventure', query: 'off-road four wheel drive low range ground clearance wading depth', topic: null },
  { key: 'tech', title: 'tech and comfort', match: (a) => a.priorities === 'tech', query: 'touchscreen head-up display premium audio leather heated seats technology', topic: null },
  { key: 'work', title: 'a hard-working vehicle', match: (a) => a.use === 'work', query: 'payload tray work ute towing durability trade', topic: null },
];

export function parseAnswers(s) {
  const out = {};
  for (const part of String(s || '').split(',')) { const [k, v] = part.split(':').map((x) => (x || '').trim()); if (k && v) out[k] = v; }
  return out;
}

function hitModels(hit) {
  const labelled = (hit.model || []).filter((m) => m !== 'all' && modelById(m));
  return labelled.length ? labelled : modelsMentioned(hit.text);
}

async function search({ query, filter }) {
  try {
    let hits = await arag.find({ query, topK: 20, filterExpression: filter });
    // A topic filter with no labelled docs yet (thin corpus) → retry unfiltered.
    if (!hits.length && filter) hits = await arag.find({ query, topK: 20 });
    return { ok: true, hits };
  } catch (e) { console.warn(`[foryou] ${e.message}`); return { ok: false, hits: [] }; }
}

// Prefer the hit's own paragraph as the blurb only when it is a clean prose
// paragraph from a model-specific resource; otherwise use the catalogue blurb.
function blurbFor(m, hit) {
  const t = hit?.text ? hit.text.replace(/\s+/g, ' ').replace(/^#+\s*/, '').trim() : '';
  const clean = t && (hit.model || []).includes(m.id) && !t.includes('|') && t.length >= 60;
  const text = clean ? t : m.blurb;
  return text.length > 180 ? `${text.slice(0, 177).replace(/\s+\S*$/, '')}…` : text;
}

function assembleRow({ id, title, reason, query, keep, colourId, colourStrict, usedUnits, stockData }, { ok, hits }) {
  const items = []; const seen = new Set();
  const firstHit = (modelId) => hits.find((h) => hitModels(h).includes(modelId)) || null;
  const push = (modelId, hit, unit) => {
    if (seen.has(modelId) || !keep(modelById(modelId)) || items.length >= 6) return;
    seen.add(modelId);
    const m = modelById(modelId);
    let u = unit || (stockData ? bestUnit(stockData, modelId, { colourId, exclude: usedUnits }) : null);
    if (u && colourStrict && u.colour !== colourId) u = null;
    if (u) usedUnits.add(u.id);
    const h = hit || firstHit(modelId);
    items.push({
      modelId,
      ...(u ? { gradeId: u.grade, unitId: u.id } : {}),
      title: u ? `${m.name} ${gradeOf(modelId, u.grade)?.name || ''}`.trim() : m.name,
      blurb: blurbFor(m, h),
      citation: h ? { title: h.title, resourceId: h.resourceId } : { title: 'Harbourline catalogue', resourceId: null },
    });
  };
  // Colour rows lead with units actually in stock in that colour.
  if (colourStrict && stockData) {
    for (const u of stockData.stock_by_site.filter((x) => x.colour === colourId && !usedUnits.has(x.id)).sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99) || b.age - a.age)) push(u.model, null, u);
  }
  for (const h of hits) for (const mid of hitModels(h)) push(mid, h);
  if (!ok || !items.length) for (const m of catalog().models) push(m.id, null); // degraded: catalogue order
  return items.length ? { id, title, reason, query, items } : null;
}

export async function forYou(params, stockData) {
  const answers = parseAnswers(params.answers);
  const packs = String(params.packs || '').split(',').filter(Boolean);
  const m = modelById(params.model);
  const g = m && gradeOf(m.id, params.grade);
  const colour = colourById(params.colour);
  const usedUnits = new Set();
  const jobs = [];

  if (m) {
    jobs.push(({
      id: 'chosen', title: `Because you chose a ${m.name}`, reason: `Similar ${m.bodyLabel || m.body} options to the ${m.name}${g ? ` ${g.name}` : ''}`,
      query: `${m.bodyLabel || m.body} ${m.powertrainLabel || m.powertrain} alternatives to the ${m.name}${g ? ` ${g.name}` : ''}: ${(m.tags || []).join(' ')}`,
      keep: (x) => x && x.id !== m.id && (BODY_ADJ[m.body] || [m.body]).includes(x.body), colourId: colour?.id, usedUnits, stockData,
    }));
  }
  const theme = THEMES.find((t) => t.match(answers));
  if (theme) {
    jobs.push(({
      id: `value-${theme.key}`, title: `Because you value ${theme.title}`, reason: `From your answers: ${Object.entries(answers).map(([k, v]) => `${k} ${v}`).join(', ')}`,
      query: theme.query, filter: theme.topic ? arag.labelFilter('topic', theme.topic) : undefined,
      keep: (x) => Boolean(x), colourId: colour?.id, usedUnits, stockData,
    }));
  }
  if (colour) {
    const fam = COLOUR_FAMILY[colour.id] || colour.name.toLowerCase();
    jobs.push(({
      id: `colour-${colour.id}`, title: `Because you like ${fam}`, reason: `Models offered in ${colour.name}${stockData ? ', with stock in that colour first' : ''}`,
      query: `${colour.name} paint colour ${fam}`,
      keep: (x) => Boolean(x) && (x.colours || []).includes(colour.id), colourId: colour.id, colourStrict: true, usedUnits, stockData,
    }));
  }
  const towKey = answers.towing && answers.towing !== 'none' ? answers.towing : packs.includes('tow') ? 'light' : null;
  if (towKey) {
    const need = TOW_NEED[towKey] || 750;
    jobs.push(({
      id: 'tow', title: 'Because you tow', reason: `Rated for at least ${need.toLocaleString('en-AU')} kg braked`,
      query: `braked towing capacity ${need} kg tow pack ${towKey}`, filter: arag.labelFilter('topic', 'towing'),
      keep: (x) => Boolean(x) && (x.towKg || 0) >= need, colourId: colour?.id, usedUnits, stockData,
    }));
  }
  // Searches run in parallel; rows are assembled in priority order so the
  // cross-row stock-unit de-duplication is deterministic.
  const results = await Promise.all(jobs.map((j) => search(j)));
  return jobs.map((j, i) => assembleRow(j, results[i])).filter(Boolean);
}
