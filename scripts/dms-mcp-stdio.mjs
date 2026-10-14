#!/usr/bin/env node
// dms-mcp-stdio.mjs — the Harbourline DMS MCP server over stdio (Claude Desktop /
// Claude Code on a laptop). Same core as the hosted POST /dms/mcp
// (server/dms/mcp-core.mjs): the tool catalogue is built from the API's
// /dms/api/openapi.json and every tool call is a REST call to the API.
//
//   DMS_API_URL    base URL of the server, e.g. http://localhost:8080 (required)
//   DMS_API_TOKEN  session token or personal access token (hdms_…)   — preferred
//   DMS_EMAIL + DMS_PASSWORD  auto-login at boot (and again on a 401) when no token
//
//   claude mcp add harbourline-dms -- env DMS_API_URL=http://localhost:8080 DMS_API_TOKEN=hdms_… node /abs/path/scripts/dms-mcp-stdio.mjs
//
// stdout carries the MCP protocol: diagnostics go to stderr only, and secrets are never printed.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer, fetchApiClient } from '../server/dms/mcp-core.mjs';

const BASE = String(process.env.DMS_API_URL || '').replace(/\/$/, '');
if (!BASE) { console.error('dms-mcp: set DMS_API_URL (e.g. http://localhost:8080)'); process.exit(1); }
const API = `${BASE}/dms/api`;
let token = process.env.DMS_API_TOKEN || '';

async function login() {
  const { DMS_EMAIL: email, DMS_PASSWORD: password } = process.env;
  if (!email || !password) return false;
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!r.ok) { console.error(`dms-mcp: login failed (${r.status})`); return false; }
  token = (await r.json()).token; return true;
}

if (!token && !(await login())) { console.error('dms-mcp: set DMS_API_TOKEN, or DMS_EMAIL + DMS_PASSWORD'); process.exit(1); }
const specRes = await fetch(`${API}/openapi.json`);
if (!specRes.ok) { console.error(`dms-mcp: cannot fetch ${API}/openapi.json (${specRes.status})`); process.exit(1); }
const spec = await specRes.json();

// Re-login transparently on 401 when running with email/password (session tokens are in-memory on the server).
const base = fetchApiClient(API);
const apiClient = async (req) => {
  let res = await base(req);
  if (res.status === 401 && !process.env.DMS_API_TOKEN && (await login())) res = await base({ ...req, headers: { ...req.headers, authorization: `Bearer ${token}` } });
  return res;
};
// The token can change on re-login, so resolve it per call.
const { server, tools } = createServer({ spec, apiClient: (req) => apiClient({ ...req, headers: { ...req.headers, ...(token ? { authorization: `Bearer ${token}` } : {}) } }), bearerToken: undefined, version: spec.info?.version });
await server.connect(new StdioServerTransport());
console.error(`dms-mcp: ${tools.length} tools from ${API}/openapi.json (stdio ready)`);
