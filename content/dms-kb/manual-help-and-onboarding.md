---
title: Harbourline DMS manual - help bubble, friendly errors, onboarding, command palette and the manual page
model: all
topic: manual
---

# Help, errors, onboarding and search

Four things in the DMS exist so that nobody has to ring the help desk to ask about the software: the **Help** bubble, friendly error messages, the onboarding programme and the command palette. All four are powered by Progress Agentic RAG over this manual and the policies.

## The Help bubble

The **Help** button sits in the bottom right-hand corner of every page. Click it to open a panel with two modes:

| Mode | What it answers | What it uses |
|---|---|---|
| Help with the software | How do I do X, where is Y, what does this status mean | This manual and the policies, plus the page you are on |
| Ask the business | Questions about leads, deals, stock, job cards and KPIs | The live-ERP agent, which runs up to four tool calls over the tables and answers with evidence rows |

In **Help with the software**, the panel suggests questions for the page you are on and answers with the manual chapter cited. Each answer has a thumbs up and a thumbs down. A thumbs down shows **Raise a ticket**, which sends your question and the page to the support queue so a person can follow up; the answer you were given is attached so nobody has to ask twice.

Every answer is logged as a **deflection**: a question that would otherwise have been a call. Managers see the deflection rate (answers marked helpful, or not followed by a ticket, as a share of all answers), the questions asked most and the pages they came from, on **Settings & API** under **Help desk**, and as the `support_deflection` Domo dataset. The DMS calls `POST /dms/api/help/ask`, `POST /dms/api/help/feedback` and `POST /dms/api/help/tickets`.

The panel answers in the language set by the data-layer toggle (English, 中文, Tiếng Việt), and in the language you type if you type in another.

## Friendly error messages

When the DMS cannot do what you asked, the message you see is written for people, not for programmers. It says what went wrong in plain words, the likely cause and what to do next, and links to the manual chapter that covers it. For example, instead of "403 Forbidden" you see "You can read this lead but not change it. Leads are owned by one salesperson; ask the sales manager to reassign it, or ask the owner to make the change. See Leads." The DMS calls `POST /dms/api/errors/explain` with the error's status, endpoint and message; the agent writes the explanation from the manual and the DMS caches it so the same error is explained the same way next time. When the agent is slow or offline, a built-in catalogue of common errors is used.

The technical details are never hidden: every friendly message has a **Details** line with the status code, the endpoint and the raw message, for when you talk to support. **Tell me more** opens the Help bubble with the error as context.

## Onboarding

New users see a banner on first login and can open **Onboarding** (`#/onboarding`) at any time. The programme is composed by the agent from this manual for your role: a general manager, a sales manager, a salesperson, a service manager, a technician, a business manager or a digital experience manager each get a different list of steps, between eight and fourteen, each with a time estimate.

Each step has:

- **Why** it matters, in a sentence.
- **Where**: a button that takes you to the page.
- **The task**: something to do, for example "Create a lead for a walk-in customer and tag it onboarding".
- **I did it**: the DMS checks live data to confirm. For the lead example it looks for a lead you created with the onboarding tag. It tells you what it checked and what it found. Steps that cannot be verified from data ("read the discount policy") are ticked by you.
- **Ask about this step**: a question box scoped to the manual chapter for that step.

The programme is dynamic: if the check finds you have already done a later step, it is ticked and the next undone step opens. Your progress is kept per login (`GET /dms/api/onboarding/progress`). **Start again** clears it. Managers see completion by role on **Settings & API**.

## The command palette

Press **Cmd+K** (Mac) or **Ctrl+K** (Windows) anywhere to search the whole system. Results come in three groups:

| Group | What is in it |
|---|---|
| Entities | Customers, leads, deals, stock units, job cards, suppliers and staff whose names, ids, registrations or VINs match |
| Knowledge | Manual chapters, policies, processed documents, job card and supplier resources and Infomedia menus found by semantic search |
| Actions | Pages and actions whose names match ("new job card", "upload invoice", "recompute signals") |

Use the arrow keys and Enter to open a result. The DMS calls `GET /dms/api/search?q=`.

## The manual page

**Manual** (`#/manual`) lists every chapter of this manual with a search box. Chapters are read from the knowledge box, so what you see is exactly what the Help bubble answers from.

## Rules

- Raise a ticket rather than ringing when the Help bubble could not answer: the ticket carries the context and gets answered faster.
- Do not type customer personal information into the Help bubble; refer to records by id.
