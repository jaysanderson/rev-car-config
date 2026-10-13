---
title: Harbourline DMS manual - the assistant (Ask the manual vs Ask the ERP)
model: all
topic: manual
---

# The assistant

The **Assistant** page (`#/assistant`) is where you ask questions in plain English. It has two modes, chosen with the toggle at the top. Both are powered by Progress Agentic RAG and carry its tag.

| | Ask the manual | Ask the ERP |
|---|---|---|
| Answers from | This manual and the Harbourline dealer policies in the knowledge box | Live DMS data: leads, deals, stock, test drives, finance, KPIs |
| Good for | "How do I…", "What is our policy on…", "Who approves…" | "Which…", "How many…", "Show me…" about today's data |
| Shows | An answer with numbered citations to manual or policy sections | An answer with the evidence rows it used |
| API | `POST /dms/api/ask {question, scope}` | `POST /dms/api/agent/query {question}` |

If you are not sure which to use: questions about **how things should be done** go to the manual; questions about **what is happening** go to the ERP.

## Ask the manual

The question is sent to the knowledge box with a label filter so that only DMS content is retrieved:

- **Scope: Manual** – resources labelled `topic/manual` (this user manual).
- **Scope: Policy** – resources labelled `topic/policy` (dealer policies).
- **Scope: All** – both.

The answer is generated only from the retrieved passages. Each statement is followed by a citation number; click it to open the source passage. If the knowledge box does not contain the answer, the assistant says so rather than guessing.

### How do I ask the manual?

1. Open **Assistant** and choose **Ask the manual**.
2. Choose the **Scope** (Manual, Policy or All). The default is All.
3. Type the question, or click an example question.
4. Click **Ask**.
5. Read the answer and check the citations, especially for policy limits and money.

Example questions:

- "Who can approve a $2,500 discount on a deal with $900 front gross?"
- "What do I need before moving a deal from finance to approval?"
- "What is the first-contact target for a configurator lead on a Saturday?"
- "Can a P-plater take a GR Yaris on a test drive?"
- "What does reason code days_of_supply mean?"

## Ask the ERP

Ask the ERP uses a **live-ERP retrieval agent**. The agent cannot see the database directly. It plans which DMS tools to call, the server runs them with your permissions, and the agent answers from the results. The tools are:

- `erp.search(table, filters)` – search any table (leads, deals, vehicles, test_drives, finance_apps, trade_ins, customers, promotions, campaigns) with filters such as site, status, stage and dates.
- `erp.get(table, id)` – fetch one record, for example deal D-10482.
- `erp.kpi(metric, filters)` – the same KPIs as the dashboard.

Because the tools run with your role, a salesperson asking "show me all deals" only gets their own deals.

### How do I ask the ERP?

1. Open **Assistant** and choose **Ask the ERP**.
2. Type the question or click an example.
3. Click **Ask**.
4. Read the answer, then open **Evidence** to see the rows the agent used and the tool calls it made. Click a row to open the record.

Example questions:

- "Which deals are stuck in finance for more than 5 days at Penrith?"
- "How many RAV4s over 60 days old do we have, and where are they?"
- "Which configurator leads from this week have not been contacted?"
- "What is Hornsby's target attainment this month?"
- "Who has the highest average gross per unit this quarter?"

## Combining the two

Some questions need both. For example, "Are any of my deals over the discount limit?" needs the policy (the limits) and the ERP (the deals). Ask the ERP; the agent retrieves the discount approval matrix from the knowledge box and cites it alongside the evidence rows.

## Other places the assistant appears

- **Deal → Summarise deal** – summary, next best action and risks.
- **Lead → Draft follow-up** – email or SMS draft.
- **Documents → Process with ARAG** – field extraction.
- **Dashboard → Ask about this** – opens Ask the ERP with a question about a card.
- **Global search** – semantic search across the manual, policies and processed documents, merged with ERP text search.

## Good practice

- Check citations before acting on a policy answer that involves money or compliance.
- Check evidence rows before quoting a number to a manager.
- The assistant does not give customers financial or insurance advice, and neither should you. See the finance and insurance compliance policy.
- Every question and answer is logged with your user id for quality review.
