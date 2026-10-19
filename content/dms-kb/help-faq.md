---
title: Harbourline DMS help desk - the questions staff ask most, with short answers
model: all
topic: help
---

# Help desk: frequently asked questions

Short answers to the questions the help desk is rung about. Each points to the manual chapter with the detail. The Help bubble answers from these and from the manual.

## Signing in and access

**I forgot my password.** In this prototype every demo login uses the password shown on the sign-in page. In production, click Forgot password on the sign-in page; your manager can also reset it from Settings & API. See Getting started.

**I cannot see the Service pages.** Service pages are shown to service managers, technicians, sales managers and the general manager. Ask your manager to check your role on Settings & API. See Getting started.

**Why is this lead read-only for me?** A lead is owned by one salesperson. Others can read it but not change it. Ask the sales manager to reassign it with Reassign on the lead. See Leads.

**Why does my site switcher only show one site?** Sales managers and salespeople are scoped to their own site. General manager, finance and digital experience roles see all sites. See Getting started.

**My access token for a script stopped working.** Personal access tokens are stored in the DMS state and are cleared when the prototype is redeployed. Create a new one on Settings & API under Access tokens. See Settings & API.

## Leads, deals and customers

**Where did my lead go after I booked the test drive?** Its status moved to test_drive_booked and it sorts under that filter. Clear the status filter on Leads to see it. See Leads.

**The deal will not move from contract to delivery.** A contract document with a Mismatch badge blocks the move. Open Documents, fix or re-verify the contract, then try again. See Documents and Deals pipeline.

**How do I give a discount above my limit?** Click Request approval on the deal. The sales manager approves within their limit; above that the general manager. See the discount approval policy.

**Can I merge two customers?** Not in this prototype. Add a memo on the customer you keep, noting the duplicate id, and the digital experience manager will merge them in the next data load. See Customers.

**Where do I write a note about a customer?** Open the customer and click Add memo. Memos are kept forever and the agent reads them when you ask about the customer. See Customers.

## Documents and photos

**Where did my uploaded document go?** Documents attach to the deal, customer, job card or supplier you uploaded from. On the Documents page, filter by kind or search the file name. Processing can take up to a minute. See Documents.

**The extraction got a number wrong.** Type over the value under Verify these fields and click Verify. Never verify a field you have not compared with the PDF. See Documents.

**How big can a photo be?** Up to 6 MB, jpg or png. Give it a caption; the caption is what the agent reads. See Service job cards.

## Service and job cards

**How do I move a job card back a step?** Open the card's status history and click Back a step. A card can go back one status at a time and cannot skip forward. See Service job cards.

**The card says Awaiting parts but the part has arrived.** Click Start work. Add a parts memo saying the part arrived, so the history is complete. See Service job cards.

**The customer is waiting and the card is overdue. What do I do?** Tell the customer in person now, set a new promised time with an advisor memo and offer a loan car if it passes the day. See the workshop promised-times policy.

**Can the technician approve extra work?** Up to $350, when it is needed to complete the requested job safely, recorded as a tech memo. Above that, the advisor by phone up to $1,500, and the customer in writing above that. See the workshop promised-times policy.

**The Infomedia quote does not match the supplier invoice.** The invoice is matched at its price. Record the difference as a parts memo on the card. See the Infomedia chapter and the supplier terms policy.

**Why does Ask about this job card say the card does not record something?** The agent only sees what is written on the card: lines, requests, findings, memos, captions and documents. If nobody wrote the memo, it cannot answer. Add the memo. See Service job cards.

## Suppliers

**A supplier is on hold. Can I still order?** Only with the service manager's approval recorded as a memo on the supplier. See the supplier terms policy.

**How do I record a credit?** Add a credit memo on the supplier with the invoice number, and attach the credit note as a document when it arrives. See Suppliers.

## Domo, Infomedia and the agent

**How do I see the Domo signals?** Open Insights · Domo. Each card says which dataset it comes from. The dealer signals and priorities are also on Stock. See Insights and Domo.

**Why did the assistant answer "I cannot find that in the manual"?** The question was outside the manual and policies. Switch to Ask the business for questions about live data, or raise a ticket so the chapter can be improved. See Help and onboarding.

**How do I quote a service?** On the job card click Quote from Infomedia menu. The figures come from the pack; the text is written by the agent and you edit it. See the Infomedia chapter.

**Where do I see how many calls the Help bubble saved?** Settings & API, under Help desk: deflection rate, top questions and tickets. See Help and onboarding.
