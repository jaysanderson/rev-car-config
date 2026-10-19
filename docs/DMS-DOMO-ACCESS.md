# Getting DMS data into Domo

Mirror of the shared doc https://claude.ai/code/artifact/8f2c88de-ebbe-49ca-a7cb-3aedb61e8e58 (19 Oct 2026). Written for the Domo expert.

## Two routes

| | REST API | MCP |
|---|---|---|
| Best for | Scheduled dataset loads, CSV into a Domo DataSet | Agents that read, filter and act |
| Entry point | `https://harbourline-configurator.fly.dev/dms/api` | `POST …/dms/mcp` (Streamable HTTP) or `node scripts/dms-mcp-stdio.mjs` |
| Shape | Paged JSON lists + CSV exports of 19 datasets | 54 tools from the same OpenAPI document, 7 resources, 5 prompts |
| Reference | `/dms/api/docs`, `/dms/api/openapi.json` | `GET /dms/api/mcp/info`, `docs/DMS-MCP.md` |

## Authentication

1. `POST /dms/api/auth/login` `{"email":"gm@harbourline.demo","password":"demo1234"}` → `{token}`; send `Authorization: Bearer <token>`.
2. `POST /dms/api/access-tokens` `{"name":"Domo nightly","expiresInDays":90}` → raw `hdms_…` shown once; same role as the creator. `GET`/`DELETE /dms/api/access-tokens[/{id}]`.
3. Roles: gm (all, incl. recompute), sales_manager (site-scoped), dxm and finance (all sites, read), salesperson (no Domo datasets). Use gm for loads. Tokens live in the DMS state folder and reset on deploy.

## Route 1: REST

- Catalogue `GET /domo/datasets` → `{datasets:[{name, kind: table|derived, description, rows, refresh, csvUrl, schema, joins}]}`.
- CSV `GET /domo/export/{name}.csv` (bearer or `?token=`), full dataset, `X-Row-Count`; `from`/`to` ignored → Replace mode in Domo.
- Incremental JSON `GET /{table}?from=&to=&sort=-createdAt&page=&pageSize=500&q=&siteId=&status=&<column>=a,b` → `{items,total,page,pageSize}`. Date fields: leads/deals `createdAt`, vehicles `arrivedAt`, test_drives `when`, finance_apps `submittedAt`.
- KPIs `GET /kpi/overview?siteId&month`, `/kpi/series?metric&by=month|week&from&to`, `/kpi/leaderboard`.

```bash
BASE=https://harbourline-configurator.fly.dev/dms/api
TOKEN=$(curl -s -X POST $BASE/auth/login -H 'content-type: application/json' -d '{"email":"gm@harbourline.demo","password":"demo1234"}' | jq -r .token)
curl -s -H "Authorization: Bearer $TOKEN" $BASE/domo/datasets | jq '.datasets[] | {name, kind, rows}'
curl -s -H "Authorization: Bearer $TOKEN" -o sales_daily.csv $BASE/domo/export/sales_daily.csv
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/leads?from=2026-10-15&sort=-createdAt&pageSize=500"
```

## Route 2: MCP

- `POST /dms/mcp`, headers `Authorization: Bearer <hdms_…>`, `Accept: application/json, text/event-stream`; stateless JSON-RPC (`initialize`, `tools/list`, `tools/call`).
- Tools for Domo work: `domo_list_datasets`, `domo_list_signals`, `domo_recompute_signals` (gm, `query.dryRun=1`), `kpi_list_overview|series|leaderboard`, `leads_list_leads`, `deals_list_deals`, `stock_list_vehicles`, `deals_summary`, `assistant_query`. Arguments: `{path, query, body}`.
- Resources `harbourline-dms://openapi`, `://dashboard`, `://domo/signals`, deal/lead/customer/stock-unit detail. Prompts `triage-lead`, `prep-test-drive`, `daily-sales-briefing`, `stuck-deals-review`, `compose-promotions-review`.
- stdio: `node scripts/dms-mcp-stdio.mjs` with `DMS_API_URL`, `DMS_TOKEN`. The knowledge box has its own MCP endpoint (`kbMcpUrl` in `/dms/api/mcp/info`).

## The 19 datasets

Tables (key): sites (id), staff (id), customers (id), vehicles (stockNo/VIN), leads (id, createdAt), test_drives (id, when), deals (id, createdAt), trade_ins (id), finance_apps (id, submittedAt), promotions (id), campaigns (id), documents (id), targets (siteId+month). Derived: sales_daily (date×site×model), stock_ageing_daily (date×site×model), funnel_weekly (week×site×channel), configurator_events (event), deal_events (deal×event), dealer_signals (month×model, 15 rows). Descriptions and schemas: `content/dms/domo-datasets.json`.

## Signals back

`GET /domo/signals` (signals + priorities), `POST /domo/recompute-signals` (gm, `?dryRun=1`). The configurator reads `content/domo/*.json`; set `DOMO_CLIENT_ID`, `DOMO_CLIENT_SECRET` and dataset ids for live Domo. Public report endpoints: `GET /api/report/configurator?days=30`, `GET /api/used/report?days=30`.

## Recommended setup and gotchas

Nightly 02:30 Sydney, Replace mode, one DataSet per CSV named after the dataset; DataFlows per `docs/DOMO-REQUIREMENTS.md`; intraday via JSON lists with `from`. State (writes, uploads, tokens) resets on deploy; CSV is not incremental; site-scoped roles are partial; assistant endpoints rate-limit (429); all data synthetic; pull vs push still open on the requirements doc.
