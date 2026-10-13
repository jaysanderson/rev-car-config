# Harbourline DMS: Progress Agentic RAG use cases

Status: 14 Oct 2026. Companion to `docs/DMS-SPEC.md` (sections 3 and 4) and the use-case table in `docs/DMS-PRD.md` section 5. This document is the engineering view: for each Progress Agentic RAG (ARAG) capability the DMS demonstrates, it gives the screen, the exact DMS and ARAG endpoints, the labels and filters, a demo question, and what makes the result credible.


> **MCP status (verified 14 Oct 2026 by the lead):** this knowledge box's MCP endpoint (`https://aws-ap-southeast-2-1.rag.progress.cloud/api/v1/kb/be12d5b5-56ea-4ad4-b380-2358247bb2c8/mcp`) answers `initialize` and `tools/list` correctly with the service token. The connection failure seen in the build session was a different knowledge box in another zone, not this one.

## Knowledge box contents used by the DMS

Same knowledge box as the configurator (`ARAG_KB_ID`). DMS resources are loaded by `node scripts/ingest-dms.mjs` from `content/dms-kb/`.

| Topic label | Resources | Slugs | Loaded by |
|---|---|---|---|
| `topic/manual` | 13 | `dms-manual-*` (getting started, dashboard, leads, test drives, deals pipeline, stock, customers, promotions and campaigns, digital experience, documents, assistant, insights and Domo, settings/API/MCP) | `scripts/ingest-dms.mjs` |
| `topic/policy` | 9 | `dms-policy-*` (discount approval, trade-in valuation, finance and insurance compliance, aged stock and ready-now, delivery and PDI, lead response SLA, test drive, privacy and first-party data, promotions governance) | `scripts/ingest-dms.mjs` |
| `topic/document` | 0 at rest; 1 per processed PDF | `dms-doc-<documentId>` (suggested) | The app, at demo time, via `POST /dms/api/documents/:id/process`. The six samples in `content/dms/samples/` are not pre-ingested |
| Configurator topics (`specs`, `grades`, `pricing`, `dealer-policy`, `finance`, …) | 47 | product content | `scripts/ingest.mjs`, `scripts/ingest-images.mjs` |

Every DMS resource also carries `model/all`, and `extra.metadata.app = "dms"`.

Filter expressions used below (shape verified against `/find` and `/ask`, as in `server/arag.mjs`):

```json
// scope "manual"
{"field": {"prop": "label", "labelset": "topic", "label": "manual"}}
// scope "policy"
{"field": {"prop": "label", "labelset": "topic", "label": "policy"}}
// scope "all" (DMS knowledge only, excludes product content)
{"field": {"or": [{"prop": "label", "labelset": "topic", "label": "manual"},
                  {"prop": "label", "labelset": "topic", "label": "policy"}]}}
// one processed document
{"field": {"prop": "resource", "id": "<aragResourceId>"}}
```

`KB` below means `https://{ARAG_ZONE}.rag.progress.cloud/api/v1/kb/{ARAG_KB_ID}`. All ARAG calls are made by the DMS server with `X-NUCLIA-SERVICEACCOUNT`. The browser never sees a token.

## The matrix

| # | Capability | What the user sees | DMS endpoint | ARAG endpoint(s) | Labels / filters | Demo question or action | What makes it credible |
|---|---|---|---|---|---|---|---|
| 1 | **Ask the manual, with citations** | Assistant → **Ask the manual**, Scope (Manual / Policy / All), answer with numbered citations that open the source passage | `POST /dms/api/ask {question, scope}` | `POST KB/ask` (`X-Synchronous: true`, `citations: true`, `features: [keyword, semantic]`, `rag_strategies: neighbouring_paragraphs`) | `topic/manual`, `topic/policy`, or the or-filter for All | "Who can approve a $2,500 discount on a deal with $900 front gross?" → general manager, cited to `dms-policy-discount-approval` (verified 14 Oct). Second: "What do I need on file before I can submit a finance application for a customer with a trade-in?" | The figures ($500 / $2,000 / $800 floor) exist only in our policy, so a correct answer must come from retrieval. Citations open the exact table row. An out-of-scope question ("What is the CEO's salary?") returns ARAG's `no_context` status, shown as "Not in the manual" |
| 2 | **Live-ERP retrieval agent** | Assistant → **Ask the ERP**: plain answer, an **Evidence** table of rows used, and the tool calls made | `POST /dms/api/agent/query {question}` | Two-step loop on `POST KB/ask` with `answer_json_schema` (citations off; the two are incompatible, HTTP 500): (1) plan: schema `{calls:[{tool, table, filters, id, metric}]}`, with the tool catalogue and table schemas in `extra_context`; server runs `erp.search` / `erp.get` / `erp.kpi` under the caller's role; (2) answer: rows passed as `extra_context`, schema `{answer, evidenceIds[], policyRefs[]}` | Step 2 filtered to `topic/policy` so policy limits (stuck thresholds, discount matrix) can be cited alongside rows | "Which deals are stuck in finance for more than 5 days at Penrith?" | `evidence[]` row count equals the number stated; the same filter on `GET /dms/api/deals?stage=finance&siteId=pen` gives the same rows; a salesperson gets only their own deals (role applied in the tool, not the prompt). The stuck threshold (finance 5 days) is cited from `dms-manual-deals-pipeline` |
| 3 | **Deal summary and next best action** | Deal page → **AI summary** card → **Summarise deal**: summary, next best action, risks, each risk with a policy citation | `POST /dms/api/deals/:id/summary` | `POST KB/ask` with `extra_context` = deal JSON, events, customer (name and suburb only), finance app, trade-in, documents' extracted fields; `answer_json_schema {summary, nextAction, risks:[{risk, policy}]}` | `topic/policy` (plus `topic/manual` for "what moves the deal") | Open D-10517 (Kluger HL-1941, $500 discount + $2,400 ready-now bonus) → risk: total concession $2,900 needs general-manager approval | Every number in the summary is present in the deal record; risks quote policy thresholds the model could not know otherwise; next action uses the exact button name from the manual ("Request approval") |
| 4 | **Follow-up drafting** | Lead page → **Follow-up** card, Channel (Email/SMS), Tone → **Draft follow-up**; draft with promotion chips and sources; **Copy** / **Send** | `POST /dms/api/leads/:id/followup {tone, channel}` | `POST KB/ask` with `extra_context` = lead, configurator panel (finder answers, viewed, offers clicked, booking, handover), and the list of **published** promotions that match the car; schema `{subject, body, promotionIds[], sources[]}` | `topic/policy` (promotions governance, lead SLA, F&I compliance) + configurator product topics for car facts | Configurator lead for a Kluger with a towing finder answer, Friendly email | Server rejects any `promotionIds` not in the published list (never invents a promotion; matches `dms-policy-promotions-governance`); no finance advice (F&I policy); the car, colour and question asked come from first-party data, visible in the panel beside the draft |
| 5 | **Document processing and extraction** | Documents → **Upload PDF** → **Process with ARAG** → fields with per-field confidence, amber **Verify these fields**, **Mismatch** badge, **Accuracy** vs ground truth for samples → **Verify** | `POST /dms/api/documents` (upload), `POST /dms/api/documents/:id/process`, `POST /dms/api/documents/:id/verify` | `POST KB/resources` (slug `dms-doc-<id>`, labels `topic/document`, `model/all`, title from file) then `POST KB/resource/{rid}/file/file/upload` (PDF bytes); poll `GET KB/resource/{rid}?show=basic` until `metadata.status = PROCESSED`; then `POST KB/ask` with resource filter and per-kind `answer_json_schema` | `topic/document` on the resource; extraction filtered to the single resource id | Process `invoice-CTP-11093.pdf` (Coastline Tint & Protect): ABN, invoice no, 4 lines, subtotal $1,985.00, GST $198.50, total $2,183.50 | Ground truth in `content/dms/samples/manifest.json` gives a measurable accuracy figure. The server checks arithmetic (lines sum to subtotal, GST = 10%, ABN checksum), and the VIN, stock no and drive-away price against the deal. Money and identity fields always need human verification; nothing is auto-verified |
| 6 | **Semantic search** | Global search box: results merged from the KB and the ERP with source labels (Manual, Policy, Document, Customer, Deal note) | `GET /dms/api/search?q=` | `POST KB/find` (`features: [semantic, keyword]`, `top_k: 12`), merged with ERP text search | Or-filter on `topic/manual`, `topic/policy`, `topic/document` (excludes configurator product content) | "customer unhappy about trade-in value" → `dms-policy-trade-in-valuation` (validity, under-allowance in writing) plus deal notes (KB part verified 14 Oct) | Finds the policy with no keyword overlap; each hit shows its label and opens the source; processed documents become searchable straight after processing ("invoice from Southern Cross", "trade-in with hail damage") |
| 7 | **MCP access** | Settings → **Copy MCP endpoint**; the same question asked from Claude Desktop, Claude Code or Cursor | `GET /dms/api/arag/status` → `{kbId, countsByTopic, agentIds, mcpUrl}` (no tokens) | `KB/mcp`, i.e. `https://{zone}.rag.progress.cloud/api/v1/kb/{kbId}/mcp` | Client-side: the user adds "only Harbourline DMS manual and policy" to the prompt; reader key scoped to the KB | "Using the Harbourline knowledge box, what is the discount approval limit for a sales manager?" | Same answer and the same `dms-policy-discount-approval` source outside the app. Shows the knowledge is not locked in the UI. **Risk:** an MCP connection to this KB failed from the engineering workstation on 14 Oct (`CLIENT_HTTP_NOT_IMPLEMENTED`). Rehearse before the demo; if it fails, show the URL on Settings and say so |
| 8 | **Multilingual** | Ask the manual in another language; follow-up drafted in the customer's language | Same as 1 and 4 (`/ask`, `/leads/:id/followup` with `language`) | `POST KB/ask` (multilingual embeddings; no translation step) | Same filters as 1 | "Ai có thể phê duyệt khoản giảm giá 2.500 đô la cho một giao dịch có lợi nhuận gộp 900 đô la?" → "Tổng giám đốc…" (general manager); "首次联系潜在客户的时限是多少？" → 15 minutes in hours, 9:15 am next opening day (both verified 14 Oct) | Same sources and the same numbers as the English answer; citations still point to the English policy. Western Sydney's customer base makes this a practical feature, not a novelty |

## Notes per capability

### 1. Ask the manual
- Scope maps 1:1 to filters; "All" deliberately excludes the configurator's product content so back-office answers are not mixed with brochure text. To let staff also ask product questions, add the `dealer-policy` and `specs` labels to the or-filter.
- System prompt: answer only from the retrieved passages, use the exact button names from the manual, say "not in the manual" when status is `no_context` / `no_retrieval_data`.

### 2. Live-ERP retrieval agent
- Chosen implementation: **ARAG `/ask` with `answer_json_schema` in a two-step loop** (plan → run tools on the server → answer). It needs no extra ARAG configuration, and the tools run in-process with the caller's role. The alternative (a KB context agent calling `/dms/api/agent/tool` with a service token, like the configurator's `harbourline-stock-agent` http context) is listed in the spec but needs a public URL and a service token. Keep it as phase 2.
- Tool contract: `erp.search(table, filters)` → max 50 rows; `erp.get(table, id)`; `erp.kpi(metric, filters)` = `/kpi/overview` fields. Tables allowed: leads, deals, vehicles, test_drives, finance_apps, trade_ins, customers (no notes), promotions, campaigns.
- Evidence shown = rows actually returned by tools, not rows the model mentions. The answer step must reference `evidenceIds` that exist.

### 3. Deal summary
- Pass only the fields needed. Customer contact details are not sent (privacy policy: customer records are not loaded into the KB; deal data is request context only).

### 4. Follow-up drafting
- Guardrail in code: draft `promotionIds` ⊆ published promotions applicable to the lead's car; otherwise strip the paragraph and retry once. Never auto-send.

### 5. Document processing
- Per-kind schemas (field names match `content/dms/samples/manifest.json` `expected`):
  - `contract`: dealNo, contractDate, customer, vin, stockNo, vehicle, vehiclePrice, onRoadCosts, accessories[{name, price}], accessoriesTotal, promotions[], readyNowBonus, discount, driveAway, tradeIn, tradeInAllowance, deposit, amountFinanced, lender, termMonths, deliveryDate, salesperson, buyerSigned, dealerSigned.
  - `trade_in_form`: appraisalNo, dealNo, rego, state, vin, make, model, year, km, owner, condition[], reconditioningTotal, valuation, appraiser, ownerSigned.
  - `supplier_invoice`: supplier, abn, invoiceNo, invoiceDate, dueDate, purchaseOrder, billTo, lines[{description, qty, unitPrice, amount}], subtotal, gst, total.
- Confidence: ask for `{value, confidence, quote}` per field, and lower the confidence when the quoted text is not found in the extracted PDF text. `verifyFields` = low confidence ∪ money fields ∪ identity fields (VIN, stock no, deal no, ABN).
- Accuracy for samples: exact match after normalising (strip `$`, commas and spaces; numbers compared numerically; booleans; arrays compared by length and values).
- Signature lines on the samples carry a visible **SIGNED** mark and the text "Signed: yes" so text extraction can detect them.
- Retention: delete `dms-doc-*` resources 90 days after the deal closes (privacy policy).

### 6. Semantic search
- Merge rule: KB hits ranked by `/find` order, ERP hits by text match, interleaved 2:1. Each item has `source` ∈ Manual | Policy | Document | Customer | Deal note.

### 7. MCP
- `GET /dms/api/arag/status` builds the MCP URL from zone and KB id. It never includes a key. Counts by topic come from `/find` with each label filter (the same method `scripts/ingest-dms.mjs` prints).

### 8. Multilingual
- No language parameter is needed for Ask; ARAG answers in the question's language. For follow-ups, pass the requested language in the system prompt.

## KB state after ingest (14 Oct 2026)

`node scripts/ingest-dms.mjs`: 22 upserted, 22 PROCESSED. KB counters 69 resources. By label: `topic/manual` 13, `topic/policy` 9, `topic/document` 0. Re-running is idempotent (PATCH by slug).
