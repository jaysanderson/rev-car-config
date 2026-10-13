---
title: Harbourline DMS manual - dashboard, KPI strip and Domo cards
model: all
topic: manual
---

# Dashboard and Domo cards

The **Dashboard** (`#/dashboard`) is the first page after signing in. It answers three questions for the selected site and month: are we on target, where is the gross, and what needs attention today. Every number on it comes from the DMS API (`GET /dms/api/kpi/overview`), and every chart is a **Domo card** that names the dataset it is drawn from, so the same figure can be rebuilt in the group's Domo instance.

## The KPI strip

The strip across the top shows, for the selected site and month:

| Tile | Definition |
|---|---|
| Units delivered | Deals that reached stage **delivered** with a delivery date in the month |
| Target attainment | Units delivered ÷ the site's monthly unit target, as a percentage |
| Gross | Front gross + back gross of delivered deals |
| Avg gross / unit | Gross ÷ units delivered |
| Leads | New leads created in the month, all channels |
| Conversion | Leads won ÷ leads closed (won + lost) in the month |
| Test-drive rate | Leads with a completed test drive ÷ leads created |
| Days to close | Median days from lead created to deal delivered |
| Aged stock | On-lot units with 60 or more days in stock |

Click a tile to open the list behind it. For example, clicking **Aged stock** opens **Stock** filtered to 60+ days.

## Domo cards

Each card is labelled **Domo card · dataset `name`** in its footer. The dataset name is the same one listed on **Insights** and exported at `/dms/api/domo/export/<dataset>.csv`.

| Card | Dataset | What it shows |
|---|---|---|
| Units vs target | `sales_daily` | Cumulative units delivered this month against a straight-line target |
| Gross by site | `deals` | Front and back gross per site, stacked |
| Funnel | `funnel_weekly` | Leads → contacted → test drive → quoted → won for the last 12 weeks |
| Stock ageing | `stock_ageing_daily` | On-lot units in 0–30, 31–59, 60–89 and 90+ day bands |
| Days of supply | `dealer_signals` | Units in stock ÷ average daily sales over 90 days, by model |
| Leaderboard | `deals` | Salespeople ranked by units and gross this month (`GET /kpi/leaderboard`) |

### Reading the cards

- **Units vs target.** If the actual line is below the target line after the 20th of the month, the gap is usually closed by aged-stock pushes and open deals in **contract** and **delivery**. Check the pipeline before approving extra discount.
- **Stock ageing.** Units in the 90+ band are move-priority stock under the aged-stock policy. Any growth in the 60–89 band means next month's 90+ problem.
- **Days of supply.** Under 30 days is tight: protect gross and do not offer ready-now bonuses on that model. Over 60 days is long: Domo will usually flag the model with reason code `days_of_supply`.
- **Funnel.** A falling test-drive step with steady leads usually means slow first contact. Compare with the lead-response SLA report.

## How do I change the period?

1. Use the **month picker** in the page header. The default is the current month.
2. To see a trend, click **View series** on any card. This calls `GET /dms/api/kpi/series?metric=<metric>&by=month` and draws 24 months.
3. Click **Week** to switch the series to weekly buckets.

## How do I see another site?

Use the **site switcher** in the rail. General managers can choose **All sites**, which adds a site breakdown to the Gross by site and Leaderboard cards.

## How do I get the data into Domo?

Click **Open in Insights** on any card. The Insights page shows the dataset's schema, row count, refresh time and the CSV export link that Domo's connector can pull. See the Insights chapter for connector set-up.

## How do I ask a question about a number?

Click **Ask about this** on a card. The DMS opens **Assistant → Ask the ERP** pre-filled with a question about the card, for example "Why is Penrith below target this month?". The agent answers with the deals and stock rows it looked at as evidence.

## Notes for managers

- The dashboard is calculated on request; there is no overnight batch. Figures change as soon as a deal moves stage.
- Gross on the dashboard is gross at the deal's current stage. Gross on deals not yet **delivered** is forecast, shown with a dotted outline.
- Targets are set per site and month in the `targets` table by the general manager.
