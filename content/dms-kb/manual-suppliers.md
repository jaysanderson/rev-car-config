---
title: Harbourline DMS manual - suppliers (records, terms, memos, invoices, asking the agent)
model: all
topic: manual
---

# Suppliers

The **Suppliers** page (`#/suppliers`) holds the businesses Harbourline buys from: parts, accessories, tyres, tint and paint protection, sublet repairers, consumables and towing. Each supplier record carries its terms, contacts, the memos people write about it, its invoices and documents, and the spend it has had. Progress Agentic RAG reads each record so you can ask about one supplier or across all of them.

Service managers, sales managers, finance and the general manager can open suppliers. Salespeople and technicians cannot.

## The supplier record

| Field | Meaning |
|---|---|
| Name and ABN | The legal name and ABN that appear on invoices |
| Category | parts, accessories, tyres, tint-protection, sublet, consumables or towing |
| Contact | Name, email and phone of the account contact |
| Terms | Payment terms, normally "30 days" |
| Rating | 1 to 5, set by the service manager after a review |
| Status | active or on_hold (an on-hold supplier cannot be chosen on a new line) |
| Spend, 12 months | Total of matched invoices in the last twelve months |
| Open invoices | Invoices not yet matched to a job card or stock unit |

Click **New supplier** to add one. Three fields are required: name, category and contact email. New suppliers start on_hold until the service manager approves them (see the supplier terms policy).

## Memos

Click **Add memo** on a supplier. Kinds:

| Kind | Use it for |
|---|---|
| call | A call or email with the supplier and its outcome |
| credit | A credit requested or received, with the invoice number |
| sla | A late delivery, a wrong part, a quality problem; what was agreed |
| quality | A review outcome, a rating change and why |

Memos cannot be deleted. **Pin** keeps a memo at the top; pinned memos are the first thing the agent reads.

## Invoices and documents

Click **Upload invoice** to attach a supplier invoice (PDF). It goes through the same document pipeline as deal documents: **Process with ARAG** extracts supplier, ABN, invoice number, dates, line items, subtotal, GST and total, and a person verifies the flagged fields. An invoice must be matched to a job card or a stock unit before it is counted as spend; unmatched invoices show under **Open invoices**. Other documents (agreements, insurance certificates, price lists) are uploaded with **Upload document**.

## Asking about one supplier

Open the supplier and use **Ask about this supplier**. Examples: "Have we had late deliveries from them this quarter?", "What did we agree about the credit on invoice SCA-204871?", "What do we buy from them and how much?". The answer is grounded in this supplier's record, memos, invoice summaries and documents, plus the supplier terms policy, and cites what it used. The DMS calls `POST /dms/api/suppliers/:id/ask`.

## Asking across suppliers

On the list click **Ask across suppliers**. Examples: "Which suppliers are on hold and why?", "Who supplies tyres and what are their terms?", "Which supplier had the most SLA memos this year?". The DMS calls `POST /dms/api/suppliers/ask`; retrieval runs over every supplier resource and the agent is given a summary of the list (counts by category and status, spend, open invoices). The answer lists the suppliers it relied on.

## Rules

- Buy only from active suppliers. A purchase from an on-hold supplier needs the service manager's approval, recorded as a memo.
- Match every invoice to a job card or a stock unit within five business days.
- Record disputes as sla or credit memos, with the invoice number, before you call the supplier.
