---
title: Harbourline policy - aged stock and the ready-now bonus
model: all
topic: policy
---

# Aged stock and ready-now bonus policy

**Policy owner:** General Manager · **Applies to:** new vehicles on lot at all four sites · **Effective:** 1 July 2026

## Purpose

Cars that sit in stock cost money (floorplan interest, depreciation, lot space) and age towards a model-year change. This policy sets out how we identify aged stock, how we move it, and how we explain it to customers. It is the internal side of the customer-facing "Ready-now bonus" section of the Harbourline dealer policies.

## Definitions

- **Days in stock** – days since the unit first arrived at any Harbourline site (`arrivedAt`). Transfers between sites do not reset it.
- **Aged** – 60 or more days in stock.
- **Move priority** – 90 or more days in stock, or ranked by Domo for another reason.
- **Ready-now bonus** – a customer benefit on an aged unit: a price reduction, a free accessory pack or servicing, or a trade-in bonus.
- **Bonus headroom** – the maximum ready-now bonus Domo calculates for the unit without taking front gross below the $800 floor.

## How units are identified

Domo's nightly `aged_stock_actions` and `dealer_signals` datasets rank units by **move priority** with a **reason code**:

| Reason code | Trigger | Recommended action |
|---|---|---|
| `aged_90d` | 90+ days in stock | Move this week: feature with a manager-approved bonus |
| `aged_60d` | 60–89 days in stock | Feature against matching builds; bonus available on request |
| `days_of_supply` | Model has more than 60 days of supply | Feature in configurator and campaigns; small bonus if needed |
| `model_year_change` | New model year due within 60 days | Feature; bonus if also aged |

The Stock page shows these with **Why this is being pushed**. Staff should not invent their own priority list.

## Customer eligibility and value

- Units with **60 days or more** in stock may carry a ready-now bonus. Units under 60 days do not, unless the reason code is `days_of_supply` and the general manager approves.
- The bonus is **larger the longer the car has been in stock**, up to the unit's bonus headroom. As a guide: 60–89 days up to 60% of headroom; 90+ days up to 100% of headroom.
- The bonus may be taken as cash off the price, a published accessory or servicing promotion, or a trade-in bonus. Only one ready-now bonus per unit.

## Approval

- Within headroom: sales manager.
- Above headroom: general manager.
See the discount approval matrix. The bonus counts towards total concession.

## Honesty and disclosure

These rules are not optional; they are what we have promised customers publicly.

1. The ready-now bonus always appears on the quote and contract as its **own line item**. It is never merged into the discount.
2. We tell customers that the car has been in stock longer, and why that makes a bonus available. We never describe an aged unit as new arrival stock.
3. An aged unit is brand new, unregistered and carries the full new-vehicle warranty from delivery. If the customer asks the **build month**, tell them. The build date may be earlier than a factory-ordered car, which can matter slightly at resale.
4. No false urgency. "Only one left" may be said only if it is true across all four sites.

## Selling aged stock

1. When a customer's build matches an aged unit in model and grade, show the aged unit first with its bonus and the 2–3 business day delivery.
2. Offer a **48-hour hold** (free) if they need time. A refundable deposit (typically $1,000) converts it to a reservation.
3. If the unit is at another site, use the scheduled transfer run (Hornsby and Liverpool Thursday, Penrith Friday) at no cost.
4. Record the bonus on the deal with **Add ready-now bonus**.

## Configurator and campaigns

Aged units with move priority are shown as **ready-now offers** in the public configurator against matching builds, and may be attached to campaigns, only after the related promotion is published by a manager. The configurator wording must follow the honesty rules above.

## Review

The sales manager reviews the site's aged list every Monday. Any unit reaching 120 days is escalated to the general manager with a disposal plan (larger bonus, transfer, demonstrator conversion or wholesale).
