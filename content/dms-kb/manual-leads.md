---
title: Harbourline DMS manual - leads, lead statuses, configurator data and AI follow-up
model: all
topic: manual
---

# Leads

A **lead** is a person who has shown interest in buying a vehicle. Leads arrive from the online configurator, the website form, the phone, walk-ins and campaigns. The **Leads** page (`#/leads`) lists them; each lead opens at `#/leads/:id`.

## Lead fields

| Field | Meaning |
|---|---|
| Source | Where the customer came from: web-configurator, walk-in, phone, referral, campaign, service |
| Channel | How the lead arrived: configurator, web-form, phone, walk-in, campaign |
| Owner | The salesperson responsible. Unassigned leads show **Unassigned** in red |
| Interest | Model, grade, colour and, if chosen, a specific stock number (HL-####) |
| Score | 0–100. Higher means more likely to buy soon. Driven by finder completion, cars viewed, offers clicked and whether a test drive is booked |
| Status | See below |

## Lead statuses

| Status | Meaning | Moves to |
|---|---|---|
| new | Received, no contact yet. The response clock is running | contacted |
| contacted | A person has spoken to or replied to the customer | qualified, lost |
| qualified | Budget, timing and vehicle confirmed | test_drive_booked, quoted |
| test_drive_booked | A test drive exists for this lead | quoted, lost |
| quoted | A deal has been created at stage **quote** | won, lost |
| won | The deal reached **delivered** | – |
| lost | Closed without a sale. A lost reason is required | – |

A lead cannot be marked **lost** without a **lost reason** (bought elsewhere, price, finance declined, timing, no response, other).

## The configurator first-party panel

Leads with channel **configurator** show a **Configurator** panel. Everything in it was captured by Harbourline's own configurator with the customer's session id, not bought from a third party:

- **Finder answers** – what the customer told the vehicle finder (for example seats needed, towing, budget band).
- **Viewed cars** – the models and stock units they opened.
- **Offers clicked** – ready-now offers they clicked, with the stock number.
- **Booking** – the test drive they booked, if any.
- **Handover sheet** – the briefing prepared for the salesperson: the car, questions the customer asked, promotions that may be offered, the test-drive incentive and talking points.

Use this panel before you call. Opening with "I can see you were looking at the Kluger Grande at Hornsby" is better than "how can I help?".

## How do I create a lead?

1. On **Leads**, click **New lead**.
2. Search for the customer by name, email or phone. If none exists, click **Create customer** and complete first name, last name and at least one of email or phone.
3. Choose **Channel**, **Source**, **Site** and **Interest** (model is required, grade optional).
4. Click **Save lead**. The lead is created with status **new** and assigned to you unless you choose another owner.

## How do I assign or reassign a lead? (sales manager)

1. Tick one or more leads in the list.
2. Click **Assign** and choose a salesperson.
3. The previous owner and the new owner both see a note in the lead's history.

## How do I log contact?

1. Open the lead.
2. Click **Log contact**, choose the method (call, email, SMS, in person) and write a short note.
3. Click **Save**. If the lead was **new**, it moves to **contacted** and the response time is recorded for the SLA report.

## How do I draft a follow-up with AI?

1. Open the lead and find the **Follow-up** card (tagged Progress Agentic RAG).
2. Choose **Channel** (Email or SMS) and **Tone** (Friendly, Professional or Brief).
3. Click **Draft follow-up**. The DMS calls `POST /dms/api/leads/:id/followup`.
4. Read the draft. It uses the customer's configurator data, current promotions that apply to their interest, and dealer policy. It never invents a promotion: if no published promotion applies, the draft will not mention one.
5. Edit if needed, then click **Copy** or **Send**. Sending logs a contact.

## How do I book a test drive from a lead?

Click **Book test drive**. See the Test drives chapter. The lead moves to **test_drive_booked**.

## How do I convert a lead to a deal?

1. Open the lead.
2. Click **Create deal**.
3. Choose the stock unit (or **Factory order** with model, grade and colour), then click **Create**. The deal starts at stage **quote** and the lead moves to **quoted**.

## How do I mark a lead lost?

Click **Mark lost**, choose a **lost reason**, add a note and click **Confirm**.

## Filters

Use **Mine**, **Unassigned**, **New**, **Overdue** (past the response SLA) and **Configurator** filters above the list. The search box matches customer name, email, phone and lead id.
