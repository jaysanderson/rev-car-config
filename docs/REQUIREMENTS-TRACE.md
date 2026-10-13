# Requirements trace

Snapshot: 13 Oct 2026, read from `src/configurator.html`, `content/`, `scripts/`. **Late update:** `server/` landed while this trace was being written. It implements all eight `/api/*` endpoints (ARAG `/ask` with JSON schema and `extra_context`, `/find` rows, and a Domo stand-in/live adapter in `data.mjs`). It has not been verified end to end, and the `Dockerfile` still deploys static nginx, so the public URL runs the fallback path. Rows that depend on the server below are marked **partial (server built, not deployed/verified)** until a smoke test passes. Status key: **done** means it meets the PRD acceptance criteria today; **partial** means some of it is built, or it only works through the fallback; **missing** means it is not built.

| # | Requirement (customer words, abridged) | Where it is implemented | Status | Evidence / gap (backlog id) |
|---|---|---|---|---|
| R1a | World-class configurator | `src/configurator.html`: `renderModels/Grades/Colours/Interiors/Packs`, `renderHero`, three-pane `.ws` grid | done | Three panes at >= 1180 px, live price, SVG car tinted by paint. Polish items are in BL-P1-12 and BL-P2-* |
| R1b | Progress Agentic RAG: conversational, LLM-driven, consultative | `askApi()` → `POST /api/ask` (build, finder answers, history, lang); scripted `T[lang].q` fallback; `scripts/provision.mjs` agent prompt | partial | Client is ready and `server/assistant.mjs` implements `/api/ask`, but it is not deployed (BL-P0-01). Without it, only 4 scripted chips work and free text gets a "not connected" reply |
| R1c | Multilingual | `T.en/zh/vi`, `#langs` toggle, `lang` sent to `/api/ask`; agent rule "answer in the customer's language" | partial | Assistant panel only. Finder, rows, offers and build rail stay English. `/api/finder/next` gets no `lang`. "Detected: English" is a toggle, not detection (BL-P1-05) |
| R1d | Domo ETL: in stock / needs to move | `content/domo/*.json` inlined by `scripts/build.mjs` → `normaliseStock()`; `stockFor`, `matches`, `localOffers` | partial | Stand-in data works in the browser. `transfer_feasibility` is ignored: the page hard-codes `SITES` (BL-P1-03). `order_bank_eta` is missing 4 models (BL-P1-04) |
| R1e | Local stock woven in, not a button | `stockLine()` on every option, `renderWays()` availability panel, hero `facts` | done | Every model, grade, colour and interior shows on lot / nearby / arriving / factory order. There is no "check stock" button |
| R2 | Half-page "How it works" drawer, per-feature, diagrams, kept updated | `HOW` object, `renderDrawer()`, `diagram()`; `.drawer{width:50vw}` | partial | 15 sections with diagrams, contracts and changelog. But the button is `hide-sm`, so there is no way in at ≤ 900 px (BL-P1-07). Some claims are ahead of reality: "API server … provisioned", "shows the dataset's refreshed_at" (BL-P0-04). Data contracts use different field names from the stand-in files (BL-P1-08) |
| R3a | Progress Agentic RAG theme (band, kit tokens) | `:root` tokens, `.band`, Progress wordmark SVG, Inter/Roboto Mono, dark mode | done | Matches the reference kit tokens. Visual QA against arag-doc-processing.fly.dev is still pending (BL-P2-01) |
| R3b | Header says prototype | `.band .proto` "Prototype · demo data · not a production system" | done | The suffix is hidden < 900 px, but "Prototype" always shows |
| R4a | Five dynamic questions, JSON from Progress Agentic RAG | `finderNext()` → `POST /api/finder/next`; `localNext()` fallback; `FQ` bank | partial | `server/assistant.mjs` uses `/ask` + JSON schema, but it is not deployed, so the public page runs the local engine. In the local engine only Q2 branches on Q1; Q3 to Q5 are always power → budget → when, with option notes varying (BL-P0-02) |
| R4b | Most relevant cars and why | `localRecs()`, `renderFinderResults()` | partial | Top 3 with why/watch/availability. The scoring uses tags `offroad`, `distance` and `seven`, which do not exist in `catalog.json` (`off-road`, `seven-seats`), so the off-road and site-work answers score nothing (BL-P0-03) |
| R4c | Then move into configuring | `[data-rec]` handler: sets model and grade, adds the Towing Pack, posts finder context to the assistant | done | Works locally |
| R5 | Internal ads/offers from Domo, honest discounts, not central | `renderOffers()` → `/api/offers` or `localOffers()`; `#ribbon`; `wayRow` nudge | partial | The strip, ribbon and nudge work from `aged_stock_actions` headroom, ranked by body type, then priority. Gaps: no `valid_until` and no "illustrative" disclaimer on tiles; "ranked 6 min ago" is hard-coded; the reason text is made up for under-60-day units (BL-P1-09) |
| R6 | 100% Toyota, current lineup | `content/catalog.json` (15 models), `content/kb/*.md` (31 files) | partial | The coverage is there, but there are inconsistencies between catalogue, KB, page fallback and scripted answers (BL-P0-05, BL-P0-06, content QA in the backlog) |
| R7a | Knowledge box powering all RAG parts | `scripts/create-kb.mjs`, `scripts/ingest.mjs` (labels `model/*`, `topic/*`), `scripts/provision.mjs` (labelsets, search configs) | partial | Scripts exist. Whether the KB is ingested is not verified from the repo; the page never reaches it (BL-P0-01) |
| R7b | Domo via a retrieval agent (stand-in) | `provision.mjs` agent `harbourline-stock-agent`: nucliadb driver + HTTP context `GET {PUBLIC_URL}/api/stock?q=` | partial | The agent calls `/api/stock`, which `server/` implements but which is not yet deployed (BL-P0-01). `server/data.mjs` provides the stand-in/live Domo adapter |
| R8 | Spotify-style "Because you…" rows, using car chosen and why, extra context to /ask | `renderForYou()` → `/api/foryou` or `tagRows()`; `askApi` sends build and finder answers | partial | The "Because you're looking at…", colour, family, towing, EV and safety rows work locally. The "Because you go off-road" row never renders (tag mismatch) and fires on the wrong answers (BL-P0-03). The colour row says "Atomic Rush" rather than "red" (BL-P2-04). Row reasons are not passed to `/ask` (BL-P1-10) |
| R9 | Semantic matching via /find (programmatic or user query) | Annotation `ARAG · /find · "<query>"` on rows; HOW contract `/api/find` | partial (server built, not deployed/verified) | `server/foryou.mjs` composes one query per row and calls ARAG `/find` with a `model` label filter; `/api/find` exists. The page still has no user-query entry to `/api/find` (BL-P1-11). In fallback the rows still carry an "ARAG · /find" label, which is misleading (BL-P0-04) |
| R10 | Run like a software company: PM + Head of Product Engineering | `docs/PRD.md`, `docs/BACKLOG.md`, `docs/REQUIREMENTS-TRACE.md`, `docs/DEMO-SCRIPT.md` | partial | Docs now exist. The repo still lacks a release process tying the drawer version and changelog to each change, and lacks sign-off (BL-P2-08) |

## Non-functional requirements

| NFR | Where | Status | Evidence |
|---|---|---|---|
| Prototype label | `.band .proto`, README, drawer Assumptions | done | README still says "Harbourline Ridge", "Kestrel and Ridge" (BL-P2-05) |
| No secrets in browser | `build.mjs` inlines only catalog + Domo JSON; `.env` git-ignored; scripts are server-side | done (static) | `public/index.html` and `dist/artifact.html` contain no JWTs or `NUCLIA_`/`ARAG_` keys. Must be re-checked once `server/` exists, and the Dockerfile must not `COPY .env` |
| Fallback when KB unreachable | `probe()` sets `API` only when `/api/health` is OK; local engines for finder, rows and offers | partial | Once `API=true`, a failing `/api/ask` shows an error but never falls back to scripted chips; fetches have no timeout (BL-P1-06) |
| Multilingual | see R1c | partial | |
| Honest discounts | `localOffers`, `wayRow`, KB `dealer-policy.md` | partial | Saving = headroom; reason stated. Missing validity, disclaimer and computed freshness (BL-P1-09, BL-P0-04) |
| Real citations | trace labels in `T` and `localNext/localRecs` | partial | Labels like "KB · finder-guide" and "KB · NSW term dates 2026" now map to real files, but the scripted holiday answer contradicts the term-dates file (BL-P0-05) |


## Harbourline DMS (sales back office)

Source: `docs/DMS-SPEC.md` (spec v1, 14 Oct 2026), PRD `docs/DMS-PRD.md`, demo `docs/DMS-DEMO-SCRIPT.md`. File and endpoint names are the planned locations; engineering updates paths and status as work lands. Status key as above; all rows start as **planned**.

| # | Spec item | Where it should be implemented | Status | Evidence / gap |
|---|---|---|---|---|
| DMS-1 | Tenancy: Harbourline Toyota, sites par/hor/pen/liv | content/dms/data/sites.json; scripts/dms-seed.mjs; site switcher in public/dms/dms.js | planned | |
| DMS-2 | Demo logins and roles gm/sales_manager/salesperson/dxm/finance, prototype auth, bearer token in memory | server/dms/auth.mjs; POST /dms/api/auth/login, GET /auth/me; #/login; #/settings (logins) | planned | |
| DMS-3 | Data model: sites, staff, customers, vehicles, leads, test_drives, deals, trade_ins, finance_apps, promotions, campaigns, domo_signals, configurator_events, bookings, documents, targets | scripts/dms-seed.mjs; content/dms/data/*.json; content/dms/data/README.md | planned | |
| DMS-4 | Vehicles include the 22 configurator units with the same ids plus ~380 historic and ~40 ordered units | scripts/dms-seed.mjs reading content/domo/stock_by_site.json; content/dms/data/vehicles.json | planned | |
| DMS-5 | Volumes (customers ~1,400, leads ~5,500, test drives ~1,900, deals ~2,100, finance ~1,300, trade-ins ~900, campaigns 18, documents 60), seasonality, seeded PRNG, 14 salespeople | scripts/dms-seed.mjs; tests/dms-smoke.mjs (counts, determinism) | planned | |
| DMS-6 | Common list params and paginated response shape | server/dms/router.mjs (list helper) | planned | |
| DMS-7 | GET /health, /openapi.json, /docs generated from a route table | server/dms/openapi.mjs; GET /dms/api/health, /openapi.json, /docs | planned | |
| DMS-8 | CRUD-lite routes for customers, leads, test-drives, deals, vehicles, trade-ins, finance-apps, promotions, campaigns, staff, sites, documents; POST /deals/:id/events | server/dms/routes-*.mjs; /dms/api/* | planned | |
| DMS-9 | KPIs: /kpi/overview, /kpi/series, /kpi/leaderboard | server/dms/kpi.mjs; #/dashboard | planned | |
| DMS-10 | Domo: /domo/datasets, /domo/export/:dataset.csv for every table plus derived sales_daily, stock_ageing_daily, funnel_weekly, configurator_events, dealer_signals; /domo/signals | server/dms/domo.mjs; content/dms/domo-datasets.json; #/insights | planned | |
| DMS-11 | Configurator bridge: POST /api/testdrive/book creates a lead with session, finder answers, viewed, handover; GET /dxm/overview; GET /dxm/handovers | server/testdrive.mjs (hook); server/dms/dxm.mjs; #/dxm; #/leads/:id | planned | |
| DMS-12 | ARAG POST /ask with scope manual/policy/all, label filters topic/manual, topic/policy | server/dms/ask.mjs; server/arag.mjs; content/dms-kb/; #/assistant (Ask the manual) | planned | |
| DMS-13 | ARAG POST /agent/query live-ERP retrieval agent with erp.search, erp.kpi, erp.get tools and evidence[]; document chosen implementation | server/dms/agent.mjs; #/assistant (Ask the ERP) | planned | |
| DMS-14 | POST /deals/:id/summary: summary, next best action, risks | server/dms/summary.mjs; #/deals/:id | planned | |
| DMS-15 | POST /leads/:id/followup {tone, channel}: grounded, no invented promotions | server/dms/followup.mjs; #/leads/:id | planned | |
| DMS-16 | POST /documents/:id/process and /verify; per-kind extraction schemas; confidence; verifyFields | server/dms/documents.mjs; content/dms/samples/*.pdf; #/documents | planned | |
| DMS-17 | GET /search: semantic find plus ERP text search, merged with source labels | server/dms/search.mjs; global search in public/dms/dms.js | planned | |
| DMS-18 | GET /arag/status: KB id, counts by topic, agent ids, MCP URL, no tokens | server/dms/arag-status.mjs; #/settings | planned | |
| DMS-19 | UI shell: ink rail, band, site switcher, user menu, hash router, no build step | public/dms/index.html; dms.css; dms.js | planned | |
| DMS-20 | Pages: login, dashboard, leads, test-drives, deals, stock, customers, promotions, campaigns, dxm, documents, assistant, insights, settings | public/dms/dms.js (one module per route) | planned | |
| DMS-21 | Dashboard Domo cards in inline SVG, each labelled with dataset | public/dms/dms.js #/dashboard | planned | |
| DMS-22 | Stock page with Domo signals, move priority and why | public/dms/dms.js #/stock; GET /vehicles; GET /domo/signals | planned | |
| DMS-23 | Promotions: Domo targets to ARAG-composed promotions, provenance, campaign attachment | server/dms/promotions.mjs (no endpoint in spec, see DMS-PRD gaps); server/promotions.mjs; #/promotions | planned | |
| DMS-24 | ARAG tag and Domo tag on every powered element; data-layer convention | public/dms/dms.css (.tag-arag, .tag-domo); dms.js | planned | |
| DMS-25 | Deliverable Data: seed script, data README, domo-datasets.json | scripts/dms-seed.mjs; content/dms/data/README.md; content/dms/domo-datasets.json | planned | |
| DMS-26 | Deliverable Content: KB manual and policies with frontmatter, 6 sample PDFs, ingest conventions, labelset topics manual/policy/document | content/dms-kb/*.md; content/dms/samples/*.pdf; scripts/ingest.mjs; scripts/provision.mjs | planned | |
| DMS-27 | Deliverable API: server/dms mounted at /dms/api, static /dms to public/dms | server/dms/*.mjs; server/index.mjs | planned | |
| DMS-28 | Deliverable Tests: dms smoke test | tests/dms-smoke.mjs | planned | |
| DMS-N1 | NFR: no secrets in browser (D-NFR4) | grep public/dms; server/dms/* | planned | |
| DMS-N2 | NFR: no PII in events (D-NFR2) | content/dealer/events.jsonl; configurator_events export | planned | |
| DMS-N3 | NFR: prototype and honesty labels (D-NFR1, D-NFR5) | public/dms/index.html band; #/insights; #/settings | planned | |
| DMS-N4 | NFR: graceful fallback when KB unreachable, 15 s timeouts (D-NFR8) | server/dms/*.mjs; public/dms/dms.js | planned | |
| DMS-N5 | Demo script 12 minutes, PRD | docs/DMS-DEMO-SCRIPT.md; docs/DMS-PRD.md | planned | |
