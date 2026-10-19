# Hand-off: where things stand (19 Oct 2026, end of session)

Read this first when resuming. Everything live is at https://harbourline-configurator.fly.dev (configurator `/`, pre-owned `/used/`, concept `/concept/`, back office `/dms/`). Smoke suites: `node tests/smoke.mjs --base <url>` (49) and `node tests/dms-smoke.mjs --base <url> --quick` (66 at the last deploy). Deploy: `node scripts/build.mjs && fly deploy --ha=false`.

## Done and deployed (commits up to "Concept polish …")

- Configurator, Harbourline Used, Harbourline One concept experience, DMS phase 1, the Domo access guide (`docs/DMS-DOMO-ACCESS.md`, shared doc https://claude.ai/code/artifact/8f2c88de-ebbe-49ca-a7cb-3aedb61e8e58), platform thesis (`docs/PLATFORM.md`), parity research doc.

## DMS phase 2 (committed, NOT yet deployed)

Spec: `docs/DMS-PHASE2-SPEC.md`. Status on 19 Oct (later that day):

- Done and tested locally: seed (598 job cards, 37 open this week, 2.5k memos, 22 suppliers, 12 sample photos, simulated Infomedia pack), all routes wired in `server/dms/index.mjs`, knowledge box ingested (`node scripts/ingest-dms-phase2.mjs`: manual chapters, FAQ, 31 Infomedia resources, 22 suppliers, 120 recent job cards, 120 customers with memos; ids in `content/dms/kb-index-phase2.json`), fallback catalogues (`node scripts/dms-seed-catalogues.mjs`), four Domo datasets, grouped `/search`, MCP prompts, DMS smoke 83/83 (full) and 78/78 (quick). Help, ask-one, ask-across and Infomedia answers verified grounded with citations.
- SPA pages written by agents U1 and U2 (job cards and board, suppliers, customer extras, help bubble, palette, onboarding, manual, friendly-error hook). U1's job-card fixture fallback in `service.js` is now dead code; remove it. Pages have only been checked headlessly.
- **SmartCenter restyle**: a theme agent was started to restyle `public/dms` (dark bar, open-screens tab strip, tile home on a road-at-sunrise scene, Options tree, dense forms, bottom action bar with hotkeys, login). Check `git status` for its files; if it did not finish, re-brief from the description above.
- Not done: deploy (`node scripts/build.mjs && fly deploy --ha=false`, then both live smoke suites), screenshot pass of the new pages, update `docs/DMS-DEMO-SCRIPT.md` screenshots, ingest of the remaining job cards if wanted (`--max=600`).

## Resume checklist

1. `git status`; read the three agent reports in the previous session transcript (or diff the files) to see what is stubbed.
2. `npm run check`; start locally `PORT=8112 node server/index.mjs` with `DMS_CHANGES_DIR` in a temp dir; `node tests/dms-smoke.mjs --base http://localhost:8112 --quick`.
3. Finish stubs, write and run `scripts/ingest-dms-phase2.mjs`, then the SmartCenter theme, then deploy.

## Conventions that still apply

Secrets only in `.env` (never printed). Commits end with the Co-Authored-By and Claude-Session lines. Jay's remit: the minimum to showcase Progress Agentic RAG with Domo intelligence, every feature attributed on screen, mocks labelled. Chrome browser tools need Jay to pick a browser; use the headless Chromium in the scratchpad instead.
