---
title: Harbourline DMS manual - documents, uploads and AI extraction with verification
model: all
topic: manual
---

# Documents and AI extraction

The **Documents** page (`#/documents`) holds the paperwork attached to deals and customers: signed contracts, trade-in appraisal forms, supplier invoices, licences and insurance certificates. Progress Agentic RAG reads uploaded PDFs and extracts the key fields so nobody has to retype them, and a person verifies the result before it updates the deal.

## Document kinds and extracted fields

| Kind | Fields extracted |
|---|---|
| contract | Deal number (D-#####), customer name, VIN, stock number (HL-####), vehicle price, accessories, discount, trade-in allowance, amount financed and lender, drive-away price, delivery date, whether the buyer and dealer signature lines are signed |
| trade_in_form | Registration, VIN, make, model, year, odometer (km), condition notes, owner name, valuation |
| supplier_invoice | Supplier name, ABN, invoice number, invoice date, line items (description, quantity, unit price), subtotal, GST, total |
| licence | Name, licence class, expiry. Licence number is masked except the last four digits |
| insurance | Insurer, policy number, cover period, vehicle VIN |

## Document statuses

| Status | Meaning |
|---|---|
| uploaded | File stored, not yet processed |
| processing | Sent to Progress Agentic RAG, extraction running |
| extracted | Fields extracted with confidence scores; needs a person to verify |
| verified | A person has checked the flagged fields and accepted the values |

## How do I upload a document?

1. On **Documents** click **Upload PDF**, or on a deal open the **Documents** card and click **Upload**.
2. Choose the file and the **Kind**.
3. Link it to a **Deal** or **Customer** (pre-filled when uploading from a deal).
4. Click **Upload**. The DMS calls `POST /dms/api/documents` and the document appears with status **uploaded**.

## How do I process a document with ARAG?

1. Open the document.
2. Click **Process with ARAG** (Progress Agentic RAG tag). The DMS calls `POST /dms/api/documents/:id/process`.
3. Behind the scenes the PDF is uploaded to the knowledge box as a resource labelled `topic/document`, processed (text extraction, layout, tables), then queried with a JSON schema for that kind of document.
4. When finished, the status is **extracted** and the fields are shown with a confidence for each.

## How do I verify the extraction?

1. Fields that need a human check are highlighted in amber under **Verify these fields**. These are fields with low confidence, fields that drive money (prices, totals, GST) and fields that must match the deal (deal number, VIN, stock number).
2. Compare each highlighted field with the PDF preview on the right. Click a field to jump to where it was found.
3. Correct any value by typing over it.
4. Click **Verify**. The DMS calls `POST /dms/api/documents/:id/verify`. The status becomes **verified**, and the values are written to the deal (for example the trade-in record or the delivery date).

## Mismatch checks

After extraction, the DMS compares the document with the deal and shows a red **Mismatch** badge if:

- The VIN or stock number differs from the deal's vehicle.
- The drive-away price differs from the deal's drive-away price by more than $1.
- A contract signature line is not signed.
- An invoice's GST is not one-eleventh of the GST-inclusive total (to the cent, allowing rounding).

A contract with a mismatch cannot be used to move a deal from **contract** to **delivery**.

## How do I see extraction accuracy for the demo samples?

The six sample documents in `content/dms/samples/` have ground-truth values in `manifest.json`. After processing a sample, the document page shows **Accuracy**: extracted fields that exactly match the ground truth, as a fraction.

## Searching documents

Processed documents are searchable from the global search (`GET /dms/api/search?q=`), for example "invoice from Southern Cross Auto Accessories" or "trade-in with hail damage". Results are labelled **Document**.

## Rules

- Upload only documents that belong to a Harbourline deal or customer.
- Do not upload a licence unless it is required (extended test drives, finance identity check).
- Never verify a field you have not compared with the PDF.
