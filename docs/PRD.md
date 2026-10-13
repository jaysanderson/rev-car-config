# Harbourline Toyota Configurator: Product Requirements

| | |
|---|---|
| Product | Harbourline Toyota Configurator (prototype) |
| Customer | Revolution Software (Toyota-owned dealer management system vendor). The prototype is shown to Revolution; "Harbourline Toyota" is a fictional dealership used as the demo tenant. |
| Owner | Product Manager |
| Engineering lead | Head of Product Engineering |
| Status | Draft v1, 13 Oct 2026 |
| Source of truth for requirements | The customer's ten requirements (R1 to R10), restated in section 4 |
| Related docs | `docs/DEMO-SCRIPT.md`, `docs/BACKLOG.md`, `docs/REQUIREMENTS-TRACE.md` |

## 1. Vision

A dealer-management-system (DMS) vendor wants to show its dealers what a car configurator looks like when the dealer's own data is part of the experience, not a "check local stock" button at the end.

The prototype puts two products to work on one page:

- **Progress Agentic RAG** is the brain: a knowledge box of current Toyota Australia product knowledge, a consultative assistant that answers in the buyer's language with citations, a finder that asks five dynamic questions and returns structured JSON, and semantic `/find` matching that builds "Because you…" rows.
- **Domo** is the stock intelligence: what is on the lot, at sister sites, in transit, how long until a factory order lands, and which cars the dealer needs to move and can afford to discount. For the prototype Domo is simulated with stand-in datasets that have the same shape as the real thing, delivered through a Progress Agentic RAG retrieval agent and the API server, so a real Domo instance can replace them later without changing the page.

One sentence: **the buyer configures the car they want and sees, at every click, how and when they can actually have it, with an assistant that knows both the product and the yard.**

## 2. Goals and non-goals

### Goals
1. Win the "this is what our DMS makes possible" conversation with dealer principals and the vendor's own leadership.
2. Prove that Progress Agentic RAG can drive structured, deterministic-looking UI (finder JSON, actions, rows), not only chat.
3. Prove the integration pattern: knowledge box + retrieval agent + HTTP context to a Domo-shaped stock service, with no secrets in the browser.
4. Be honest: labelled prototype, discounts with stated reasons, citations to real knowledge-box resources, no Toyota artwork or marketing copy.

### Non-goals (see also section 8)
Transacting, real DMS write-back, real Domo connection, a production CMS, OEM-approved pricing.

## 3. Personas

### P1. Buyer: "Mia, 38, Parramatta, two kids and a camper trailer"
- Wants: the right car for how she lives, the real drive-away price, and to know whether she can have it before the summer holidays.
- Frustrations today: OEM configurators let her build cars that do not exist within 300 km; dealer sites hide stock behind enquiry forms; "special offers" feel like bait.
- Success: she finishes the finder, configures a recommended car, sees one on a nearby lot with a transfer day, and asks a towing question in Mandarin for her father, getting a cited answer.

### P2. Dealer sales manager: "Raj, Harbourline Toyota group"
- Wants: aged stock to move without blanket discounting; leads tied to a real VIN and build; fewer "do you have one in white" phone calls.
- Success: the offers strip and ready-now nudges only show cars Domo has flagged with headroom, ranked by move priority, with the reason stated; he can trace every offer to a dataset row.

### P3. DMS vendor stakeholder: "Elena, Head of Product at the DMS vendor"
- Wants: a credible, good-looking demo that shows the DMS as the data spine, and an architecture her engineers believe.
- Success: the "How it works" drawer explains each feature with a diagram and data contract; the "Data layer" toggle shows which dataset or knowledge-box source drives every element; nothing in the browser holds a credential.

## 4. Features mapped 1:1 to requirements

Acceptance criteria (AC) are written so QA can pass or fail them by using the page served by the API server (the "connected" build), unless marked "fallback".

### F1. World-class configurator with Domo-woven stock (R1)
*Customer words: "A world-class car configuration experience… Progress Agentic RAG for a conversational, LLM-driven, multilingual, consultative experience. Domo for ETL: what cars are in stock, what cars need to be moved… Local stock woven into the experience, not a 'check local stock' button."*

- AC1.1 The page has three panes at desktop width (>= 1180 px): build rail (model, grade, colour, interior, accessories), stage (car, price, availability, offers, For you), assistant.
- AC1.2 Every model, grade, colour and interior option shows a stock indicator from Domo `stock_by_site` (on the lot / nearby / arriving / factory order). There is no separate "check stock" button anywhere.
- AC1.3 "How you can have this car" recomputes on every build change and lists, in order: exact matches on the home lot, exact matches at sister sites with the transfer day from `transfer_feasibility`, in-transit units with ETA from `inbound_pipeline`, at most one close match with a ready-now bonus, and always a factory-order row with the window from `order_bank_eta`.
- AC1.4 Price shown is NSW drive-away for a private buyer, recalculated on every change, and matches `catalog.json` for the selected grade + paid paint + interior + accessories.
- AC1.5 The assistant is consultative: on first load it asks about use and timing; answers end with a suggested next step.
- AC1.6 Every Domo timestamp shown ("stock refreshed N min ago") is computed from the dataset `refreshed_at`, not hard-coded.

### F2. "How it works" half-page drawer (R2)
- AC2.1 A "How it works" control in the header opens a drawer that covers 50% of the viewport width at >= 960 px (100% below), without hiding the header's prototype label.
- AC2.2 The drawer has an overview diagram and one section per shipped feature with: what the customer sees, what powers it (DMS / Domo / Progress Agentic RAG / page), numbered how-it-works steps, the data contract, a diagram, and a "Show me on the page" button that scrolls to and highlights the element.
- AC2.3 The drawer includes Assumptions and a Changelog with version and date. Release rule: no feature is "done" until its drawer section and a changelog line ship in the same change (Definition of Done item).
- AC2.4 Drawer claims match reality: anything not yet live (for example a real Domo connection) is labelled as simulated or planned.
- AC2.5 The drawer is reachable at every viewport width, including mobile.

### F3. Progress Agentic RAG visual theme and prototype label (R3)
- AC3.1 Uses the Progress Agentic RAG kit: ink band (`--ink-950`) with green (`--green`) underline, Progress Agentic RAG wordmark, Inter + Roboto Mono, the kit tokens (`--brand-*`, `--accent-*`, `--surface`, `--raised`), light and dark themes. Reference: https://arag-doc-processing.fly.dev
- AC3.2 The header band shows "Prototype" on every viewport, plus "demo data · not a production system" at >= 900 px.
- AC3.3 No layout breakage at 375, 768, 1180, 1440 px; no horizontal page scroll; keyboard focus visible on all controls.
- AC3.4 Car imagery is the generic SVG silhouette tinted with the paint colour. No Toyota photography, logos or artwork.

### F4. "Choose the right car for me" finder (R4)
- AC4.1 "Find the right car" opens a finder in the stage that asks exactly five questions, one at a time, with a progress indicator and the ability to go back or change any earlier answer.
- AC4.2 Each question is produced by Progress Agentic RAG `/ask` with a JSON schema (`answer_json_schema`), returned as JSON `{step, of, question:{id,text,why,options[{id,label,sub,note?}]}, trace[]}`. No free text is parsed.
- AC4.3 Each question depends on all previous answers: the question id, wording, options or option notes must change when an earlier answer changes. At minimum questions 2 to 5 must each be demonstrably conditioned on earlier answers (for example, towing weight drives the powertrain options; budget filters grades).
- AC4.4 After five answers the agent returns `{done:true, summary, recommendations:[{modelId, gradeId, fit, why[], watch[], availability}]}` with three ranked models, each with at least two "why" reasons grounded in knowledge-box content, any caveats in "watch", and availability from Domo.
- AC4.5 "Configure this car" loads the recommended model and grade into the configurator (and adds the Towing Pack when towing was an answer), and hands the finder answers to the assistant as context.
- AC4.6 Ids returned by the agent are validated against the catalogue; invalid or missing responses fall back to the local rule engine with the same contract (fallback), and the data layer shows which path answered.
- AC4.7 With the data layer on, the raw JSON for each step is visible.

### F5. Domo-driven internal offers (R5)
- AC5.1 A "This week at Harbourline" strip (max three tiles) and a slim ribbon in the build rail show only units present in `aged_stock_actions` with `incentive_headroom > 0`.
- AC5.2 Ranking: same body type as the current build first, then `move_priority` ascending. The unit being configured (exact match already shown in availability) is never repeated.
- AC5.3 Each offer states the reason in plain words (for example "on the lot over 90 days"), the site, the before and after price, and the saving; the saving equals `incentive_headroom` and is never larger.
- AC5.4 Offers are visually secondary: below availability, smaller than the hero, never a modal or interstitial.
- AC5.5 Tapping an offer switches the build to that exact unit.

### F6. 100% Toyota content (R6)
- AC6.1 The catalogue and knowledge box cover the current Toyota Australia lineup as of the content date (15 models in `catalog.json`), each with a spec resource and, where a model has three or more grades, a grade-comparison resource.
- AC6.2 Prices, towing, seats, powertrains and grade names agree between `catalog.json`, `content/kb/*.md`, the page's fallback data, and scripted answers (zero known inconsistencies at demo time).
- AC6.3 No content is copied from Toyota marketing material; all copy is original and factual. No Toyota images or logos. Toyota product names and feature names (for example "Toyota Safety Sense") are used only as factual identifiers.
- AC6.4 Every resource carries `model` and `topic` labels.

### F7. Real Progress Agentic RAG wiring, Domo via a retrieval agent (R7)
- AC7.1 One knowledge box (`harbourline-toyota-configurator`) is provisioned and ingested from `content/kb/*.md` + `catalog.json`; `/counters` shows all resources processed.
- AC7.2 An API server exposes `/api/health`, `/api/catalog`, `/api/stock`, `/api/offers`, `/api/ask`, `/api/finder/next`, `/api/foryou`, `/api/find`; it holds all tokens server-side.
- AC7.3 A retrieval agent (`harbourline-stock-agent`) has the KB as a `nucliadb` driver and an HTTP context module that calls `GET /api/stock?q=` (the Domo stand-in). Assistant answers about stock quote unit ids that exist in the stand-in data.
- AC7.4 Domo stand-in datasets (`stock_by_site`, `aged_stock_actions`, `inbound_pipeline`, `transfer_feasibility`, `order_bank_eta`) have the documented contract and cover every model in the catalogue; a single adapter is the only code that would change when real Domo credentials are configured (`/api/health` reports `domo: "standin" | "live"`).
- AC7.5 The page shows "Connected to the knowledge box · Domo stand-in" when the API is reachable.

### F8. Spotify-style "For you" rows (R8)
- AC8.1 Up to four horizontal rows titled "Because you…", derived from (a) the chosen model, (b) chosen colour family ("Because you like red" for Atomic Rush), (c) finder answers (towing, off-road, safety, family, electric), each with a one-line reason.
- AC8.2 Each row's items come from `/find` (F9) and, where a stocked unit matches, link to that unit; otherwise to the model.
- AC8.3 Row titles and reasons, plus the build and finder answers, are passed as extra context to `/ask` so the assistant can say "since you value safety…".
- AC8.4 Rows update when the build or finder answers change. Tapping a card changes the build.
- AC8.5 The "off-road", "safety" and "red" rows are each demonstrable from a clean start.

### F9. Semantic matching with `/find` (R9)
- AC9.1 The server composes one semantic query per row (programmatic) and also accepts a free-text query from the user (`/api/find?q=`).
- AC9.2 Hits map back to catalogue models via the `model/*` label; results carry a citation (resource title and id) shown on the card.
- AC9.3 The data layer shows the exact query sent to `/find` and, only when it actually came from `/find`, labels it so. Fallback rows are labelled "local tag match".

### F10. Run like a software company (R10)
- AC10.1 `docs/` holds PRD, backlog (P0/P1/P2), requirements trace and demo script, kept current with each release.
- AC10.2 Each release bumps the drawer version and changelog.
- AC10.3 The PM and Head of Product Engineering sign off the requirements trace before a customer demo.

## 5. Non-functional requirements

| ID | Requirement | Acceptance |
|---|---|---|
| NFR1 Prototype label | The app always states it is a prototype with demo data. | "Prototype" visible in the band at all widths; README and drawer Assumptions say Harbourline is fictional and prices/stock are illustrative. |
| NFR2 No secrets in the browser | No KB token, NUA key, agent key or Domo credential is ever sent to or embedded in the page. | `grep` of `public/index.html` and `dist/artifact.html` finds no tokens; all ARAG and Domo calls go via the API server; `.env` is git-ignored and not copied into the container image. |
| NFR3 Graceful fallback | If the knowledge box or API is unreachable, the page still works. | Finder uses the local rule engine; For you uses local rows (labelled as such); offers and availability use inlined stand-in data; assistant shows a clear "not connected" message and, for the suggested questions, scripted answers. No spinners that never end; every API call times out within 15 s. |
| NFR4 Multilingual | Buyer can use English, Simplified Chinese and Vietnamese at minimum. | Assistant greeting, chips, placeholders and answers follow the language; `/ask` receives `lang`; finder questions are requested in the selected language; numbers and stock facts are identical across languages. Stretch: page chrome translated. |
| NFR5 Honest discounts | Every discount is real, funded and explained. | Saving equals Domo `incentive_headroom`; "was" price is the computed drive-away for that unit's spec; reason shown; validity (`valid_until`) shown or implied ("this week"); no countdown timers or false scarcity; a note says prices are illustrative. |
| NFR6 Citations are real | Every source chip names a resource that exists in the knowledge box. | Trace labels map to `content/kb` slugs; no citation to a document that is not ingested. |
| NFR7 Performance | Feels instant. | Option clicks rerender < 100 ms locally; first `/ask` token or answer < 6 s p50; finder step < 4 s p50. |
| NFR8 Accessibility | Usable by keyboard and screen reader. | All interactive elements are buttons or links; focus visible; `prefers-reduced-motion` honoured; colour contrast AA. |
| NFR9 Content integrity | No Toyota artwork or marketing copy. | Content QA pass recorded in `docs/BACKLOG.md`. |

## 6. Success metrics (for the demo programme)

- Demo completes the 10-minute script with zero on-screen inconsistencies (price, date, stock) in three consecutive dry runs.
- Stakeholder survey after demo: "I believe this could run on our DMS data" >= 4/5.
- At least one dealer group agrees to a pilot with real Domo datasets.

## 7. Dependencies

- Progress Agentic RAG account, KB, retrieval agent, service tokens (server-side).
- Fly.io (or equivalent) app running the API server and static page together; the current static nginx container cannot serve `/api/*`.
- Domo: stand-in JSON now; Domo API client id/secret and dataset ids later.

## 8. Out of scope

- Real transactions: reservations, deposits, finance applications, test-drive bookings (toasts only).
- DMS write-back (described in the drawer as the target design only).
- Real Domo connection and real dealer stock.
- Trade-in valuation, finance calculators with real rates, insurance.
- OEM approval of pricing; prices are illustrative estimates.
- Authentication, user accounts, saved builds across devices.
- Non-Toyota brands; used cars; fleet ordering.
- Full page-chrome translation beyond the assistant panel (stretch only).

## 9. Open questions for the customer

1. **Languages.** Are English, Simplified Chinese and Vietnamese the right three for the target dealers? Should the whole page translate, or only the assistant?
2. **Finder depth.** Must all five questions be generated by the agent live, or is a curated question bank, with the agent choosing the next question and writing notes, acceptable? (Latency and repeatability trade-off.)
3. **"Because you like red".** Do you want colour-family wording ("red") or Toyota paint names ("Atomic Rush")?
4. **Offer rules.** Who approves a ready-now bonus in the real world: should offers require a manager-approval flag from Domo before they show?
5. **Domo.** Which Domo instance and datasets will the pilot use, and is the retrieval agent's HTTP context the integration you want long term, or a direct Domo connector?
6. **Home site.** Is Parramatta plus three sister sites the right demo group, and is NSW drive-away the right pricing basis?
7. **Branding.** Is Progress Agentic RAG theming with a fictional dealer name acceptable to Toyota Australia contacts who may see the demo, or should the demo avoid the Toyota name in the header?
8. **Hosting.** Is a public Fly URL acceptable, or must the demo run behind access control?
9. **Content currency.** Toyota Australia's lineup changes during 2026 (new RAV4, new HiLux, bZ4X update). What "as of" date should the content target, and who signs off facts?
