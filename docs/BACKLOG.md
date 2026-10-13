# Backlog

Owner: PM. Engineering triage: Head of Product Engineering. Snapshot: 13 Oct 2026.
Priority key: **P0** blocks the customer demo or breaks a stated requirement or honesty rule. **P1** visible gap or quality issue to fix before a dealer pilot. **P2** polish.
IDs are referenced from `docs/REQUIREMENTS-TRACE.md`. Owners: FE = `src/configurator.html`, BE = `server/` + `scripts/`, CR = content researcher (`content/`).

## P0

| ID | Area | File | What is missing or wrong | Suggested fix | Owner |
|---|---|---|---|---|---|
| BL-P0-01 | R7, R1b, R9 | `Dockerfile`, `nginx.conf`, `fly.toml`, `server/` | **Update 13 Oct (late):** `server/` has now landed (`index.mjs` with `/api/health, catalog, stock, offers, ask, finder/next, foryou, find`; `arag.mjs` with timeouts; `data.mjs` Domo stand-in/live adapter; `foryou.mjs` using `/find`). What remains is P0 for the demo: the `Dockerfile` is still `nginx:1.27-alpine` serving `public/` only, so the **deployed** Fly app has no `/api/*` and the page stays in fallback. The retrieval agent's HTTP context (`provision.mjs`) calls `{PUBLIC_URL}/api/stock`, which only works once the server is deployed. This trace has not yet verified it end to end. | Switch to a Node 20 image running `server/index.mjs` (serving `public/` too); set Fly secrets (never `COPY .env`); deploy; re-run `node scripts/provision.mjs agent`; smoke-test `/api/health` and one `/ask`, `/finder/next`, `/foryou` from the page; then update `REQUIREMENTS-TRACE.md`. | BE |
| BL-P0-02 | R4 | `src/configurator.html` `localNext()`; server `/api/finder/next` | "Each question driven by the one before" is only half met. In the local engine only Q2 branches; Q3 to Q5 are always power → budget → when. The `/ask` + `answer_json_schema` path is not implemented. | Server: call `/ask` with `answer_json_schema` (question or recommendations), passing the finder-guide resource, all answers so far and `lang`; validate ids against the `FQ` vocabulary and catalogue. Local engine: make Q3 to Q5 conditional (e.g. tow → `power` options limited to diesel/hybrid with tow notes; work+site → `terrain`; family+more → `priorities` safety/space), and filter budget bands to those with eligible models. | BE + FE |
| BL-P0-03 | R8, R4 | `src/configurator.html` `tagRows()` and `localRecs()` | Tag vocabulary mismatch with `catalog.json`. The page checks `offroad`, `seven` and `distance`, but the catalogue has `off-road`, `seven-seats` and no `distance`. Result: the customer's own example row "Because you go off-road" **never renders**, and finder scoring ignores off-road and long-distance. The off-road row is also triggered by any `worktype` (including "Client visits") instead of off-road intent. | Use catalogue tags (`off-road`, `seven-seats`); add `distance`/`touring` mapping; trigger the off-road row from `use=tow`, `worktype=site`, `terrain` or a model tagged `off-road`; add a unit test that every tag used in the page exists in the catalogue. | FE |
| BL-P0-04 | Honesty (NFR5/6), R2, R9 | `src/configurator.html` | The page claims things it does not do. (a) "stock refreshed 6 min ago" and "ranked 6 min ago" are hard-coded, while the drawer says "the page shows the dataset's refreshed_at … so the number is honest". (b) Rows are labelled `ARAG · /find · "…"` even when they come from local tag matching. (c) The drawer changelog v0.5.0 says "Knowledge box provisioned; API server for /ask, /finder, /foryou, /find", but no server exists. (d) The assistant badge says "LIVE" in fallback mode. | Compute freshness from `STOCK.refreshed_at`. Label fallback rows "local match (offline)". Show "LIVE" only when `API===true`, otherwise "OFFLINE DEMO". Edit the changelog to say what shipped. | FE |
| BL-P0-05 | Demo beat "holidays", R6 | `src/configurator.html` `T.*.q.holiday`, `FQ.when` | The scripted answer (EN/ZH/VI) says "NSW school holidays start on Saturday 19 December", and the finder note says "NSW holidays start 19 December". The KB (`nsw-school-term-dates-2026.md`) says Term 4 ends Thursday 17 December and summer holidays start **Friday 18 December 2026**. The answer cites "KB · NSW term dates 2026" while contradicting it. The same answer says a RAV4 factory order "lands mid-February"; `order_bank_eta` says 14 to 18 weeks (19 Jan to 16 Feb) with note "March slot", and the drawer diagram says "late Feb". | Use "Friday 18 December" (last school day Thursday 17 December) in all three languages and the finder note. Pick one RAV4 ETA story (recommend: "14 to 18 weeks, so late January at the earliest and more likely February") and make the data note, scripted answer and diagram agree. | FE + CR |
| BL-P0-06 | Demo beat "GXL or Cruiser", R6 | `src/configurator.html` `T.*.q.grade`, `FALLBACK_CATALOG` | The scripted answer says Cruiser is "about $6,000 more" than GXL. In the catalogue, GXL is $54,390 and Cruiser $62,790, a difference of **$8,400**. `FALLBACK_CATALOG` is stale across the board: RAV4 GX $42,990 vs $51,190; Yaris Cross $30,990 vs $37,390; Corolla tow 450 kg vs 0 kg (not rated); bZ4X 71 kWh / 516 km / 750 kg vs 74.7 kWh / ~590 km / 1,500 kg. The finder EV note still says "516 km range", and the EV "why" says "around 500 km". If `__DATA__` fails to load, the page shows a different price list from the KB. | Fix the scripted figure to "about $8,400" in all three languages (or generate it from the catalogue). Regenerate `FALLBACK_CATALOG` from `catalog.json` at build time (or delete it and rely on `__DATA__`). Replace the hard-coded range strings with catalogue values. | FE |
| BL-P0-07 | Content | `content/catalog.json`, `content/kb/*` | Content QA P0 items CQ-01 to CQ-03 below (HiLux GR Sport placeholder priced as real, unverified free roadside claim, "Australia's favourite/best-known" superlatives in catalogue blurbs that the assistant will quote). | Fix per item, then re-run `scripts/ingest.mjs` and `scripts/build.mjs`. | CR |

## P1

| ID | Area | File | What is missing or wrong | Suggested fix | Owner |
|---|---|---|---|---|---|
| BL-P1-01 | R7 | `scripts/provision.mjs` | The KB driver config embeds the KB SOWNER token (`key: token`) in the agent. That is acceptable server-side, but it is over-privileged for read-only retrieval. | Mint a reader (SMEMBER) token for the driver. | BE |
| BL-P1-02 | R7 | `server/data.mjs` | **Largely addressed:** `data.mjs` has a Domo OAuth + SQL path and a stand-in path. To do: verify `/api/health` reports the mode, and document the dataset ids. | Make one module expose `getStock()`, `getAgedActions()`, `getEta()`, `getTransfers()`, `getInbound()`, backed by `content/domo/*.json` or the Domo API (client id/secret + dataset ids). `/api/health.domo` reports the mode. | BE |
| BL-P1-03 | R1d | `src/configurator.html` `SITES` | The page hard-codes site names, distances and transfer days, ignoring `transfer_feasibility.json` and `stock_by_site.sites`. Also `wayRow` labels nearby units "Domo · transfer_feasibility" when that dataset is not read. | Build `SITES` from `stock_by_site.sites` + `transfer_feasibility.rows` in `normaliseStock()`; show `lead_days`. | FE |
| BL-P1-04 | R1d | `content/domo/order_bank_eta.json` | 11 rows for 15 models: Fortuner, GR Yaris, GR Corolla and GR86 are missing, and the page silently defaults them to 12 to 18 weeks. | Add rows; the page should show "ask us" when no ETA exists rather than inventing one. | CR / BE |
| BL-P1-05 | R1c | `src/configurator.html` | Multilingual covers the assistant only. The finder, rows, offers, build rail and toasts are English. `/api/finder/next` and `/api/foryou` get no `lang`. "Detected: English" is not detection. Only the 4 chips work offline in zh/vi. | Pass `lang` to all API calls and ask the agent for questions in that language. Add an i18n bundle for page chrome (at least the finder `FQ` and section headings). Change the note to "Answering in English. Type in any language." | FE + BE |
| BL-P1-06 | NFR3 | `src/configurator.html` `askApi`, `finderNext`, `renderForYou`, `renderOffers` | No fetch timeouts. Once `API=true`, a KB outage makes `/ask` show an error with no scripted fallback, and finder steps can hang on the "Choosing the next question…" animation. | Add `AbortController` timeouts (10 to 15 s). On `/ask` failure for a chip question, fall back to `T[lang].q[key]`, marked "offline answer". | FE |
| BL-P1-07 | R2 | `src/configurator.html` band | `#openDrawer` has class `hide-sm`, so "How it works" disappears at ≤ 900 px; tablets and phones cannot open the drawer. | Keep it visible; shorten it to an icon plus "How" on small screens. | FE |
| BL-P1-08 | R2 | `HOW.features[].contract` | Drawer data contracts disagree with the stand-in files: `next_run_date/km/cost` vs `run_day/distance_km/lead_days/transfer_cost`; `weeks_low/high` vs `eta_weeks_min/max`; `eta_date/stage(built/shipped/landed)` vs `eta_days/stage:on_ship`. `aged_stock_actions` has no `valid_until`/`days_of_supply` in the data. | Align the contract text to the files (or the files to the contract), then keep them in one place. | FE + BE |
| BL-P1-09 | R5, NFR5 | `renderOffers`, `localOffers`, `aged_stock_actions.json` | Offer honesty gaps: no validity date; no "illustrative pricing" footnote; reason text for under-60-day units ("more of these than we need") is invented by the page rather than taken from `reason_code`; `recommended_action` placements (stage_strip vs build_ribbon) are ignored, and the ribbon just picks the first offer. | Map `reason_code` → customer copy (aged_90d, aged_60d, days_of_supply); honour placement; add `valid_until` to the data and show "Offer ends Sun 19 Oct"; add a footnote. | FE + CR |
| BL-P1-10 | R8 | `askApi`, `renderForYou` | The "Because you…" row reasons are not passed to `/ask` as extra context, which R8 requires. | Include `{rows:[{id,title,query}]}` in the `/api/ask` body; the server adds them to `extra_context`. | FE + BE |
| BL-P1-11 | R9 | page + server | There is no user-driven `/find` entry point; R9 asks for both user and programmatic queries. | Add a "Search the range" input (or route "show me…" questions) to `/api/find?q=` and render the hits as a row "Because you searched '…'". | FE + BE |
| BL-P1-12 | R1 | `src/configurator.html` `T.*.q.*` | All four scripted answers assume a RAV4 build. If the presenter is on another model, "Can it tow my caravan?" still answers about the RAV4. | Show model-specific chips, or prefix answers with the model and only show RAV4 chips when the model is RAV4 in offline mode. | FE |
| BL-P1-13 | R4 | `localRecs()` | The "Under $45k" band with a 0.9 lower bound and `fits[fits.length-1]` picks the most expensive grade in the band, so recommendations skew to top grades. The fit % is cosmetic (`55+s*5`). Ties (Prado vs HiLux) are resolved by catalogue order. | Pick the grade closest to the band midpoint; break ties by availability; show "fit" only when the agent supplies it. | FE |
| BL-P1-14 | R6 | `src/configurator.html` `FQ.power.why` | "Toyota has hybrid in most of the range, one full EV" is stale if the new HiLux BEV / bZ4X Touring are on sale. | Generate it from the catalogue powertrains. | FE / CR |
| BL-P1-15 | Process | `README.md` | The README names "Harbourline Ridge Configurator", "Kestrel and Ridge" and "open public/index.html", and does not mention the API server or scripts. | Rewrite the README with the run, provision, ingest and deploy steps. | BE |

## P2

| ID | Area | File | What | Suggested fix |
|---|---|---|---|---|
| BL-P2-01 | R3 | page | No side-by-side visual QA against the arag-doc-processing reference. | Screenshot review at 375/768/1180/1440 in light and dark. |
| BL-P2-02 | NFR8 | `answersChips()` | Answer chips are `<span data-back>`, so they are not keyboard-focusable. | Render them as buttons. |
| BL-P2-03 | R1 | `priceOf()` | Dead code (`if(g.leather&&…)p+=0`). The interior price logic is unclear. | Simplify; unit-test the price against the catalogue. |
| BL-P2-04 | R8 | `tagRows()` | "Because you like Atomic Rush": the customer's example is "because you like red". | Add `family` (red/white/blue/black/grey/green/bronze) to `catalog.colours`; title "Because you like red" with the paint name in the subtitle. |
| BL-P2-05 | NFR1 | `README.md` | Stale names (see BL-P1-15). | — |
| BL-P2-06 | R2 | `HOW` | There is no drawer section for the stand-in Domo and retrieval agent HTTP context. | Add a "Domo today vs Domo live" section. |
| BL-P2-07 | R1 | `wayRow` | Toast-only buttons ("Reserve this one") give no "prototype" cue until clicked. | Fine for a demo; consider a subtle "(demo)" suffix. |
| BL-P2-08 | R10 | repo | No release checklist tying the version, changelog and trace to each change. | Add a Definition of Done to the PRD and check it in PR review. |
| BL-P2-09 | Content | `scripts/provision.mjs` | The `model` labelset colour is `#e2001a` (Toyota red). | Use a kit token colour. |

## Content QA

Pass by an Opus sub-agent over `catalog.json`, all `content/kb/*.md` and `content/domo/*.json`; PM spot-verified the starred items with grep. **What is good:** every spec-file drive-away price matches `catalog.json`; every `fromPrice` equals the cheapest grade; drive-away arithmetic (list + dealer delivery + NSW duty + rego + CTP) reproduces within about $330; every Domo unit's model, grade, colour, interior and pack exists in the catalogue; there are no Toyota images, logos or asset URLs anywhere in content or `public/` (toyota.com.au appears only as source citations in `content/README.md`); there are no Toyota slogans. LC300, Prado 250, Kluger, HiLux (2.8 range-wide, 48V on autos, 3,500 kg), the warranty core (5 yr unlimited km, 7 yr engine/driveline, 10 yr hybrid battery) and the NSW duty formula all look right. The five articles the README promised (finance, safety, dealer policy, NSW term dates, finder guide) now exist (31 files).

### P0

| ID | File | Issue | Fix |
|---|---|---|---|
| CQ-01 | `catalog.json` hilux `gr-sport` ($81,890) | This is a placeholder variant that the content README admits is unconfirmed, yet it is priced and offered like a real grade. | Replace it with Rugged X (confirmed; the KB already describes it), or remove it. |
| CQ-02* | `kb/warranty.md` L38-40 | "Toyota Roadside assistance is provided for the warranty period … can extend to seven years" is unverified, and roadside is generally a paid membership in Australia. The assistant will repeat it as fact. | Remove it, or verify it and cite the source. |
| CQ-03* | `catalog.json` rav4/hilux `blurb`; `grades-hilux.md` L31; `grades-kluger.md` L33 | Marketing superlatives that cannot be backed in a dealer tool (Australian Consumer Law risk): "Australia's favourite mid-size SUV", "Australia's best-known ute", "Australia's most familiar HiLux grade and has strong resale value", "feels genuinely upmarket". | Rewrite them as factual statements. |
| CQ-04 | page vs KB | Holiday date and RAV4 ETA (BL-P0-05) and the GXL/Cruiser gap (BL-P0-06) are the demo-visible inconsistencies. | See the FE items. |

### P1

| ID | File | Issue | Fix |
|---|---|---|---|
| CQ-05 | `catalog.json` `towKg` | The headline towing figure is the maximum for the range, shown next to a from-price for a lower-rated variant: RAV4 1,500 kg vs GX 2WD about 800 kg; bZ4X 1,500 vs FWD 750; HiLux 3,500 vs WorkMate 4x2. The finder uses `towKg` for scoring, so a buyer recommended a "RAV4 GX" could not tow 1,500 kg. | Add `towKg` per grade/drive (or `towKgMax` plus a per-grade value) and label it "up to". |
| CQ-06 | `catalog.json` grades with "2WD or AWD" | AWD is mentioned but not priced: about +$3,000 on Corolla Cross and about +$3,500 drive-away on RAV4, per the KB. Configured prices are 2WD prices. | Add a priced drivetrain option, or show "2WD price shown". |
| CQ-07 | `catalog.json`, `spec-camry.md`, `grades-camry.md` (verify) | Camry grade names: the current generation is Ascent / SX / SL. "Ascent Sport" is the previous generation. This also affects page fallback and Domo HL-2510. | Verify, then rename `ascent-sport` → `sx` throughout. |
| CQ-08 | `catalog.json`, `spec-gr-yaris.md` (verify) | GR Yaris GT/GTS grades at about $55-60k list look borrowed from GR86/GR Corolla naming; the current car has been a single grade at about $72k+ before on-roads. | Verify and correct. Remove the "BBS-style" wording. |
| CQ-09* | `spec-rav4.md` L25 (verify) | "About 143 kW combined" is below both the previous generation (160/163 kW) and the new-generation figures overseas. | Verify. |
| CQ-10 | `pricing-and-drive-away.md` | Quotes 2025-26 luxury car tax thresholds; October 2026 is FY2026-27. | Update the thresholds. |
| CQ-11* | `warranty.md` L18 (verify) | "Perforation 7 years regardless of servicing" row. | Verify or remove. |
| CQ-12 | `warranty.md`, `grades-camry.md`, `spec-camry.md` | Rideshare wording: the table says 5 yr / 160,000 km and the body says it "can affect cover". The Camry is pitched at rideshare drivers with no mention of the cap. | Use one wording, and add the cap to the Camry articles. |
| CQ-13 | `domo/order_bank_eta.json` | RAV4 note "March slot" vs 14-18 weeks (19 Jan to 16 Feb). Fortuner and the three GR models have no rows (BL-P1-04). | Fix the note and add the rows. |
| CQ-14 | `domo/stock_by_site.json` `bonus` vs `aged_stock_actions.incentive_headroom` | The internal incentive **ceiling** is shown to customers as the offer (same numbers). | Add an `approved_offer` field (≤ headroom); the page shows only that. See the CEO decision below. |
| CQ-15* | all `spec-*.md`, `towing-guide.md` | Internal notes in customer-facing text: "see content README", "(verify)", "confirm". The assistant may quote them. | Move them to frontmatter (`verify:`) or the README. |
| CQ-16 | `content/kb/` | No grade guides for LandCruiser 300 (6 grades), Yaris Cross, Corolla, C-HR, Fortuner, bZ4X, GR Yaris, GR86. | Write `grades-*.md` for at least LC300, Fortuner, C-HR and Yaris Cross. |

### P2

| ID | File | Issue | Fix |
|---|---|---|---|
| CQ-17 | `catalog.json` prado `gxl` | `leather:false`, but the highlight says synthetic leather-accented; Kluger GXL has `true` for similar trim. Domo HL-2150 (Prado GXL) is `fabric-black`. | Pick one rule and apply it to both. |
| CQ-18 | `domo/stock_by_site.json` HL-2104 | RAV4 Edge with `leather-black`, while Edge is `leather:false`; the $1,900 upgrade is not a real option on Edge. | Change it to the Edge's standard trim. |
| CQ-19 | `catalog.json` hilux | `seats: 5`, but the from-price variant is a 2-seat single cab. | Use per-grade seats, or "2-5". |
| CQ-20 | `catalog.json` c-hr | No `roof` pack, though `accessories.md` says SUVs get it. | Align. |
| CQ-21 | `towing-guide.md` | C-HR is listed in the 400-750 kg class but is rated 725 kg. | Add "(C-HR to 725 kg)". |
| CQ-22 | `grades-kluger.md` vs `spec-kluger.md` | GXL "$71,990 (est.)" vs "$71,990". | Make them match. |
| CQ-23 | `spec-hilux.md`, catalog blurb | "Updated HiLux" vs "new-generation HiLux". | Use "new-generation" throughout. |
| CQ-24 | `grades-hilux.md` vs catalog | SR body: "extra or double cab" vs "Double cab pick-up". | Align. |
| CQ-25* | `spec-gr86.md`, `catalog.json` gr86 `safety` | "EyeSight-based" is a Subaru trademark. Also "V-Active", "GR-DAT" and repeated "Advantage" program names. | Use plain descriptions. |
| CQ-26 | `domo/stock_by_site.json` `vin` | Fake VINs use real Toyota WMI prefixes (JTM, MR0…). | Use an obviously fictional prefix (e.g. `ZZZHL…`). |
| CQ-27 | `kb/*` vs catalogue | The KB describes variants not in the catalogue (RAV4 XSE/PHEV, HiLux Rugged X and BEV, bZ4X Touring, Corolla Cross GR Sport). Not covered at all: LandCruiser 70, HiAce. | Decide the scope (see the CEO decisions). |
| CQ-28 (verify) | various | C-HR outputs, bZ4X AC charging (22 vs 11 kW) and range, Fortuner fuel use (8.6 vs 7.6), Prado launch prices, GR service intervals, Toyota paint names applied uniformly to every model. | Verify in a fact pass before the customer demo. |

## Decisions needed from the CEO

1. **Deploy target (BL-P0-01).** `server/` exists now, but the container is still static nginx, so the public URL runs in fallback. Confirm that the backend engineer switches the Fly app to the Node server and re-provisions the agent's HTTP context before the next demo, and that the demo is presented only from that URL.
2. **What a customer sees as a discount (CQ-14).** Options: show `incentive_headroom` in full (simple, but exposes the ceiling), or add a Domo `approved_offer` field (recommended).
3. **Content scope (CQ-01, CQ-27).** Do the 15 configurator models stay fixed, or do we add confirmed new variants (HiLux Rugged X, RAV4 XSE/PHEV, bZ4X Touring)? The recommendation is to replace the HiLux GR Sport with Rugged X and keep the rest as KB-only.
4. **Finder fidelity (BL-P0-02).** Choose between a fully agent-generated next question (latency, variability) and agent-selected-from-a-bank with agent-written notes (recommended for demos).
5. **Fact sign-off owner (CQ-07 to CQ-11, CQ-28).** Who verifies Toyota facts before a customer demo? The recommendation is one owner and an "as of" date shown in the drawer.
