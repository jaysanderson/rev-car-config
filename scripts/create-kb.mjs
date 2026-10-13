#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// create-kb.mjs — auto-provision a Nuclia Knowledge Box from an account key.
//
// The orchestrator runs this in Phase 1 when no KB is bound in .env but an
// account key IS present. It:
//   1. creates a fresh Knowledge Box (account management API — VERIFIED),
//   2. mints a KB service-account token (best-effort — needs an account PAT with
//      service-account permission),
//   3. writes NUCLIA_KB_URL / NUCLIA_KB_ID / NUCLIA_ZONE (+ NUCLIA_SERVICEACCOUNT
//      when the token was minted) back into .env.
//
// Reads from .env (or real env): NUCLIA_NUA_KEY (preferred) or
// NUCLIA_ACCOUNT_TOKEN, plus NUCLIA_ACCOUNT and NUCLIA_ZONE.
// Zero dependencies — Node 20+ (global fetch).
//
//   node scripts/create-kb.mjs --title "Meridian — Matter Intelligence" --slug meridian
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = join(ROOT, '.env');

// ── tiny .env reader/writer (no dotenv) ──────────────────────────────────────
function readEnv() {
  const env = { ...process.env };
  if (existsSync(ENV_PATH)) {
    for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}
function writeEnvVars(vars) {
  let text = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
  for (const [k, v] of Object.entries(vars)) {
    if (v == null || v === '') continue;
    const line = `${k}=${v}`;
    const re = new RegExp(`^${k}=.*$`, 'm');
    text = re.test(text) ? text.replace(re, line) : (text.replace(/\n?$/, '\n') + line + '\n');
  }
  writeFileSync(ENV_PATH, text);
}

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : def;
}
const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const fail = (m) => { console.error(`\n  ✗ ${m}\n`); process.exit(1); };

async function req(url, { token, method = 'GET', body, header = 'Authorization' } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  headers[header] = `Bearer ${token}`;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { ok: res.ok, status: res.status, json };
}

async function main() {
  const env = readEnv();
  const account = env.NUCLIA_ACCOUNT;
  // A NUA key is the preferred credential (it can create + manage assets under
  // the account); an account token still works as a fallback.
  const token = env.NUCLIA_NUA_KEY || env.NUCLIA_ACCOUNT_TOKEN;
  const zone = env.NUCLIA_ZONE || 'aws-eu-1';
  if (!account || !token) {
    fail('Set NUCLIA_ACCOUNT (your account id — the UUID, copied once from the dashboard) and\n' +
         '  NUCLIA_NUA_KEY (your NUA key) in .env first.\n' +
         '  These are what let the factory create and manage its own ARAG assets.');
  }

  // Fast-fail: a NUA key must have KB management ENABLED to create/manage KBs.
  // Without this check the create call returns an opaque 403 — catch it clearly.
  try {
    const claims = JSON.parse(Buffer.from(String(token).split('.')[1] || '', 'base64').toString());
    if (claims && claims.allow_kb_management === false) {
      fail('This NUA key has KB management DISABLED (allow_kb_management: false), so it cannot\n' +
           '  create a Knowledge Box. Re-create the NUA key in the Nuclia dashboard with the\n' +
           '  "Manage Knowledge Boxes" / KB-management option enabled, then paste the new key.');
    }
  } catch { /* not a decodable JWT — let the live API call surface any error */ }

  const title = arg('--title', 'ARAG Demo Knowledge Box');
  const slug = slugify(arg('--slug', title)) || `arag-demo-${Date.now().toString(36)}`;
  const zbase = `https://${zone}.rag.progress.cloud/api/v1`;

  console.log(`\n  Provisioning a Knowledge Box in account ${account} (zone ${zone})…`);

  // 1) Create the KB (account management API — verified).
  const create = await req(`${zbase}/account/${account}/kbs`, {
    token, method: 'POST', body: { title, slug, zone },
  });
  if (!create.ok) fail(`KB creation failed (HTTP ${create.status}): ${JSON.stringify(create.json).slice(0, 300)}`);
  const kbId = create.json.id || create.json.uuid;
  if (!kbId) fail(`KB created but no id in response: ${JSON.stringify(create.json).slice(0, 200)}`);
  const kbUrl = `${zbase}/kb/${kbId}`;
  console.log(`  ✓ Knowledge Box created: ${kbId}`);
  writeEnvVars({ NUCLIA_KB_ID: kbId, NUCLIA_KB_URL: kbUrl, NUCLIA_ZONE: zone });

  // 2) Mint a KB service-account token (VERIFIED live against Progress ARAG with
  //    a NUA key that has allow_kb_management). Two steps, both on the REGIONAL
  //    API (NUA keys are rejected by the global API):
  //      a. create the service account — KB-scoped, PLURAL collection route;
  //      b. mint a key — SINGULAR `service_account/{id}/keys` route, with an
  //         `expires` epoch (the server caps expiry at 1095 days).
  //    The minted token authenticates the data plane via `X-NUCLIA-SERVICEACCOUNT: Bearer`.
  let saToken = null;
  try {
    // SOWNER: one provisioned token does everything the build needs — INGEST the
    // generated corpus, CREATE search configurations (an OWNER-role op, see the
    // guide), and SERVE the portal's read calls — so the factory is self-sufficient
    // from a single credential. (SMEMBER is refused on writes; SCONTRIBUTOR is
    // refused on search_configurations; the NUA key has no data-plane access at
    // all.) Server-side only, never reaches the browser.
    const sa = await req(`${zbase}/account/${account}/kb/${kbId}/service_accounts`, {
      token, method: 'POST', body: { title: `factory-${slug}`, role: 'SOWNER' },
    });
    const saId = sa.ok && sa.json.id;
    if (saId) {
      const expires = Math.floor(Date.now() / 1000) + 1080 * 24 * 60 * 60; // ~1080d, under the 1095-day cap
      const k = await req(`${zbase}/account/${account}/kb/${kbId}/service_account/${saId}/keys`, {
        token, method: 'POST', body: { expires },
      });
      saToken = (k.ok && (k.json.token || k.json.key)) || null;
    }
  } catch { /* fall through to manual step */ }

  if (saToken) {
    writeEnvVars({ NUCLIA_SERVICEACCOUNT: saToken });
    console.log(`  ✓ Service-account token minted and written to .env`);
    console.log(`\n  Knowledge Box fully provisioned — ready to ingest. NUCLIA_KB_URL / _ID / _ZONE / _SERVICEACCOUNT are set.\n`);
  } else {
    console.log(`  ⚠ Could not mint a service-account token automatically (the NUA key may lack`);
    console.log(`    service-account permission). The KB IS created and its coordinates are in .env.`);
    console.log(`\n  One step to finish: create a KB service-account key in the Nuclia dashboard`);
    console.log(`    → Account ${account} → Knowledge Box "${slug}" → Service accounts → add key`);
    console.log(`    then paste it into .env as  NUCLIA_SERVICEACCOUNT=…  and re-run the build.\n`);
    process.exit(3); // signal "KB made, token pending" so the orchestrator can prompt for it
  }
}

main().catch((e) => fail(e.message));
