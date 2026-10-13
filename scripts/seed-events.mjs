#!/usr/bin/env node
// seed-events.mjs — seed content/dealer/events.jsonl (or $DEALER_STATE_DIR/events.jsonl)
// with ~400 synthetic first-party events over the last 30 days across ~60 sessions,
// so GET /api/report/configurator is interesting on day one.
//
//   node scripts/seed-events.mjs
//
// Idempotent: writes only when the file is missing or empty. Seeded lines carry
// src:"seed"; delete the file (or empty it) and re-run to regenerate.
import '../server/env.mjs';
import { stock } from '../server/data.mjs';
import { seedEvents, readEvents } from '../server/events.mjs';
import { dealerPath } from '../server/state.mjs';

const s = await stock();
const n = seedEvents({ stockUnits: s.stock_by_site });
const all = readEvents();
if (n) console.log(`Seeded ${n} events across ${new Set(all.map((e) => e.sid)).size} sessions → ${dealerPath('events.jsonl')}`);
else console.log(`events.jsonl already has ${all.length} event(s); not seeding (${dealerPath('events.jsonl')})`);
