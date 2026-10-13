---
title: Harbourline DMS manual - stock, ageing, Domo signals and move priorities
model: all
topic: manual
---

# Stock and ageing

The **Stock** page (`#/stock`) shows every vehicle the group holds or has on order. Each unit has a stock number in the form **HL-####**, a VIN, a site, the configurator model id (for example `rav4`, `kluger`, `prado`), grade, colour, interior and fitted accessory packs. The 22 units shown to customers in the online configurator are the same units, with the same stock numbers, as on this page.

## Vehicle statuses

| Status | Meaning |
|---|---|
| on_lot | Physically at a site and available to sell |
| in_transit | On its way from Toyota or between sites |
| allocated | Allocated by Toyota to Harbourline but not yet shipped |
| ordered | Factory order placed for a customer deal |
| demo | Demonstrator used for test drives |
| sold | Attached to a delivered deal |

A unit held for a customer (48-hour hold or deposit) shows a **Held** badge while its status stays on_lot.

## Days in stock and ageing bands

**Days in stock** counts from `arrivedAt` (the day the unit arrived at any Harbourline site). It does not reset when a unit moves between sites.

| Band | Colour on the heat map | Meaning |
|---|---|---|
| 0–30 days | Green | Fresh |
| 31–59 days | Amber | Watch |
| 60–89 days | Orange | Aged: eligible for a ready-now bonus |
| 90+ days | Red | Move priority: feature this week |

## The ageing heat map

The **Heat map** view shows sites as rows and models as columns. Each cell shows the number of on-lot units and is coloured by the oldest unit in it. Click a cell to list the units.

## Domo signals and move priorities

Domo runs the `dealer_signals` dataflow nightly over the stock ledger, sales history, Toyota allocation and monthly targets. For each model it publishes days of supply, next month's allocation, target gap, average days in stock and average incentive headroom. For individual units it publishes:

- **Move priority** – 1 is the most urgent.
- **Reason code** – why the unit is being pushed:
  - `aged_90d` – 90 or more days in stock.
  - `aged_60d` – 60 to 89 days in stock.
  - `days_of_supply` – the model has too many days of supply for its sales rate, even if this unit is younger.
  - `model_year_change` – a new model year arrives soon.
- **Bonus headroom** – the most a manager can approve as a ready-now bonus on this unit without going below the group's floor gross.

The **Domo signals** card on Stock lists priority units in order. Each row has a **Why this is being pushed** link that explains the reason code, the days in stock and the headroom in plain words, for example: "RAV4 Cruiser HL-2231 at Parramatta has been in stock 94 days (aged_90d). Up to $1,800 can be approved as a ready-now bonus."

## How do I find a car for a customer?

1. On **Stock**, type the model in the search box or use the **Model**, **Grade**, **Colour** and **Site** filters.
2. Set **Status** to on_lot (and in_transit if the customer can wait).
3. Sort by **Days in stock** descending to see aged units first. Offering an aged unit with a ready-now bonus is usually better for the customer and the dealer than a factory order.
4. Click a unit to see its full record and any open deals or holds.

## How do I place a 48-hour hold?

1. Open the unit and click **Hold 48 h**.
2. Choose the customer or lead and click **Confirm**.
3. The unit shows **Held** with an expiry time. One hold per customer at a time. If the unit is being transferred, the 48 hours start when it arrives.

## How do I request a transfer?

1. Open the unit and click **Request transfer**.
2. Choose the destination site. The next scheduled run is shown: Hornsby and Liverpool on Thursday, Penrith on Friday.
3. Click **Submit**. The unit status becomes in_transit when the run departs.

## How do I apply a ready-now bonus?

The bonus is applied on the deal, not on the unit. In the deal's **Pricing** card click **Add ready-now bonus**. The headroom for the unit is shown; amounts within headroom are approved by the sales manager, amounts above headroom by the general manager. The bonus always appears on the quote as its own line.

## Exports

Click **Export CSV** to download the current view. The full ageing history is the `stock_ageing_daily` dataset on **Insights**.
