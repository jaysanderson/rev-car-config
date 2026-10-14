# Harbourline DMS MCP

The Harbourline DMS speaks **MCP** (Model Context Protocol). Any MCP-aware agent can drive the
sales back office as a system of record: Claude Desktop, Claude Code, Cursor, an n8n node, an
Anthropic SDK app or an ARAG retrieval agent. It can read leads, deals, stock and KPIs, book test
drives, raise quotes, log deal events, request and record approvals, compose and publish
promotions, process documents and ask the live-ERP agent.

There is **one MCP server**, exposed in two ways. The design mirrors maintenanceOS (`docs/MCP.md`).

| Transport | URL / command | Use when |
| --- | --- | --- |
| **Streamable HTTP** | `POST https://<host>/dms/mcp` (locally `http://localhost:8080/dms/mcp`) | Hosted agents, n8n, remote tooling |
| **stdio** | `node scripts/dms-mcp-stdio.mjs` | Claude Desktop / Claude Code on a laptop |

Both use the same code (`server/dms/mcp-core.mjs`) and the same tool catalogue.
`GET /dms/api/mcp/info` returns the live URLs, tool list, resources and prompts. The settings page renders it.

---

## How the tool catalogue is built

**Tools are not hand-curated.** The MCP layer reads the API's own OpenAPI document
(`GET /dms/api/openapi.json`, which is generated from the route table in `server/dms/index.mjs`)
and turns each operation into a tool. The agent surface therefore cannot drift from the REST API.

The catalogue **excludes**:

- every `DELETE` operation (irreversible), such as revoking an access token
- `POST /auth/login` and `POST /auth/logout`, because the agent is already authenticated
- `POST /documents`, the base64 file upload, which is not a sensible tool argument
- operations whose 2xx response is not JSON: `GET /domo/export/{dataset}.csv`, `GET /documents/{id}/file` (PDF) and `GET /docs` (HTML)
- `GET /openapi.json`, which is exposed as the resource `harbourline-dms://openapi` instead

The result is **54 tools** (62 operations in the OpenAPI document) covering leads, customers, test drives, deals, stock, trade-ins, finance,
promotions, campaigns, documents, KPIs, Domo, DXM, the ARAG assistant, access tokens and MCP info.
They read and write, but none is destructive.

### Tool naming convention

`<tag>_<verb>_<resource>`, or `<tag>_<action>` when the last path segment is an action verb
(compose, publish, unpublish, process, verify, summary, followup, query, ask, recompute-signals,
hold, transfer). The tag is the resource group from the OpenAPI document.

```
GET    /leads                          → leads_list_leads
GET    /deals/{id}                     → deals_get_deals
POST   /deals                          → deals_create_deals
PATCH  /leads/{id}                     → leads_patch_leads
POST   /deals/{id}/events              → deals_create_events
POST   /deals/{id}/summary             → deals_summary
POST   /promotions/compose             → promotions_compose
POST   /vehicles/{stockNo}/hold        → stock_hold
POST   /agent/query                    → assistant_query
GET    /kpi/overview                   → kpi_list_overview
```

There is one difference from the reference: a trailing **noun** after an id is a sub-resource and gets the HTTP verb. So
`POST /deals/{id}/events` is `deals_create_events`, not `deals_events`.

Each tool's `inputSchema` wraps the operation's path, query and body into one object:

```json
{
  "path":  { "id": "D-10466" },
  "query": { "pageSize": 10, "siteId": "pen" },
  "body":  { "type": "call", "note": "Chased the lender" }
}
```

`path` is required when the operation has path parameters. `body` is required when the OpenAPI document marks it so.
List tools accept any column name in `query` as an equality filter (a comma means "any of").

### Dispatch

Each tool call is a REST call to `/dms/api/...` with the caller's bearer token. The hosted endpoint
uses a loopback fetch to the same server; the stdio binary fetches `DMS_API_URL`. Auth, role
permissions, row scoping, rate limits and validation therefore apply exactly as they do for the web UI. When the REST call
returns a non-2xx status, the tool result is `isError: true` with the text
`[HTTP <status>] <same JSON body>`. For example, a salesperson calling `domo_list_datasets` gets
`[HTTP 403] {"error":"forbidden: role salesperson lacks domo.read"}`.

---

## Resources

Resources are read-only context the agent can attach without calling a tool.

| URI | Returns |
| --- | --- |
| `harbourline-dms://openapi` | The OpenAPI 3.0 document |
| `harbourline-dms://dashboard` | Live KPIs: units delivered, gross, conversion, test-drive rate, days to close, aged stock, days of supply, pipeline, target (scoped to the caller) |
| `harbourline-dms://domo/signals` | Domo `dealer_signals` + derived priorities + move priorities with "why" text |
| `harbourline-dms://deal/{id}` | Deal with customer, lead, vehicle, finance, trade-in, documents, timeline |
| `harbourline-dms://lead/{id}` | Lead with customer, owner, test drives, deals, configurator booking, handover, events |
| `harbourline-dms://customer/{id}` | Customer with leads, deals, test drives, trade-ins, documents |
| `harbourline-dms://stock/{stockNo}` | Vehicle by stock number (or VIN) with its deal and the model's Domo signal |

## Prompts

| Name | Args | What it does |
| --- | --- | --- |
| `triage-lead` | `leadId` | Classifies a lead (hot/warm/cold) from configurator first-party data and history, recommends one next action and drafts the follow-up. |
| `prep-test-drive` | `bookingId` | Builds a one-page prep sheet from the handover: answers, the unit to have ready, the incentive and two questions to ask. |
| `daily-sales-briefing` | `siteId?` | Morning briefing: MTD vs target, leaderboard, stalled deals, aged stock, new configurator leads. |
| `stuck-deals-review` | `siteId?` | Finds deals past the stage limits (quote 7, negotiation 5, finance 5, approval 2, contract 3, delivery 10 days) and proposes the unblocking action for each. |
| `compose-promotions-review` | — | Recomposes promotions (Domo targets → ARAG copy), checks them against policy and headroom, and recommends publish or hold. |

---

## Authentication

MCP uses the **same bearer token** as the REST API, with no separate MCP account. A token is either:

- a **session token** from `POST /dms/api/auth/login` (in memory on the server, 12 h), or
- a **personal access token** (`hdms_…`) from `POST /dms/api/access-tokens {name, expiresInDays?}`. The raw
  value is shown once and only its SHA-256 is stored (`_tokens.json` in the DMS state dir). List them with
  `GET /dms/api/access-tokens` and revoke with `DELETE /dms/api/access-tokens/{id}`. A PAT acts as its owner,
  with the same role and site scope. Use PATs for MCP clients because they survive server restarts.

`POST /dms/mcp` without a valid token answers HTTP 401 with a JSON-RPC error.

Demo users (password `demo1234`): `gm@harbourline.demo` (all), `sm.par@harbourline.demo` (Parramatta),
`sales1@harbourline.demo` (own leads and deals), `marketing@harbourline.demo` (DXM, promotions),
`finance@harbourline.demo` (F&I).

```bash
TOKEN=$(curl -s http://localhost:8080/dms/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"gm@harbourline.demo","password":"demo1234"}' | jq -r .token)
PAT=$(curl -s http://localhost:8080/dms/api/access-tokens -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"name":"Claude Code","expiresInDays":30}' | jq -r .token)
```

---

## Connecting Claude Code

**Hosted (Streamable HTTP):**

```bash
claude mcp add --transport http harbourline-dms http://localhost:8080/dms/mcp \
  --header "Authorization: Bearer $PAT"
```

**stdio:**

```bash
claude mcp add harbourline-dms -- \
  env DMS_API_URL=http://localhost:8080 DMS_API_TOKEN="$PAT" \
  node /absolute/path/to/rev-car-config/scripts/dms-mcp-stdio.mjs
```

**The knowledge box's own MCP endpoint** (Progress Agentic RAG: semantic search over the DMS
manual, policies, processed documents and the Toyota corpus) can sit alongside it:

```bash
claude mcp add --transport http harbourline-kb \
  https://aws-ap-southeast-2-1.rag.progress.cloud/api/v1/kb/be12d5b5-56ea-4ad4-b380-2358247bb2c8/mcp \
  --header "X-NUCLIA-SERVICEACCOUNT: Bearer <KB service-account key>"
```

The KB key is a platform credential. This app never issues or exposes it. `GET /dms/api/arag/status` and
`/mcp/info` return only the URL.

Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "harbourline-dms": {
      "command": "node",
      "args": ["/absolute/path/to/rev-car-config/scripts/dms-mcp-stdio.mjs"],
      "env": { "DMS_API_URL": "http://localhost:8080", "DMS_API_TOKEN": "hdms_…" }
    }
  }
}
```

### stdio env vars

| Env | Purpose |
| --- | --- |
| `DMS_API_URL` | Required. Base URL of the server (the binary appends `/dms/api`). |
| `DMS_API_TOKEN` | Session token or PAT (preferred). |
| `DMS_EMAIL` / `DMS_PASSWORD` | Auto-login at boot and again on a 401 when no token is set. |

---

## Connecting a hosted agent (Streamable HTTP)

`POST /dms/mcp` with headers:

```
content-type:         application/json
accept:               application/json, text/event-stream
authorization:        Bearer <token or hdms_ PAT>
mcp-protocol-version: 2025-03-26
```

The body is a JSON-RPC 2.0 frame (`initialize`, `tools/list`, `tools/call`, `resources/read`,
`prompts/get`, …). The server is **stateless**: each request gets a fresh `Server` and transport, there is no
session id, and responses are plain JSON (`enableJsonResponse`). `GET /dms/mcp` is a friendly probe.

```bash
curl -s http://localhost:8080/dms/mcp -H "authorization: Bearer $PAT" \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"leads_list_leads","arguments":{"query":{"channel":"configurator","status":"new","pageSize":5}}}}'
```

---

## Architecture

```
Claude / agent ──stdio──▶ scripts/dms-mcp-stdio.mjs ─┐
n8n / remote   ──HTTP───▶ POST /dms/mcp              ─┤
                                                      ├─▶ server/dms/mcp-core.mjs
                                                      │    (OpenAPI → tools, naming, input schema,
                                                      │     dispatch, resources, prompts)
                                                      ▼
                                   REST /dms/api/* (server/dms/index.mjs — same auth,
                                   role permissions, row scoping, validation, rate limits)
```

MCP never touches the tables directly. Every tool call goes through the REST endpoints.

Tests: `node tests/dms-smoke.mjs` covers initialize, the 401 path, tools/list (≥ 30), a read
call, a write call, a 403 → `isError`, resources, prompts, PATs and the stdio binary.
