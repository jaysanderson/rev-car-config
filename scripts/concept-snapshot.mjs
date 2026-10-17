#!/usr/bin/env node
// concept-snapshot.mjs — offline data snapshot for /concept/ (used when the API is unreachable, e.g. the artifact).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rj = (p) => (existsSync(join(ROOT, p)) ? JSON.parse(readFileSync(join(ROOT, p), 'utf8')) : null);
const stock = {}; for (const f of ['stock_by_site', 'aged_stock_actions', 'transfer_feasibility', 'inbound_pipeline', 'order_bank_eta', 'dealer_signals', 'used_market_prices']) stock[f] = rj(`content/domo/${f}.json`);
const snap = { generated: new Date().toISOString(), catalog: rj('content/catalog.json'), stock, used: rj('content/used/stock.json'), usedComments: rj('content/dealer/used_comments.generated.json'), promotions: rj('content/dealer/promotions.generated.json') || rj('content/dealer/promotions.json'), calendar: rj('content/dealer/calendar.json'), incentives: rj('content/dealer/incentives.json'), credits: rj('content/images/credits.json'), sites: (rj('content/dms/data/sites.json') || []).map((s) => ({ id: s.id, name: s.name, address: s.address, phone: s.phone, distanceKm: s.distanceKm, transferRun: s.transferRun })) };
writeFileSync(join(ROOT, 'public/concept/data/snapshot.json'), JSON.stringify(snap));
console.log(`snapshot: ${snap.catalog?.models.length} models, ${snap.stock.stock_by_site?.rows?.length ?? snap.stock.stock_by_site?.length ?? '?'} stock rows, ${snap.used?.rows.length} used units, ${Math.round(readFileSync(join(ROOT, 'public/concept/data/snapshot.json')).length / 1024)} KB`);
