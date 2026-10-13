# Harbourline DMS — sales back office (spec v1, 14 Oct 2026)

Second application in this repo, served by the same Node server at **`/dms`** (SPA, hash router) with its API at **`/dms/api`**.
Purpose: show Revolution Software how Progress Agentic RAG (ARAG) and Domo work in the dealer back office, sales only.
Modelled on MaintenanceOS (API-first, OpenAPI docs, roles, seeded data, SPA that only talks to the API) but no Prisma/Fastify/React:
plain Express router (`server/dms/`), in-memory tables loaded from generated JSON (`content/dms/data/*.json`), vanilla-JS SPA
(`public/dms/`) using the same Progress kit tokens as the configurator (ink band, dark rail, cards). No build step.

## 1. Tenancy and roles
Dealer group **Harbourline Toyota**, sites `par` Parramatta (home), `hor` Hornsby, `pen` Penrith, `liv` Liverpool.
Demo logins (prototype auth: POST /dms/api/auth/login → bearer token kept in memory; password `demo1234`):
`gm@harbourline.demo` (General manager, all sites), `sm.par@harbourline.demo` (Sales manager, Parramatta), `sales1@harbourline.demo` (Salesperson, Parramatta),
`marketing@harbourline.demo` (Digital experience manager), `finance@harbourline.demo` (Business manager, F&I). Roles: gm, sales_manager, salesperson, dxm, finance.

## 2. Data model (ids are strings; dates ISO; money AUD integers)
- `sites` {id, name, address, phone, salesTarget: {month: units}}
- `staff` {id, name, role, siteId, email, avatarInitials}
- `customers` {id, firstName, lastName, email, phone, suburb, postcode, source (web-configurator|walk-in|phone|referral|campaign|service), createdAt, tags[], notes}
- `vehicles` (stock + history) {vin, stockNo (HL-####), siteId, model (configurator ids: rav4, kluger, …), grade, colour, interior, packs[], status (on_lot|in_transit|sold|demo|allocated|ordered), daysInStock, landedCost, listPrice, arrivedAt, soldAt?, dealId?, bonusHeadroom, movePriority?, reasonCode?}
  — MUST include the 22 configurator units (content/domo/stock_by_site.json) with the same ids, plus ~380 sold/historic units over 24 months and ~40 ordered/allocated.
- `leads` {id, customerId, siteId, ownerId (staff), source, channel (configurator|web-form|phone|walk-in|campaign), status (new|contacted|qualified|test_drive_booked|quoted|won|lost), createdAt, updatedAt, interest:{modelId, gradeId?, colourId?, stockNo?}, configuratorSessionId?, finderAnswers[], viewed[], bookingId?, lostReason?, score (0-100)}
- `test_drives` {id (TD-xxxxx), leadId, customerId, siteId, staffId, stockNo?, modelId, gradeId, when, status (booked|completed|no_show|cancelled), questions[{id,question,answer}], incentive, handover (the sheet), outcome?}
- `deals` {id (D-#####), leadId, customerId, siteId, salespersonId, stockNo|order{modelId,gradeId,colourId,etaWeeks}, stage (quote|negotiation|finance|approval|contract|delivery|delivered|lost), createdAt, closedAt?, vehiclePrice, accessories[{id,name,price}], promotions[{id,title,value}], tradeInId?, discount, driveAway, financeAppId?, grossProfit, frontGross, backGross, deliveryDate?, lostReason?, events[{at, type, note, staffId}]}
- `trade_ins` {id, dealId, customerId, make, model, year, km, condition, valuation, offered, documents[]}
- `finance_apps` {id, dealId, lender (Toyota Finance|Macquarie|ANZ|Westpac), amount, termMonths, rate, status (submitted|approved|conditional|declined|settled), submittedAt, decisionAt?}
- `promotions` (mirror of content/dealer promotions + history) {id, title, kind, value, source{domo,kb}, startsAt, endsAt, appliesTo, status}
- `campaigns` {id, name, channel (email|sms|web|social), audience, startsAt, endsAt, promotionIds[], sent, opened, clicked, leads, budget}
- `domo_signals` = content/domo/dealer_signals.json (read-through)
- `configurator_events` = content/dealer/events.jsonl (read-through) + `bookings` = content/dealer/bookings.json
- `documents` {id, kind (contract|trade_in_form|supplier_invoice|licence|insurance), dealId?, customerId?, fileName, uploadedAt, status (uploaded|processing|extracted|verified), extracted:{...fields}, aragResourceId?}
- `targets` {siteId, month, units, grossTarget}

Volumes (24 months to 14 Oct 2026, seasonality: June EOFY and December peaks, Jan dip): customers ~1,400; leads ~5,500; test drives ~1,900; deals ~2,100 (≈1,600 delivered, 350 lost, 150 open); finance apps ~1,300; trade-ins ~900; campaigns 18; documents 60 (6 with real sample PDFs). Deterministic PRNG (seeded) so re-generation is stable. Gross per unit realistic (front $1,200–$4,500; back $600–$2,800). Salespeople 14 across sites with differing conversion.

## 3. API (`/dms/api`, JSON, bearer auth except /auth/login and /health and /openapi.json)
Common list params: `?q=&siteId=&status=&from=&to=&sort=&page=&pageSize=` → `{items, total, page, pageSize}`.
- `GET /health`, `GET /openapi.json` (OpenAPI 3.0 of every route, generated from a route table), `GET /docs` (HTML page rendering the spec; inline, no CDN needed beyond the allowlist)
- `POST /auth/login {email,password}` → `{token, user:{id,name,role,siteId}}` · `GET /auth/me`
- CRUD-lite: `GET/POST /customers`, `GET /customers/:id` (with leads, deals, test drives, documents), `GET/POST/PATCH /leads`, `GET /leads/:id`, `GET /test-drives`, `GET /test-drives/:id`, `GET/PATCH /deals`, `GET /deals/:id`, `POST /deals/:id/events`, `GET /vehicles`, `GET /vehicles/:stockNo`, `GET /trade-ins`, `GET /finance-apps`, `GET /promotions`, `GET /campaigns`, `GET /staff`, `GET /sites`, `GET /documents`, `POST /documents` (multipart or base64 upload), `GET /documents/:id`
- KPIs: `GET /kpi/overview?siteId=&month=` → units delivered, gross, avg gross/unit, leads, conversion, test-drive rate, days to close, aged stock count, days of supply by model, pipeline by stage, target attainment; `GET /kpi/series?metric=&by=month|week&siteId=` → time series; `GET /kpi/leaderboard`
- Domo: `GET /domo/datasets` (catalogue: name, description, row count, refresh, CSV url, schema), `GET /domo/export/:dataset.csv` for every table plus derived ones (`sales_daily`, `stock_ageing_daily`, `funnel_weekly`, `configurator_events`, `dealer_signals`); `GET /domo/signals` (= dealer_signals + derived priorities) 
- Bridge from the configurator (DXM): on `POST /api/testdrive/book` (existing) create/attach a customer-less lead with channel=configurator carrying session id, finder answers, viewed, handover; `GET /dxm/overview` → configurator report + bookings + campaign performance + promotion exposure; `GET /dxm/handovers` list.
- ARAG (all server-side with the existing KB client; never expose tokens):
  - `POST /ask {question, scope: "manual"|"policy"|"all", context?}` → cited answer; retrieval filtered by labels `topic/manual` or `topic/policy` (KB resources from content/dms-kb/)
  - `POST /agent/query {question}` → the **live-ERP retrieval agent**: the agent is given tools (server implements them) `erp.search(table, filters)`, `erp.kpi(...)`, `erp.get(table,id)` and answers questions like "which deals are stuck in finance for more than 5 days at Penrith?" with the rows it used (`evidence[]`) and a plain answer. Implementation: ARAG /ask with answer_json_schema in a 2-step loop (plan tool calls → run → answer) or a KB context agent calling `/dms/api/agent/tool` with a service token; document which.
  - `POST /deals/:id/summary` → grounded summary + next best action + risks (ARAG, extra_context = deal, events, customer, finance, trade-in, policy docs)
  - `POST /leads/:id/followup {tone, channel}` → drafted email/SMS grounded in the lead's configurator data, promotions and policy (never invent a promotion)
  - `POST /documents/:id/process` → upload the file to the KB as a resource, wait for processing, then ARAG extraction with a per-kind JSON schema (contract: deal no, VIN, customer, prices, dates, signatures present; trade-in form: rego, VIN, km, condition, owner; supplier invoice: supplier, ABN, invoice no, lines, total, GST) → `extracted` + confidence + `verifyFields` (which to check) ; `POST /documents/:id/verify`
  - `GET /search?q=` → semantic /find across KB (manual, policies, documents) + ERP text search (customers, deals notes), merged with source labels
  - `GET /arag/status` → KB id, resource counts by topic, agent ids, MCP endpoint URL for the KB (so the UI can show "connect from Claude/Cursor")

## 4. UI (`public/dms/index.html` + `dms.css` + `dms.js`, hash routes)
Rail (dark ink) with product name "Harbourline DMS · Sales", site switcher, user menu. Band at top like the configurator (Progress wordmark, Prototype pill). Pages:
`#/login` · `#/dashboard` (KPI strip, "Domo cards": units vs target, gross by site, funnel, stock ageing, days of supply, leaderboard — charts drawn with inline SVG, each labelled "Domo card · dataset …") · `#/leads` (+ `#/leads/:id` with configurator first-party panel: finder answers, viewed cars, offers clicked, booking, handover sheet, AI follow-up drafting) · `#/test-drives` · `#/deals` (board by stage + list; `#/deals/:id` with timeline, finance, trade-in, documents, AI summary/next action) · `#/stock` (by site, ageing heat, Domo signals and move priorities, "why this is being pushed") · `#/customers` · `#/promotions` (Domo-selected targets → ARAG-composed promotions, provenance, campaign attachment) · `#/campaigns` · `#/dxm` (digital experience: configurator report, bookings, content/offers published to the configurator, handovers) · `#/documents` (upload a PDF → process with ARAG → extracted fields with confidence → verify) · `#/assistant` (two modes: "Ask the manual" and "Ask the ERP" (live agent) with example questions, citations, evidence rows) · `#/insights` (Domo dataset catalogue with CSV export links, schema, row counts, "how to connect Domo") · `#/settings` (API docs link, OpenAPI, MCP endpoint, roles, demo logins).
Every ARAG-powered control shows a small "Progress Agentic RAG" tag and every Domo-fed element a "Domo" tag; the configurator's data-layer convention applies.

## 5. Deliverables by team
- Data: `scripts/dms-seed.mjs` → `content/dms/data/*.json` + `content/dms/data/README.md` (schema, volumes, how Domo should join) + `content/dms/domo-datasets.json` descriptors.
- Content: `content/dms-kb/` manual + policies (frontmatter `title`, `model: all`, `topic: manual|policy`), `content/dms/samples/*.pdf` (6 synthetic documents), ingest via `scripts/ingest.mjs` conventions (extend labelset topic with manual, policy, document).
- API: `server/dms/*.mjs` mounted in server/index.mjs at `/dms/api`, static `/dms` → `public/dms`.
- UI: `public/dms/`.
- Tests: `tests/dms-smoke.mjs`.

## 6. Architecture parity with the reference ERP (added 14 Oct 2026)
The DMS follows MaintenanceOS exactly: **API-first** (every screen and every agent goes through `/dms/api`; OpenAPI at `/dms/api/openapi.json` and `/dms/api/docs`), **complete MCP tooling** and a **web front-end**.
- One MCP server (`server/dms/mcp-core.mjs`) exposed two ways: Streamable HTTP at `POST /dms/mcp` (stateless, fresh server per request) and stdio via `scripts/dms-mcp-stdio.mjs` for Claude Desktop / Claude Code.
- The tool catalogue is generated from the DMS's own OpenAPI document, never hand-curated: one tool per operation, excluding DELETE, binary/upload endpoints, login and CSV export; names `<tag>_<verb>_<resource>`; inputSchema `{path, query, body}`; calls dispatched in-process so auth, RBAC and validation apply exactly as for REST.
- Resources (`harbourline-dms://openapi`, `://dashboard`, `://deal/{id}`, `://lead/{id}`, `://customer/{id}`, `://stock/{stockNo}`, `://domo/signals`) and prompts (`triage-lead`, `prep-test-drive`, `daily-sales-briefing`, `stuck-deals-review`, `compose-promotions-review`).
- Auth: the same bearer token as REST; personal access tokens at `/dms/api/access-tokens` for long-lived integrations. `GET /dms/api/mcp/info` feeds the settings page. The knowledge box's own MCP endpoint is shown alongside.
- Docs: `docs/DMS-MCP.md` mirrors the reference `docs/MCP.md`.
