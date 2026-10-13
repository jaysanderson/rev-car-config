# Harbourline DMS (sales back office): Product Requirements

Version 1, 14 Oct 2026. Owner: Product. Build contract: `docs/DMS-SPEC.md` (this PRD says what "good" means; the spec says what to build). Configurator context: `docs/PRD.md`.


> **MCP status (verified 14 Oct 2026 by the lead):** this knowledge box's MCP endpoint (`https://aws-ap-southeast-2-1.rag.progress.cloud/api/v1/kb/be12d5b5-56ea-4ad4-b380-2358247bb2c8/mcp`) answers `initialize` and `tools/list` correctly with the service token. The connection failure seen in the build session was a different knowledge box in another zone, not this one.

## 1. Vision

The configurator showed Revolution Software what Progress Agentic RAG (ARAG) and Domo do on the showroom floor. The Harbourline DMS shows the other half: the same two technologies running the **sales back office** of a Toyota dealer group, so a DMS vendor can see where they plug into the product they already sell.

- **Sales only.** Leads, test drives, deals, stock, finance and trade-in as they touch a sale, promotions, campaigns, documents. No service, parts or accounting.
- **Demo-grade functionality.** Real screens, real API, believable seeded data (24 months, about 2,100 deals), but no production workflow depth. Every button either works against the seeded API or says plainly that it does not.
- **Every ARAG and Domo capability shown credibly.** Eight ARAG use cases (section 5) and a Domo loop in both directions (section 6). Each one is grounded in something the audience can inspect: a citation, an evidence row, a dataset name.
- **One story with the configurator.** A customer books a test drive in the configurator and arrives in the DMS as a lead with a handover sheet. What the dealer does in the DMS (sales, stock, promotions) flows back to the configurator as Domo `dealer_signals` and governed promotions.
- **API-first.** Modelled on MaintenanceOS: the SPA only talks to the documented API, which publishes OpenAPI and an MCP endpoint, so the audience sees that the AI features are reachable by their own systems and by Claude or Cursor.

Success looks like: the Revolution product lead says "we could put this on our DMS data", and asks which of the datasets and endpoints they would map first.

## 2. Goals and non-goals

Goals: show ARAG retrieval, extraction, generation, semantic search and agentic tool use on dealer data; show Domo as the analytics layer that decides and explains (stock priorities, targets, dashboards); show the closed loop with the configurator; stay honest about what is simulated.

Non-goals: replacing a DMS, production auth, multi-tenant admin, write-back to Toyota systems, accounting-grade finance.

## 3. Personas

| Persona | Login | Role | Job to be done | Where they live |
|---|---|---|---|---|
| **Grace, General manager** | `gm@harbourline.demo` | gm, all four sites | Is the group on target, where is stock ageing, what should we promote | Dashboard, Stock, Insights, Promotions |
| **Raj, Sales manager, Parramatta** | `sm.par@harbourline.demo` | sales_manager | Which deals are stuck, who needs coaching, what to do today | Assistant (Ask the ERP), Deals, Dashboard leaderboard |
| **Sam, Salesperson, Parramatta** | `sales1@harbourline.demo` | salesperson | Call the right lead with the right context, follow up fast, keep deals moving | Leads, Test drives, Deals, follow-up drafting |
| **Fiona, Business manager (F&I)** | `finance@harbourline.demo` | finance | Get finance and trade-in paperwork right the first time | Documents, Deals (finance, trade-in), Ask the manual (policy) |
| **Dev, Digital experience manager** | `marketing@harbourline.demo` | dxm | Make the website and configurator earn leads, publish offers that are real and approved | DXM, Promotions, Campaigns, Insights |

The existing configurator personas (Mia the buyer, Raj the sales manager, Elena the vendor stakeholder) carry over. Elena is the audience in the room and is not a login.

## 4. Modules and acceptance criteria

Common to all modules: prototype band and "demo data" label visible at all widths; role-aware navigation (a role never sees a nav item it cannot use); every ARAG-powered control tagged "Progress Agentic RAG", every Domo-fed element tagged "Domo" with the dataset name; no secret ever reaches the browser; empty and error states are written, not blank.

### M1. Authentication and tenancy
- Five demo logins, password `demo1234`, bearer token kept in memory (a reload logs out, by design).
- Site switcher scopes lists and KPIs; gm can pick "All sites"; sales roles default to their site.
- AC: wrong password gives a clear error; `/auth/me` returns role and site; Settings lists the five logins.

### M2. Dashboard
- KPI strip (units delivered, gross, average gross per unit, leads, conversion, test-drive rate, days to close, aged stock count) and "Domo cards": units vs target, gross by site, funnel, stock ageing, days of supply, leaderboard, as inline SVG.
- AC: every card names its Domo dataset; numbers reconcile with `/kpi/overview` and with the CSV export of the same dataset; site and month filters change all cards; the leaderboard shows 14 salespeople with differing conversion.

### M3. Leads (and configurator panel)
- List with filters (status, owner, channel, source, score) and detail page.
- Configurator panel on a lead from `channel=configurator`: finder answers, cars viewed, offers clicked, the booking, the handover sheet.
- AC: a test drive booked in the configurator appears as a lead within one refresh, with session id, finder answers, viewed cars, incentive and handover; leads can be PATCHed (status, owner); score is shown with its reason.

### M4. Follow-up drafting (ARAG)
- On a lead, pick tone and channel (email or SMS) and get a draft.
- AC: the draft cites the lead's real configurator data (model, grade, colour, what they asked); it only mentions promotions that exist in the promotions register and shows which ones; it follows policy (for example no unapproved discounts); nothing is sent, the salesperson edits and copies. See section 5.

### M5. Test drives
- List and detail: slot, car, status, questions asked by the customer with answers, incentive, handover sheet, outcome.
- AC: booked, completed, no_show and cancelled states all present in seed data; a configurator booking is visible here with the same handover as on the lead.

### M6. Deals
- Board by stage (quote, negotiation, finance, approval, contract, delivery, delivered, lost) and list; detail with timeline, finance application, trade-in, documents, price build-up (accessories, promotions, discount, drive-away, front and back gross).
- AI summary, next best action and risks (ARAG).
- AC: about 150 open deals spread across stages with some genuinely stuck (in finance more than 5 days) so the agent query has real answers; summary cites the events and policy it used; adding a deal event updates the timeline.

### M7. Stock
- By site, ageing heat, 22 configurator units plus the wider ledger; Domo signals per model (days of supply, allocation next month, target gap, margin headroom) and move priority with reason code; "why this is being pushed".
- AC: the 22 configurator units carry the same ids as `content/domo/stock_by_site.json`; every unit with a move priority shows its reason in words and the Domo dataset it came from; priority values equal what the configurator offers use.

### M8. Customers
- List and detail with leads, deals, test drives, documents.
- AC: search by name, suburb, email; detail shows the full history; the customer for a configurator booking is created or attached when the dealer qualifies the lead.

### M9. Promotions
- Domo-selected targets (models and units to move) flow into ARAG-composed promotions with provenance; attach to campaigns.
- AC: each promotion shows source (Domo target, KB policy clause), constraints, validity dates and status; composition never invents value outside incentive headroom; a promotion cannot become "live" without an approver in the DXM or GM role (governance, section 7).

### M10. Campaigns
- 18 campaigns with channel, audience, promotions, sent, opened, clicked, leads, budget.
- AC: campaign performance appears in `/dxm/overview`; leads attributed to a campaign link back to it.

### M11. DXM (digital experience)
- Configurator report from events, bookings, content and offers published to the configurator, handover sheets list.
- AC: session, finder completion, configuration, test-drive conversion; counts match `content/dealer/events.jsonl` and `bookings.json`; no personal data in the event view.

### M12. Documents (ARAG document processing)
- Upload a PDF (contract, trade-in form, supplier invoice, licence, insurance), process, review extracted fields with confidence, verify.
- AC: the six sample PDFs extract correctly against their per-kind schema; low-confidence fields are flagged in `verifyFields`; verify moves the document to `verified` and records who; a supplier invoice total, GST and line items add up or the mismatch is flagged.

### M13. Assistant
- Two modes: "Ask the manual" (manual and policy, cited) and "Ask the ERP" (live agent over the data, with evidence rows).
- AC: example questions are clickable; every answer shows citations or evidence rows; an unanswerable question says so rather than guessing; see section 5.

### M14. Insights
- Domo dataset catalogue: name, description, row count, refresh, schema, CSV link, "how to connect Domo".
- AC: every table plus `sales_daily`, `stock_ageing_daily`, `funnel_weekly`, `configurator_events`, `dealer_signals` is listed; each CSV downloads and its row count equals the catalogue; schemas match the CSV headers.

### M15. Settings
- Link to `/dms/api/docs` and `/dms/api/openapi.json`, the KB's MCP endpoint, roles, demo logins, ARAG status.
- AC: OpenAPI lists every route; `/arag/status` shows KB id, resource counts by topic, agent ids and MCP URL without any token.

### M16. Global search
- Semantic search across manual, policy, documents and ERP text.
- AC: results carry source labels (Manual, Policy, Document, Customer, Deal note); "a customer worried about trade-in being undervalued" finds relevant policy and deal notes without keyword overlap.

## 5. ARAG use-case matrix

| # | Use case | Surface | Demo question or action | What proves it is grounded |
|---|---|---|---|---|
| 1 | **Ask the manual** (retrieval, citations) | Assistant, "Ask the manual" | "What do I need on file before I can submit a finance application for a customer with a trade-in?" | Answer carries citations to resources in `content/dms-kb/` (manual or policy), clickable to the source passage; scope filter shows `topic/manual` or `topic/policy`; an out-of-scope question ("What is the CEO's salary?") is refused |
| 2 | **Live-ERP retrieval agent** (agentic tool use) | Assistant, "Ask the ERP" | "Which deals are stuck in finance for more than 5 days at Penrith?" | `evidence[]` lists the exact rows (deal id, stage, days in stage); the tool calls (`erp.search`, `erp.kpi`, `erp.get`) are shown; the count in the answer equals the evidence rows and the same filter run on `GET /deals` |
| 3 | **Deal summary and next best action** (generation with extra context) | Deal detail | Open a stuck deal, click "Summarise" | Summary names facts present in the deal, events, finance app and trade-in; risks cite the policy clause; every date and dollar figure matches the deal record |
| 4 | **Follow-up drafting** (generation with guardrails) | Lead detail | "Friendly email" for the configurator lead after the test drive | Draft references the car, colour and question the customer asked in the configurator; promotions named exist in the register (shown as chips); no invented offer or price; policy constraint visible |
| 5 | **Document processing** (extraction with schema and confidence) | Documents | Upload the supplier invoice PDF, "Process" | Extracted fields with per-field confidence next to the PDF; totals reconcile; low-confidence fields flagged for human verify; resource appears in the KB and is then searchable |
| 6 | **Semantic search** (/find) | Global search | "customer unhappy about trade-in value" | Results merged from KB and ERP with source labels and no keyword match required; each result links to its source |
| 7 | **MCP** (ARAG as a tool for other agents) | Settings, Claude or Cursor | Connect the KB's MCP endpoint and ask the same manual question from Claude | Same answer and citations outside the app; the MCP URL shown in Settings is the KB's, with tokens held by the client, not the page. Note: the MCP connection failed to connect from the engineering workstation on 14 Oct (see open risks); verify before any demo |
| 8 | **Multilingual** | Assistant, follow-up, summary | Ask the manual in Vietnamese or Chinese; draft the follow-up in the customer's language | Same sources and same numbers as English; citations still point to the English documents |

Honesty rules for ARAG output: every answer shows its sources; the model is told to say "not found" when retrieval is empty; drafts are never auto-sent; extracted fields are never auto-verified.

## 6. The Domo story

**Position.** Domo is the analytics and decision layer. The DMS is the system of record. The DMS exports its tables as datasets; Domo joins and models them, decides what matters, and the answer flows back into the dealer experience. In this prototype, Domo is a stand-in: the DMS publishes the datasets and the derived signals; the dashboards below are what Revolution would build in a real Domo instance on these exports.

**Datasets exported** (`GET /dms/api/domo/datasets`, CSV at `/domo/export/:dataset.csv`): every ERP table (sites, staff, customers, vehicles, leads, test_drives, deals, trade_ins, finance_apps, promotions, campaigns, documents, targets) plus derived `sales_daily`, `stock_ageing_daily`, `funnel_weekly`, `configurator_events`, `dealer_signals`. Descriptors in `content/dms/domo-datasets.json`; join guide in `content/dms/data/README.md`.

**Dashboards to build in Domo** (and the in-app Domo cards that preview them):
1. **Sales performance:** units vs target by site and month, gross per unit, leaderboard.
2. **Funnel:** lead to test drive to quote to won, by source and channel; configurator channel versus others.
3. **Stock health:** ageing by site and model, days of supply, inbound versus allocation, move priority.
4. **Finance and trade-in:** approval rate and time by lender, trade-in valuation versus offered.
5. **Campaign ROI:** spend, leads, cost per lead, deals attributed.
6. **Configurator insight:** sessions, finder completion, test-drive conversion, most viewed versus most sold.

**The feedback loop into the configurator** (`dealer_signals`):
`DMS tables (vehicles, deals, targets, Toyota allocation) → Domo dataflow → dealer_signals (one row per model: unitsInStock, sales90d, daysOfSupply, allocationNextMonth, targetGap, avgDaysInStock, marginHeadroomAvg) → derived move priorities → configurator offers, ribbons and ordering`, and in the DMS: stock page priorities with reasons, and promotions composed from the same targets. The point to make: a salesperson sells a Kluger on Tuesday, days of supply drops, the target gap closes, and the configurator stops pushing it on Wednesday, with no one editing a rule.

**Honesty rules.** Dataset values on `/domo/signals` are produced by the DMS seed, not a live Domo instance. Domo-fed elements say "Domo · dataset name"; the Insights page states that Domo is a stand-in until a real instance is connected.

## 7. The DXM bridge

| Flow | Direction | What happens |
|---|---|---|
| Configurator events | Configurator to DMS | Anonymous events (`content/dealer/events.jsonl`) feed the DXM report and `configurator_events` dataset |
| Bookings | Configurator to DMS | `POST /api/testdrive/book` also creates a lead (`channel=configurator`) with session id, finder answers, viewed cars, offers and the handover sheet |
| Handover sheets | DMS surface | Salesperson sees what the customer chose and asked, the incentive offered, and the suggested opening, before calling |
| Promotions governance | DMS to configurator | Promotions are composed from Domo targets, carry provenance and constraints, need approval before they are published to the configurator register; the configurator only ever shows approved, in-date, funded promotions |
| Signals | DMS/Domo to configurator | `dealer_signals` priorities (section 6) |

DXM acceptance: a promotion in "draft" or "expired" never appears in `/api/promotions`; approver and time are recorded; withdrawing a promotion removes it from the configurator within one refresh.

## 8. Non-functional requirements

| ID | Requirement | Acceptance |
|---|---|---|
| D-NFR1 Prototype auth | Demo logins only, tokens in memory, password `demo1234` | A banner says so; no real credentials, no persistence of tokens; the auth route is rate-limited |
| D-NFR2 No PII in events | Configurator events carry session ids and behaviour only | Inspect `events.jsonl` and `configurator_events.csv`: no name, email, phone or free-text customer input. Bookings and customers are the only places with personal data, and all of it is synthetic |
| D-NFR3 Synthetic data | All people, VINs, ABNs, rego and documents are invented | Sample PDFs and seed data labelled synthetic; no real ABN or licence numbers |
| D-NFR4 No secrets in browser | KB token, agent keys, service tokens never in the SPA | `grep` of `public/dms/` finds none; `/arag/status` exposes ids and URLs only |
| D-NFR5 Honesty | Simulated parts are labelled | Domo is a stand-in; drafts are not sent; extraction needs a human verify; "Prototype · demo data" always visible |
| D-NFR6 Grounding | No uncited ARAG claim | Citations and evidence rows on every ARAG answer; empty retrieval returns "I could not find that" |
| D-NFR7 Performance | Feels live | List endpoints under 300 ms; `/ask` and summary under 8 s p50; agent query under 15 s p50; document processing shows progress and can be pre-warmed |
| D-NFR8 Graceful fallback | Works with the KB unreachable | Lists, dashboard, stock, insights keep working; ARAG controls show a clear "not connected" state; no endless spinners (15 s timeout) |
| D-NFR9 Reproducibility | Same data every run | Seeded PRNG; regenerating gives identical JSON |
| D-NFR10 Accessibility and responsive | Keyboard usable, AA contrast, usable at 1180 px and above, readable on a tablet | Same bar as configurator NFR8 |
| D-NFR11 Consistency | Configurator and DMS agree | The same unit has the same age, price, priority and reason on both |

## 9. Out of scope

Service, parts, accounting, payroll, general ledger, real finance rates or lender integration, real credit checks, e-signature, real email or SMS sending, DMS write-back to Toyota systems, used-car appraisal beyond a seeded valuation, multi-brand, production auth and permissions, data migration tooling.

## 10. Open questions for the customer

1. Which DMS entities and fields would Revolution map first: leads, deals, stock, finance?
2. Is Domo already in their stack for these dealers, and which instance would a pilot use? Should the DMS push datasets, or Domo pull?
3. Which documents matter most for extraction: contracts, trade-in forms, supplier invoices, others? What accuracy and verification step do compliance teams require?
4. Who may approve promotions in a real group, and what does Toyota Australia require before a dealer offer is published online?
5. Are English, Simplified Chinese and Vietnamese the right languages for the back office as well as the showroom?
6. Is MCP exposure of dealer data acceptable, and with what scoping (read only, per site, per role)?
7. What customer data may be sent to a hosted retrieval service? Where must it be hosted (region, data residency)?
8. Should the ERP agent be read-only forever, or would they want it to take actions (reassign lead, log a note)?
9. How should the configurator hand over leads to their real CRM: our lead model, or theirs?
10. What does "stuck" mean for them: fixed days in stage, or a model of expected stage duration?
11. Is the demo shown with the Toyota name, or under the fictional Harbourline brand only?
