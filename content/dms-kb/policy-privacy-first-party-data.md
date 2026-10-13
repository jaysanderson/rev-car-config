---
title: Harbourline policy - privacy and first-party data handling (configurator events, no PII in events)
model: all
topic: policy
---

# Privacy and first-party data handling

**Policy owner:** Privacy Officer (General Manager) · **Applies to:** all staff, the DMS, the online configurator and any system that receives Harbourline customer data · **Effective:** 1 July 2026

## Purpose

Harbourline collects personal information to sell and deliver vehicles, and first-party interaction data from its own configurator to help customers find the right car and to brief the sales team. This policy explains what we collect, why, where it is kept and the rules that keep personal information out of places it does not belong. It supports our obligations under the Australian Privacy Principles; it does not replace the published privacy policy.

## Two kinds of data

| | Personal information (PII) | First-party interaction data |
|---|---|---|
| Examples | Name, email, phone, address, licence, date of birth, income, employer | Finder answers, cars viewed, colours chosen, offers shown and clicked, questions asked |
| Identified by | Customer id | Random configurator session id |
| Lives in | Customers, leads, finance applications, documents | `configurator_events` (events.jsonl) and the lead's configurator panel |
| Collected when | The customer gives it (booking, enquiry, showroom, finance) | The customer uses the configurator |

## What the configurator logs, and why

The configurator sends events to `POST /api/events` with a session id, an event type, a small data object and a timestamp. The event types and their purpose:

| Event | Data | Why |
|---|---|---|
| `finder_answer` | Question id and answer value (for example `seats: 7`) | Recommend suitable cars; brief the salesperson so the customer is not asked again |
| `finder_result` | Models recommended | Measure whether the finder helps |
| `build_change` | Model, grade, colour, interior, packs | Know which builds are popular; match aged stock |
| `offer_view` / `offer_click` | Stock unit id | Measure ready-now offers and promotion exposure |
| `ask` | That a question was asked | Measure assistant use |
| `booking` / `booking_answer` | Site, model, answers to booking questions | Create the test drive and handover sheet |

## The rule: no PII in events

- Events must **never** contain a name, email, phone number, street address, licence number, date of birth, IP address, precise location or free-text that could contain any of these.
- Free-text questions typed into the configurator assistant are not stored in events; only the fact that a question was asked. Questions shown on a handover sheet are taken from the booking, which the customer submits knowingly.
- The session id is random, created in the browser, and is not linked to an advertising identifier or third-party cookie.
- Events are not sold or shared with third-party advertisers.

Developers and the digital experience manager must check any new event type against this rule before release.

## When session data becomes linked to a person

Only when the customer **books a test drive or submits an enquiry**, giving their name and contact details with notice of how they will be used, does the DMS link that session's first-party data to their lead. Until then the lead (if any) is customer-less. The booking form must state that the customer's configurator choices will be shared with the sales team to prepare for their visit.

## Where data goes

- **DMS** – full customer and deal records, role-limited.
- **Domo exports** – no customer notes, no licence details, no finance assessment details. Configurator events by session id only.
- **Progress Agentic RAG knowledge box** – the manual, policies, product content and processed documents. Documents uploaded for extraction (contracts, trade-in forms) contain personal information: they are labelled `topic/document`, are only searchable by staff, and are deleted from the knowledge box when the deal is closed for 90 days. Customer records and notes are not loaded into the knowledge box; deal summaries pass deal data as request context only.
- **MCP access** – knowledge-box reader keys are issued only to staff.

## Staff rules

1. Collect only what you need. Do not add licence numbers, health details or opinions to notes or tags.
2. Do not copy customer data into personal email, messaging apps or spreadsheets.
3. Upload a licence only for extended test drives or finance identity checks.
4. Use **Privacy request** for any access, correction, deletion or marketing opt-out request.
5. Report any suspected data breach to the privacy officer immediately.

## Marketing

Marketing messages go only to customers with marketing consent. Every marketing message includes an unsubscribe option, and opt-outs are actioned within 5 business days.

## Retention

Deal records and documents: 7 years. Test-drive agreements: 2 years. Extended-drive licence copies: 90 days unless a deal is created. Configurator events: 25 months, then aggregated.
