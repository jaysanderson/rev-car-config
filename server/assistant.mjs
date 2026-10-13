// assistant.mjs — the ARAG-backed consultative surfaces: /api/ask and /api/finder/next.
//
// "Domo through the agent", two ways (see README):
//   ACTIVE in this server: every /ask call carries `extra_context` with a compact
//   stock summary (from the Domo datasets) for the model(s) in play, plus the
//   current build and finder answers. The KB /ask grounds the rest in the corpus.
//   ALSO PROVISIONED: retrieval agent `harbourline-stock-agent` with an `http`
//   context agent that GETs {PUBLIC_URL}/api/stock?q=<question> (plain-text stock
//   summary) alongside an `ask` context agent on this KB — usable from the ARAG
//   dashboard / widget; this server does not route through it.
import * as arag from './arag.mjs';
import { catalog, modelById, gradeOf, packById, colourById, interiorById, modelsMentioned, stockSummary, catalogSummary, availability } from './data.mjs';
import * as fallback from './finder-fallback.mjs';

const LANG = { en: 'English', es: 'Spanish', zh: 'Chinese', ar: 'Arabic', hi: 'Hindi', vi: 'Vietnamese', ko: 'Korean', ja: 'Japanese', it: 'Italian', el: 'Greek', fr: 'French', de: 'German', pt: 'Portuguese', tl: 'Tagalog', id: 'Indonesian' };

const ASK_SYSTEM = `You are the product consultant at Harbourline Toyota, a Toyota dealership in Parramatta, Sydney (sister sites Hornsby, Penrith, Liverpool).
Be consultative, warm and concise (2-5 sentences). Ground every fact in the provided context: the Toyota knowledge base passages and the DOMO STOCK FEED / CURRENT BUILD blocks.
Rules:
- Reply in the same language as the customer's question.
- Only mention stock units (ids like HL-2231), sites, days in stock, bonuses and ETAs that appear in the DOMO STOCK FEED. Never invent a unit, price, date or spec.
- Prices are NSW drive-away estimates; say so when quoting.
- If the context does not answer the question, say you'll confirm with the sales team.
- Suggest at most 3 concrete next steps as actions: type "model" (value = model id), "grade" (value = grade id of the relevant model), "pack" (value = tow|protection|roof), or "unit" (value = stock unit id). Use only ids that appear in the context. Labels are short button text in the customer's language.`;

const ASK_SCHEMA = {
  name: 'dealership_reply',
  description: 'Consultant reply plus suggested configurator actions',
  parameters: {
    type: 'object',
    properties: {
      answer: { type: 'string', description: 'The reply to the customer, in their language' },
      actions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['model', 'grade', 'pack', 'unit'] },
            value: { type: 'string' },
            label: { type: 'string' },
            model: { type: 'string', description: 'model id the grade belongs to (grade actions only)' },
          },
          required: ['type', 'value', 'label'],
        },
      },
    },
    required: ['answer', 'actions'],
  },
};

function buildText(build) {
  if (!build || !build.modelId) return null;
  const m = modelById(build.modelId); if (!m) return null;
  const g = gradeOf(m.id, build.gradeId);
  return `CURRENT BUILD in the configurator: ${m.name}${g ? ` ${g.name} (grade id ${g.id}, $${g.price.toLocaleString('en-AU')})` : ''}`
    + `${build.colourId ? `, colour ${colourById(build.colourId)?.name || build.colourId}` : ''}`
    + `${build.interiorId ? `, interior ${interiorById(build.interiorId)?.name || build.interiorId}` : ''}`
    + `${build.packs?.length ? `, packs ${build.packs.map((p) => packById(p)?.name || p).join(', ')}` : ', no accessory packs'}.`
    + ` Available grades for ${m.name}: ${m.grades.map((x) => `${x.id} (${x.name})`).join(', ')}.`;
}

const finderText = (finder) => (finder?.answers?.length ? `FINDER ANSWERS: ${finder.answers.map((a) => `${a.id}=${a.label || a.value}`).join('; ')}.` : null);

/** Validate LLM actions against the catalogue + stock. */
function validActions(actions, { build, stockData, modelsInPlay }) {
  const out = []; const seen = new Set();
  for (const a of Array.isArray(actions) ? actions : []) {
    if (!a || typeof a.value !== 'string') continue;
    const value = a.value.trim(); const label = String(a.label || value).slice(0, 60);
    let ok = false; let v = value;
    if (a.type === 'model') ok = Boolean(modelById(value));
    else if (a.type === 'grade') {
      const mid = [a.model, build?.modelId, ...modelsInPlay].find((id) => id && gradeOf(id, value));
      ok = Boolean(mid);
    } else if (a.type === 'pack') ok = Boolean(packById(value)) && (!build?.modelId || (modelById(build.modelId)?.accessories || []).includes(value));
    else if (a.type === 'unit') { v = value.toUpperCase(); ok = stockData.stock_by_site.some((u) => u.id === v); }
    const key = `${a.type}:${v}`;
    if (ok && !seen.has(key)) { seen.add(key); out.push({ type: a.type, value: v, label }); }
  }
  return out.slice(0, 3);
}

// Sources about the models in play (or general `all` docs) first, then the rest.
const citationsFrom = (sources, n = 4, modelsInPlay = []) => [...sources]
  .map((s, i) => ({ s, i, rank: !modelsInPlay.length || (s.model || []).some((m) => modelsInPlay.includes(m)) ? 0 : (s.model || []).includes('all') ? 1 : 2 }))
  .sort((a, b) => a.rank - b.rank || a.i - b.i).filter((x, _, arr) => x.rank < 2 || arr.filter((y) => y.rank < 2).length < 2)
  .map((x) => x.s).slice(0, n).map((s) => ({
  title: s.title, ...(s.model?.length ? { model: s.model[0] } : {}), ...(s.topic?.length ? { topic: s.topic[0] } : {}), resourceId: s.resourceId,
}));

function historyFor(history) {
  return (Array.isArray(history) ? history : []).slice(-8)
    .filter((h) => h && typeof h.text === 'string' && h.text.trim())
    .map((h) => ({ author: h.role === 'user' ? 'USER' : 'NUCLIA', text: h.text.slice(0, 2000) }));
}

/** Deterministic answer when ARAG is unavailable or has no context. */
function fallbackAnswer({ question, build, stockData, modelsInPlay }) {
  const id = modelsInPlay[0];
  const m = modelById(id);
  if (!m) return { answer: 'I can help with models, grades, towing, pricing and what we have in stock. Which Toyota are you looking at?', actions: [] };
  const av = availability(stockData, m.id, build?.modelId === m.id ? undefined : undefined);
  const units = stockData.stock_by_site.filter((u) => u.model === m.id);
  const aged = units.filter((u) => u.bonus > 0).sort((a, b) => a.priority - b.priority)[0];
  const answer = `The ${m.name} starts from $${m.fromPrice.toLocaleString('en-AU')} drive-away (NSW estimate), seats ${m.seats} and tows up to ${(m.towKg || 0).toLocaleString('en-AU')} kg braked. `
    + `We have ${av.onLot} at Parramatta, ${av.nearby} at our sister sites and ${av.inTransit} inbound; soonest: ${av.soonest}.`
    + (aged ? ` ${aged.id} has been in stock ${aged.age} days, so there is room to move on price.` : '')
    + ' I can have the team confirm the details.';
  const actions = [];
  if (build?.modelId !== m.id) actions.push({ type: 'model', value: m.id, label: `Build a ${m.name}` });
  if (aged) actions.push({ type: 'unit', value: aged.id, label: `See ${aged.id}` });
  return { answer, actions };
}

export async function askAssistant({ question, lang, build, finder, history }, stockData) {
  const q = String(question || '').slice(0, 1000).trim();
  const modelsInPlay = [...new Set([...modelsMentioned(q), ...(build?.modelId && modelById(build.modelId) ? [build.modelId] : [])])];
  const stockText = stockSummary(stockData, modelsInPlay.length ? modelsInPlay : []);
  const extra = [buildText(build), finderText(finder), stockText].filter(Boolean);
  const unitCount = stockData.stock_by_site.filter((u) => !modelsInPlay.length || modelsInPlay.includes(u.model)).length;
  const trace = [{ kind: 'domo', label: `Domo stock: ${unitCount} unit(s)${modelsInPlay.length ? ` for ${modelsInPlay.map((id) => modelById(id)?.name || id).join(', ')}` : ' across all sites'} passed to the agent` }];
  const langHint = lang && LANG[lang] ? ` (UI language: ${LANG[lang]}; still answer in the question's language)` : '';

  if (arag.configured() && q) {
    try {
      const r = await arag.ask({ query: q, system: ASK_SYSTEM + langHint, extraContext: extra, jsonSchema: ASK_SCHEMA, history: historyFor(history) });
      const json = r.json && typeof r.json === 'object' ? r.json : null;
      trace.unshift({ kind: 'kb', label: `Knowledge base: ${r.sources.length} source document(s) retrieved` });
      if (json && typeof json.answer === 'string' && json.answer.trim() && !/^not enough data/i.test(json.answer)) {
        return {
          answer: json.answer.trim(),
          citations: citationsFrom(r.sources, 4, modelsInPlay),
          trace,
          actions: validActions(json.actions, { build, stockData, modelsInPlay }),
        };
      }
      trace.push({ kind: 'kb', label: `Knowledge base had no grounded answer (${r.status}); using stock summary` });
    } catch (e) {
      trace.unshift({ kind: 'kb', label: 'Knowledge base unavailable; answered from catalogue and stock' });
      console.warn(`[ask] ${e.message}`);
    }
  } else {
    trace.unshift({ kind: 'kb', label: 'Knowledge base not configured; answered from catalogue and stock' });
  }
  const fb = fallbackAnswer({ question: q, build, stockData, modelsInPlay });
  return { answer: fb.answer, citations: [], trace, actions: fb.actions };
}

// ── finder ───────────────────────────────────────────────────────────────────
const FINDER_SYSTEM = `You run a 5-question "find my Toyota" interview for Harbourline Toyota (Sydney). Use the CATALOGUE and DOMO STOCK FEED in the context.
Rules for the next question:
- Exactly 5 questions in total; you are asked for one at a time.
- Each question MUST depend on the previous answers (branch: e.g. towing a caravan → ask about terrain, not commuting distance; seven seats → no small-car budget bands).
- The question id must be one of: use, people, distance, towing, worktype, terrain, power, budget, when, priorities — and must not repeat an id already answered. The first question is always "use".
- Give 3 or 4 options, each with a short kebab-case id, a short label, a one-line sub, and an optional note (only when it changes the outcome, e.g. "Rules out 5-seat SUVs").
- "why" is one sentence explaining why the question matters given the answers so far.
Answer in English.`;

const QUESTION_SCHEMA = {
  name: 'finder_question',
  description: 'The next interview question',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', enum: fallback.VOCAB },
      text: { type: 'string' },
      why: { type: 'string' },
      options: {
        type: 'array',
        items: {
          type: 'object',
          properties: { id: { type: 'string' }, label: { type: 'string' }, sub: { type: 'string' }, note: { type: 'string' } },
          required: ['id', 'label', 'sub'],
        },
      },
    },
    required: ['id', 'text', 'why', 'options'],
  },
};

const RECS_SCHEMA = {
  name: 'finder_recommendations',
  description: 'Top 3 Toyota recommendations',
  parameters: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      recommendations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            modelId: { type: 'string' }, gradeId: { type: 'string' }, fit: { type: 'integer' },
            why: { type: 'array', items: { type: 'string' } }, watch: { type: 'array', items: { type: 'string' } },
          },
          required: ['modelId', 'gradeId', 'fit', 'why', 'watch'],
        },
      },
    },
    required: ['summary', 'recommendations'],
  },
};

function cleanAnswers(answers) {
  return (Array.isArray(answers) ? answers : []).filter((a) => a && fallback.VOCAB.includes(a.id) && a.value != null)
    .slice(0, 5).map((a) => ({ id: a.id, value: String(a.value).slice(0, 60), label: String(a.label || a.value).slice(0, 80) }));
}

function validQuestion(q, answers) {
  if (!q || !fallback.VOCAB.includes(q.id) || answers.some((a) => a.id === q.id)) return null;
  if (answers.length === 0 && q.id !== 'use') return null;
  if (typeof q.text !== 'string' || !q.text.trim()) return null;
  const opts = (Array.isArray(q.options) ? q.options : []).filter((o) => o && o.id && o.label)
    .map((o) => ({ id: String(o.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30), label: String(o.label).slice(0, 40), sub: String(o.sub || '').slice(0, 80), ...(o.note ? { note: String(o.note).slice(0, 80) } : {}) }));
  if (opts.length < 3 || opts.length > 4 || new Set(opts.map((o) => o.id)).size !== opts.length) return null;
  return { id: q.id, text: q.text.trim(), why: String(q.why || '').trim(), options: opts };
}

function validRecs(json, stockData) {
  const recs = [];
  for (const r of Array.isArray(json?.recommendations) ? json.recommendations : []) {
    const m = modelById(r?.modelId);
    if (!m || recs.some((x) => x.modelId === m.id)) continue;
    const g = gradeOf(m.id, r.gradeId) || m.grades[0];
    recs.push({
      modelId: m.id, gradeId: g.id,
      fit: Math.max(0, Math.min(100, Math.round(Number(r.fit) || 0))),
      why: (Array.isArray(r.why) ? r.why : []).map(String).filter(Boolean).slice(0, 4),
      watch: (Array.isArray(r.watch) ? r.watch : []).map(String).filter(Boolean).slice(0, 3),
      availability: availability(stockData, m.id),
    });
    if (recs.length === 3) break;
  }
  return recs;
}

export async function finderNext(body, stockData) {
  const answers = cleanAnswers(body?.answers);
  const done = answers.length >= 5;
  const trace = [{ kind: 'domo', label: `Domo stock: ${stockData.stock_by_site.length} units across 4 sites checked for availability` }];
  const answered = answers.length ? answers.map((a, i) => `${i + 1}. ${a.id} = ${a.label} (${a.value})`).join('\n') : '(none yet)';
  const extra = [`CATALOGUE (id | name | body | powertrain | seats | braked tow | from price | grades | tags):\n${catalogSummary()}`, stockSummary(stockData)];

  if (arag.configured()) {
    try {
      if (!done) {
        const r = await arag.ask({
          query: `Which Toyota suits a buyer who answered: ${answers.map((a) => a.label).join(', ') || 'nothing yet'}? Decide the next interview question.`,
          system: `${FINDER_SYSTEM}\n\nAnswers so far:\n${answered}\nThis will be question ${answers.length + 1} of 5.`,
          extraContext: extra, jsonSchema: QUESTION_SCHEMA, timeoutMs: 20000, topK: 10,
        });
        const q = validQuestion(r.json, answers);
        trace.unshift({ kind: 'kb', label: `Knowledge base: ${r.sources.length} document(s) informed question ${answers.length + 1}` });
        if (q) return { step: answers.length + 1, of: 5, question: q, trace };
        trace.push({ kind: 'kb', label: 'Agent question failed validation; used the guided fallback' });
      } else {
        const r = await arag.ask({
          query: `Recommend the best 3 Toyota models and grades for: ${answers.map((a) => `${a.id} ${a.label}`).join(', ')}`,
          system: `You recommend Toyotas for Harbourline Toyota. Using the CATALOGUE, knowledge base and DOMO STOCK FEED, return exactly 3 recommendations ranked by fit (0-100), using only model ids and grade ids from the CATALOGUE. "why" = 2-3 short reasons tied to the answers; "watch" = 0-2 honest caveats (towing limits, budget, wait times). "summary" = one sentence. Answer in English.\n\nAnswers:\n${answered}`,
          extraContext: extra, jsonSchema: RECS_SCHEMA, timeoutMs: 25000, topK: 15,
        });
        const recs = validRecs(r.json, stockData);
        trace.unshift({ kind: 'kb', label: `Knowledge base: ${r.sources.length} document(s) used to rank models` });
        if (recs.length) {
          return { done: true, summary: String(r.json.summary || '').trim() || fallback.recommend(answers, stockData).summary, recommendations: recs, trace };
        }
        trace.push({ kind: 'kb', label: 'Agent recommendations failed validation; used the scoring fallback' });
      }
    } catch (e) {
      console.warn(`[finder] ${e.message}`);
      trace.unshift({ kind: 'kb', label: 'Knowledge base unavailable; used the guided fallback' });
    }
  }
  return done ? { ...fallback.recommend(answers, stockData), trace } : { ...fallback.nextQuestion(answers), trace };
}
