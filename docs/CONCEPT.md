# Harbourline One: the concept experience (storyboard and build contract)

Owner: PM. Engineering: Head of Product Engineering. Started and first built 17 Oct 2026 (all seven scenes, assistant, five languages, powers drawer; see §4 for live vs mock). Route `/concept/` on the Fly app (`public/concept/`), also published as a multi-file artifact. Mock-up of the fully styled customer experience that one dealer knowledge layer (Progress Agentic RAG) plus Domo intelligence can power. Live where the API already exists, mocked and labelled where it does not.

## 1. Promise

One front door for a dealer group that covers new, used and ownership, speaks the visitor's language, remembers the visitor's journey, answers with citations, and shows its working. Every idea from the configurator, the used surface, the research parity spec (P-series parity features, B-series beyond-the-bar features) and the platform thesis (`docs/PLATFORM.md` §5 twelve moves) appears somewhere in the five scenes below, and the "What powers this" slide-out explains and demonstrates the Agentic RAG and Domo features behind each one.

## 2. Theme

Harbourline is a premium Sydney dealer group. Warm off-white canvas, charcoal type, one accent red used only for actions, deep navy for the Progress band. Display face Manrope, body Inter. Large imagery, hairline borders, 10 px radius, calm motion (200 ms), dark mode via tokens. Phone first, then 1440. Tokens live in `public/concept/concept.css`; every file uses them and nothing else.

## 3. Scenes (hash routes)

| Route | Scene | What is in it | Ideas it carries |
|---|---|---|---|
| `#/` | **Front door** | One input in any language ("Tell us what you need"); language pills; three doors (Find my car, Browse what is here, Build new); "For you" rows from the journey; offer tiles chosen by Domo signals with the reason shown; "Happening at Harbourline" (school-holiday timing, arrivals this week from inbound pipeline); trust strip (citations, data layer, no account) | P-series natural-language search; B-series for-you rows, dealer-signal offers with reasons, transparency |
| `#/browse?q=…&…` | **Rich search** | Unified results across new models, used units and factory orders; semantic ranking with the query echoed; facets generated from the hits; cards with agent reason + citation chip + availability by site + market position (used) or drive-away (new); compare tray (up to 3); "Watch this search"; empty state offers the finder | used U2/U11, configurator for-you, P compare, P certified toggle |
| `#/car/:id` | **Product view** (new model `m:rav4` or used unit `u:U-33002`) | Gallery with credit; headline price with "Excl. Govt. Charges" or drive-away by postcode; new: build rail (grade, colour, interior, packs) with live availability per site and transfer days, order ETA; used: provenance panel, agent comments with trace, market position; both: assistant pinned to the car with memory, "price with receipts" breakdown, illustrative finance panel (repayment slider, Toyota Access/GFV explainer), compare with two nearest alternatives, actions: Book a drive (3 salesperson questions, handover sheet preview), Reserve (48 h hold), Enquire, Watch; accessories fitment advisor | configurator build/availability/offers/booking; used comments/provenance/memory/reserve/watch; P finance tabs, P 360 imperfections (mock callouts), B handover sheet, move 9, move 11 |
| `#/finder` | **Find my car** | The branching interview across new and used in one flow (budget, use, follow-up, priorities, timing), results mixing new grades and used units with fit, why, watch, nudge reason | configurator finder, used finder, B dealer nudges |
| `#/value` | **Value my car** | Rego or make/model/year → instant estimate range with line-item deductions and "what would raise it"; drag-in document upload (service book, photos) that "reads" the book (mock of DMS extraction); offer valid 7 days; Offer Watch; applies the trade to any car's price | move 1, P instant valuation |
| `#/own` | **Own** (owner mode) | Pick a demo owner (Priya Raman, RAV4 Cruiser delivered 21 Oct): delivery tracker (order → built → shipped → landed → ready), handover pack, "Ask your car" (manual answers live from the KB), next service and recall status, service booking with recall awareness and loan-car rule, equity clock toward trade-cycle renewal with a one-tap replacement build, warranty balance | moves 2, 3, 4, 10; P order tracker; P ownership portal |
| overlay | **Assistant** | Persistent thread (button bottom right, slides in). Acts, not only answers: change build, apply a filter, open a car, book, reserve, watch, switch language. Every turn shows trace chips (KB sources, Domo datasets, memory recalled). Voice input where the browser allows. Auto-detects language from the question | configurator /ask actions, used memory, B one assistant |
| overlay | **What powers this** | Slide-out from the band. One card per use case: Multilingual, Personalised shopping, Conversational shopping, Rich search, Product view, Pricing and offers, Value my car, Ownership, Back-office hand-off. Each card: what the visitor sees; Agentic RAG features (labels and metadata, /find, /ask with JSON schema, extra_context, context agents, document processing, MCP, multilingual generation); Domo datasets (stock_by_site, aged_stock_actions, transfer_feasibility, inbound_pipeline, order_bank_eta, dealer_signals, used_market_prices, configurator and used reports); **Demonstrate** button: live cards fire the real call and show response + trace; mocked cards play a scripted response marked MOCK. **Demo mode** toggle highlights every hotspot on the page with a numbered pin; clicking a pin opens its card | all |

## 4. Live or mock

Live now (existing endpoints): catalog, stock and availability, offers and promotions with reasons, `/api/ask` and `/api/used/*/ask` with actions, `/api/find` and `/api/used?q=`, `/api/foryou` and `/api/used/foryou`, finder (`/api/finder/next`, `/api/used/match`), test-drive slots/book/answers/handover, used reserve/enquire/watch, used comments and market position, `/api/report/*`, `/api/images`.
Mock (client-side, labelled MOCK in the UI and in the powers card): valuation and document reading, finance repayment maths (illustrative formula), delivery tracker, recall status, service booking, equity clock, 360 imperfection call-outs, voice (real Web Speech API when available, else disabled).

## 5. Files and ownership

```
public/concept/
  index.html        shell: band, header, scene root, assistant drawer, powers drawer, demo-mode pins   (coordinator)
  concept.css       theme tokens, layout, shared components                                            (coordinator)
  app.js            HL namespace: state, api, i18n, router, ui helpers, powers registry, bus           (coordinator)
  data/snapshot.json offline snapshot of catalog/stock/used/promotions for the artifact                (coordinator, scripts/concept-snapshot.mjs)
  scenes/home.js    front door                                                                         (Agent A)
  scenes/browse.js  rich search + compare tray                                                         (Agent A)
  scenes/product.js product view new + used, finance panel, booking flow, accessories advisor          (Agent B)
  scenes/finder.js  unified finder                                                                     (Agent B)
  assistant.js      conversational overlay, actions, voice, language detection                         (Agent C)
  i18n.js           string bundles en, zh, vi, ar, hi for every HL.t key used across the files         (Agent C, last)
  scenes/value.js   value my car (mock)                                                                (Agent D)
  scenes/own.js     owner mode (mock + live manual answers)                                            (Agent D)
  powers.js         What-powers-this cards, Demonstrate wiring, demo-mode pin content                  (Agent D)
```

Rules: a file is edited only by its owner. Scenes register themselves with `HL.scene(name, {mount, unmount})`; the shell loads every file with ordinary `<script>` tags in the order above, so a scene may call anything on `HL` but must not call another scene's internals. Strings go through `HL.t('scene.key', 'English default')`; Agent C collects the keys at the end. Hotspots: wrap a feature's root element with `HL.spot(el, 'powerId')`. Powers cards: `HL.powers.register({...})` in `powers.js` only; scenes refer to ids: `multilingual, personalised, conversational, search, product, pricing, value, own, backoffice`.

## 6. The HL contract (app.js)

- `HL.state`: `{ lang, theme, sid, postcode, compare:[ids], journey:{viewed:[], asked:[], answers:[], watches:[]}, build:{modelId, gradeId, colourId, interiorId, packs:[]} }` persisted in sessionStorage; `HL.set(patch)` emits `state`.
- `HL.api(path, {method, body, timeoutMs})` → parsed JSON, throws `HL.ApiError` with `.status`; adds `x-sid`, `content-type`; `HL.online` boolean after `/api/health`.
- `HL.data` → `{catalog, stock, used, promotions, offers}` loaded once (live, else snapshot). `HL.model(id)`, `HL.unit(stockNo)`, `HL.money(n)`, `HL.km(n)`, `HL.img(modelId, size)`.
- `HL.t(key, fallback, vars)`; `HL.i18n = { en:{}, zh:{}, vi:{}, ar:{}, hi:{} }`; `HL.setLang(code)` flips `dir` for `ar`.
- `HL.go(hash)`, `HL.route()` → `{name, params, query}`; `HL.scene(name, def)`.
- `HL.ui.el(tag, attrs, children)`, `HL.ui.card(cardData)` (a product card for a model or a unit with reason, citation chip, availability, market), `HL.ui.chip(text, kind)`, `HL.ui.trace(items)`, `HL.ui.skeleton(n)`, `HL.ui.toast(text)`, `HL.ui.sheet(title, bodyEl, actions)` (modal), `HL.ui.empty(text, actionLabel, onClick)`.
- `HL.assistant.open(prefill?)`, `HL.assistant.ask(question, {scope:{kind:'model'|'unit', id}})`, `HL.assistant.onAction(fn)`; `HL.bus.on(event, fn)`, `HL.bus.emit(event, data)`; events: `state`, `route`, `journey`, `assistant:action`, `powers:demo`.
- `HL.powers.register(card)`, `HL.powers.open(id?)`, `HL.powers.demoMode(on?)`; `HL.spot(el, id, label?)`.
- `HL.track(type, data)` posts first-party events where the server accepts them (`used_view`, `build_change`, `offer_view`, `offer_click`) and records the journey locally for everything else.

## 7. Honesty rules

Same as the other surfaces: label every mock, every library photo and every illustrative price; show where numbers come from; no payment; no PII leaves the browser except an enquiry the visitor submits.
