---
title: Harbourline DMS manual - test drives, bookings, handover sheets and outcomes
model: all
topic: manual
---

# Test drives

The **Test drives** page (`#/test-drives`) lists every booked, completed, no-show and cancelled test drive. Each test drive has an id in the form **TD-xxxxx**, a lead, a customer, a site, a salesperson, a model and grade and, where a specific car is used, a stock number.

Bookings made by customers in the online configurator appear here automatically. The configurator calls `POST /api/testdrive/book`, and the DMS bridge creates or attaches a lead with channel **configurator** that carries the session id, finder answers, viewed cars and the handover sheet.

## Statuses

| Status | Meaning |
|---|---|
| booked | Date and time agreed. Shows on the site's day list |
| completed | The drive happened. An outcome is required |
| no_show | The customer did not attend and did not cancel. Follow up within the same day |
| cancelled | Cancelled by the customer or the dealer before the time |

## The day list

The default view is **Today** for your site. Columns: time, customer, model and grade, stock number, salesperson, status and a **Prep** indicator. Prep is green when the demonstrator is washed, fuelled or charged, and the licence has been checked.

Switch to **Week** to plan demonstrator use. Demonstrators are vehicles with status **demo** in Stock.

## The test-drive record

Opening a test drive shows:

- **Car** – the stock unit or demonstrator, with VIN and registration.
- **Customer** – name, contact, licence check status.
- **Questions** – questions the customer asked in the configurator before booking, with the answers they were given. Use them to plan the drive.
- **Incentive** – the test-drive incentive offered at booking (for example a towing set-up session). Honour exactly what was offered.
- **Handover sheet** – the briefing for the salesperson: car, viewed models, finder answers, promotions that may be offered, talking points and prep tasks.
- **Outcome** – recorded after the drive.

## How do I book a test drive?

1. From a lead, click **Book test drive**. From the Test drives page, click **New test drive** and select the lead.
2. Choose **Site**, **Date and time**, **Model** and **Grade**.
3. Optional: choose a specific **Stock unit**. Only units with status on_lot or demo are offered.
4. Choose the **Salesperson**.
5. Click **Book**. The lead moves to **test_drive_booked**.

## How do I prepare for a booked drive?

1. Open the test drive and read the **Handover sheet**.
2. Tick the prep tasks: vehicle washed, fuelled or charged, plates and insurance current, route chosen.
3. When the customer arrives, click **Check licence**, sight the licence and record the licence number's last four digits and expiry. Do not photograph or upload the licence unless the customer is taking an extended drive.

## How do I record the outcome?

1. After the drive, click **Complete**.
2. Choose an **Outcome**: Wants a quote, Thinking about it, Not suitable, Wants a different model.
3. Add notes, especially anything that will affect the deal (trade-in, finance, timing).
4. Click **Save**. If the outcome is **Wants a quote**, click **Create deal** from the same screen.

## How do I record a no-show?

Click **No show**. The DMS creates a follow-up task for the salesperson. Call the customer the same day and offer a new time.

## How do I cancel or reschedule?

Click **Reschedule** to change the time (the status stays **booked**), or **Cancel** with a reason.

## Extended and towing drives

- **Extended drives** (up to 24 hours) need sales-manager approval, a licence copy uploaded as a document of kind **licence**, and a signed extended-drive agreement.
- **Towing drives** are run from Penrith by appointment with the demonstrator caravan.

See the test-drive policy for licence, insurance excess and route rules.

## Reporting

The test-drive rate on the dashboard is leads with a completed test drive divided by leads created. Completed drives that convert to a delivered deal within 30 days count as "drive-to-sale" on the leaderboard.
