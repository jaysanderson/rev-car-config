// state.mjs — dealer-side file IO shared by dealer.mjs, promotions.mjs, events.mjs
// and testdrive.mjs.
//
// Seed data lives in content/dealer. Writable state (STATE_FILES) lives in
// DEALER_STATE_DIR when set, else in content/dealer. A state file that does not exist
// in the state dir yet is read from content/dealer (the seed). If the state dir is
// not writable (e.g. the container's content/ is root-owned), the first write
// switches state to <os tmpdir>/harbourline-dealer, copying the seeds across, and
// logs a warning, so the prototype keeps working (state is then ephemeral).
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, statSync, copyFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ROOT } from './env.mjs';

export const SEED_DIR = join(ROOT, 'content', 'dealer');
let STATE_DIR = process.env.DEALER_STATE_DIR || SEED_DIR;
const STATE_FILES = new Set(['bookings.json', 'promotions.generated.json', 'events.jsonl']);

/** Path a file is read from: the state copy when it exists, else the seed. */
export function dealerPath(name) {
  if (STATE_FILES.has(name)) {
    const p = join(STATE_DIR, name);
    if (existsSync(p)) return p;
  }
  return join(SEED_DIR, name);
}

// ── JSON IO ──────────────────────────────────────────────────────────────────
const cache = new Map(); // path → {mtime, data}
export function readDealer(name, fallback) {
  const p = dealerPath(name);
  if (!existsSync(p)) return fallback;
  const m = statSync(p).mtimeMs;
  const c = cache.get(p);
  if (c && c.mtime === m) return c.data;
  try {
    const data = JSON.parse(readFileSync(p, 'utf8'));
    cache.set(p, { mtime: m, data });
    return data;
  } catch (e) {
    console.warn(`[dealer] cannot parse ${name}: ${e.message}`);
    return c ? c.data : fallback;
  }
}

function writeAtomic(dir, name, data) {
  mkdirSync(dir, { recursive: true });
  const p = join(dir, name);
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tmp, p); // atomic on the same filesystem
  cache.set(p, { mtime: statSync(p).mtimeMs, data });
}

/** Run `fn` against the state dir; on EACCES/EROFS/EPERM switch to the tmp dir and retry. */
function withWritableDir(name, fn) {
  try { return fn(STATE_DIR); }
  catch (e) {
    if (!['EACCES', 'EROFS', 'EPERM'].includes(e.code)) throw e;
    const alt = join(tmpdir(), 'harbourline-dealer');
    if (STATE_DIR === alt) throw e;
    console.warn(`[dealer] ${STATE_DIR} is not writable (${e.code}); dealer state now in ${alt} (ephemeral)`);
    mkdirSync(alt, { recursive: true });
    for (const f of STATE_FILES) if (!existsSync(join(alt, f)) && existsSync(dealerPath(f))) copyFileSync(dealerPath(f), join(alt, f));
    STATE_DIR = alt;
    return fn(STATE_DIR);
  }
}

let writeChain = Promise.resolve();
/** Serialised atomic write of a JSON state file. */
export function writeDealer(name, data) {
  const job = writeChain.then(() => { withWritableDir(name, (dir) => writeAtomic(dir, name, data)); return data; });
  writeChain = job.catch(() => {});
  return job;
}
/** Serialised read-modify-write: `fn(current)` returns the new data (or undefined to skip). */
export function updateDealer(name, fn, fallback) {
  const job = writeChain.then(() => {
    const next = fn(readDealer(name, fallback));
    if (next !== undefined) withWritableDir(name, (dir) => writeAtomic(dir, name, next));
    return next;
  });
  writeChain = job.catch(() => {});
  return job;
}

/**
 * Append lines to a state text file (JSON lines). Synchronous O_APPEND, so lines from
 * concurrent requests never interleave. The first append to a state dir that does
 * not hold the file yet copies the seed across first.
 */
export function appendDealerLines(name, lines) {
  if (!lines.length) return;
  withWritableDir(name, (dir) => {
    const p = join(dir, name);
    if (!existsSync(p)) {
      mkdirSync(dir, { recursive: true });
      const seed = join(SEED_DIR, name);
      if (seed !== p && existsSync(seed)) copyFileSync(seed, p);
    }
    appendFileSync(p, lines.map((l) => `${l}\n`).join(''));
  });
}
