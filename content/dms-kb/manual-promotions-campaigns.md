---
title: Harbourline DMS manual - promotions and campaigns (Domo targets, ARAG composition, publishing)
model: all
topic: manual
---

# Promotions and campaigns

Harbourline's promotions are built in three steps, and the DMS shows each step and who did it:

1. **Domo selects the targets.** The nightly `dealer_signals` and `aged_stock_actions` datasets say which models and units need help (aged stock, long days of supply, a target gap) and how much incentive headroom each has.
2. **Progress Agentic RAG composes the promotion.** It drafts the title, customer wording, value, eligibility and reason, grounded in the dealer policies and the knowledge base, and it can only offer value within the headroom Domo supplied.
3. **A manager publishes it.** Nothing reaches the configurator, a quote or a campaign until a sales manager or the general manager clicks **Publish**.

## The Promotions page

The **Promotions** page (`#/promotions`) has three columns:

- **Domo targets** (Domo tag) – models and units with their reason code, days in stock, days of supply and headroom.
- **Composed** (Progress Agentic RAG tag) – draft promotions waiting for review.
- **Published** – live promotions with start and end dates and the campaigns they are attached to.

Each promotion has: id, title, kind (price, servicing, accessory-bundle, finance-rate, trade-in-bonus), value in dollars, applies-to rules (models, specific units, aged-only, body types), start and end dates, status (draft, published, expired, withdrawn) and **provenance**.

## Provenance

Click **Provenance** on any promotion to see:

- The Domo rows that selected it (dataset, refresh time, unit or model, reason code, headroom).
- The knowledge-base passages ARAG cited when composing it.
- Who published it and when.

If a promotion has no Domo provenance, it was created manually and must say so.

## How do I compose promotions?

1. On **Promotions**, check the **Domo targets** column is fresh (the refresh time is shown).
2. Click **Compose promotions**. The DMS asks ARAG to draft one promotion per target group.
3. Drafts appear in **Composed**. Each shows value against headroom, eligibility and the customer wording.

## How do I review and publish a promotion? (sales manager or general manager)

1. Open a draft in **Composed**.
2. Check: value is within headroom; the wording is true for every eligible unit; the end date is set; no promise is made that the policy does not allow (see promotions governance).
3. Edit the wording with **Edit** if needed.
4. Click **Publish**. The promotion becomes visible to the configurator (`promotions.generated.json`), to quotes and to campaigns.
5. To stop a live promotion, click **Withdraw**. Quotes already issued keep the promotion until they expire.

## How do I add a promotion to a deal?

On the deal's Pricing card click **Add promotion**. Only published promotions whose applies-to rules match the deal's car are listed.

## Campaigns

A **campaign** sends a message to an audience over one channel. The **Campaigns** page (`#/campaigns`) lists all 18 campaigns with channel (email, SMS, web, social), audience, dates, attached promotions, budget and results: sent, opened, clicked and leads created.

### How do I create a campaign? (digital experience manager)

1. Click **New campaign**.
2. Enter a **Name**, choose the **Channel** and set **Start** and **End** dates.
3. Build the **Audience** from customer tags, suburbs, models of interest or lead status. Customers without marketing consent are excluded automatically; the count shown is after exclusion.
4. Click **Attach promotion** and choose one or more published promotions. Draft promotions cannot be attached.
5. Enter the **Budget**.
6. Click **Save draft**, then **Schedule** when approved.

### How do I measure a campaign?

Open the campaign. The results card shows sent, opened, clicked, leads, test drives and deals attributed (leads with channel **campaign** and the campaign id). Cost per lead = budget ÷ leads. The `campaigns` dataset on **Insights** feeds the same numbers to Domo.

## The honesty rule

Promotions describe aged stock honestly: a ready-now bonus is offered because the car has been in stock longer, and we say so. Never describe an aged unit as "just arrived", and never imply scarcity that does not exist.
