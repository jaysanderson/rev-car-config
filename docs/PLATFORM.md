# Harbourline platform thesis: one dealer knowledge layer, many surfaces

Owner: PM. Written 17 Oct 2026 for Revolution Software. Status markers in this document mean: **built** = running at https://harbourline-configurator.fly.dev and covered by a smoke test; **building** = in progress today under `docs/USED-SPEC.md`; **specced** = written up with acceptance criteria in `docs/` or the shared parity spec; **claim** = we believe the knowledge layer supports it, nothing is written or built. Harbourline Toyota is fictional and every price, stock figure and document in the prototype is synthetic.

## 1. The thesis

A dealership's digital experience is not a configurator with a chat window. It is one body of knowledge (the OEM's product facts, the dealer's own policies, every car on the lot with its documents, every customer's history with the dealer, the live stock and money signals from the DMS) viewed through many screens by many people: the buyer at home, the salesperson on the floor, the service advisor, the business manager, the used-car buyer, marketing and the general manager. Today each screen has its own copy of a slice of that knowledge, typed in by hand and out of date by lunchtime. The Progress Agentic RAG knowledge box lets us hold it once, as labelled resources with metadata, text, files and links, and let every surface retrieve, ask, generate and personalise from the same source. The configurator at `/` proved this on new cars. The back office at `/dms` proved the same knowledge box serves staff through an API and an MCP server. The used-car surface at `/used` is the first one where the knowledge layer is the product rather than a helper: the listing is the resource, the agent writes the words, and retrieval remembers the visitor.

## 2. Surface map

Rows are lifecycle stages, columns are the people who need a screen. Each cell says what exists and where.

| Stage | Customer web | Salesperson | Service advisor | F&I (business manager) | Used-car buyer / appraiser | Marketing | GM |
|---|---|---|---|---|---|---|---|
| Discover | **built** model range, "For you" rows from `/find`, offers (`src/configurator.html`, `server/foryou.mjs`) | **built** leads with configurator journey (`/dms` leads) | claim | claim | claim | **built** campaigns, promotions provenance (`/dms` marketing) | **built** DXM overview |
| Choose | **built** 5-question finder, branches each step (`server/assistant.mjs`) | **built** handover sheet with finder answers (`server/testdrive.mjs`) | claim | claim | claim | specced: budget-first discovery (parity spec B-series) | claim |
| Configure (new) | **built** grades, colours, packs, drive-away price, availability | **built** stock with transfer and hold (`/dms` stock) | n/a | claim: approved-offer field (BACKLOG CQ-14) | n/a | **built** Domo-targeted, agent-composed promotions (`server/promotions.mjs`) | **built** dealer signals, read-only priorities |
| Browse (used) | **building** listing, VDP, agent comments, scoped assistant, session memory, finder, for-you rows (`docs/USED-SPEC.md`) | **building** enquiries land as leads | claim | claim | **building** unit record with inspection, PPSR, service history as a KB resource | claim: syndication copy | claim |
| Value my car | claim: instant estimate with justification (parity spec P-series, `track-emerging.md` item 1) | **built** trade-in records in deals (`/dms` deals) | claim | claim | **built** trade-in appraisal PDFs extracted by the agent (`/dms` documents) | claim | claim |
| Finance and insure | specced: payment calculator and soft pre-qualification explainer (parity spec, Phase 1 "Money") | claim | n/a | **built** finance apps table, stuck-in-finance view (`/dms`) | n/a | claim | **built** KPIs |
| Buy and reserve | **built** test-drive booking with salesperson questions; **building** reserve as a 48 h hold, no payment (`/used`) | **built** quotes, bonus within headroom, approvals (`server/dms/ops.mjs`) | n/a | **built** deal summary by the agent (`/dms/api/deals/:id/summary`) | n/a | claim | **built** pipeline |
| Deliver | specced: delivery-readiness checklist (`track-emerging.md` item 8) | **built** contract of sale extracted and cross-checked (`/dms` documents) | claim | claim | n/a | claim | claim |
| Own: service | claim: service booking with recall awareness and manual in the KB | claim | claim: live job status, "why does this cost $X" from the repair order | n/a | n/a | claim: service-to-sales trade cycle | claim |
| Own: recalls and warranty | claim: cited answers from the warranty resource (resource exists: `content/kb/warranty.md`) | claim | claim | n/a | n/a | claim | claim |
| Own: parts and accessories | **built** accessory packs in the build and in promotions; claim: fitment advisor | claim | claim | n/a | n/a | claim | claim |
| Re-sell and trade cycle | claim: equity clock against Toyota Access GFV (`track-emerging.md` item 3) | claim: renewal prompts from DMS deal history | claim | claim | claim | claim | claim |

Reading the map: the first three rows and the back office are built. The used row is being built today. Everything from "Value my car" down is the work that would make this a platform rather than two demos.

## 3. What agentic RAG makes possible that a CMS plus a DMS cannot

Every example below is something the prototype does now, with the file to look at.

- **A car is a resource, not a row.** The DMS holds a used car as thirty columns. The knowledge box holds it as a resource with labels (`model/rav4`, `topic/used`), metadata, a listing text, a provenance text (service history, inspection, PPSR), a photo file and a video link slot. Retrieval then works across all of it in one call. (`docs/USED-SPEC.md` §3; the same pattern as `content/kb/*.md` with `model` and `topic` labels in `scripts/ingest.mjs`.)
- **Natural-language retrieval over cars and documents together.** `/find` is hybrid semantic plus keyword with a reranker. "Something that tows a caravan and seats seven" returns paragraphs from the towing guide and from the matching cars, each mapped back to a model through its label. The configurator builds its "Because you…" rows this way (`server/foryou.mjs`, rules in the file header). The used listing's "Most relevant" sort and its for-you rows reuse it.
- **Generation that must fit a schema.** `/ask` with `answer_json_schema` returns a finder question with ids drawn from a fixed vocabulary, a promotion with a kind and a value, or a set of dealer comments with headline, body, highlights and honest notes. The server validates every field against the catalogue or the unit record and falls back to a deterministic version when the agent strays (`server/assistant.mjs`, `server/promotions.mjs`). This is how we stop the Watsonville problem (`docs/research/track-emerging.md`, "What they get wrong").
- **Live data in the answer without re-ingesting it.** Stock, prices, promotions and the visitor's own build go in as `extra_context` on each call, so the answer can say "there is one on the lot in Graphite" while the knowledge stays static (`server/assistant.mjs` `askAssistant`). The platform-side version is the `http` context agent on `harbourline-stock-agent`, which calls our `/api/stock?q=` (`scripts/provision.mjs`).
- **Documents become data.** A signed contract or a trade-in appraisal uploaded as a resource is read with `full_resource` and a per-kind schema, each field checked against the extracted text and cross-checked against the deal, with low-confidence fields sent to a human (`server/dms/ai.mjs` `extract`, `docs/DMS-SPEC.md`).
- **Staff agents get the same knowledge as tools.** The DMS exposes 54 MCP tools generated from its OpenAPI document and the knowledge box has its own MCP endpoint, so a salesperson's copilot in Claude or ChatGPT can search stock, draft a follow-up and read policy with the same guardrails (`server/dms/mcp-core.mjs`, `docs/DMS-MCP.md`).
- **Personalisation from the journey, not from a profile.** The session's viewed cars, finder answers, questions and watches are turned into `/find` queries. No login, no PII in the event stream (`server/events.mjs`; used-surface design in `docs/USED-SPEC.md` U6 and U11).
- **Multilingual by default.** The agent answers in the language of the question over an English corpus; the configurator exposes EN, 中文 and Tiếng Việt in the assistant (`server/assistant.mjs` `LANG`).

A CMS can hold the text and a DMS can hold the rows. Neither can take a question in Vietnamese about towing, find the right paragraph and the right car, and answer with a citation and a stock count.

## 4. How close to the ultimate dealer site

Graded against the leaders in `docs/research/` per stage. "Bar" is the best observed behaviour; "Harbourline" is what exists today (configurator, DMS, and the used surface in build), graded A (at or beyond the bar), B (close, one integration away), C (the knowledge layer can do it, nothing built), D (outside what agentic RAG covers).

| Stage | Bar and who sets it | Harbourline today | Grade |
|---|---|---|---|
| Discover and search | carsales AI voice search and ChatGPT app over live stock; Autotrader UK "type what you mean"; CarGurus Discover returning real listings (`track-emerging.md` §1) | Natural-language `/find` over cars and documents, for-you rows, cited assistant; no voice, no ChatGPT app yet (the KB MCP endpoint exists) | **A-** |
| Choose | Toyota AU and Tesla: model choice is the guidance; no leader runs a needs-based interview | Five-question finder that branches on every answer, with dealer nudges that state their reason | **A** (beyond the bar) |
| Configure | Toyota AU `/rav4/prices` with cash, finance and lease tabs and drive-away by postcode (`track-marketplaces-dealers.md`) | Grades, colours, packs, drive-away estimate, live availability; no finance tab | **B** |
| Browse used | Carvana's 360 imagery with imperfection call-outs; CarMax's no-haggle out-the-door price; Toyota dealer listing with Certified toggle and $1,000 reserve (`track-online-retail.md`) | Listing, agent-written comments, provenance panel, scoped assistant with memory, finder, for-you rows; library photos, synthetic PPSR | **B+** on knowledge, **C** on imagery |
| Value my car | CarMax plate-to-offer in minutes, valid 7 days, with Offer Watch; carsales Instant Offer on RedBook data; J.D. Power: justified trade value is worth 128 points (`track-emerging.md` item 1) | Trade-in appraisal PDFs extracted in the DMS; nothing customer-facing | **C** |
| Finance | Carvana pre-computed terms for the whole inventory; CarMax 4-minute pre-qualification; Toyota Personalised Repayments exists but online finance was disabled on every RAV4 we checked | Finance basics answered from the KB; no calculator, no soft check | **C** (D for the decision itself) |
| Reserve and buy | Toyota Order Online $1,000 holding deposit in four steps; Polestar order page as a status tracker with e-sign; Amazon Autos all-in price and pickup slot | Test-drive booking with salesperson prep; used reserve as a 48 h hold with no payment | **B** for the hold, **D** for payment and e-sign |
| Deliver | Tesla pre-delivery task list; Polestar live ETA from order; Cox: digital buyers save 41 minutes | Order-bank ETA shown in the configurator; nothing after the deal | **C** |
| Own | Toyota Go membership (service, recalls, manuals); Tesla app as key; J.D. Power: 64% want photo or video evidence with repair advice | Manuals and policies in the knowledge box for staff; nothing customer-facing | **C** |
| Trust and transparency | Price with receipts; Moffatt v Air Canada liability; Australian automated-decision disclosure from 10 Dec 2026 | Citations on every answer, provenance on every promotion, data-layer toggle, honesty rules on discounts | **A** |
| Staff side | CarMax Skye answering half of questions; Impel dossiers; one calculation engine from web to DMS (Gubagoo, Tekion) | DMS with agent query, deal summary, follow-up drafts, document extraction, MCP tools; no single desking engine | **B+** |

What agentic RAG covers well: knowledge, retrieval, generation under a schema, personalisation from a journey, document understanding, multilingual answers, exposure through MCP. On those stages we are at or past the leaders, and the research says that is where buyers now form their opinion (25% of new-car buyers used AI tools and were 13 points more satisfied, Cox 2025; 63% expect to use AI next time, Cox 2026).

What it does not cover, and what we would integrate: payments (Toyota's existing $1,000 deposit rail or a PSP), identity and e-sign (myToyota login, DocuSign-class e-sign where NSW law allows), logistics and order status (Toyota's allocation and shipping feeds), OEM order systems (One Toyota "Order Online"), pricing and valuation engines (RedBook or carsales Instant Offer, Toyota Finance personalised rate), real inventory feeds (Revolution's DMS instead of our seed), imagery capture (a photo rig or a PDI walkaround workflow), and the lender's credit decision. The knowledge layer explains, justifies and remembers; it must never be the system of record for money or identity.

Honest overall answer: on the conversational, consultative and transparency dimensions a Sydney Toyota dealer running this would be ahead of every Australian dealer site we opened and level with CarMax and carsales. On money, delivery and ownership it would still be a 2024 dealer site until the integrations above are made. The fastest route to "ultimate" is not more AI; it is connecting the AI we have to the deposit rail, the finance rate, the valuation engine and the service system, in that order.

## 5. What else we can do

Twelve moves beyond the used surface. Difficulty: **L** buildable on current data, **M** needs a new integration or feed, **H** needs Toyota, Toyota Finance or a regulatory or commercial change. Research references point into `docs/research/`.

| # | Move | What the customer or staff member gets | Powered by | Difficulty |
|---|---|---|---|---|
| 1 | Justify-my-trade valuation with document upload | Upload the service book and a few photos; get an estimate range, line-item deductions and what would raise it, grounded in the dealer's own trade history and recent comparable sales | Document extraction (`server/dms/ai.mjs`), DMS trade-ins, Domo used-market stand-in, RedBook for a real range | M |
| 2 | Ownership portal with the manual in the KB | "Why is the tyre-pressure light on?" answered from this car's manual, with the next service and recall status | Manuals already ingested (`content/dms-kb/`), VIN from the deal, Toyota recall feed | M |
| 3 | Service booking with recall awareness | Booking that knows the open recall, the capped-price item due and the loan-car rule, and explains the quote | DMS workshop tables (to add), policy resources, `/ask` with schema | M |
| 4 | Proactive renewal when the trade cycle matures | At month 30 of a Toyota Access term, a message with the equity position and a one-tap build of the replacement, with the reason stated | DMS deals and finance apps, GFV terms (`content/kb/finance.md`), configurator deep link | M |
| 5 | Agent-written listing syndication | The same comments, facts and photos pushed to Carsales and the dealer site from the unit resource, so the facts never disagree | Used resource as the source of truth, Autogate or Nexgate feed | M (H for Carsales rules) |
| 6 | Video walkaround transcripts as resources | A salesperson's 60-second walkaround becomes a link field on the unit resource; the transcript is searchable and quotable ("he mentions a chip on the bonnet at 0:41") | Knowledge box link processing, video slot in the unit record | L to M |
| 7 | Multilingual everything | Finder, listing chrome, comments and enquiry forms in the visitor's language, not only the assistant | `LANG` in `server/assistant.mjs`, an i18n bundle for the pages (BACKLOG BL-P1-05) | L |
| 8 | Salesperson copilot in MCP | In Claude or ChatGPT: "what did the Raman lead ask about, what is the Cruiser on the lot worth to us, draft the follow-up in Hindi" | DMS MCP server (54 tools), KB MCP endpoint (`docs/DMS-MCP.md`) | L |
| 9 | Finance pre-qualification explainer | A payment calculator for the exact VIN and a plain explanation of Toyota Access, balloon and GFV before the application; the real soft check comes from Toyota Finance | KB finance resources, catalogue prices; Toyota Finance personalised-rate API for the number | L for the explainer, H for the rate |
| 10 | Delivery handover pack | For each delivered VIN: the features of this car, the owner's questions so far, the three-week follow-up booked, in the owner's language | Session memory, booking flow (`server/testdrive.mjs`), DMS deals | L |
| 11 | Accessories fitment advisor | "Will the tow pack fit a 2019 Corolla hatch and what will it cost fitted?" answered from the accessories resource and the supplier invoices already extracted | `content/kb/accessories.md`, supplier invoice extraction (`/dms` documents) | L |
| 12 | Fleet buyer portal | A fleet manager asks for twelve HiLux SR5s by March with a tray and gets allocation, ETA bands and a quote draft from the DMS | Order-bank ETA, Domo signals, deal drafting in the DMS, agent query loop | M |

Also recorded in the parity spec and `track-emerging.md`: one assistant across web, MCP and the phone line (item 4), price with receipts (item 5), explainable-automation panel before the 10 Dec 2026 disclosure obligation (item 14), bring-your-own-AI handoff (item 15).

## 6. Risks

- **OEM data rights.** Toyota owns product imagery, pricing rules and the order system. The prototype uses Wikimedia Commons photos with credits and illustrative prices. A pilot needs Toyota-approved imagery and the One Toyota price feed, or the dealer's own transaction prices clearly labelled.
- **Privacy of session memory.** The used surface stores a visitor's questions as free text against a random session id for 30 days (`docs/USED-SPEC.md` §4). That is personal information the moment a visitor types a name. It must stay out of Domo exports, be deletable by the visitor (the forget endpoint) and be covered by the privacy notice before any real traffic.
- **Hallucination controls.** Every generated artefact is schema-bound and validated against the record it describes, with a deterministic fallback. Comments may only state what is in the unit record. The remaining exposure is tone: an agent can be accurate and still oversell. Keep the "honest notes" field mandatory and sample comments weekly.
- **Latency.** `/ask` is 5 to 8 s and the finder about 10 s per question, hidden by prefetching. Comments are generated offline and cached. A customer-facing site needs streaming answers or a faster generative model for anything in the critical path.
- **Syndication and advertising rules.** Agent-written comments pushed to marketplaces must meet Carsales listing rules and Australian Consumer Law on representations. The validation layer helps; a human approval step on first publication does not cost much.

## 7. Recommended sequence

- **Iteration 1 (now to end of October): finish the used surface and make the platform story visible.** Ship `/used` per the spec, ingest the units as resources with photos, generate and validate the comments, wire enquiries to DMS leads, publish this document and the surface map inside the How-it-works drawer. Demo: the six beats in `docs/DEMO-SCRIPT.md`.
- **Iteration 2 (November to mid-December): money.** Payment calculator and finance explainer on new and used, justify-my-trade estimate with document upload, approved-offer field instead of raw headroom, price-with-receipts chips on every number. These are the Cox 15-to-24-point gaps and the J.D. Power 128-point trade finding; they need only the knowledge layer and the DMS until Toyota Finance and RedBook are connected.
- **Iteration 3 (January to March 2027): own and return.** Ownership portal with the manual, service booking with recall awareness, delivery handover pack with the three-week follow-up, renewal prompts from the trade cycle, the salesperson copilot in MCP. This is where loyalty is won (22% return to the same dealer today) and where Revolution's DMS has data nobody else has.

Each iteration keeps the rule that made the first two surfaces credible: say where every number came from, validate everything the agent writes, and leave money and identity to the systems that own them.
