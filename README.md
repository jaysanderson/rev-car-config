# Harbourline Toyota Configurator

A car-configurator prototype from a dealer-management-system vendor, built for a fictional Toyota dealer (Harbourline Toyota, Parramatta, with Hornsby, Penrith and Liverpool sister sites).

- **Progress Agentic RAG (Nuclia)** drives the consultative parts: cited answers in the customer's language, a 5-question finder that branches on every answer, and "For you" rows built from semantic search.
- **Domo** supplies stock intelligence from the DMS: stock by site, aged-stock actions, transfer feasibility, inbound pipeline and order-bank ETAs. It shapes offers, availability and answers.

Harbourline is fictional. All prices, stock and ages are illustrative.

## Architecture

```
browser (public/index.html, with a deterministic local fallback)
   │  same-origin JSON
   ▼
server/index.mjs  (Node 20 + Express; holds the ARAG token, never ships it)
   ├── server/arag.mjs            ARAG client: /ask (sync, JSON schema), /find, /counters, /catalog
   ├── server/assistant.mjs       /api/ask and /api/finder/next (ARAG + validation)
   ├── server/finder-fallback.mjs deterministic 5-question finder (used whenever ARAG fails validation)
   ├── server/foryou.mjs          "Because you…" rows from composed /find queries (rules in the file header)
   ├── server/dealer.mjs          dealer priorities, promotions, dealer factor, offer re-ranking, atomic state writes
   ├── server/testdrive.mjs       test-drive slots, booking (ARAG questions), answers (ARAG reply)
   ├── server/testdrive-fallback.mjs  question bank, incentive picker, prep list, template reply
   └── server/data.mjs            catalogue, Domo datasets (stand-in or live), pricing, availability, offers
content/
   ├── catalog.json               models, grades, colours, interiors, packs, drive-away prices
   ├── kb/*.md                    Toyota knowledge corpus (frontmatter: title, model, topic)
   ├── domo/*.json                Domo stand-in datasets
   └── dealer/                    dealer stand-in data (fictional)
        ├── priorities.json       business-editable weights (written by PUT /api/dealer/priorities)
        ├── promotions.json       8 promotions with appliesTo rules and an honest dealer-side reason
        ├── calendar.json         per-site hours, 45-min slots, recurring stand-in diary of taken slots
        ├── incentives.json       11 test-drive incentives with matching rules
        └── bookings.json         test-drive bookings (stand-in DMS write-back; appended by the API)
```

### ARAG assets (zone `aws-ap-southeast-2-1`)

| Asset | What it is |
|---|---|
| Knowledge Box `harbourline-toyota-configurator` | The corpus: `content/kb/*.md` plus `catalog.json` (rendered to Markdown, slug `catalog`). |
| Labelsets `model`, `topic` | `model`: Toyota model ids + `all`. `topic`: specs, grades, towing, accessories, pricing, warranty, service, finance, safety, dealer-policy, dates. |
| Search configs `grounded-hybrid`, `semantic-broad` | Saved retrieval strategies (hybrid + predict reranker). |
| Retrieval agent `harbourline-stock-agent` | Driver `nucliadb` → the KB. Context agents: `ask` (KB) and `http` (GET `https://harbourline-configurator.fly.dev/api/stock?q=<question>`, the REST context agent). Generation: `summarize` with a grounded dealership prompt. Rules: language, stock-fact grounding, no invention. |

### Domo through the agent: two paths

1. **Active in this server:** every `/api/ask` and `/api/finder/next` call sends ARAG `/ask` an `extra_context` block holding a compact stock summary for the models in play, built from the Domo datasets, plus the current build and finder answers. The model answers from the KB passages and that stock block together.
2. **Provisioned on the platform:** the `harbourline-stock-agent` retrieval agent calls this app's `/api/stock?q=` over HTTP (the `http` context agent) alongside the KB `ask` agent. Use it from the ARAG dashboard ("Test agent") or a widget. It needs the deployed app, because it calls the public URL. The server does not route through it.

### Domo source

`content/domo/*.json` is the stand-in. To go live, set `DOMO_CLIENT_ID`, `DOMO_CLIENT_SECRET` and `DOMO_DATASET_STOCK`. You can also set `DOMO_DATASET_AGED`, `DOMO_DATASET_TRANSFER`, `DOMO_DATASET_INBOUND` and `DOMO_DATASET_ORDERBANK`. The server then queries Domo's dataset API (client credentials, `scope=data`), maps the results to the same shapes and falls back to the stand-in if a call fails. `/api/health` reports `domo: "live" | "stand-in"`.

## API

All responses are JSON, `Cache-Control: no-store`, same-origin only (cross-origin POSTs get 403). The ARAG-backed endpoints (`/api/ask`, `/api/finder/next`, `/api/foryou`, `/api/find`, `/api/testdrive/book`, `/api/testdrive/answers`) and `PUT /api/dealer/priorities` share a per-IP token bucket (`RATE_BURST`, `RATE_PER_MIN`).

| Endpoint | Returns |
|---|---|
| `GET /api/health` | `{ok, kb:{id, resources, processing}, domo, version}`. Always 200. |
| `GET /api/catalog` | `content/catalog.json` |
| `GET /api/stock` | `{stock_by_site, aged_stock_actions, transfer_feasibility, inbound_pipeline, order_bank_eta, refreshed_at}`. With `?q=`, returns a text/plain summary for the agent. |
| `GET /api/offers?model=&body=` | An array of `{unitId, modelId, gradeId, colourId, price, bonus, site, age, priority, placement, reason}`, same body type first, then priority ascending. Same-body offers are `build_ribbon`; the rest are `stage_strip`. |
| `POST /api/ask` | `{question, lang, build, finder, history}` → `{answer, citations[], trace[], actions[]}` |
| `POST /api/finder/next` | `{answers[]}` → the next question (`{step, of:5, question, trace}`) or, at 5 answers, `{done, summary, recommendations[], trace}` |
| `GET /api/foryou?model=&grade=&answers=id:value,…&colour=&packs=` | An array of `{id, title, reason, query, items[]}` |
| `GET /api/find?q=` | An array of `{title, modelId, topic, text, score, resourceId}` |
| `GET /api/dealer/priorities` | `{updatedAt, updatedBy, weights:{stockOnLot, agedStock, promotions, pushModel:{modelId, weight}}, note}` (weights 0-100) |
| `PUT /api/dealer/priorities` | Same shape in; integers 0-100, `pushModel.modelId` a catalogue id or null. Written atomically; returns the saved object (server sets `updatedAt`). 400 `{error}` on invalid input. **No auth (prototype).** |
| `GET /api/promotions?model=&unit=&body=` | Array of `{id, title, kind, value, desc, reason, appliesTo:{models, units, aged, bodies, onLot?}, validUntil}` matching every given filter; all live promotions when none. Unknown model/unit/body → 400. |
| `GET /api/testdrive/slots?site=par&unit=` | `{site, siteName, unitId?, transferNote?, days:[{date, label, closed?, slots:[{id, time, available}]}]}` for 10 days from today (Australia/Sydney). `transferNote` when the unit is at another site or in transit; slots before it can arrive are unavailable. |
| `POST /api/testdrive/book` | `{site, slotId, unitId?, build, viewed[], finder:{answers}, lang}` → `{bookingId, site, siteName, when, whenLabel, unitId, model, grade, modelId, gradeId, questions[3], incentive, trace}`. 409 if the slot was taken. |
| `POST /api/testdrive/answers` | `{bookingId, answers:[{id, value}]}` → `{ok, reply, prep[≤3], trace}`. 404 unknown booking; 400 if no answer matches the booking's questions. |

`/api/offers` rows also carry `promotions:[promotionId]` (empty when none) and are re-ranked by the dealer weights (below). Finder recommendations (`done:true`) carry `dealerFactor` (number, 0-12) and `nudge` (`{reason, promotionId?}` or null).

### Dealer priorities, promotions, test drives

- **Dealer factor** (finder, both paths): `stockOnLot/100×6` if the model has a unit on any lot, `agedStock/100×6` if it has an aged unit with incentive headroom, `pushModel.weight/100×8` for the pushed model, `promotions/100×4` if a promotion applies; capped at 12. Recommendations are ordered by `fit + dealerFactor`. The ARAG path asks the agent for 4 ranked picks with a `nudge` sentence (the prompt carries a DEALER PRIORITIES block and the promotions), computes `dealerFactor` in code, re-sorts and keeps 3. The agent's sentence is used only when it passes a filter (no stock age, margins, bonuses, targets, or dollar amounts that are not a listed promotion's value); otherwise the deterministic sentence is used. `fit` itself is untouched.
- **Offers**: same-body first as before, then `move priority − pushModel.weight/100×3 (pushed model) − promotions/100×2 (unit has a promotion)`.
- **Assistant**: `/api/ask` adds a DEALER PROMOTIONS block for the models in play, a rule that the agent may quote only those and must say honestly why each is offered, and a trace `{kind:"domo", label:"Promotions: N applicable"}`.
- **Test drives**: questions come from the ARAG agent (`answer_json_schema`, salesperson prompt over the viewed cars, current build, finder answers and the KB) and are validated: shape, 2-4 options for `choice`, `yes`/`no` for `yesno`, no topic the finder already answered, one per topic. `server/testdrive-fallback.mjs` tops up to exactly 3 from a bank keyed by tags, body, powertrain and finder answers. The incentive is deterministic (`incentives.json`). The answers reply is ARAG (two sentences, limited to the prep list), with a template fallback; the prep list is always deterministic. A slot is held in memory while the booking is prepared, so two concurrent bookings cannot take it.
- **State**: `priorities.json` and `bookings.json` are written to `DEALER_STATE_DIR` when set, else `content/dealer/`. If that directory is read-only (the Docker image's `content/` belongs to root), the server switches to `<tmpdir>/harbourline-dealer` with a warning, so on Fly the edits and bookings last only until the machine restarts. The smoke test points `DEALER_STATE_DIR` at a temp dir.

Platform notes, verified live:

- `answer_json_schema` combined with `citations:true` returns HTTP 500, so JSON-shaped asks run without citations. Citations come from the retrieval best matches instead.
- An empty KB returns `no_retrieval_data` even when `extra_context` is supplied. The server then answers from the catalogue and stock.

## Setup

`.env` is gitignored. It holds `NUCLIA_NUA_KEY`, `NUCLIA_ACCOUNT`, `NUCLIA_ZONE`, `ARAG_KB_ID`, `ARAG_API_KEY` (the KB service token), `ARAG_ZONE`, `ARAG_AGENT_ID` and `ARAG_AGENT_KEY`. The `NUCLIA_KB_*` and `NUCLIA_SERVICEACCOUNT` mirrors are there for the demo-factory scripts. Optional: `ARAG_GENERATIVE_MODEL` and the `DOMO_*` variables.

To provision from scratch (both steps are idempotent; the first is vendored from arag-demo-factory):

```sh
node scripts/create-kb.mjs --title harbourline-toyota-configurator --slug harbourline-toyota-configurator
node scripts/provision.mjs        # labelsets, search configs, retrieval agent (or: provision labelsets|search|agent)
```

## Ingest the corpus

```sh
npm run ingest            # = node scripts/ingest.mjs
```

The script upserts every `content/kb/*.md` (slug = filename) and `catalog.json` (slug `catalog`, labels `model=all`, `topic=pricing`), then waits for processing and reports the status of each resource. Re-run it any time the corpus changes. It also works against an empty `content/kb`.

## Run locally

```sh
npm ci
node server/index.mjs     # loads .env automatically; PORT defaults to 8080
# or: node --env-file=.env server/index.mjs
```

## Deploy

Runtime secrets are staged on the Fly app. These are `ARAG_*`, `NUCLIA_ACCOUNT`, `NUCLIA_ZONE`, `NUCLIA_KB_*` and `NUCLIA_SERVICEACCOUNT`. The NUA key and the agent key stay local because the server doesn't need them.

```sh
fly deploy                # Dockerfile: node:20-alpine, npm ci --omit=dev, node server/index.mjs on :8080
```
