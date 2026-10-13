---
title: Harbourline DMS manual - deals and the pipeline stages (quote to delivered)
model: all
topic: manual
---

# Deals and the pipeline

A **deal** is a sale in progress. Each deal has an id in the form **D-#####**, one customer, one salesperson, one site and either a stock unit (HL-####) or a factory order. Open the **Deals** page (`#/deals`) and choose **Board** (columns by stage) or **List**. A single deal opens at `#/deals/:id`.

## Pipeline stages

| Stage | What it means | Required before moving on | What moves it |
|---|---|---|---|
| quote | A priced quote exists for a specific car or factory order | Vehicle price, accessories, drive-away price, customer | Salesperson clicks **Move to negotiation** once the customer engages with the numbers |
| negotiation | Price, trade-in or promotions are being agreed | Discount entered; trade-in valued if there is one; promotions selected from published ones only | Customer accepts the numbers. If the customer is financing, **Move to finance**; if paying cash, **Move to approval** |
| finance | F&I is arranging finance or the customer's own lender | Finance application submitted (lender, amount, term) | Finance application status **approved** or **conditional** with conditions met, or customer confirms own funds |
| approval | Manager checks the deal against the discount approval matrix | Gross calculated; any discount or ready-now bonus above the salesperson's limit approved by the right person | Approver clicks **Approve deal** |
| contract | The contract of sale is issued for signature | Approval recorded; deposit received; contract document generated | Signed contract uploaded as a document and **verified** |
| delivery | Car is being prepared | Delivery date set; PDI booked; finance settled or settlement booked | Delivery checklist complete and the customer signs the delivery receipt |
| delivered | Car handed over. Counts as a unit sold | Delivery date, odometer at handover | – |
| lost | Deal closed without a sale | Lost reason | – |

You cannot skip **approval** or **contract**. A deal can move to **lost** from any open stage.

## The deal page

- **Header** – deal id, stage, customer, salesperson, site, vehicle, drive-away price and front/back gross (managers and F&I only).
- **Timeline** – every event: stage changes, calls, notes, approvals, documents and finance decisions, each with the person and time. Added with `POST /dms/api/deals/:id/events`.
- **Vehicle** – stock unit with VIN and days in stock, or factory order with ETA in weeks.
- **Pricing** – vehicle price, accessories, promotions (each a separate line), discount, ready-now bonus, trade-in allowance, drive-away price.
- **Trade-in** – the appraisal, valuation and amount offered.
- **Finance** – lender, amount, term, rate and status.
- **Documents** – contract, trade-in form, licence, insurance certificate.
- **AI summary** – see below.

## Gross

- **Front gross** = vehicle price + accessories − landed cost − discount − ready-now bonus − promotion cost, adjusted for trade-in over- or under-allowance.
- **Back gross** = finance commission + insurance and protection product commission.
- **Gross profit** = front + back.

## How do I create a quote?

1. From a lead click **Create deal**, or on Deals click **New deal** and choose the lead.
2. Choose **Stock unit** or **Factory order**.
3. Add accessories with **Add accessory**, and promotions with **Add promotion** (only published promotions that apply to this car are offered).
4. Enter a **Discount** if any. The approval needed is shown next to the field.
5. Click **Save quote**. The deal is at **quote** and the drive-away price is calculated.

## How do I move a deal to the next stage?

Click the **Move to …** button in the deal header, or drag the card on the **Board**. If a required field is missing the move is blocked and the missing field is highlighted.

## How do I request approval?

At **approval**, click **Request approval**. The approver named by the discount approval matrix is notified. They open the deal and click **Approve deal** or **Decline** with a note.

## How do I add a note or event?

Click **Add event**, choose a type (note, call, email, customer visit, finance update), write the note and click **Save**.

## How do I get an AI summary and next action?

1. On the deal page, find the **AI summary** card (Progress Agentic RAG).
2. Click **Summarise deal**. The DMS calls `POST /dms/api/deals/:id/summary`, passing the deal, its events, customer, finance and trade-in, and retrieving the relevant dealer policies.
3. You get a short summary, a **next best action** and **risks** (for example "finance conditional on payslips for 6 days", "discount exceeds sales-manager limit"). Each policy point is cited.

## How do I mark a deal lost?

Click **Mark lost**, choose the lost reason and click **Confirm**. A held stock unit is released back to **on_lot**.

## Stuck deals

A deal is flagged **Stuck** when it has stayed in one stage longer than: quote 7 days, negotiation 5 days, finance 5 days, approval 2 days, contract 3 days, delivery 10 days. Use the **Stuck** filter, or ask the ERP agent, for example "which deals are stuck in finance for more than 5 days at Penrith?".
