// lib-env.mjs — tiny shared .env reader/writer for the scripts (no dotenv).
// Values are never printed. Real env vars win over .env entries.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ENV_PATH = join(ROOT, '.env');

export function readEnv() {
  const env = { ...process.env };
  if (existsSync(ENV_PATH)) {
    for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

export function writeEnvVars(vars) {
  let text = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
  for (const [k, v] of Object.entries(vars)) {
    if (v == null || v === '') continue;
    const re = new RegExp(`^${k}=.*$`, 'm');
    text = re.test(text) ? text.replace(re, `${k}=${v}`) : text.replace(/\n?$/, '\n') + `${k}=${v}\n`;
  }
  writeFileSync(ENV_PATH, text, { mode: 0o600 });
}

export const clean = (k) => String(k || '').trim().replace(/^["']+|["']+$/g, '').replace(/^Bearer\s+/i, '').trim();

/** Resolve the KB coordinates from either naming convention. */
export function kbCoords(env = readEnv()) {
  const zone = env.ARAG_ZONE || env.NUCLIA_ZONE || 'aws-ap-southeast-2-1';
  const kbId = env.ARAG_KB_ID || env.NUCLIA_KB_ID || '';
  const token = clean(env.ARAG_API_KEY || env.NUCLIA_SERVICEACCOUNT);
  const kbUrl = kbId ? `https://${zone}.rag.progress.cloud/api/v1/kb/${kbId}` : '';
  return { zone, kbId, token, kbUrl, dpKbUrl: kbUrl.replace('.rag.progress.cloud', '.dp.progress.cloud') };
}
