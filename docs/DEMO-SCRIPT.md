# Harbourline Toyota Configurator: 10-minute demo talk track

Audience: DMS vendor stakeholders and dealer principals. Presenter speaks in first person. All figures are demo data.

## Pre-demo checklist

- Open the served URL (the API-server host, not the standalone file), so the live path is exercised.
- Open the assistant panel (right) and confirm the system message "Connected to the knowledge box · Domo stand-in" appears. If it does not, you are on the scripted path (see the real-vs-simulated box).
- Reset between runs by reloading the page. Finder answers, build and chat all clear.
- Browser width 1180px or more, so build rail, stage and assistant show side by side. Use the light theme and 100% zoom.
- Check the header shows "Prototype · demo data · not a production system". Do not crop it out of a shared screen.
- Close the "How it works" drawer and leave "Data layer" off. EN selected.
- Rehearse once end to end. The best match depends on the local rule engine or the live agent, so confirm it before you present.

## What is real vs simulated

| Piece | Status |
| --- | --- |
| Progress Agentic RAG knowledge box, /ask, /find, multilingual answers | Real when the API server is running with a token. The server holds the token; the browser never sees it. |
| Domo datasets (stock_by_site, aged_stock_actions, inbound_pipeline, transfer_feasibility, order_bank_eta) | Stand-in JSON in content/domo/, delivered through the agent's HTTP context and the API server. A framework for a real Domo connection, not a live feed. |
| Stock, ages, bonuses, Harbourline dealer group | Fictional and illustrative. Toyota models, grades and specs are real. |
| No API server | The four chip questions are scripted. Free text returns a "not connected" message. The finder falls back to a local rule engine. |
| Reserve, Hold, Place order | Toasts only. No DMS write-back yet. |

## Beat 0: Framing (0:00-0:30)

- Click: nothing. Point to the header band.
- Audience sees: "Prototype · demo data · not a production system", the three panes.
- Say: "This is a prototype with demo data. Harbourline is a made-up dealer group: Parramatta is home, with Hornsby, Penrith and Liverpool nearby. The point is how a customer experience can combine product knowledge and live stock in one conversation."
- Under the hood: Progress Agentic RAG supplies the knowledge and conversation; Domo supplies stock intelligence.
- If it goes wrong: say the demo data is stand-in, and carry on.

## Beat 1: Find the right car (0:30-2:30)

- Click: "Find the right car" (top right of the dealer bar). Answer: "Towing and touring", then "Caravan", then "Petrol or diesel", then "$65k to $90k", then "In the next few weeks".
- Audience sees: question X of 5 with a short "why we ask", working steps, trace chips ("KB · finder-guide", "KB · spec sheets"), and the answers as chips you can click to go back. On the last question, "In the next few weeks" shows a note such as "N cars on the lot today" with a "Domo · stock_by_site" chip.
- Say: "Only the second question branches today. Pick towing and it asks about weight; pick family and it asks how many people. The other three are the same for everyone. The agent picks each next question, and the page validates it."
- Under the hood: Progress Agentic RAG /ask with answer_json_schema returns either a question object or the recommendations. Question ids come from a fixed vocabulary. Without the server, the local rule engine (localNext) does the same job.
- If it goes wrong: click an answer chip to step back, or "Start over". If the questions look wrong, say the fallback rule engine is running and carry on.

## Beat 2: Recommendation results (2:30-3:30)

- Click: "Configure this car" on the "Best match" card.
- Audience sees: three cards with fit %, "from" price, green "why" bullets, "watch" bullets, and a live availability line (on the lot, nearby, in transit, or factory order). Expect a Prado GXL on top; HiLux scores close, so say so if it leads.
- Say: "Each recommendation says why and what to watch, with real availability. It is not a brochure list. Choosing a car loads the nearest real unit's spec, and for a towing answer it adds the Towing Pack."
- Note: the Prado GXL unit nearby (HL-2150, Liverpool) already carries the Towing Pack. The auto-add shows on a unit without it.
- Under the hood: the same JSON payload (summary, recommendations with fit, why, watch, availability) is visible under the cards; Domo stock_by_site and order_bank_eta feed the availability line.
- If it goes wrong: pick whichever card is on top and click its "Configure this car".

## Beat 3: Configure (3:30-4:30)

- Click: a different grade in "Grade"; colour swatches in "Colour"; options under "Interior" and "Genuine accessories".
- Audience sees: price updating, and under each swatch a stock tag: "N here" (home lot), "N nearby", "arriving", or "order".
- Say: "The customer learns what is actually available while choosing, not after. Pick a colour we do not hold and the tag says order."
- Under the hood: Domo stock_by_site counted per grade, colour and interior; the home site is Parramatta.
- If it goes wrong: switch model in the Model list; the counts recompute.

## Beat 4: Availability (4:30-5:15)

- Click: nothing, or change a colour and watch the card update.
- Audience sees: "How you can have this car" with ranked rows: "Ready now" (on the lot, with days in stock), "Here Thursday" or "Here Friday" with the distance, "Arrives in 9 days" for in-transit, and "Built to order" with a week range.
- Say: "These are the real ways to get exactly this build. Transfers use the actual truck run day."
- Under the hood: Domo stock_by_site, transfer_feasibility (run_day, lead_days, distance_km), inbound_pipeline (eta_days, stage) and order_bank_eta (eta_weeks_min and max).
- If it goes wrong: say stock is stand-in data, then switch to the RAV4 for a richer set of rows.

## Beat 5: Offers (5:15-6:00)

- Click: nothing. Point to "This week at Harbourline" and the ribbon at the top of the build rail ("See it").
- Audience sees: up to three discounted cars with a crossed-out price, a "save" amount and a stated reason ("on the lot over 90 days"). Same body type ranks first.
- Say: "Every discount states its reason. It is never the car you are configuring, and it is never described as anything but an aged-stock bonus."
- Under the hood: Domo aged_stock_actions with move_priority and incentive_headroom; ribbon placement build_ribbon. The server /api/offers ranks the rows.
- If it goes wrong: if the strip is empty, say the offers are stock-driven and move on.

## Beat 6: Assistant (6:00-7:30)

- Click: first switch to RAV4 in the Model list so the scripted answers match the build. Then the chip "Can it tow my caravan?" and its action "Add the Towing Pack to this build". Then the chip "I need it before the school holidays" and "Switch to the Graphite Cruiser" (or "Switch to the Saturn Blue arrival").
- Audience sees: working steps, an answer, trace chips (KB · NSW term dates 2026, Domo · order_bank_eta, stock_by_site, inbound_pipeline), and buttons that change the build and the availability card.
- Say: "It combines a date from the knowledge base with ETAs from stock. A factory order will not make the school holidays, so it offers two real cars that will, each as a one-tap build change."
- Under the hood: /ask with citations and structured actions[] (pack, grade, unit). The agent calls Domo tools (stock, aged actions, ETA) mid-answer.
- If it goes wrong: if free text is typed without the API, expect the "not connected" message; use the chips.

## Beat 7: Languages (7:30-8:15)

- Click: "中文", re-ask the third chip; then "Tiếng Việt" and re-ask one chip.
- Audience sees: greeting, chips, trace labels and answer all in the chosen language, with the same stock facts and buttons.
- Say: "Same sources, same numbers. Only the language changes. The English documents answer the Vietnamese question."
- Under the hood: multilingual retrieval in the knowledge box; the agent answers in the language of the question. In the mockup the toggle translates the assistant panel only.
- If it goes wrong: go back to EN and say the panel language is a UI toggle in this build.

## Beat 8: How it works (8:15-9:00)

- Click: "How it works" (header). Show the overview diagram, then one feature such as "“How you can have this car”" or "Deadline reasoning", read its data contract, click "Show me on the page", then scroll to the changelog.
- Audience sees: a half-page drawer with five systems, an SVG diagram, "What the customer sees", "How it works", a data contract, and a version/changelog list.
- Say: "Each feature says what the customer sees, what powers it, and the contract. The page never calls the knowledge box directly; a small server holds the token."
- Under the hood: /api/health, /api/stock, /api/offers, /api/ask, /api/finder/next, /api/foryou, /api/find; Domo datasets.
- If it goes wrong: close the drawer with Escape and continue.

## Beat 9: Data layer (9:00-9:30)

- Click: "Data layer" toggle in the header, then "Find the right car" if you want the JSON.
- Audience sees: tags on every element ("Domo · stock_by_site", "Domo · aged_stock_actions · priority 1 · rank 1", "KB · price_list", "ARAG · /find · query"), and a raw JSON payload under each finder step with "ARAG · /ask · answer_json_schema".
- Say: "Every element names where its data came from. This is a review aid, not a customer feature."
- Under the hood: /find with model/* labels powers the "For you" rows ("Because you tow").
- If it goes wrong: toggle it off and on.

## Beat 10: Close (9:30-10:00)

- Click: nothing. Return to the stage.
- Say: "The knowledge and conversation are real and run on Progress Agentic RAG. The Domo data is stand-in files shaped like the datasets we would connect. Next steps are a real Domo connection and DMS write-back, so Reserve and Hold create a lead and a hold against the VIN."
- Under the hood: replace the stand-in datasets with the Domo API; write leads and holds to the DMS.
- If it goes wrong: finish with the real-vs-simulated table.

## Likely audience questions

1. **Is the discount real?** No. The bonus figures are illustrative. In production the amount is capped by incentive_headroom from your own margin data, and the dealer policy requires the bonus as a separate quote line.
2. **Where does the data live, and what reaches the browser?** Stock lives in your DMS and Domo; knowledge lives in the knowledge box. The browser receives answers, stock summaries and offers from the API server. The server holds all tokens; none is in the page.
3. **How do you add a new model?** Add a markdown resource with model and topic labels and re-ingest it. It then feeds answers, /find rows and the finder.
4. **What languages?** The agent answers in the language of the question and retrieval is multilingual. This build shows English, Chinese and Vietnamese in the assistant panel; the page chrome is English.
5. **How does it connect to our DMS?** Via Domo dataflows that publish stock and ageing datasets, and a write-back API for leads and holds. The write-back is not built yet.

## Known hazards before demo day

- RAV4 grade answer ("GXL or Cruiser?") says Cruiser is "about $6,000 more". catalog.json has GXL $54,390 and Cruiser $62,790, a difference of $8,400. Fix the script or avoid quoting it.
- Holiday answer says a factory order "lands mid-February". order_bank_eta for RAV4 says 14 to 18 weeks with the note "March slot", and the HOW drawer diagram says "late Feb". Three sources, three dates.
- The four scripted answers are RAV4-centric regardless of the current build. After the finder, a Prado build with the tow chip still talks about the RAV4 first. Switch to RAV4 before beat 6.
- The Prado GXL carries the Towing Pack already, so the "auto-added" pack is not visible there. The scripted tow answer's "Add the Towing Pack" button is a no-op on that build.
- Prado and HiLux score the same under the local engine (tie-break by catalogue order), so the best match is rule-order dependent. Check it live.
- "Stock refreshed 6 min ago" in the grade answer is hardcoded. The Domo files say refreshed at 06:00 on 13 Oct.
- The HOW drawer's data contracts (e.g. next_slot_month, weeks_low, vin, site_id) do not match the stand-in field names (eta_weeks_min, id, site). Avoid reading them aloud as exact schemas.
- The "2 here" example in the brief does not occur in this stock set. Counts of 1 are typical; do not promise a 2.

## Used surface (/used): six beats, about 6 minutes

Added 17 Oct 2026. Spec: `docs/USED-SPEC.md`. Platform framing: `docs/PLATFORM.md`. Open `/used/` in one tab and `/dms/#/leads` (logged in as `sm.par@harbourline.demo`) in another before you start. Check the LIVE badge; if it reads OFFLINE, the listing and VDP still render from inlined data but beats 1, 3, 4 and 5 lose their agent parts.

### Beat U1: Listing and semantic sort (0:00-1:00)

- Click: the search box in the filter rail; type "something that tows a caravan and seats seven"; leave sort on Most Relevant.
- Say: "This is the page every dealer has: filters, sort, a Certified toggle, a price excluding government charges. The difference is the order. Most Relevant is not a keyword match; the query runs against the knowledge box, where every car on this page is a resource with its own text, metadata and photo."
- Under the hood: `GET /api/used?q=…&sort=relevant` runs ARAG `/find` over the `topic/used` resources, then applies the structured filters on top. The result count shows the query time.
- If it goes wrong: clear the query; the list falls back to recency order and the count still shows.

### Beat U2: Agent-written comments on a car (1:00-2:00)

- Click: View Details on the Kluger (or any Certified car). Scroll to the comments block and the provenance panel.
- Say: "Nobody at the dealership typed these comments. The agent wrote them from this car's own record: the inspection, the service history, the PPSR check, the warranty. It is only allowed to say what is in the record, the server checks that, and it has to include the honest notes, which is why you can see the stone chips."
- Under the hood: `scripts/used-comments.mjs` ran `/ask` with `answer_json_schema` filtered to the unit's resource; the result was validated against the record and cached in `content/used/comments.generated.json`. The trace line under the comments names the sources.
- If it goes wrong: a car without a generated set shows the scripted version, labelled as such.

### Beat U3: Ask, leave, come back (2:00-3:00)

- Click: in the assistant pane on the same VDP, ask "has it had its 60,000 km service?" then "what tyres are on it?". Click back to the listing.
- Say: "Two questions, both answered from the car's provenance text with a citation. Now look at the card on the listing: it says I asked two questions about this car. Open it again and the questions are waiting, so I never start from scratch, and the agent carries them as context when I ask about the next car."
- Under the hood: `POST /api/used/:stockNo/ask` with the `x-sid` header stores the Q&A in `used_sessions.jsonl`; `GET /api/used/questions` feeds the card markers; the VDP shows "Your questions about this car".
- If it goes wrong: the marker depends on the session id in `sessionStorage`; stay in the same tab.

### Beat U4: Find what's right for me (3:00-4:00)

- Click: "Find what's right for me". Answer: under $45k, family, SUV, safety and running costs, this month.
- Say: "Same idea as the new-car finder, but the answers are real cars on real lots, ranked, with reasons the agent wrote and a watch-out for each. If fewer than three fit, it offers to watch the search and tell you when one arrives."
- Under the hood: `POST /api/used/match` is a scripted five-step interview; ranking is server-side over the stock file and the "why" lines come from `/ask`, scripted when the agent is unavailable.
- If it goes wrong: the scripted reasons still render; say so.

### Beat U5: For you, built from the journey (4:00-5:00)

- Click: return to the listing and scroll to the "For you" rows. Open the "What this page knows about you" strip.
- Say: "No login, no profile. The rows come from what I did in this session: the car I viewed, the questions I asked, the finder answers. Each row is a natural-language query over the car resources, and the strip shows exactly what it used. The forget button clears it."
- Under the hood: `GET /api/used/foryou` turns the session journey into `/find` queries; `DELETE /api/used/session` forgets it.
- If it goes wrong: a brand-new session has no rows; do beats U2 to U4 first.

### Beat U6: Enquiry lands in the back office (5:00-6:00)

- Click: on the VDP, Reserve Now $1,000; fill the form; submit. Switch to the DMS tab and refresh the leads list.
- Say: "No payment is taken in the prototype; the reserve is a 48-hour hold. What matters is where it lands: a lead in Revolution's back office with the car, the channel and everything the visitor asked, so the salesperson calls back already knowing the conversation."
- Under the hood: `POST /api/used/:stockNo/enquiry` creates a DMS lead (channel `web-form`, source `harbourline.com.au/used`) and a hold on the unit; the lead carries the session's questions.
- If it goes wrong: the lead list filters by site; pick the unit's site or log in as `gm@harbourline.demo`.

### Used-surface hazards

- Photos are library images of the model with a credit; the car's colour in the record matches the photo where we could. Say "library photo" if asked.
- PPSR, inspections and service histories are synthetic. Do not read a PPSR certificate number aloud as real.
- Comments generation runs offline; if stock was re-seeded without re-running the comments script, every card falls back to scripted text.


## Harbourline One (concept experience, `/concept/`)

Use this when the audience wants the whole picture rather than one surface. Open **Demo mode** from the band first: every feature powered by the knowledge layer or Domo gets a numbered pin, and each pin opens its card in **What powers this** with a Demonstrate button that fires the real call.

1. **Front door, any language.** Type "有没有七座的混合动力车？" in the big input. The assistant answers in Chinese with citations from the used listings. Say: one English corpus, every language.
2. **For you.** Point at "Picked from your visit": rows built from what this device viewed and asked, with the retrieval query shown. Click Forget me to show it is session memory, not a profile.
3. **Rich search.** Browse with "something to tow a caravan": new and pre-owned interleaved, "semantic match · ARAG /find" in the header, compare three cars in the tray.
4. **Product view.** Open the 2024 HiLux Rogue: agent-written comments "from this car's own resource", provenance, market position from Domo, price with receipts, Book a drive to the three salesperson questions and the handover preview.
5. **Find my car.** Five branching questions; results mix new grades with a Domo nudge ("why Harbourline can make this easy now") and used units with fit.
6. **Value my car and Own.** Both labelled MOCK where no integration exists; "Ask your car" is live from the knowledge box. Finish on the What-powers-this summary strip: resources in the knowledge box, sessions, asks, bookings and enquiries from the report datasets.
