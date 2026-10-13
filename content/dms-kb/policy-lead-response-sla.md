---
title: Harbourline policy - lead response service levels (SLAs)
model: all
topic: policy
---

# Lead response SLAs

**Policy owner:** Sales Manager (each site) · **Applies to:** every lead from every channel · **Effective:** 1 July 2026

## Purpose

Customers who contact several dealers usually buy from the one that responds first and best. This policy sets response targets, explains how they are measured, and says what happens when they are missed.

## Showroom hours

| Day | Hours |
|---|---|
| Monday to Friday | 8:30 am – 6:00 pm |
| Saturday | 8:30 am – 5:00 pm |
| Sunday | 10:00 am – 4:00 pm (Parramatta and Penrith only) |
| Public holidays | Closed |

"In hours" means within these hours at the lead's site.

## Response targets

| Measure | Target |
|---|---|
| **First contact, in hours** | Within **15 minutes** of the lead being created |
| First contact, out of hours | By **9:15 am** the next opening day (an automatic acknowledgement is sent immediately) |
| Lead assigned to a salesperson | Within 5 minutes in hours (unassigned leads are shown in red) |
| Configurator booking confirmed with the customer | Within 15 minutes in hours, and the day before the drive |
| Quote sent after a request | Same day if requested before 3:00 pm; otherwise by 11:00 am next opening day |
| Follow-up after a test drive | Same day |
| Follow-up after a no-show | Same day |
| Unresponsive lead | At least 3 attempts over 7 days, using at least 2 channels, before marking lost with reason "no response" |

**First contact** means a real person speaking to or personally replying to the customer: a phone call that connects, a personal email or SMS that answers their enquiry, or a conversation in the showroom. An automatic acknowledgement does not count. A call that goes to voicemail counts only if followed by a personal SMS or email within the same 15 minutes.

## How it is measured

- The clock starts at the lead's `createdAt`.
- It stops when the first **Log contact** is recorded on the lead, or when a follow-up is sent from the DMS with **Send**.
- Out-of-hours leads start the clock at opening time.
- Leads not contacted within the target show in the **Overdue** filter on Leads, and the sales manager is notified.

The SLA report is available on the dashboard (click the **Leads** tile) and in the `leads` dataset for Domo.

## Channel guidance

- **Configurator leads** – read the Configurator panel first. Use their finder answers and viewed cars; do not ask questions they already answered. If they booked a test drive, confirm the time and mention the incentive they were offered.
- **Web-form leads** – reply on the channel they used, then call.
- **Phone leads** – a call taken live is first contact; log it before hanging up.
- **Walk-ins** – create the lead before the customer leaves.
- **Campaign leads** – mention the campaign offer only if it is still published.

## Using AI drafting

**Draft follow-up** on the lead produces an email or SMS grounded in the lead's data and current published promotions. It is a good way to meet the 15-minute target with a personal reply, provided you read and edit it before sending. It does not count as contact until you click **Send**.

## Escalation

1. At 15 minutes without contact in hours: the owner is reminded.
2. At 30 minutes: the sales manager is notified and may reassign the lead.
3. At 2 hours: the general manager sees the lead on the daily exceptions list.

## Targets for the team

Each site aims for at least **90%** of in-hours leads contacted within 15 minutes each month, and 100% within 2 hours. Results by salesperson are reviewed at the weekly sales meeting.

## Customer preferences

If the customer asks not to be called, respect it and use email or SMS. If they ask to stop all contact, mark the lead lost with reason "other", note the request, and turn off marketing consent on the customer record.
