---
title: Harbourline DMS manual - getting started, signing in, sites and roles
model: all
topic: manual
---

# Getting started with Harbourline DMS · Sales

Harbourline DMS · Sales is the sales back office for the Harbourline Toyota group. It runs in a browser at **/dms** on the same server as the public configurator, and every screen reads from and writes to the DMS API at **/dms/api**. Nothing on screen is stored only in the browser: if you can see it in the DMS, another system can get it from the API.

This chapter covers signing in, finding your way around, choosing a site and what each role can do.

## The screen layout

- **Band (top).** The Progress wordmark and a **Prototype** pill. The pill is a reminder that this environment holds synthetic data.
- **Rail (left, dark).** The product name "Harbourline DMS · Sales", the **site switcher**, the page links (Dashboard, Leads, Test drives, Deals, Stock, Customers, Promotions, Campaigns, Digital experience, Documents, Assistant, Insights, Settings) and the **user menu** at the bottom.
- **Page area.** Cards, tables and boards. Any control powered by Progress Agentic RAG carries a small **Progress Agentic RAG** tag. Any chart or number fed by Domo carries a **Domo** tag and names its dataset.

## Sites

The group has four sites:

| Site id | Site | Notes |
|---|---|---|
| `par` | Parramatta | Home site and transfer hub |
| `hor` | Hornsby | Thursday transfer run |
| `pen` | Penrith | Friday transfer run; towing demonstrator |
| `liv` | Liverpool | Thursday transfer run |

The **site switcher** in the rail filters every page to one site or to **All sites**. Your default is your home site. The choice is passed to the API as `siteId`, so a filtered screen and a filtered export always agree.

## Roles

| Role | Demo login | Sees | Can do |
|---|---|---|---|
| General manager (`gm`) | gm@harbourline.demo | All sites | Everything, including approvals above sales-manager limits, target setting and campaign budgets |
| Sales manager (`sales_manager`) | sm.par@harbourline.demo | Own site (Parramatta) | Assign leads, approve discounts and ready-now bonuses within the approval matrix, move deals to **approval** and **contract**, publish promotions |
| Salesperson (`salesperson`) | sales1@harbourline.demo | Own leads and deals, site stock | Work leads, book test drives, build quotes, add deal events, upload documents |
| Digital experience manager (`dxm`) | marketing@harbourline.demo | Digital experience, promotions, campaigns, insights | Review configurator performance, compose and submit promotions for publishing, manage campaigns |
| Business manager, F&I (`finance`) | finance@harbourline.demo | Deals in **finance** and **approval**, finance applications | Submit and update finance applications, record insurance and protection products, verify contract documents |

The demo password for every login is `demo1234`. In production these accounts would come from the group's identity provider.

## How do I sign in?

1. Go to **/dms**. If you are not signed in you land on `#/login`.
2. Enter your email and password.
3. Click **Sign in**. The DMS calls `POST /dms/api/auth/login` and keeps the returned bearer token in memory only.
4. You land on the **Dashboard** for your home site.

Refreshing the browser tab clears the in-memory token, so you will be asked to sign in again. This is deliberate for the prototype.

## How do I switch site?

1. Open the **site switcher** at the top of the rail.
2. Choose a site, or **All sites** (general manager only).
3. The current page reloads with the new filter. The selected site is shown in the page header.

## How do I sign out?

Open the **user menu** at the bottom of the rail and click **Sign out**. The token is discarded.

## First day checklist for a new salesperson

1. Sign in and confirm your name, role and site in the user menu.
2. Open **Leads** and filter by **Mine** to see the leads assigned to you. New leads are bold.
3. Open **Test drives** and check today's bookings.
4. Open **Deals** and switch to **Board** to see your open deals by stage.
5. Open **Assistant**, choose **Ask the manual** and ask "what are my lead response targets?" to confirm the SLA policy.

## Getting help

- **Assistant → Ask the manual** answers how-to and policy questions from this manual and the dealer policies, with citations.
- **Assistant → Ask the ERP** answers questions about live data, such as "which of my deals have been in finance for more than five days?", and shows the rows it used.
- **Settings → API docs** opens the full API reference for integrators.
