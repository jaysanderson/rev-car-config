# Engineering report: Harbourline Toyota Configurator

13 Oct 2026, from the Head of Product Engineering. Covers the Node server (`server/*.mjs`), the scripts, the Docker and Fly config, and the static front-end (`public/index.html`).

## 1. What was tested

| Area | How | Result |
|---|---|---|
| Syntax | `node --check` on every `server/*.mjs`, `scripts/*.mjs` and `tests/*.mjs` file | All pass |
| API contract | `node tests/smoke.mjs` (new). It starts the server on a free port with `.env` loaded, calls every endpoint with realistic and hostile payloads, and checks response shapes. Every modelId, gradeId, colourId and unitId returned must exist in `content/catalog.json` or the stock feed. It also fails if any `.env` secret appears in a response. | **22/22 pass locally** after the fixes below |
| KB ingest | `node scripts/ingest.mjs` (idempotent upsert) | 32/32 resources PROCESSED, 447 paragraphs, 0 failures |
| Live site (v6) | `node tests/smoke.mjs --base https://harbourline-configurator.fly.dev` | 19/22. The three failures are the defects fixed locally (§3), which are not deployed yet |
| Container | `docker build` + `docker run -p 18080:8080` | Builds. `/api/health` returns 200, `/` returns 200, the process runs as `node`, and the image contains no `.env` |
| Code review | Opus review of the server, scripts, Dockerfile and fly.toml | §3 and §5 |
| Front-end QA | Sonnet agent in Chrome against the static `public/`: finder (5 questions), recommendation, How it works, Data layer, 中文 and a chip question | §4. No console errors and no horizontal overflow at desktop width |

Real example responses: `docs/API-EXAMPLES.md`. Regenerate with `node tests/smoke.mjs --record docs/API-EXAMPLES.md`.

Latency observed with the live KB:
- `/api/ask` takes 7–10 s (one zh run took 18 s on Fly).
- `/api/finder/next` takes 10–15 s **per question**, so 55–75 s for the full five-step flow.
- `/api/foryou` takes about 1 s and `/api/find` about 0.2 s.

The finder latency is the biggest UX risk for a live demo (see §5).

## 2. Smoke-test results (local, after fixes)

```
GET  /api/health                         PASS  kb.resources=32 processing=0 domo=stand-in
GET  /api/catalog                        PASS  15 models
GET  /api/stock                          PASS  22 units, 1 inbound
GET  /api/offers (rav4, hilux, gr86)     PASS  6 offers each
GET  /api/offers unknown model           PASS  400
POST /api/ask en / zh / injection        PASS  4 cites + 3 actions; zh answer in Chinese; injection refused
POST /api/ask malformed JSON             PASS  400 JSON
POST /api/ask hostile types              PASS  200 (was 500)
POST /api/ask empty question             PASS  400
POST /api/finder/next family path        PASS  → corolla-cross/gxl, camry/ascent-sport
POST /api/finder/next tow path           PASS  → landcruiser-300/sahara, prado/gxl, hilux/sr5 (asserts top pick tows ≥ 2 t)
GET  /api/foryou                         PASS  3 rows, 17 items
GET  /api/find (2 queries, empty)        PASS  12 hits / 200 []
GET  /, /api/nope, /.env                 PASS  index / 404 JSON / SPA fallback (no .env content)
```

## 3. Defects fixed in server/, scripts/ and fly.toml

| # | Severity | File | Defect | Fix |
|---|---|---|---|---|
| 1 | High | server/index.mjs `/api/health` | Awaited two ARAG calls of up to 5 s each against a 5 s Fly check timeout. Failures were not cached. | Served from cache with a background refresh at most every 30 s. Failures are cached too. Only the very first call waits, capped at 2 s. |
| 2 | Med-high | server/assistant.mjs `buildText`, `finderText` | `build.packs:"x"` or `finder.answers:"abc"` threw TypeError, giving a 500 | Array guards. Finder answers go through `cleanAnswers()`. |
| 3 | Med | server/index.mjs | Malformed JSON or a body over 64 kb returned Express's HTML error page | `/api` error handler returning JSON (400 or 413) |
| 4 | Med | server/assistant.mjs `buildText` | Unresolved colour, interior and pack ids were put into the prompt verbatim, an injection path | Only catalogue-resolved names reach the prompt |
| 5 | Med | server/assistant.mjs `finderNext` | Client-supplied finder labels were put into the **system** prompt | The system prompt now carries only canonical `id = value` slugs (`[a-z0-9-]`) |
| 6 | Med | server/assistant.mjs `historyFor` | Any role other than `user` became an assistant turn (forgeable), 8 × 2000 chars | Accepts only `user` and `assistant`, capped at 1000 chars per turn and 4000 in total |
| 7 | Med | server/index.mjs `/api/offers` | An unknown model returned every aged offer. `body` was unvalidated. | Unknown model returns 400. `body` is whitelisted against catalogue body types. |
| 8 | Med | server/index.mjs | LLM endpoints had no rate limit, and `trust proxy: true` let clients spoof the IP | Per-IP token bucket keyed on `Fly-Client-IP` (burst 30, 20/min; env `RATE_BURST` and `RATE_PER_MIN`) on ask, finder, foryou and find. `trust proxy` set to 1. |
| 9 | Low | server/assistant.mjs `validRecs` | LLM `why` and `watch` strings had no length cap | Capped at 200 chars |
| 10 | Lead request | server/index.mjs static | `index.html` was served with `max-age=300`, so browsers showed a stale page after deploys (live check: `cache-control: public, max-age=300`) | `.html` and the SPA fallback are served `Cache-Control: no-cache`. Other assets keep 5 minutes. |
| 11 | Low | server/index.mjs `VERSION` | The Fly suffix rendered as `+deployment-0` | Now the last 8 characters of the image ref |
| 12 | Low | scripts/ingest.mjs `req()` | No fetch timeout | `AbortSignal.timeout(30000)` |
| 13 | High | fly.toml | Health check timeout of 5 s | Raised to 10 s |

Originals are backed up outside the repo. The diff is confined to `server/index.mjs`, `server/assistant.mjs`, `scripts/ingest.mjs` and `fly.toml`.

Earlier in the session the smoke run hit ECONNREFUSED part-way through on 3 runs. That happened while the backend engineer was still editing and running the server, and it has not recurred in 5 runs since. The harness now logs the child's exit code and signal if it happens again.

## 4. Front-end defects (for the CEO; `src/configurator.html`)

1. **Hero/stage collapsed to about 40 px in the 3-column desktop layout.**
   - `.pane.stage` is a scrolling flex column and `.hero` has `overflow:hidden`, so the hero flex-shrinks to 40 px and the price was cut in half. Confirmed in the browser.
   - **Status: already patched in current src at line 161** (`.pane.stage>*,#stageView>*{flex:none}`), and `public/index.html` contains it. Re-check visually after the next build.
2. **Finder says "fits your budget" for grades below the chosen band** (line 774). The `$45k to $65k` band showed "Urban fits your budget at $42,690", because the filter allows `lo*0.9`. Proposed patch:
   ```js
   why.push(grade.name+(grade.price<lo?' comes in under your budget at ':' fits your budget at ')+fmt(grade.price));
   ```
   This only affects offline/local mode. The server path uses the agent's ranking.
3. **中文 switches only the assistant panel.** Nav, finder, offers and "For you" stay in English, and the Chinese greeting quotes the English "Find the right car" label.
   - This is arguably by design, since the toggle is the assistant language. Either label the switch "Assistant language", or add `T[lang]` strings for the five header and CTA labels.
4. **"Data layer" click right after closing the How it works drawer was ignored once**, and a second click worked.
   - Low confidence, probably the drawer's closing transition intercepting the click. If it reproduces, set `pointer-events:none` on the drawer/backdrop while it is closing.
5. **Not tested:** mobile 390 px. The Chrome tool could not change the layout viewport. Check manually in DevTools before the demo.

No console errors at any step. Screenshots are in the QA scratchpad (`…/scratchpad/qa/screenshot-*-N.jpg`; N=0 is the initial load, 3 the finder results, 5 How it works, 7 Data layer on, 9 the 中文 answer).

## 5. Open items (not fixed; consider)

- **Finder latency of 10–15 s per question.**
  - Option 1: ask the agent only for the final ranking and serve questions 1–4 from `finder-fallback.mjs`, which is instant.
  - Option 2: lower `topK` and the timeouts in `finderNext`.
- **Dealer-internal data is public.**
  - `/api/stock` returns VIN, `incentive_headroom`, `recommended_action` ("manager-approved bonus"), `transfer_cost` and `move_priority`.
  - `stockSummary` puts "bonus headroom" into the LLM context, so the assistant may quote dealer margins to customers.
  - Fix: whitelist fields in `stockPublic`, and protect `/api/stock?q=` (used by the ARAG context agent) with a shared-secret header.
- **Request timeout does not abort upstream work.** `res.setTimeout(45000)` sends a 504 but does not abort ARAG fetches, and the handler later logs "Cannot set headers". Pass a per-request `AbortController` (abort on timeout and on `req.close`) into `arag.call`.
- **Live Domo mode** (not active):
  - The 5 dataset queries run sequentially at 10 s each, plus auth, which can exceed 45 s.
  - Nothing is cached and there is no in-flight de-duplication.
  - Use `Promise.all`, cache for 60 s, and keep a single in-flight promise.
- **`/api/foryou` echoes the raw `answers` query into `reason`.** It is escaped by the front-end, but should be whitelisted to the vocabulary.
- **Grade actions are returned without their model id.** Add `model` to grade actions.
- **`/api/health` exposes the KB id and counters.** These are not secret, but unnecessary.
- **Graceful shutdown:** add `server.closeIdleConnections()` and an 8 s exit fallback.
- **Node 20 is end-of-life** (Apr 2026). Consider `node:22-alpine`.
- **Cold starts:** `min_machines_running = 0` means a cold start on the first hit. Set it to 1 for demo day.
- **Fly secrets are set:** `ARAG_KB_ID`, `ARAG_API_KEY`, `ARAG_ZONE`, `ARAG_AGENT_ID`, plus legacy `NUCLIA_*`.
  - The server reads only `ARAG_*` with `NUCLIA_*` fallbacks.
  - `NUCLIA_SERVICEACCOUNT` duplicates the key and can be unset with `fly secrets unset NUCLIA_SERVICEACCOUNT NUCLIA_KB_URL NUCLIA_ACCOUNT`. This is optional.
  - `NUCLIA_NUA_KEY` and `ARAG_AGENT_KEY` were correctly not pushed.

## 6. Deploy readiness

- [x] `node --check` clean
- [x] Smoke test 22/22 against the local server with the live KB
- [x] KB populated: 32 resources, all PROCESSED
- [x] Fly secrets present (`fly secrets list`: ARAG_KB_ID, ARAG_API_KEY, ARAG_ZONE, ARAG_AGENT_ID)
- [x] `docker build` succeeds locally. The container serves `/` and `/api/health` on 8080 as a non-root user, with no `.env` in the image.
- [x] Dockerfile: node:20-alpine, `npm ci --omit=dev`, `EXPOSE 8080`. `.dockerignore` excludes `.env*`.
- [x] fly.toml: internal_port 8080, `/api/health` check (timeout now 10 s)
- [ ] Front-end: CEO to rebuild after any patches to `src/configurator.html`
- [ ] Recommended before the demo: `min_machines_running = 1`, and the stock field whitelist (§5)

**Verdict: ready to deploy.** v6 is live and healthy. The local fixes (health, 500s, offers, rate limit, no-cache HTML) should go out in the next deploy, and nothing blocks it.

### Commands for the CEO

```sh
cd /Users/jsanders/Claude/rev-car-config
node scripts/build.mjs                       # rebuild public/index.html from src + content
npm run check && node tests/smoke.mjs        # expect 22/22
fly secrets list -a harbourline-configurator # names only; ARAG_KB_ID, ARAG_API_KEY, ARAG_ZONE present
fly deploy -a harbourline-configurator
node tests/smoke.mjs --base https://harbourline-configurator.fly.dev   # expect 22/22
curl -sI https://harbourline-configurator.fly.dev/ | grep -i cache-control   # expect no-cache
```
