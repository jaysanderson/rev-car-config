# Hand-off: where things stand (19 Oct 2026, end of session)

Read this first when resuming. Everything live is at https://harbourline-configurator.fly.dev (configurator `/`, pre-owned `/used/`, concept `/concept/`, back office `/dms/`). Smoke suites: `node tests/smoke.mjs --base <url>` (49) and `node tests/dms-smoke.mjs --base <url> --quick` (66 at the last deploy). Deploy: `node scripts/build.mjs && fly deploy --ha=false`.

## Done and deployed (commits up to "Concept polish …")

- Configurator, Harbourline Used, Harbourline One concept experience, DMS phase 1, the Domo access guide (`docs/DMS-DOMO-ACCESS.md`, shared doc https://claude.ai/code/artifact/8f2c88de-ebbe-49ca-a7cb-3aedb61e8e58), platform thesis (`docs/PLATFORM.md`), parity research doc.

## In progress: DMS phase 2 (NOT deployed, committed as work in progress)

Spec and contract: `docs/DMS-PHASE2-SPEC.md` (job cards with memos, documents and images; suppliers and customers with the same pattern; help bubble for call deflection; friendly errors; interactive onboarding; the Infomedia data pack; system-wide search and chat). Ownership table in §7.

State at hand-off:

| Piece | Owner | State |
|---|---|---|
| Seed data: `scripts/dms-seed-service.mjs` → `content/dms/data/{job_cards,memos,suppliers,support_tickets}.json`, service staff appended to `staff.json`, image and inspection rows appended to `documents.json`, `content/dms/infomedia/*`, `content/dms/samples/images/*` (12 generated photos) | coordinator | Generated once (557 job cards, only 3 open today). A tweak to add a busy current week (about 60 cards in the last 7 days plus bookings) was drafted but not applied; re-run with `--images` after any change (needs `CHROME_EXE` pointing at the Playwright headless shell and `PLAYWRIGHT_DIR` at the scratchpad's node_modules, else SVGs only) |
| Server: `server/dms/service.mjs`, `help.mjs`, `infomedia.mjs` (all handlers written and import-clean), `db.mjs` TABLES, `auth.mjs` roles `service_manager` and `technician` + demo users `service@` / `tech1@`, `kb.mjs` `upsertResource` | Agent S | **Handlers done, routes NOT wired**: `server/dms/index.mjs` is untouched, so every phase 2 path 404s. Also missing: `content/dms/friendly-errors.json`, `content/dms/onboarding-catalogue.json`, Domo DERIVED entries (`service_daily`, `job_card_lines`, `support_deflection`, `onboarding_progress`), `/search` extension in `ai.mjs`, MCP prompts, smoke checks. The agent's report lists the exact `route()` lines to add (board and `/ask` before `/:id`; `big` body matcher for the three `/documents` uploads; TAGS for the new path groups) |
| SPA service: `public/dms/pages/service.js`, `suppliers.js`, `customers.js` changes, NAV group Service in `dms.js` | Agent U1 | Pages written and syntax-clean, not rendered in a browser yet. `service.js` has a labelled fixture fallback used while the API 404s (search `fixture(` / `isFixture`; delete once routes answer). Thumbnail URLs assume `GET /documents/:id/file?thumb=1&token=`; align `imgUrl()` with what the server ships. Expected detail shape: card + `memos`, `documents`, `vehicleHistory`, `kbResourceId`; ask-across returns `cardsConsidered`, `evidence[{id,status,why}]` |
| SPA help: `public/dms/help.js`, `palette.js`, `pages/onboarding.js`, `pages/manual.js`, `core.js` friendly-error hook, `settings.js` cards, `dms.css`, `index.html` | Agent U2 | Done and headless-verified (no page errors); falls back gracefully while routes 404 (Help uses `/ask` and `/agent/query`). Server must add: `GET /manual/chapters` -> `{items:[{slug,title,topic,summary}]}`, `GET /manual/chapters/:slug` -> `{slug,title,topic,markdown}`, `GET /onboarding/stats` -> `{started,completed,completionRate,byRole[]}`; `/help/ask` should return `helpId`, `citations[{title,slug?,resourceId}]`, `trace[]`, `suggestedPages[]` |
| Content: four manual chapters, two policies, `help-faq.md`, doc updates | Agent C | Done, not yet ingested |
| Ingest: `scripts/ingest-dms-phase2.mjs` (job cards → `topic/jobcard`, suppliers → `topic/supplier`, customers with memos → `topic/customer`, Infomedia → `topic/infomedia` with model labels, new manual chapters and `topic/help` FAQ; writes `content/dms/kb-index-phase2.json`) | coordinator | Not written yet. Add labels `jobcard, supplier, customer, infomedia, help` to the `topic` labelset first (see `scripts/ingest-used.mjs` for the pattern). Ingest a subset: open and last-90-day cards, all suppliers, customers with memos, the pack, the chapters |

## Requested next, not started

- **Restyle the DMS in the REVOLUTIONnext SmartCenter fashion** (Jay sent two screenshots on 19 Oct): charcoal top bar with hamburger, title, "Search Help…" box and icon row; a tab strip of open screens with counts and close buttons, green underline on the active tab; a home screen with a full-bleed landscape photo and coloured tiles (green sticky note, orange counters) grouped under headings; work screens with a breadcrumb row, a left "Options" tree with the selected item highlighted blue, dense label:field forms, grids with a blue selected row, and a bottom action bar with green / grey / red buttons with hotkeys in brackets ("New Receipt (E)", "Save & Confirm (S)", "Refresh (Z)"). Do it as a theme agent after the phase 2 SPA files land, owning `dms.css`, `index.html` and the shell in `dms.js`; keep our own title ("Harbourline DMS", styled after SmartCenter) rather than Revolution's product name.
- Then: run the phase 2 smoke, build, deploy, re-run both suites live, update `docs/DMS-DEMO-SCRIPT.md` screenshots.

## Resume checklist

1. `git status`; read the three agent reports in the previous session transcript (or diff the files) to see what is stubbed.
2. `npm run check`; start locally `PORT=8112 node server/index.mjs` with `DMS_CHANGES_DIR` in a temp dir; `node tests/dms-smoke.mjs --base http://localhost:8112 --quick`.
3. Finish stubs, write and run `scripts/ingest-dms-phase2.mjs`, then the SmartCenter theme, then deploy.

## Conventions that still apply

Secrets only in `.env` (never printed). Commits end with the Co-Authored-By and Claude-Session lines. Jay's remit: the minimum to showcase Progress Agentic RAG with Domo intelligence, every feature attributed on screen, mocks labelled. Chrome browser tools need Jay to pick a browser; use the headless Chromium in the scratchpad instead.
