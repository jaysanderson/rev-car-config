---
title: Harbourline DMS manual - insights, Domo datasets and CSV exports
model: all
topic: manual
---

# Insights and Domo exports

The **Insights** page (`#/insights`) is the catalogue of every dataset the DMS publishes for Domo. It shows what each dataset contains, how big it is, when it refreshed, its schema and a CSV export link. It is the hand-off point between the DMS and the group's Domo instance.

## Why Domo pulls from the DMS

The DMS is the system of record for sales. Domo is where the group combines sales with other data (service, used cars, marketing spend, OEM targets), builds the dashboards managers use, and runs the dataflows that produce **dealer signals**: days of supply, target gap, move priority and incentive headroom. Those signals flow back into the DMS (Stock, Promotions) and into the configurator's ready-now offers.

## The dataset catalogue

`GET /dms/api/domo/datasets` returns the catalogue. Each entry has a name, description, row count, last refresh, CSV URL and schema (column names and types).

| Dataset | Grain | Use in Domo |
|---|---|---|
| `sites` | One row per site | Join key `siteId` for every other dataset |
| `staff` | One row per staff member | Salesperson names for leaderboards |
| `customers` | One row per customer (no notes) | Source mix, suburb heat maps |
| `leads` | One row per lead | Funnel, response times, channel performance |
| `test_drives` | One row per test drive | Test-drive rate, no-show rate |
| `deals` | One row per deal | Units, gross, pipeline, lost reasons |
| `vehicles` | One row per unit | Stock position, ageing |
| `trade_ins` | One row per trade-in | Over- and under-allowance |
| `finance_apps` | One row per application | Penetration, approval rate by lender |
| `promotions` | One row per promotion | Promotion cost and uptake |
| `campaigns` | One row per campaign | Cost per lead |
| `targets` | Site × month | Target attainment |
| `sales_daily` | Site × model × day | Daily units and gross |
| `stock_ageing_daily` | Site × model × day | Units by ageing band |
| `funnel_weekly` | Site × week | Leads, contacted, drives, quotes, wins |
| `configurator_events` | One row per event | Configurator engagement (session id only, no personal information) |
| `dealer_signals` | One row per model | The signals Domo produces, exported back for audit |

All money columns are whole Australian dollars. All dates are ISO 8601 in Sydney time.

## How do I export a dataset?

1. Open **Insights**.
2. Find the dataset and click **Schema** to check the columns.
3. Click **Export CSV**. The file downloads from `/dms/api/domo/export/<dataset>.csv` filtered by the site switcher.

## How do I connect Domo?

1. In Domo, create a new DataSet with the **CSV (Advanced)** or **JSON No Code** connector, using HTTPS pull.
2. Use the URL shown by **Copy CSV URL**, for example `https://<host>/dms/api/domo/export/deals.csv`.
3. Add the header `Authorization: Bearer <service token>`. Ask the general manager for a reporting service token; never use a personal login.
4. Set the update schedule. Daily at 05:00 is recommended so the overnight `dealer_signals` dataflow sees yesterday's sales.
5. Repeat for each dataset you need, then join on `siteId`, `customerId`, `dealId`, `leadId` and `stockNo` in a Magic ETL or SQL dataflow.

The **How to connect Domo** card on Insights repeats these steps with the correct host filled in.

## Signals coming back from Domo

`GET /dms/api/domo/signals` returns the current dealer signals plus derived priorities. Stock and Promotions read this. The refresh time is shown everywhere a signal is used, so you can tell if Domo has not run.

## How do I check a number matches Domo?

1. Note the dataset named on the Domo card (for example `sales_daily`).
2. Export the CSV with the same site and month filter.
3. Sum the column in a spreadsheet or in Domo. It should match the card exactly; if not, check the filters and the refresh time.

## Data rules

- Exports contain no customer notes, licence details or finance application details beyond lender, amount, term and status.
- Configurator events contain a random session id only.
- Report a mismatch between Domo and the DMS to the DMS administrator rather than adjusting either by hand.
