---
title: Harbourline DMS manual - digital experience, the configurator bridge and handover sheets
model: all
topic: manual
---

# Digital experience (configurator bridge and handovers)

The **Digital experience** page (`#/dxm`) is the digital experience manager's view of the public configurator: how customers use it, what it shows them, and what it hands to the sales team. It is also where the bridge between the configurator and the DMS is explained.

## How the configurator connects to the DMS

The configurator and the DMS run on the same server. Three connections matter:

| Connection | Endpoint | What it carries |
|---|---|---|
| Events | `POST /api/events {sid, type, data}` | Anonymous first-party interaction events, stored in `events.jsonl` |
| Test-drive booking | `POST /api/testdrive/book` | The booking. The DMS bridge creates or attaches a lead with channel **configurator**, carrying the session id, finder answers, viewed cars and the handover sheet |
| Handover | `GET /api/testdrive/handover/:bookingId` | The salesperson's briefing: car, viewed, finder answers, questions, promotions to offer, incentive, talking points, prep |

Event types logged by the configurator: `finder_answer`, `finder_result`, `build_change`, `offer_view`, `offer_click`, `ask`, `booking`, `booking_answer`. Events carry a random session id, never a name, email or phone number.

## The Digital experience page

- **Configurator report** (Domo tag) – sessions, finder starts and completions, answers by question, models configured, colours chosen, offers shown, offers clicked, questions asked and bookings, for the last 30 days. Same figures as `GET /api/report/configurator?days=30` and the `configurator_events` dataset.
- **Bookings** – every test drive booked in the configurator, with site, model, time and status of the matching DMS test drive.
- **Published to the configurator** – the promotions and ready-now offers currently visible to customers, with their provenance. This is what a customer sees today.
- **Campaign performance** – campaigns driving traffic to the configurator, with clicks and bookings.
- **Promotion exposure** – for each published promotion, how many times it was shown and clicked in the configurator.
- **Handovers** – the list from `GET /dms/api/dxm/handovers`.

The page summary is served by `GET /dms/api/dxm/overview`.

## Handover sheets

A handover sheet is created when a customer books a test drive in the configurator. It gives the salesperson everything the customer has already told us so they do not have to ask again:

- **Car** – the model, grade and colour, and the stock unit if the customer chose one.
- **Viewed** – other cars they looked at.
- **Finder answers** – for example "7 seats", "tows a caravan", "budget $60–70k".
- **Questions** – questions they asked the configurator assistant and the answers given.
- **Promotions to offer** – published promotions that apply to the car. Only these may be offered.
- **Incentive** – the test-drive incentive promised at booking.
- **Talking points** – grounded suggestions such as towing capacity or service pricing.
- **Prep** – tasks such as "fit tow bar demonstrator" or "charge the bZ4X".

## How do I review a handover?

1. On **Digital experience**, open **Handovers**, or open the test drive in **Test drives**.
2. Click **View handover**.
3. Check that the promotions listed are still published. If a promotion has been withdrawn since the booking, the sheet shows it struck through.
4. Click **Send to salesperson** to notify the assigned salesperson.

## How do I check what customers see?

Open **Published to the configurator**. Click **Preview in configurator** to open the public configurator in a new tab.

## How do I find out why a booking did not convert?

1. Open **Bookings** and click the booking.
2. The matching lead and test drive open with their outcome.
3. For patterns, use **Assistant → Ask the ERP**, for example "what share of configurator bookings at Hornsby completed a test drive last month?".

## What the DXM is responsible for

- Configurator content and offers being accurate and current.
- Event logging staying free of personal information.
- Handover sheets reaching the right salesperson before the drive.
- Campaign set-up and reporting. Publishing promotions remains a sales manager or general manager decision.
