# Harbourline DMS · Domo Reporting and ETL Requirements

As of 14 Oct 2026. Living copy: https://claude.ai/code/artifact/3890a2ca-186c-4103-8291-8aaaba09a867 (comment there; this file mirrors it).

## Purpose and scope
Domo must turn the Harbourline DMS and the customer configurator into one set of dashboards, reports and ETL dataflows that Revolution Software can see running end to end: ERP data in, decisions out, and the decisions flowing back into the customer experience as nudges and promotions. Everything is built inside Domo (connectors, Magic ETL, DataSets, Beast Modes, cards, pages, alerts, scheduled reports, writeback) against the synthetic data the DMS ships. In scope: new-vehicle sales for the four sites, 24 months of history to 14 Oct 2026, configurator first-party events, and the two feedback loops the configurator consumes (dealer signals, promotion targets). Out of scope: service, parts, accounting, used vehicles, live Toyota/Revolution connections.

## Source systems and datasets
Nineteen DataSets from `/dms/api/domo/export/<name>.csv` (catalogue with schema at `/dms/api/domo/datasets`): 13 ERP tables exported nightly 02:00 Sydney (sites 4, staff 24, customers 3,895, vehicles 492, leads 5,748, test_drives 2,102, deals 2,068, trade_ins 952, finance_apps 1,378, promotions 25, campaigns 18, documents 60, targets 108) and six derived (sales_daily, stock_ageing_daily, funnel_weekly, configurator_events, dealer_signals, deal_events). Conventions: Australia/Sydney datetimes; JSON columns as strings; exclude leads with mergedIntoLeadId; realised gross only where stage = delivered; sales90d and days of supply use from-stock deliveries; Oct 2024 starts the 15th; Oct 2026 is month-to-date.

## ETL flows
| Flow | Component | Input | Output | Schedule | Rules |
|---|---|---|---|---|---|
| F1 Load ERP tables | HTTP/CSV connectors, bearer token (DMS personal access token) | 13 table exports | dms_<table> raw | nightly 02:05 replace | type columns, keep JSON as text, add load_ts |
| F2 Sales and funnel | Magic ETL | leads, test_drives, deals, targets, staff, sites | sales_daily, funnel_weekly, deal_events, deal_stage_durations | 02:20 | drop merged duplicates; JSON Expand deals.events; stage duration = next event − this; realised gross only; attainment joins targets; Oct 2024 pro-rated |
| F3 Stock, ageing, signals | Magic ETL | vehicles, deals, promotions, prior stock_ageing_daily | stock_ageing_daily (append), dealer_signals, aged_stock_actions, stock_by_site, inbound_pipeline | 02:30 | snapshot on-lot per site×model; sales90d = from-stock deliveries; DoS = (on_lot+in_transit)/(sales90d/90); allocation = ordered; target gap = target − MTD; move priority by age>60 and headroom |
| F4 Writeback | Domo Writeback (HTTP POST) or scheduled export | dealer_signals, aged_stock_actions, stock_by_site, inbound_pipeline | POST /dms/api/domo/recompute-signals → content/domo/*.json | 02:45 + on demand | exact schema; DMS validates, rejects partial; configurator refreshes within 15 min |
| F5 Configurator events | HTTP/JSON connector | /api/report/configurator, configurator_events.csv | configurator_events (append, dedupe sid+at+type) | every 15 min | no PII by contract; join to leads.configuratorSessionId and test_drives.id |

Error handling: every flow writes row count and checksum to dms_load_audit; zero rows or failed validation keeps yesterday's output and raises the ETL-failed alert; F4 is idempotent.

## Domo data model
Stars: Sales (deal grain), Funnel (lead), Stock (unit per day), F&I (application), Trade-ins (appraisal), DXM (event). Dimensions: sites, staff, customers, vehicles, models (from the configurator catalogue), calendar (fiscal year from 1 July, NSW school-holiday flag), promotions. Shared Beast Modes: gross per unit, target attainment, lead→delivery, test-drive rate, close rate on test drives, F&I penetration, days of supply, ageing band, discount+bonus share, days in stage, lead response minutes, configurator attribution. PDP: salesperson = own rows; sales manager = own site; GM, business manager, DXM = group; customer PII hidden except sales manager/GM; DXM subject carries no customer columns.

## Dashboards
Group performance (GM) · Sales pipeline and stuck deals (sales manager; thresholds quote 7, negotiation 5, finance 5, approval 2, contract 3, delivery 10) · Funnel and lead response (15-minute SLA) · My desk (salesperson, PDP) · Stock and ageing (DoS Domo vs ERP, heat map, move-priority list) · F&I and trade-ins · Digital experience (sessions, finder, bookings, offers, campaigns; no PII) · Promotions and nudges (targets, provenance, weights over time). Each card states its measure and DataSet; numbers must equal the DMS dashboard for the same filter.

## Scheduled reports and alerts
Reports: daily sales briefing 07:00; weekly pipeline review Mon 08:00; monthly performance pack; stock and ageing Mon/Thu 07:30; configurator and campaign Mon 08:00; signals writeback confirmation 03:00. Alerts: stuck deal; lead response SLA; aged stock 60/90; days of supply <20 or >75; target at risk on the 15th; configurator spike; ETL failed.

## Governance
Session ids only in DXM; PII masked by role; nudges capped at 12 fit points and always explained to the customer; promotions selected by Domo, composed from the knowledge box, validated by the DMS, published by a manager; retention 13 months for events, 90 days for audit; data owner owns connectors and dataflows, dealer owns pages and alerts; one glossary per page.

## Delivery plan and open questions
Phase 1 load and core pages (~3 days) → phase 2 loop and experience (~2 days) → phase 3 personas and polish (~2 days). Open: pull vs push (assumed pull); Writeback vs export (assumed Writeback); fiscal year (assumed 1 July); knowledge-box usage DataSet needs an assistant log endpoint (phase 3); Revolution systems and Domo zone for a pilot; customer-visible headroom vs approved offer (assumed approved).
