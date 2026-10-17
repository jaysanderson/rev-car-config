# Harbourline Used: pre-owned retail surface (spec)

Owner: PM. Engineering: Head of Product Engineering. Status: build started 17 Oct 2026. Lives at `/used/` in the same Fly app as the configurator (`/`) and the back office (`/dms/`).

## 1. Why this surface

The configurator proves the knowledge layer on new cars, where the OEM owns the data. Used cars are the stronger test: every car is unique and its value sits in unstructured material (inspection report, service book, PPSR check, photos, prior deal). This surface shows that the **listing itself is a resource in the Progress Agentic RAG knowledge box** (metadata, text, photo, video slot), that **dealer comments are written by the agent from that resource** rather than typed by a salesperson, and that the **assistant remembers what a visitor already asked about a car**.

Reference experience: a Sydney Toyota dealer's "Pre-Owned Cars For Sale" page (filters rail, result count with query time, sort pills, Toyota Certified toggle, 3-up cards with photo, year/model, grade and variant code, chips for condition/body/km/transmission/stock number, price "Excl. Govt. Charges", and four actions: View Details, Finance Enquiry, Enquire Now, Reserve Now $1,000; a floating "Chat now" bubble). We match that bar, then add what the knowledge layer makes possible.

## 2. Features

| ID | Feature | Powered by |
|---|---|---|
| U1 | Listing with filters, sort, Toyota Certified toggle, result count and query time | `content/used/stock.json` (36 units, 4 sites) |
| U2 | "Most relevant" sort with a free-text query is semantic: ARAG `/find` over the `topic/used` resources, filters applied on top | ARAG /find |
| U3 | Agent-written dealer comments per car (headline, body, highlights, honest notes), generated from the car's own resource, validated, cached | ARAG /ask with `answer_json_schema`, resource filter, scripted fallback |
| U4 | Vehicle display page (VDP): photos, specs, price position against market, provenance panel (owners, service history, inspection, PPSR, warranty), similar cars | stock + `content/domo/used_market_prices.json` |
| U5 | Assistant scoped to the car on the VDP; a general assistant on the listing | ARAG /ask, extra_context = the unit record, filter to the unit resource + policy docs |
| U6 | "Your questions about this car": per-session memory shown on the VDP and as a marker on listing cards; prior questions on other cars are passed to the agent as context | `used_sessions.jsonl` keyed by `x-sid` |
| U7 | "Find what's right for me": 5-step used-car finder (budget, use, body, priorities, timing) ranking real units with reasons | scripted interview, ARAG writes the "why" |
| U8 | Enquire, finance enquiry, reserve (48 h hold, no payment taken) → lead in the DMS | `/dms` leads table, channel `web-form`, source `harbourline.com.au/used` |
| U9 | Watch a car or a search ("tell me when a Hybrid RAV4 under $45k arrives"); watcher count on the VDP as a demand signal | `used_watches.json` |
| U10 | First-party events and a Domo report | `events.jsonl`, `/api/used/report` |
| U11 | Personalised "For you" rows on the listing built from the visitor's journey (cars viewed, questions asked, finder answers, watches) with natural-language retrieval over the car resources; a "What this page knows about you" strip with a forget button | ARAG /find with journey-derived queries, session memory |

Out of scope for this iteration: payments, real PPSR, real photos per car (library photo of the model with credit; cars without a library photo show "photos being taken"), video processing (a `video` slot exists on the record and the resource; none attached yet), DMS used-stock screens (leads only).

## 3. Data model

`content/used/stock.json` → `{ generated, priceNote, rows: Unit[] }`, deterministic from `scripts/used-seed.mjs`.

```
Unit {
  stockNo "U-33067", vin, siteId par|hor|pen|liv,
  make "Toyota", model "RAV4", modelId "rav4"|null (catalogue id when Toyota), variantCode "AXAH52R",
  year 2024, grade "GX", gradeId|null, body suv-mid|suv-small|suv-large|ute|sedan|hatch|coupe, bodyLabel "SUV",
  colour "Graphite", colourId|null, interior "Fabric, black",
  km 49316, transmission Automatic|Manual, drive 2WD|AWD|4x4, fuel Hybrid|Petrol|Diesel|Electric, engine "2.5L hybrid", seats, towKg,
  price 42888 (excl. govt charges), was null|number, certified bool, demo bool,
  status on_lot|reconditioning|arriving|held|sold, etaDays|null, daysInStock, arrivedAt,
  acquiredVia trade-in|ex-demo|ex-fleet|auction|buy-back, tradeInId "TI-30418"|null,
  owners 1, firstRegistered "2024-04-18", compliance "2024-03", regoExpiry "2027-04", plate "EWD31B", keys 2, books true,
  serviceHistory [{date, km, by, work}], nextServiceDue {km, date},
  inspection {date, inspector, points 120, passed, items [{area, note, action repaired|replaced|noted}], tyresMm {front, rear}, brakesPct {front, rear}},
  ppsr {checkedAt, encumbrance false, writtenOff false, stolen false, certificate},
  warranty {type "Toyota Certified Pre-Owned"|"Balance of new-car warranty"|"Statutory", until, kmLimit|null, roadside bool},
  features [string], photo {src "/api/images/rav4.jpg", thumb "/api/images/rav4/thumb.jpg", credit, library true}|null, video null|{url,title},
  reconditioning [{item, cost}]
}
```

Agent comments: `content/used/comments.generated.json` → `{ generatedAt, model, items: { [stockNo]: { headline, body, highlights[], honest[], sources[], generatedAt } } }`. The server composes a scripted version when a unit has none.

Market stand-in: `content/domo/used_market_prices.json` → rows `{ make, model, yearFrom, yearTo, median, low, high, sample }` plus `refreshed_at`.

Knowledge box: one resource per unit, slug `used-<stockno lower>`, title "2024 Toyota RAV4 GX hybrid AWD, 49,316 km, Graphite (U-33067)", labels `model/<modelId>` (Toyota only) and `topic/used`, `origin.metadata` with the scalar fields, text fields `listing` (summary, specs, features, price) and `provenance` (service history, inspection, PPSR, warranty, reconditioning), file field `photo` (library jpg), optional link field `video`, and `summary` set to the agent's comments once generated. Two policy docs: `content/kb/used-certified-program.md` (topic warranty, policy) and `content/kb/used-buying-guide.md` (topic finder).

## 4. API (server/used.mjs, mounted at /api/used)

All responses JSON. `x-sid` header (same rules as the configurator) personalises "your questions", watches and events. No PII in events.

| Method, path | Body / query | Returns |
|---|---|---|
| GET `/api/used` | `q, make, model, body, fuel, transmission, drive, site, certified=1, priceMin, priceMax, kmMax, yearMin, sort=relevant|latest|price-asc|price-desc, page, pageSize` | `{ total, tookMs, semantic, items: Card[], facets: { make, model, body, colour, fuel, transmission, drive, site: [{value,label,count}] }, refreshedAt, priceNote }` |
| GET `/api/used/:stockNo` | | `{ unit, comments, market: { median, low, high, sample, position below|at|above, diff }, similar: Card[], yourQuestions: [{q,a,at}], watchers, trace[] }` |
| POST `/api/used/ask` | `{ question, lang, history[] }` | `{ answer, citations[], trace[], actions[] }` general assistant over the used range |
| POST `/api/used/:stockNo/ask` | `{ question, lang, history[] }` | same shape, scoped to the car; stores the Q&A for the session |
| GET `/api/used/questions` | | `{ byStock: { [stockNo]: n }, recent: [{stockNo, q, at}] }` for the card markers |
| GET `/api/used/:stockNo/questions` | | `{ questions: [{q,a,at}] }` |
| POST `/api/used/match` | `{ answers: [{id, value}], lang }` | `{ done:false, step, total:5, question: {id,text,why,options:[{id,label,sub,note?}]} }` or `{ done:true, summary, results: [{ stockNo, fit, why[], watch[], card }] }` |
| POST `/api/used/:stockNo/enquiry` | `{ kind: enquire|finance|reserve, name, email?, phone?, message?, financeTermMonths?, deposit? }` | `{ ok, ref "UE-xxxxx", leadId, hold?: { until }, message }` |
| POST `/api/used/watch` | `{ stockNo }` or `{ criteria: { model?, body?, fuel?, priceMax?, kmMax? } }` | `{ ok, watchId, matchesNow }` |
| GET `/api/used/watch` | | `{ watches: [...] }` for the session |
| GET `/api/used/foryou` | | `{ journey: { viewed[], asked[], answers{}, watches[] }, rows: [{ id, title, why, query, items: Card[] }] }` built from the session; empty rows when the session is new |
| DELETE `/api/used/session` | | `{ ok }` forgets the session's questions, watches and journey |
| POST `/api/used/comments/refresh` | `{ stockNo? }` (rate-limited) | `{ regenerated: n, items }` |
| GET `/api/used/report` | `days=30` | `{ views, asks, enquiries: {enquire, finance, reserve}, watches, matchCompletions, topViewed: [{stockNo, n}], questionsPerCar }` |

`Card` = `{ stockNo, title, subtitle, make, model, modelId, year, grade, variantCode, body, bodyLabel, colour, km, transmission, fuel, drive, price, was, certified, demo, status, etaDays, siteId, siteName, daysInStock, photo, headline, youAsked, watchers }`.

Event types added to `events.mjs`: `used_view {stockNo}`, `used_ask {stockNo|null, questionLength, lang}`, `used_enquiry {stockNo, kind}`, `used_watch {stockNo|null, criteria slug}`, `used_match_result {recommended: [stockNo]}`. Server logs `used_ask`, `used_enquiry`, `used_watch`, `used_match_result`; the page posts `used_view`.

Session memory file `used_sessions.jsonl` (dealer state dir): `{ts, sid, stockNo, q, a, lang}`; questions are free text typed by the visitor, kept 30 days, never exported to Domo. The report counts them only.

## 5. Page (src/used.html → public/used/index.html)

Same Progress kit as the configurator (band with Progress wordmark and the prototype pill, product header "Harbourline Toyota · Pre-owned", How-it-works drawer, LIVE/OFFLINE badge). Hash routes: `#/` listing, `#/car/:stockNo` VDP, `#/match` finder. Inline `window.__USED__ = { stock, sites, imageBase, credits, priceNote }` from `scripts/build.mjs` so listing and VDP render offline; assistant, finder, semantic sort, enquiries and watches need the API and degrade to a clear offline message.

Listing: filter rail (search, make, model, colour, body, odometer, price, year, transmission, drive, features, fuel), "N cars found across Harbourline in M ms", sort pills, "Only show Toyota Certified Vehicles" toggle, cards as in the reference plus an agent headline line, a "You asked N questions" marker when the session has asked about that car, and a "Find what's right for me" entry. Floating "Chat now" bubble opens the general assistant.

VDP: gallery (library photo + credit, or "photos being taken"), title block with price, "Excl. Govt. Charges", market position, chips, four actions, agent-written comments with a "Written by the agent from this car's record" trace, provenance panel, "Your questions about this car" (history, re-ask), assistant pane scoped to the car, similar cars, watch button with watcher count.

Finder: one question per screen with branching options, result cards with fit and reasons, "Watch this search" when fewer than three matches.

## 6. Honesty rules

Prices are illustrative demo data. Photos are library images of the model with credit unless `photo.library` is false. Agent comments may only state what is in the unit record; the server rejects comments that mention a feature or figure not present and falls back to the scripted version. No payment is taken; "Reserve" creates a 48 h hold in the DMS lead. PPSR, inspections and service histories are synthetic.
