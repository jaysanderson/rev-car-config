---
title: Harbourline DMS manual - service job cards (workshop flow, memos, photos, documents, asking the agent)
model: all
topic: manual
---

# Service job cards

The **Job cards** page (`#/service`) is the workshop's system of record. Every vehicle that comes in for service or repair gets one job card: who the customer is, what they asked for, what the technician found, the labour and parts lines, the memos people write along the way, the photos and documents, and the vehicle's earlier visits. Progress Agentic RAG reads each card, so you can ask a question about one card or across all of them.

The page has two views: **Board** (one column per status, newest at the top) and **List** (a table with filters for status, site, advisor, technician, registration and VIN). Service managers see every site; technicians see the cards assigned to them.

## The workshop flow

A job card moves through these statuses in order. Each move is a button on the card and is written to the card's history with the time and who clicked it.

| Status | Meaning | Button that moves it here |
|---|---|---|
| booked | The customer has a time; nothing has arrived yet | **New job card** |
| checked_in | The vehicle is on site, the customer's requests are confirmed, the odometer is recorded | **Check in** |
| in_progress | A technician is working on it | **Start work** |
| awaiting_parts | Work is paused until a part arrives (the parts memo says which) | **Awaiting parts** |
| awaiting_approval | Extra work was found and the customer, or an advisor, must approve it | **Request approval** |
| completed | All approved work is done and road-tested | **Complete** |
| invoiced | The invoice has been raised against the card | **Invoice** |
| collected | The customer has the car and the card is closed | **Collected** |
| cancelled | The booking did not go ahead | only from booked or checked_in |

A card can go back one step (for example from in_progress to checked_in if the wrong car was started) using the **Back a step** link in the card's status history. It cannot skip forward.

## What a job card holds

- **Vehicle**: VIN, registration, make, model, year and the odometer reading recorded at check-in. Toyota models link to the catalogue model.
- **Customer**: linked to the customer record, with phone and email.
- **Advisor and technician**: the service advisor who owns the card and the technician assigned to it.
- **Promised time**: when the customer expects the car back, and whether they are **waiting** on site or have a **loan car**.
- **Customer requests**: what the customer asked for, in their words, one line each.
- **Findings**: what the technician found, one line each. These are the lines the agent quotes when a customer asks "what did you find".
- **Lines**: labour, parts, sublet and menu lines with quantity, hours, unit price and total. A menu line comes from an Infomedia service menu and expands into its labour and parts (see the Infomedia chapter). Lines over the approval thresholds in the workshop policy are marked **needs approval** until an advisor or the customer approves them.
- **Memos**: the running notes, by kind (next section).
- **Photos**: images attached to the card, each with a caption (damage on arrival, odometer, dash warning lights, tyre tread, before and after).
- **Documents**: inspection reports, supplier invoices for parts and sublet work, authorisations.
- **Vehicle history**: earlier job cards for the same VIN, with their findings.
- **Campaigns and recalls**: open OEM campaigns for this VIN from the Infomedia pack, with a one-click **Add to lines**.

## Memo kinds and who writes them

| Kind | Written by | Use it for |
|---|---|---|
| customer_note | Service advisor | What the customer said at booking or check-in, how they want to be contacted |
| tech_note | Technician | What was inspected, measured or replaced; readings and torque values |
| advisor_note | Service advisor | Calls made, approvals given, promised-time changes |
| parts_note | Parts | Which part is on order, the supplier, the expected date |
| quality | Workshop controller | Road test, quality check, anything to watch next visit |
| call | Anyone | A call or message with the customer, with the outcome |

Click **Add memo**, pick the kind, type the note and save. A memo cannot be deleted; it can be edited for ten minutes and **Pin**ned so it stays at the top of the timeline. Pinned memos are the first thing the agent sees when you ask about the card.

## How do I add a photo or a document?

1. On the card, click **Add photo** (jpg or png, up to 6 MB) or **Upload document** (PDF, inspection report, invoice or authorisation).
2. Give the photo a caption that says what it shows ("Kerb rash front-left alloy, on arrival"). Captions are how the agent knows what the image is.
3. The file is stored against the card (`POST /dms/api/job-cards/:id/documents`) and shown in the gallery or the documents list.
4. Documents can be processed the same way as deal documents (**Process with ARAG**), which extracts the fields from a supplier invoice or inspection report.

When a card changes, its knowledge-box resource is refreshed a few seconds later with the card text, the memos, the findings and the attachments, so the agent always sees the latest state. **Sync to knowledge box** forces it.

## Asking the agent about one job card

Open the card and use the **Ask about this job card** panel. Suggested questions are shown as chips: "What did the technician find?", "Is the customer waiting?", "What is outstanding before collection?", "Which parts are we waiting on?". Type your own in any language.

The answer is grounded in this card only: its lines, requests, findings, memos (pinned first), captions of its photos, its documents and the vehicle's earlier cards, plus the workshop policies. The answer cites what it used. The DMS calls `POST /dms/api/job-cards/:id/ask` with the card's resource as the retrieval scope.

What it cannot see: other customers' cards, the stock ledger, prices outside the card, or anything not written on the card. If a memo was never written, the agent will say the card does not record it.

## Asking across all job cards

On the list or board, click **Ask across job cards**. Typical questions: "Which cards are waiting on parts for more than two days?", "What are the most common findings on RAV4s this month?", "Which waiting customers have passed their promised time?", "Which technician has the most open cards at Penrith?".

The DMS calls `POST /dms/api/job-cards/ask`. Retrieval runs over every card in the knowledge box, and the agent is also given a structured summary of the cards that match your filters (counts by status, open cards, cards awaiting parts, overdue promises). The answer lists the cards it relied on as evidence, each a link to the card. It cannot see cards from sites outside your role's scope.

## The handover note

On a completed card click **Handover note**. The agent writes the note the advisor reads to the customer at collection: what was done, what was found, what was not done and why, and what to watch before the next service. It is written from the card and its memos, cites them, and can be produced in the customer's language. The DMS calls `POST /dms/api/job-cards/:id/summary`. Edit it before you use it; the agent does not know what you said on the phone unless it is in a memo.

## Promised times, waiting customers and loan cars

Promised times are set at booking and confirmed at check-in. A card whose promised time has passed without **Complete** shows an amber **Overdue** badge on the board. A waiting customer is marked **Waiting** and sorts to the top of the technician's list. A loan car is recorded on the card and must be returned before **Collected**. The workshop policy sets the windows, how a delay is communicated and the approval thresholds for extra work.

## Rules

- Record the odometer and the customer's requests at check-in before any work starts.
- Every finding that leads to extra work needs a memo and, above the policy thresholds, an approval before the line is added as approved.
- Photos of damage on arrival are taken before the car enters the workshop.
- Do not write a customer's licence number, card number or health information in a memo.
