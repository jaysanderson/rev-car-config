# Harbourline Toyota: configurator, used-car retail and back office

A prototype from a dealer-management-system vendor, built for a fictional Toyota dealer (Harbourline Toyota, Parramatta, with Hornsby, Penrith and Liverpool sister sites).

## Three surfaces, one knowledge layer

One Progress Agentic RAG knowledge box and one set of Domo stand-in datasets serve three applications in the same Node server: the **new-car configurator** at `/` (finder, build, availability, offers, cited assistant), the **used-car retail surface** at `/used/` (listing with semantic sort, agent-written dealer comments from each car's own resource, a vehicle page with provenance and an assistant that remembers what you asked, a used-car finder, personalised rows from your session, enquiries and holds into the back office; spec `docs/USED-SPEC.md`), and the **sales back office** at `/dms/` (API-first DMS with OpenAPI and MCP). The platform thesis and surface map are in `docs/PLATFORM.md`.

- **Progress Agentic RAG (Nuclia)** drives the consultative parts: cited answers in the customer's language, a 5-question finder that branches on every answer, and "For you" rows built from semantic search.
- **Domo** supplies stock intelligence from the DMS: stock by site, aged-stock actions, transfer feasibility, inbound pipeline and order-bank ETAs. Its nightly Intelligence output `dealer_signals` (days of supply, allocation, target gap, margin headroom per model, from the ERP) decides the dealer nudges and which promotions exist. It shapes offers, availability and answers.
- **Domo + ARAG together** compose the promotions: Domo picks what to push, the ARAG agent writes the offer from the accessories, servicing and finance documents, and the server validates it against the catalogue.
- **First-party data**: the configurator logs anonymous session events, gives the salesperson a pre-visit handover sheet for every test drive, and aggregates a report for Domo.

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
   ├── server/dealer.mjs          derivePriorities() from Domo signals, promotion filters, dealer factor, offer re-ranking
   ├── server/promotions.mjs      Domo targets → ARAG-composed promotions, validation, 30-min cache, persisted last good set
   ├── server/events.mjs          first-party events (JSON lines), /api/report/configurator aggregate, synthetic seed
   ├── server/state.mjs           dealer state files: atomic JSON writes, JSONL appends, read-only fallback to tmp
   ├── server/testdrive.mjs       test-drive slots, booking (ARAG questions), answers (ARAG reply), salesperson handover
   ├── server/testdrive-fallback.mjs  question bank, incentive picker, prep list, template reply
   └── server/data.mjs            catalogue, Domo datasets (stand-in or live), pricing, availability, offers
content/
   ├── catalog.json               models, grades, colours, interiors, packs, drive-away prices
   ├── kb/*.md                    Toyota knowledge corpus (frontmatter: title, model, topic)
   ├── domo/*.json                Domo stand-in datasets
   │    └── dealer_signals.json   Domo Intelligence dataflow output (nightly): per model unitsInStock, sales90d,
   │                              daysOfSupply, allocationNextMonth, targetGap, avgDaysInStock, marginHeadroomAvg
   └── dealer/                    dealer stand-in data (fictional)
        ├── promotions.generated.json  last good ARAG-composed promotion set (state; read at start-up so restarts are instant)
        ├── promotions.json       static promotions register: served only when ARAG is unreachable and no generated set exists
        ├── events.jsonl          first-party events, append-only JSON lines (state; seeded by scripts/seed-events.mjs)
        ├── calendar.json         per-site hours, 45-min slots, recurring stand-in diary of taken slots
        ├── incentives.json       11 test-drive incentives with matching rules
        └── bookings.json         test-drive bookings incl. the handover sheet (stand-in DMS write-back; appended by the API)
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

`content/domo/*.json` is the stand-in. To go live, set `DOMO_CLIENT_ID`, `DOMO_CLIENT_SECRET` and `DOMO_DATASET_STOCK`. You can also set `DOMO_DATASET_AGED`, `DOMO_DATASET_TRANSFER`, `DOMO_DATASET_INBOUND`, `DOMO_DATASET_ORDERBANK` and `DOMO_DATASET_SIGNALS` (the `dealer_signals` dataflow output; columns as in the stand-in). The server then queries Domo's dataset API (client credentials, `scope=data`), maps the results to the same shapes and falls back to the stand-in if a call fails. `/api/health` reports `domo: "live" | "stand-in"`.

## API

All responses are JSON, `Cache-Control: no-store`, same-origin only (cross-origin POSTs get 403). The ARAG-backed endpoints (`/api/ask`, `/api/finder/next`, `/api/foryou`, `/api/find`, `/api/testdrive/book`, `/api/testdrive/answers`, `/api/testdrive/handover`, `POST /api/promotions/refresh`) share a per-IP token bucket (`RATE_BURST`, `RATE_PER_MIN`). `POST /api/events` has its own bucket (`EVENTS_BURST` 120, `EVENTS_PER_MIN` 90) and a 2 KB body limit (413 above it).

**Session id.** The page generates a random `sid` per browser session (8-64 chars of `A-Z a-z 0-9 _ -`, e.g. `crypto.randomUUID()`) and sends it as the `x-sid` header (or a body `sid`) on `/api/events`, `/api/ask`, `/api/finder/next`, `/api/testdrive/book` and `/api/testdrive/answers`. No other identifier is stored. Finder prefetches must send `x-prefetch: 1` (or body `prefetch: true`) so they are not logged.

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
| `GET /api/dealer/priorities` | Derived from Domo: `{source:"Domo · dealer_signals (nightly)", refreshedAt, computedAt, updatedAt, updatedBy, weights:{stockOnLot, agedStock, promotions, pushModel:{modelId, weight}}, derivedFrom:[{signal, value, effect}], note}` (weights integers 0-100). |
| `PUT` (any non-GET) `/api/dealer/priorities` | 405 `{error}`: priorities are produced by Domo and cannot be edited. |
| `GET /api/promotions?model=&unit=&body=` | Array of `{id, title, kind, value, desc, why, reason, appliesTo:{models, units, aged, bodies, onLot?}, validUntil, source:{domo, kb[]}, composedBy:"arag"\|"fallback"}` matching every given filter; all live promotions when none. `why` is the customer-safe line; `reason` and `source.domo` are dealer-side. Unknown model/unit/body → 400. |
| `GET /api/promotions/explain` | `{source, composedAt, composedBy:"arag"\|"mixed"\|"fallback"\|"static", latencyMs, ttlMinutes, refreshing, signalsRefreshedAt, targets:[{target, type, models, units, signal, allowedKinds, promotion:{id, title, kind, value, why}, composedBy, kb[], rejected?, ms}]}`: the Domo targets and the promotion each produced (How-it-works drawer; dealer-internal signals). |
| `POST /api/promotions/refresh` | Recompose now (awaits ARAG, ~20 s); returns the explain object. |
| `POST /api/events` | `{sid, type, data}` → 201 `{ok, logged:true}`; 202 `{ok, logged:false, note}` for a duplicate or a server-logged type; 400 `{error}` on an unknown type or invalid data; 413 over 2 KB. Types and `data`: `finder_answer {questionId, value}`, `finder_result {recommended:[modelId]}`, `build_change {modelId, gradeId, colourId, interiorId?, packs[]}`, `offer_view {unitId}`, `offer_click {unitId}`; `ask`, `booking`, `booking_answer` are logged by the server. |
| `GET /api/report/configurator?days=30` | `{since, days, generatedAt, events, sessions, finderStarts, finderCompletions, answersByQuestion:{questionId:{value:n}}, modelsConfigured:{modelId:n}, coloursChosen:{colourId:n}, packsChosen:{packId:n}, offersShown:{unitId:n}, offersClicked:{unitId:n}, questionsAsked, bookings:{count, bySite, byModel}, bookingAnswers:{questionId:{value:n}}, conversion:{finderToBooking, offerClickToBooking}}` (days 1-365). |
| `GET /api/testdrive/slots?site=par&unit=` | `{site, siteName, unitId?, transferNote?, days:[{date, label, closed?, slots:[{id, time, available}]}]}` for 10 days from today (Australia/Sydney). `transferNote` when the unit is at another site or in transit; slots before it can arrive are unavailable. |
| `POST /api/testdrive/book` | `{site, slotId, unitId?, build, viewed[], finder:{answers}, lang}` → `{bookingId, site, siteName, when, whenLabel, unitId, model, grade, modelId, gradeId, questions[3], incentive, handover, trace}` (`handover` = the sheet's URL). 409 if the slot was taken. |
| `POST /api/testdrive/answers` | `{bookingId, answers:[{id, value}]}` → `{ok, reply, prep[≤3], trace}`. 404 unknown booking; 400 if no answer matches the booking's questions. |
| `GET /api/testdrive/handover/:bookingId` | Salesperson pre-visit sheet: `{bookingId, whenLabel, when, site, siteName, customerRef, lang, car:{modelId, model, gradeId, grade, colour, interior, packs[], unitId, price, priceNote, transferFrom?}, viewed:[{modelId, model, grade, unitId, source}], finderAnswers:[{question, answer}], questions:[{question, answer\|null}], promotionsToOffer:[{title, why}], incentive, talkingPoints[3-5], talkingPointsBy:"arag"\|"fallback", prep[], generatedAt, basis, trace}`. 400 bad id, 404 unknown. Dealer-side, no auth (prototype). |

`/api/offers` rows also carry `promotions:[promotionId]` (empty when none) and are re-ranked by the dealer weights (below). Finder recommendations (`done:true`) carry `dealerFactor` (number, 0-12) and `nudge` (`{reason, promotionId?}` or null).

### Dealer priorities, promotions, test drives

- **Priorities are computed, not edited** (`derivePriorities(signals, stock)` in `server/dealer.mjs`), from `dealer_signals` and the aged-stock list, every time the stock snapshot refreshes (60 s cache): `stockOnLot` = unit-weighted average days of supply scaled 20 → 0 … 90 → 100; `agedStock` = aged units with headroom × 7 + (average age − 60) × 1.2; `promotions` = unit-weighted `marginHeadroomAvg` scaled $0 → 0 … $2,500 → 100; `pushModel` = the model with the highest `allocationNextMonth + 2 × targetGap` (score ≥ 8, never a supply-constrained model), weight = score × 2.5. With the stand-in: 44 / 69 / 39 / Kluger 65. `derivedFrom` explains each weight in plain language.
- **Promotions** (`server/promotions.mjs`). Domo picks the targets: `aged-<model>` (aged units with headroom), `push-<model>`, `gap-<model>` (target gap ≥ 3) and `body-<body>` (unit-weighted days of supply ≥ 55 over ≥ 4 units). Each target gets one ARAG `/ask` (4 in parallel, retrieval limited to the accessories, service, finance, towing, dealer-policy and warranty documents) with an `answer_json_schema` limited to the target's allowed kinds (`accessory-bundle | servicing | trade-in | finance | delivery`) and a numeric `value`. The server rejects: a kind not allowed; packs the model does not take or the unit already has; an accessory value that is not the exact catalogue price of the chosen packs or that exceeds headroom ÷ 0.7; servicing beyond 3 years or above years × the capped price (`content/kb/service.md`); a trade-in bonus outside $250-headroom; any percentage or rate; a $ amount that is not the value or a catalogue price; a model outside the target; and customer text that mentions age, headroom, margins, targets or allocation. A rejected target gets a deterministic promotion (`composedBy:"fallback"`, reason in `/explain`). Ids are stable (`promo-aged-rav4`, `promo-push-kluger`, `promo-gap-hilux`, `promo-body-suv-mid`, …). The set is cached in memory for `PROMO_TTL_MIN` (30) minutes or until the Domo signature changes, recomposed in the background (~20 s), and the last set with any ARAG-composed promotion is written to `promotions.generated.json`. ARAG not configured or unreachable with no previous set → `promotions.json`.
- **First-party events** (`server/events.mjs`, `events.jsonl`): `{ts, sid, type, data, src}`; no PII, no free text. The server logs `ask {questionLength, lang, modelId}`, `booking {bookingId, modelId, unitId, site, whenLabel}`, `booking_answer {bookingId, questionId, value}`, and from `/api/finder/next` (sid present, not a prefetch) `finder_answer` for the newest answer and `finder_result` on the final step. The page posts `build_change`, `offer_view`, `offer_click`, and may post `finder_answer` / `finder_result` for prefetched steps; repeats within 30 min are dropped. `node scripts/seed-events.mjs` writes ~485 synthetic events over 30 days across ~60 sessions when the file is missing or empty.
- **Handover**: built in the background after each booking and again after the answers; the GET waits for an in-flight build, otherwise serves the sheet stored on the booking (`bookings.json` → `handover`, so the DMS write-back carries it) or rebuilds it. Talking points: one ARAG `/ask` as a sales-manager briefing over the model's spec documents (`model` label = the car or `all`), the finder and booking answers, the promotions and the incentive. Points quoting a $ amount that is not the car price, a promotion, the incentive or a pack price are dropped; fewer than 3 → topped up from a deterministic briefing.

- **Dealer factor** (finder, both paths): `stockOnLot/100×6` if the model has a unit on any lot, `agedStock/100×6` if it has an aged unit with incentive headroom, `pushModel.weight/100×8` for the pushed model, `promotions/100×4` if a promotion applies; capped at 12. Recommendations are ordered by `fit + dealerFactor`. The ARAG path asks the agent for 4 ranked picks with a `nudge` sentence (the prompt carries a DEALER PRIORITIES block and the promotions), computes `dealerFactor` in code, re-sorts and keeps 3. The agent's sentence is used only when it passes a filter (no stock age, margins, bonuses, targets, or dollar amounts that are not a listed promotion's value); otherwise the deterministic sentence is used. `fit` itself is untouched.
- **Offers**: same-body first as before, then `move priority − pushModel.weight/100×3 (pushed model) − promotions/100×2 (unit has a promotion)`.
- **Assistant**: `/api/ask` adds a DEALER PROMOTIONS block for the models in play, a rule that the agent may quote only those and must say honestly why each is offered, and a trace `{kind:"domo", label:"Promotions: N applicable"}`.
- **Test drives**: questions come from the ARAG agent (`answer_json_schema`, salesperson prompt over the viewed cars, current build, finder answers and the KB) and are validated: shape, 2-4 options for `choice`, `yes`/`no` for `yesno`, no topic the finder already answered, one per topic. `server/testdrive-fallback.mjs` tops up to exactly 3 from a bank keyed by tags, body, powertrain and finder answers. The incentive is deterministic (`incentives.json`). The answers reply is ARAG (two sentences, limited to the prep list), with a template fallback; the prep list is always deterministic. A slot is held in memory while the booking is prepared, so two concurrent bookings cannot take it.
- **State**: `bookings.json`, `events.jsonl` and `promotions.generated.json` are written to `DEALER_STATE_DIR` when set, else `content/dealer/` (a state file missing there is read from `content/dealer/`, and copied across on the first write). If that directory is read-only (the Docker image's `content/` belongs to root), the server switches to `<tmpdir>/harbourline-dealer` with a warning, so on Fly bookings, new events and recomposed promotions last only until the machine restarts (the seeded events and the last generated promotions ship in the image). The smoke test points `DEALER_STATE_DIR` at a temp dir.

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

## Seed the first-party events

```sh
node scripts/seed-events.mjs   # only when content/dealer/events.jsonl is missing or empty
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

## DMS (sales back office)

A second application in the same server. It is a sales-only dealer management system for Harbourline Toyota that shows Progress Agentic RAG and Domo working in the back office. It is API-first: there is an OpenAPI document, a full MCP tool catalogue, and the SPA at `/dms` only talks to the API. Contract: `docs/DMS-SPEC.md`. MCP: `docs/DMS-MCP.md`.

| Path | What |
| --- | --- |
| `/dms` | SPA (`public/dms/`, hash routes) |
| `/dms/api` | REST API, bearer auth (62 operations) |
| `/dms/api/openapi.json` · `/dms/api/docs` | OpenAPI 3.0 generated from the route table, and an inline HTML reference |
| `/dms/mcp` | MCP Streamable HTTP (stateless, 54 tools generated from the OpenAPI document); stdio: `scripts/dms-mcp-stdio.mjs` |

**Demo logins** (password `demo1234`): `gm@harbourline.demo` (general manager, all sites) · `sm.par@harbourline.demo` (sales manager, Parramatta) · `sales1@harbourline.demo` (salesperson Josh Pereira, own leads/deals) · `marketing@harbourline.demo` (digital experience) · `finance@harbourline.demo` (business manager, F&I). Personal access tokens (`hdms_…`) are issued by `POST /dms/api/access-tokens` for MCP clients and scripts.

**Routes** (all under `/dms/api`, lists take `q, siteId, status, from, to, sort, page, pageSize` plus any `column=value`, and return `{items,total,page,pageSize}`):
- system/auth: `GET /health` (public, always 200) · `POST /auth/login` · `GET /auth/me` · `POST /auth/logout` · `GET /auth/users` · `GET/POST /access-tokens` · `DELETE /access-tokens/:id` · `GET /mcp/info`
- CRM: `GET/POST /customers` · `GET /customers/:id` · `GET/POST /leads` · `GET/PATCH /leads/:id` (customer fields create the customer; `contact` logs a contact) · `GET/POST /test-drives` · `GET/PATCH /test-drives/:id`
- deals: `GET/POST /deals` · `GET/PATCH /deals/:id` (stage, discount, readyNowBonus ≤ headroom, `event`) · `POST /deals/:id/events` (`approval_requested` → approval, `approved` → contract) · `GET /trade-ins` · `GET /finance-apps`
- stock: `GET /vehicles` (`aged=1`) · `GET /vehicles/:stockNo` · `POST /vehicles/:stockNo/hold` (48 h) · `POST /vehicles/:stockNo/transfer`
- marketing: `GET /promotions` (published | unpublished | scheduled | expired) · `POST /promotions/compose` · `POST /promotions/:id/publish|unpublish` · `GET /campaigns`
- documents: `GET/POST /documents` (base64 JSON ≤ 8 MB) · `GET /documents/samples` · `GET /documents/:id` · `GET /documents/:id/file` · `POST /documents/:id/process` · `POST /documents/:id/verify`
- KPIs and Domo: `GET /kpi/overview|series|leaderboard` · `GET /domo/datasets` · `GET /domo/export/:dataset.csv` (also `?token=`) · `GET /domo/signals` · `POST /domo/recompute-signals`
- DXM: `GET /dxm/overview` · `GET /dxm/handovers`
- ARAG: `POST /ask` · `POST /agent/query` · `POST /deals/:id/summary` · `POST /leads/:id/followup` · `GET /search` · `GET /arag/status`

**Files** (`server/dms/`): `index.mjs` (route table → router + OpenAPI) · `db.mjs` (loads `content/dms/data/*.json`, indexes, list/get/insert/patch, `_changes.jsonl` write-through) · `auth.mjs` (users, session tokens, PATs, permission matrix, row scoping) · `kpi.mjs` · `domo.mjs` (catalogue, streamed CSV, `dealer_signals` recompute) · `derive.mjs` (derived datasets, data team) · `dxm.mjs` (configurator bridge: `leadFromBooking`, reconcile) · `ops.mjs` (test drives, quotes, bonus, approvals, holds, transfers) · `ai.mjs` (ARAG features) · `kb.mjs` (file upload / processing / facet calls) · `documents.mjs` · `openapi.mjs` · `mcp-core.mjs` + `mcp.mjs` (MCP). Tests: `node tests/dms-smoke.mjs` (`--quick` skips the slow ARAG checks).

**Roles:** gm can do everything. sales_manager is limited to their own site and cannot recompute Domo signals. salesperson is limited to their own site and their own leads, deals and test drives, can read stock and promotions, and cannot publish or transfer. dxm covers DXM, promotions (including publish), campaigns, documents, read access to all leads, and the assistant. finance covers deals, finance applications, trade-ins, documents and the assistant. Denials return 403, and rows outside a role's scope return 404.

**ARAG paths** (every call is server-side with the KB service token; nothing reaches the browser):
- `/ask` uses `/ask` filtered to label `topic/manual` or `topic/policy`, always excluding `topic/document` (resources from `content/dms-kb/`).
- `/agent/query` is the live-ERP agent: a **two-step `/ask` loop in the server**. Step 1 is `answer_json_schema` → a plan of ≤ 4 calls to `erp.search(table, filters, limit)`, `erp.kpi(name, params)` and `erp.get(table, id)`, given the schema summary. The server runs those calls against `db.mjs` with the caller's scoping. Step 2 is `/ask` with the results as `extra_context` → `{answer, evidence[{table,id,why,row}], followups[]}`. Evidence is validated against the rows actually returned. If the plan step fails, a deterministic keyword planner takes over. No KB context agent calls back into the API.
- `/deals/:id/summary` and `/leads/:id/followup` are `/ask` calls with the record as `extra_context` and the policy/manual scope. The follow-up only cites promotions from the list it is given, and unknown ids are dropped.
- `/documents/:id/process` uploads the file as a KB resource labelled `topic/document`, waits for processing (hard limit 90 s; after that it returns 504 `{status:"timeout", retryAfterSeconds}`), then runs `/ask` with `filter_expression {prop:"resource", id}` + `rag_strategies:[full_resource]` and a per-kind `answer_json_schema` (`{value, confidence}` per field). Confidence is checked against the extracted text, and ERP cross-checks produce `verifyFields`.
- `/search` combines `/find` over manual, policy and document with an ERP text search. `/arag/status` returns counts by topic label and the KB MCP URL `https://<zone>.rag.progress.cloud/api/v1/kb/<kbid>/mcp`.
- `lang` (ISO code) is accepted by `/ask`, `/agent/query`, `/deals/:id/summary` and `/leads/:id/followup`.

**Write-through state:** demo edits go to `content/dms/data/_changes.jsonl` and PATs to `_tokens.json`. Set `DMS_CHANGES_DIR` to move them. If the directory is not writable, the server falls back to `<tmp>/harbourline-dms`. Uploads go to `content/dms/uploads/` (`DMS_UPLOAD_DIR`). At startup the server reconciles configurator bookings into leads and recomputes `content/domo/dealer_signals.json` from the DMS tables. With the seed as generated the recompute reproduces the file exactly, so nothing is written. Optional env: `DMS_TODAY`, `DMS_AGENT_PLAN_MODEL`, `DMS_AGENT_ANSWER_MODEL`.
