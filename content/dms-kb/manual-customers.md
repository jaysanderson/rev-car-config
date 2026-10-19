---
title: Harbourline DMS manual - customers, the customer record and duplicates
model: all
topic: manual
---

# Customers

The **Customers** page (`#/customers`) is the single record of every person Harbourline has sold to or is working with. Leads, test drives, deals, trade-ins, finance applications and documents all hang off a customer. Opening a customer (`GET /dms/api/customers/:id`) shows all of them on one page.

## Customer fields

| Field | Notes |
|---|---|
| First name, last name | Required |
| Email, phone | At least one is required. Phone in Australian format (04xx xxx xxx or 02 xxxx xxxx) |
| Suburb, postcode | Used for site allocation and campaign audiences. Full street address is only entered on the contract |
| Source | How we first met them: web-configurator, walk-in, phone, referral, campaign, service |
| Created | Date the record was first created |
| Tags | Free tags, for example `fleet`, `repeat-buyer`, `towing`, `ev-interest` |
| Notes | Salesperson notes. Keep them factual and professional: customers can ask to see them |

Personal information beyond this (licence number, date of birth, income, employer) belongs on finance applications and documents, not in notes or tags.

## The customer page

- **Summary** – name, contact, suburb, source, tags and the salesperson who owns the most recent open lead.
- **Leads** – all leads, newest first, with status.
- **Test drives** – all test drives with outcome.
- **Deals** – open and closed deals with stage and vehicle.
- **Documents** – contracts, trade-in forms, licences and insurance certificates linked to the customer.
- **Activity** – the merged timeline of contacts and deal events.

## How do I find a customer?

Type a name, email, phone number or customer id in the search box at the top of **Customers**. The search uses the `q` parameter and matches partial names and phone numbers without spaces.

## How do I create a customer?

1. Click **New customer**.
2. Enter first name, last name and email or phone.
3. Choose **Source**.
4. Enter suburb and postcode.
5. Click **Save customer**.

Before saving, the DMS checks for possible duplicates by email, phone, and name plus postcode. If it finds any, it shows them and asks you to **Use existing** or **Create anyway**.

## How do I edit a customer?

Open the customer and click **Edit**. Change the fields and click **Save**. Changes to email and phone are recorded in the activity timeline.

## How do I merge duplicates? (sales manager)

1. Open the record you want to keep.
2. Click **Merge** and search for the duplicate.
3. Review the side-by-side comparison and choose which value to keep for each field.
4. Click **Merge records**. Leads, deals, test drives and documents from the duplicate move to the kept record. The duplicate is archived, not deleted.

## How do I add a tag?

Open the customer, click **Add tag**, type the tag and press Enter. Tags are used by **Campaigns** to build audiences, so use the existing tags where possible.

## Configurator customers

Customers who book through the online configurator arrive as a lead with a session id. Until they give a name and contact details at booking, the lead is customer-less: there is no customer record and no personal information. When they book, the DMS creates the customer from the booking form and links the session's first-party data (finder answers, viewed cars, offers clicked) to the lead, not to the customer record.

## Privacy requests

If a customer asks what information Harbourline holds about them, or asks for it to be corrected or deleted, do not edit or delete records yourself. Click **Privacy request**, choose the request type (access, correction, deletion, opt-out of marketing) and click **Submit**. The request goes to the privacy officer. See the privacy and first-party data policy.

## Marketing consent

The **Marketing** toggle on the customer record shows whether the customer has agreed to receive marketing. Customers without consent are excluded from campaign audiences automatically. Service and transactional messages (for example "your car is ready") do not need marketing consent.

## Memos, documents, photos and job cards (phase 2)

A customer record now carries everything the dealership knows about the person beyond their deals.

- **Memos**: click **Add memo** on the customer. Kinds are customer_note (preferences, how they like to be contacted), call (a call or message and its outcome) and credit (anything owed either way). Memos cannot be deleted; **Pin** keeps one at the top. The agent reads pinned memos first.
- **Documents and photos**: **Upload document** attaches licences, insurance certificates, authorisations and correspondence; **Add photo** attaches an image with a caption. Both follow the document pipeline in the Documents chapter.
- **Job cards**: every service visit for a vehicle the customer owns is listed with its status and findings, linking to the card.

### Asking about one customer

Click **Ask about this customer**. Examples: "What has this customer asked us about before?", "Which cars do they own and when is the next service due?", "Is there anything outstanding on their last job card?". The answer is grounded in this customer's record, memos, document summaries, deals and job cards, and cites what it used. The DMS calls `POST /dms/api/customers/:id/ask`.

### Asking across customers

On the Customers page click **Ask across customers**. Examples: "Which customers with a RAV4 bought in 2024 have not had a service in twelve months?", "Who has an open credit memo?". The DMS calls `POST /dms/api/customers/ask`; retrieval runs over the customer resources in the knowledge box (customers with memos, documents or more than one deal) and the agent is given a summary of the filtered list. Customers outside your role's site scope are not visible.

### Rules

- Do not write licence numbers, card numbers or health information in a memo. Record the last four digits of a licence only where a policy requires it.
