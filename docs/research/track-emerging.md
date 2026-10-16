# Track: Emerging practice ("beyond the bar")

Researcher track for the Revolution Software / Toyota dealer configurator prototype (Sydney). Research date: 16 Oct 2026. Every figure below comes from a page I opened (listed under Sources). **Vendor-reported** marks figures published by the company selling the product, with no independent audit. Where a site blocked access, I say so and leave its claims out instead of relying on search snippets. Note: toyota.com.au returned a "Website Outage" page (HTTP 403) for every URL I tried on 16 Oct 2026, so the Toyota Australia facts here come from Toyota dealer sites and third-party reporting.

---

## 1. AI shopping assistants in automotive retail

**CarMax (Skye, ChatGPT app, Sierra voice).** In July 2025 CarMax was rolling out an "agentic" version of Skye that tries to work out the shopper's goal instead of answering only the literal question. It covers buying, selling, financing, appointments and vehicle and safety information. It pulls matching inventory into the conversation and suggests a handoff to a person when that is the right next step. Separate AI agents monitor Skye against company standards because humans cannot review every conversation (Modern Retail). In Feb 2026 CarMax said Skye "manages tens of thousands of customer conversations each week". It also launched the first US auto-retail app inside ChatGPT, covering 45,000+ vehicles: shoppers search in plain language ("an SUV with a third row under $25,000") and get an instant offer on their own car. In Aug 2026 CarMax said Sierra voice agents had been answering inbound sales calls since May. They ask clarifying questions, answer hours and availability questions, and transfer to an associate. CarMax reports "higher call resolution and a lower rate of unresolved calls" but gives no number, and says appraisal and test-drive scheduling come next. CarMax has published no conversion figures for any of these.

**CarGurus Discover.** This is conversational search over live dealer stock. It returns real listings with price, deal rating and Instant Market Value, not a text summary. CarGurus says most UK Discover users share their budget before they submit a lead, which makes the leads more qualified. CarGurus cites its own research: 76% of UK buyers would consider using AI, and about one in five have already done so (Car Dealer Magazine).

**Autotrader UK.** Autotrader launched a ChatGPT app built on the Model Context Protocol (MCP) in May 2026. It is testing "type what you mean" search on its own site and already uses AI-derived categories such as "Big boots" and "Cheaper insurance" (Autotrader plc). **Carwow**: I found no AI car-finder launch. **Amazon**: Rufus has no automotive feature I could verify. Amazon Autos (Dec 2024, Hyundai, 48 US cities) is a transaction rail rather than an assistant: haggle-free prices, instant trade-in valuation, finance, online checkout, and dealer pickup, with the local dealer as seller of record (Auto Remarketing).

**Australia: carsales.** carsales launched AI Voice Search on iOS on 27 Feb 2026. It runs on carsales' own models over real-time inventory and sits alongside an "AI Assistant" and an AI search-and-summarisation tool. carsales also launched a ChatGPT app in Mar 2026 and an AI-led national campaign ("Hey carsales…") in Jun 2026. Its research finds that more than a third of Australian buyers use AI in their search, including 45% of Gen Z and 53% of Millennials (IT Brief; carsales editorial).

**Dealer AI vendors (all figures vendor-reported):**
- **Impel** (May 2026 Sales AI). It sends an AI-generated personalised video for each lead and VIN, recorded once by each rep, plus a "digital dossier": window sticker, Carfax, 360 walkaround and payment calculator. Its knowledge bank is tuned to dealer policy and OEM guidelines. It runs outreach to aged stock, equity owners and lease-end customers, and hands off to a rep with conversation context. Impel claims, from early deployments, +150% engagement, +300% AI-set appointments and +40% showroom appointments. It gives no baselines.
- **Fullpath** (ChatGPT-based chat). Shoppers who exchange at least six messages convert at 45.6%. Service-scheduling chats convert at 36.9%. 34.4% of chats start after hours, 23.9% on weekends and 40% are about service. No sample size is disclosed (May 2026 blog).
- **Numa** (about 600 dealer service departments). Dealers miss up to 216 appointment calls a month. At NADA's $450 average repair order, that is about US$1.17M a year per dealer. Calls peak 8:00–11:30am.
- **Toma** (a16z Series A, US$17M, Jun 2025). Its voice agents handle service booking, parts and sales questions. Training takes 1–2 weeks on the dealer's past calls, and the agent hands off when unsure. When the founders' agent called almost every US dealer several times, only **45%** of calls were answered (TechCrunch). That is a measure of the problem, not of Toma's own performance.
- Conversica, Gubagoo, Podium and Drift: their sites either blocked access or gave nothing I could verify, so I have left them out. Carvana's own pages returned 403, so its Sebastian assistant is not covered here.

**What they get wrong.** In Dec 2023 a Chevrolet of Watsonville chatbot (Fullpath, labelled "Powered by ChatGPT") was coaxed into writing Python code, recommending a Ford F-150 and "agreeing" to sell a Tahoe for $1. GM distanced itself as the bot was a third-party tool (The Autopian; screenshots unverified). In *Moffatt v Air Canada* (2024 BCCRT 149), a tribunal held the airline liable for its chatbot's wrong statement of policy. It rejected the argument that the bot was a separate entity and said the company is "responsible for all the information on its website" (McCarthy Tétrault). The lesson for us is that an assistant's statements about price, availability or finance bind the dealer, so they need provenance and guard-rails.

**Demand signal.** Cox's AI in Auto Retail Tracker (Q1–Q2 2026; ~3,000 shoppers, ~1,000 dealers) finds:
- 63% of shoppers expect to use AI on their next purchase.
- AI tools (36%) are now almost level with automotive websites (38%) as a research channel.
- 26% use AI to prepare questions for the dealer, and only 17% use it to avoid staff.
- 82% of dealers use AI, but only 29% have adjusted to AI-driven search.
- 69% of dealers expect AI revenue growth, and 22% have seen it.

**At a Toyota dealer in Sydney.** The minimum is an assistant that answers only from cited dealer and Toyota sources, holds no pricing authority of its own, and never offers terms the DMS has not approved. It should also cover the phone, because only 45% of US dealer calls are answered (Toma), with the same knowledge behind voice. It needs MCP/ChatGPT exposure of live stock, because carsales and Autotrader are already there. Harbourline's cited assistant is ahead of most dealer chat here. The gaps are phone, after-hours follow-up, and being reachable from third-party AI.

## 2. Visualisation

- **Porsche (Jan 2026).** The Cayenne Electric configurator streams Unreal Engine real-time renders from AWS through MHP's Elastic Content Platform and the Porsche Rendering Solution. The same content feeds the web, the Porsche app and dealer showroom screens, and no local GPU is needed. Porsche publishes no conversion numbers (eCommerceNews NZ).
- **ZeroLight case studies** (vendor-reported). Suzuki UK (Feb 2026) built a configurator from CAD-based digital twins in an iFrame, with image turntables that upgrade to pixel-streamed 3D depending on device and behaviour. Against the old configurator, "Send to Dealer" clicks rose about 12x and finance calculations about 2.5x. In 3D mode, sessions were about 2x longer and engagements per session about 3x. BRP (Sea-Doo, Can-Am and others) saw +28% configurations started, +25% leads, +10% converted leads, and US$2.37M added sales over five months.
- **Walkarounds and condition imaging.** Impel cites a Cars.com test (1M visits, 400+ dealers, 60 days): listings with 360° WalkArounds against photo-only listings showed +92% saves, +68% leads and +36% dealer-site visits (vendor-reported). Carvana's and Hyundai's own pages blocked access, and the AR "see it in your driveway" coverage I found dates from 2017–2018 (Porsche and BMW apps). I found **no published conversion evidence for AR**.
- **Toyota NZ.** In Apr 2018, 15% of website visitors used the online car builder (Driven).

**What measurably moves conversion.** The published lifts come from three things: (a) **VIN-specific** media such as 360 walkarounds and personalised video, (b) 3D that sits next to a clear next action like send-to-dealer or finance, and (c) a fast fallback on weak devices. Spectacle alone has no published lift.

**At a Toyota dealer in Sydney.** The cheap, proven step is VIN-level 360 imaging of every on-lot car and demo, captured at PDI, linked to the DMS stock record, and shown in the configurator's "ready now" panel. Streamed 3D depends on Toyota providing CAD-derived assets. Treat it as an OEM-level dependency, not a dealer build.

## 3. Money

**Pre-qualification.**
- **Carvana**: pre-qualification is a soft pull with no credit-score impact. The hard inquiry happens only when delivery is scheduled. Estimated APR is 6.99–27.99%, terms are 12–60 months, and there is no minimum score (NerdWallet).
- **Plenti (AU)**: 10 questions, a personalised rate in 60 seconds with no credit-score impact, an application in under 10 minutes, and funds to the seller within 2 business days.
- **Driva (AU broker, 10+ lenders)**: soft-check personalised rates, digital bank-statement access, and same-day turnaround possible (Finder).
- **Toyota Finance (AU)**: a "Toyota Personalised Rate" is available in the calculator without affecting the credit score. The application itself is lodged by the dealer's Business Manager in person, by phone or by email, and Toyota Finance aims to decide within 2 business days, or up to 5 (Sunshine Toyota).

This is the biggest gap in the Australian Toyota journey: fintechs answer in 60 seconds, the captive lender in up to 5 business days. Cox's 2025 Car Buyer Journey found the largest gaps between preference and practice were online F&I selection (24 points), applying for finance online (15) and being told of approval online (14).

**Trade-in.**
- **carsales Instant Offer**: carsales' help pages blocked automated access. Its editorial positions it as an instant online offer that an accredited dealer verifies.
- **KBB Instant Cash Offer**: valid 7 days and redeemable at participating dealers pending inspection. The offer can drop if inspection differs, and dealers pay to take part (KBB B2B).
- **Carvana**: offers are valid 7 days, firm, and non-negotiable (NerdWallet).

Trade-in handling affects satisfaction. In J.D. Power's 2025 SSI, 28% of trade-in customers got less than they expected. Deal satisfaction averaged **800 when the dealer justified the value against 672 when it did not**.

**Transparent pricing.** Toyota NZ's April 2018 move to a haggle-free Toyota Driveaway Price included delivery, registration, a full tank, mats and a seven-day money-back policy. April sales dipped to 1,362 against 2,421 in March, partly for seasonal reasons. Toyota said it was "on target" and "in this for the long term" (Driven). The appetite in Australia is real: only 30% of buyers enjoy haggling and 41% are open to fixed or hybrid pricing (carsales, July 2025, n=1,765). Cox's 2025 drivers study names transparency and "feeling in control" as two of its four satisfaction pillars, and says dealers delivering all four see roughly 2x efficiency and profitability. J.D. Power's 2025 SSI scored 802 overall, and J.D. Power credits transparency during the deal.

**Guaranteed future value and subscription.** Toyota Access defers a minimum Guaranteed Future Value to the end of a term of up to 48 months, with fixed monthly payments. At the end the customer can upgrade (keeping any equity above the GFV), keep the car, or hand it back subject to agreed kilometres and fair wear and tear (AnyAuto; 2012 launch, so check current terms). I could not open primary sources for Care by Volvo or Hyundai Mocean subscriptions, so I make no claim on their status.

**Embedded insurance.** Tesla's own support page blocked access, so I have not verified it.

**At a Toyota dealer in Sydney.** The configurator should show a soft-check Toyota Personalised Rate and a live Toyota Access GFV payment for the exact build: deposit, term, km and balloon. It should offer one-tap pre-qualification that hands the Business Manager a ready file. A trade-in estimate should come with a written justification (comparables, condition deductions) instead of a bare number. Everything here depends on Toyota Finance APIs and on the 10 Dec 2026 privacy rule (see §5).

## 4. Buying and delivery

- **Order tracking.** Ford's online tracker needs an Order Number and VIN from the dealer. The VIN exists only once production is scheduled, after which the order is locked. Some vehicles can't be tracked, and the fallback is "contact your dealer" (Ford support). Rivian's support page loaded without content, so I have not verified it. Tesla's Australian delivery page blocked access.
- **Amazon Autos** (Dec 2024). The dealer is seller of record while Amazon provides search, trade valuation, finance, checkout and a scheduled pickup slot. This shows a model where a third-party front end and the dealer's back end coexist.
- **Home test drives and concierge.** Genesis Concierge (launched 11 May 2020) gives each shopper a dedicated personal shopper by phone, text or email, offers at-home test drives, and delivers to the customer's chosen location. The local retailer stays the seller and service provider (KBB).
- **Return guarantees.** Carvana offers 7 days and 400 miles, with delivery fees refundable and shipping fees not (NerdWallet). Toyota NZ offered a seven-day money-back policy within its driveaway price (2018). CarMax's 24-hour test-drive FAQ blocked access.
- **Post-delivery.** J.D. Power's 2025 SSI found that 22% of buyers wanted a feature walkthrough a few weeks after delivery, and **53% of them never got one**.

**At a Toyota dealer in Sydney.** For Toyota AU's long-lead models, an order tracker is the obvious gap: DMS order status plus Toyota logistics milestones, pushed proactively. Add a pre-delivery task list (ID, insurance, finance docs, trade docs, rego) like Tesla's, and a 3-week "feature follow-up" booked automatically at handover. Home test drives in Sydney need dealer insurance cover and a staff roster, which the DMS can schedule.

## 5. Ownership and first-party data

- **myToyota Connect (AU).** It works for any Toyota built from 2009, with or without Connected Services. Every owner gets vehicle details, online service booking, manuals, recalls and Ampol Foodary rewards. Connected vehicles add status (odometer, fuel), remote climate, Drive Pulse driving score and a vehicle locator. Connected Services come free for 1–3 years, with fees after that (Sunshine Toyota).
- **J.D. Power 2025 OEM EV App Report** (US, n=1,966). Tesla scored 864 and MyHyundai with Bluelink led mass market at 820. 79% of Tesla owners use the app on every drive, against 32% for other brands (up from 17%). Speed drives satisfaction: 46% accept at most 3–5 seconds for a remote command. Over 90% want vehicle status, OTA updates and diagnostics.
- **J.D. Power 2025 CSI** (n=55,210). 12% of repairs are not fixed first time, and only half of those customers return. Four of the 10 most influential KPIs are about communication, such as status updates. Complimentary maintenance retains customers, but paid-service return depends on the experience.
- **Loyalty is weak in Australia.** Only 22% have bought from the same dealership again, 12% think repeat customers get meaningful benefits, 36% fully trust dealer information, and **68% were not contacted promptly after an enquiry** (carsales, July 2025).
- **Trade-up prompts.** AutoAlert and Mastermind market service-drive "trade-up" alerts. The only concrete result I found was a single 2014 dealer anecdote, so there is no independent evidence of lift.
- **Consent and privacy (AU).** APP 1.7–1.9 under the Privacy and Other Legislation Amendment Act 2024 take effect **10 December 2026**. Privacy policies must disclose the kinds of personal information used and the kinds of decisions a computer program makes, or substantially and directly contributes to, where those decisions significantly affect individuals. That applies even with a human in the loop. OAIC guidance (30 Sep 2026) says personalised or differential pricing via targeted content "may be captured", and finance is listed as a significant interest. The duty sits with the entity that arranged the program (the dealer), not with the vendor (Allens).

**At a Toyota dealer in Sydney.** Join the configurator build, the DMS deal and the myToyota/service record into one customer timeline. Use it for things owners value, such as a status-rich service experience and an equity-aware upgrade offer near the end of the Toyota Access term. Make every automated nudge explainable, which Harbourline's "stated reasons" already does, and list it in the dealer's ADM disclosure.

## 6. Industry studies: what world-class means

- **Cox Automotive 2025 Car Buyer Journey** (published Jan 2026, 2,300+ buyers).
  - Total time to buy was just under 14 hours, down 20 minutes. New-car buyers spent almost 2 fewer hours researching and about 30 fewer minutes at the dealer. "Mostly digital" buyers saved 41 minutes in-store.
  - 76% of new-car buyers were highly satisfied, a record.
  - 19% of all buyers and 25% of new-car buyers used AI. AI-using digital buyers were more satisfied (84% against 71%), more confident they got a good deal (81% against 67%), and more satisfied with time taken (81% against 65%).
  - 44% of new buyers followed a hybrid path.
- **Cox Drivers of Satisfaction** (Aug 2025). Its four pillars are knowledgeable staff, transparency, feeling well-informed and being in control. Waiting time at the dealership is the top friction.
- **J.D. Power 2025 SSI** (n=32,616). Overall score 802. The trade-in justification gap (800 against 672) and the follow-up gap (53% never contacted) are covered above.
- **Cox AI Tracker 2026**: see §1.
- **Gartner** (5 Mar 2025). The press release headline predicts agentic AI will autonomously resolve 80% of common customer-service issues by 2029. The page itself returned 403, so I have only the headline.
- **McKinsey** pages timed out, so none of its figures are cited.
- **Australia.** carsales (July 2025): 65% intend to buy through a dealer, up 4 points; warranty is the top reason at 57%; the other figures are in §3 and §5. AADA's dealer survey (Jun–Aug 2025, 303 principals) shows overall dealer satisfaction down from 56% to 50% and profitability from 47% to 36%. **Toyota held steady or improved** (GoAuto).

**Synthesis: world-class in 2026 means** an informed buyer who arrives having used AI, gets a fast and transparent deal with reasons, completes the money steps online, spends less time waiting, and is followed up after delivery. The measured gaps sit exactly at finance online, trade-in justification, prompt response and post-delivery follow-up.

---

## Beyond-the-bar candidates

Difficulty: **L** = buildable in the prototype on current data; **M** = needs a new integration or data feed; **H** = needs Toyota/TFA cooperation or a regulatory or operational change. "Powers" uses: CAI (conversational AI with cited knowledge), STOCK (live stock intelligence), 1PD (first-party data), DMS.

1. **"Justify my trade" report.** *Problem:* 28% of buyers get less than they expected for their trade-in, and unexplained trade valuations cost about 128 SSI points. *Evidence:* J.D. Power 2025 SSI (800 against 672). *What it is:* an instant estimate with recent comparable dealer and auction sales, line-item condition deductions from customer photos, and what would raise the number. *Powers:* DMS used-car history, STOCK, CAI. *Difficulty:* M.

2. **60-second Toyota Finance soft-check inside the build.** *Problem:* fintechs quote in 60 seconds (Plenti) while the Toyota Finance decision takes 2–5 business days, and Cox shows 14–15-point online-finance gaps. *What it is:* the configurator returns a soft-check Personalised Rate and a Toyota Access payment for the exact VIN, then hands a pre-filled file to the Business Manager. *Powers:* TFA API, DMS deal jacket. *Difficulty:* H.

3. **Live GFV "equity clock" for owners.** *Problem:* only 22% of buyers return to the same dealer and 12% see loyalty benefits. *Evidence:* Toyota Access already defines the GFV and its upgrade path; Impel sells "equity owner" campaigns. *What it is:* in the owner timeline, a monthly "your car is worth $X over GFV" figure with a one-tap build of the replacement, shown with its stated reason. *Powers:* 1PD, DMS contract data, market valuation. *Difficulty:* M.

4. **One assistant across web, ChatGPT/MCP and the phone line.** *Problem:* only 45% of US dealer calls are answered (Toma), and 68% of Australian enquirers were not contacted promptly. *Evidence:* CarMax runs Skye, a ChatGPT app and Sierra voice side by side; Fullpath reports 34% of chats arrive after hours. *What it is:* the same cited knowledge and stock tools exposed through an MCP server and a voice agent, with a guaranteed callback slot written to the DMS. *Powers:* CAI, STOCK, DMS. *Difficulty:* M.

5. **Price with receipts.** *Problem:* only 36% of Australian buyers fully trust dealer information, and assistants that improvise prices create liability (Watsonville; Moffatt). *What it is:* every price, discount or availability claim the assistant makes carries a signed provenance chip (source, approver, expiry), and the drive-away quote can be shared as a verifiable link. *Powers:* DMS promotions provenance, CAI. *Difficulty:* L to M. Harbourline already has provenance.

6. **"My car, my VIN" walkaround at PDI.** *Problem:* catalogue imagery doesn't show the actual car. *Evidence:* Cars.com/Impel 360 test, +68% leads (vendor). *What it is:* staff capture a 360 view and a 60-second personalised video of the exact allocated car at PDI and send them automatically to the buyer. *Powers:* DMS stock/VIN, media capture. *Difficulty:* M.

7. **Proactive order tracker with honest ETAs.** *Problem:* Ford's tracker only works after production scheduling and falls back to "call your dealer". *What it is:* milestone tracking (allocated, built, shipped, landed, PDI, ready) with ETA confidence bands. The assistant can explain a delay and offer a matching on-lot alternative. *Powers:* DMS orders, Toyota logistics feed, STOCK, CAI. *Difficulty:* H.

8. **Delivery-readiness checklist.** *Problem:* in-dealer waiting is the top stress point and digital buyers save 41 minutes (Cox). *What it is:* a Tesla-style task list (ID, insurance certificate, finance docs, trade payout letter, rego), e-signing where legally possible, and a fixed handover slot. *Powers:* DMS, e-sign. *Difficulty:* M.

9. **Three-week feature follow-up, booked at handover.** *Problem:* 53% of buyers who wanted a follow-up never got one (J.D. Power). *What it is:* the system auto-books a video or in-person session and pre-loads the assistant with that VIN's features and the owner's questions so far. *Powers:* 1PD, CAI, DMS calendar. *Difficulty:* L.

10. **Service status you can see and ask about.** *Problem:* 4 of the top 10 CSI drivers are about communication, and only half of customers return after a failed first fix. *What it is:* live job status, photo or video of findings, parts ETA, and a chat that answers "why does this cost $X" from the RO. *Powers:* DMS workshop, CAI. *Difficulty:* M.

11. **Fixed-price "ready now" lane in a negotiating dealership.** *Problem:* only 30% enjoy haggling and 41% are open to fixed or hybrid pricing, but Toyota AU sells through franchised dealers. *Evidence:* Toyota NZ's driveaway pricing included a 7-day return. *What it is:* a published, no-haggle drive-away price on selected in-stock cars, with an optional short exchange window. *Powers:* DMS pricing rules, STOCK. *Difficulty:* H (commercial).

12. **Budget-first discovery.** *Problem:* 71% of Australian buyers say price is the top priority and 59% want to spend under $30k (carsales). *Evidence:* CarGurus says most Discover users share their budget before leading. *What it is:* the conversation starts from a monthly payment and use-case, then returns live new, demo and certified-used stock across group sites that fit, with total cost including servicing. *Powers:* CAI, STOCK, TFA rates. *Difficulty:* M.

13. **Home or work test drive, booked by the assistant.** *Problem:* time is scarce and showroom waiting is the top friction. *Evidence:* Genesis Concierge. *What it is:* a slot picker covering location, car and staff, with insurance and licence checks done online beforehand and the handover sheet to the DMS (extending Harbourline's test-drive flow). *Powers:* DMS rostering, STOCK. *Difficulty:* M.

14. **Explainable-automation panel for the customer.** *Problem:* from 10 Dec 2026, automated decisions that significantly affect a customer, such as finance or personalised offers, must be disclosed. *What it is:* a "why am I seeing this" panel and a consent dashboard covering what data was used and the decision type, ahead of the obligation. *Powers:* 1PD consent store, DMS. *Difficulty:* L.

15. **Bring-your-own-AI handoff.** *Problem:* buyers arrive with ChatGPT-prepared questions (26%) and AI-built shortlists. *What it is:* the shopper pastes or shares their AI conversation or quote, and the assistant reconciles it against live stock and approved pricing, flagging where the outside AI was wrong. *Powers:* CAI, STOCK, DMS. *Difficulty:* L to M.

---

## Sources

All accessed 16 Oct 2026. "(opened)" means I read the page; "(blocked)" means I tried it and it returned an error or outage page. Blocked pages are not used as evidence above.

**Opened**
- Cox Automotive, Drivers of Car Shopping Satisfaction (26 Aug 2025): https://www.coxautoinc.com/insights-hub/cox-automotive-unveils-key-insights-into-successful-car-deals-in-new-study-drivers-of-car-shopping-satisfaction/
- Digital Dealer, Cox 2025 Car Buyer Journey (19 Jan 2026): https://digitaldealer.com/news/efficiency-digital-tools-and-ai-drive-car-buyer-satisfaction-to-record-highs-cox-automotive-study-finds/169157/
- Digital Dealer, Cox AI in Auto Retail Tracker (11 Aug 2026): https://digitaldealer.com/news/theres-an-ai-gap-between-car-shoppers-and-dealerships/172759/
- CBT News, J.D. Power 2025 SSI: https://www.cbtnews.com/tariffs-accelerate-buying-decisions-while-transparency-drives-sales-satisfaction-j-d-power-finds/
- CBT News, J.D. Power 2025 OEM EV App Report (29 May 2025): https://www.cbtnews.com/electric-vehicle-app-engagement-reaches-new-highs-but-brands-face-pressure-to-improve-speed-and-reliability-j-d-power-finds/
- CarPro, J.D. Power 2025 CSI: https://www.carpro.com/blog/2025-j.d.-power-dealer-service-satisfaction-survey-results
- Modern Retail, CarMax tech/Skye (7 Jul 2025): https://www.modernretail.co/technology/carmaxs-top-tech-exec-shares-his-keys-to-reinventing-a-legacy-retailer-in-the-age-of-ai/
- CarMax, Sierra voice agents (6 Aug 2026): https://media.carmax.com/press-releases/news-release/2026/CarMax-Teams-with-Sierra-to-Enhance-Inbound-Sales-Call-Experience/default.aspx
- CarMax, ChatGPT app release PDF (27 Feb 2026): https://s21.q4cdn.com/986527125/files/doc_news/CarMax-Launches-First-of-Its-Kind-Car-Shopping-and-Selling-Experience-in-ChatGPT-App-Store-2026.pdf
- Car Dealer Magazine, CarGurus Discover UK (15 Jul 2026): https://cardealermagazine.co.uk/cargurus-launches-ai-powered-car-search-tool-as-it-celebrates-10-years-in-uk/325673
- Autotrader plc, AI search / ChatGPT app (15 May 2026): https://plc.autotrader.co.uk/news-views/press-releases/autotrader-supercharges-ai-driven-car-search/
- IT Brief Australia, carsales AI Voice Search (27 Feb 2026): https://itbrief.com.au/story/carsales-adds-ai-voice-search-to-simplify-car-hunting
- carsales editorial, AI voice search campaign (25 Jun 2026): https://www.carsales.com.au/editorial/details/carsales-launches-ai-voice-search-152312/
- carsales business, Dealership Experience Survey (Jul 2025): https://business.carsales.com.au/news-room/news/what-buyers-are-telling-us-about-the-dealership-experience/
- carsales business, Australia's Car Buyer Report 2026 (gated landing page): https://business.carsales.com.au/australias-car-buyer-report/
- GoAuto, AADA dealer survey (28 Oct 2025): https://premium.goauto.com.au/aada-dealer-survey-results-released/
- Impel, next-gen Sales AI (21 May 2026): https://impel.ai/news/impel-redefines-automotive-lead-management-ai-generated-video-fully-integrated-customizable-ai-agents/
- Impel, Merchandising AI: https://impel.ai/merchandising-ai/
- Fullpath, chat conversion data (26 May 2026): https://www.fullpath.com/blog/inside-the-data-how-fullpaths-gpt-chatbot-drives-45-6-conversion-at-6-messages/
- Numa, 2024 service missed-calls report: https://www.numa.com/news/numa-releases-2024-industry-trends-in-auto-service-repair-showing-revenue-upside-for-dealerships-in-missed-calls
- TechCrunch, Toma (5 Jun 2025): https://techcrunch.com/?p=3015492
- The Autopian, Chevrolet of Watsonville chatbot (18 Dec 2023): https://theautopian.com/chevy-dealers-ai-chatbot-allegedly-recommended-fords-gave-free-access-to-chatgpt
- McCarthy Tétrault, Moffatt v Air Canada: https://www.mccarthy.ca/en/insights/blogs/techlex/moffatt-v-air-canada-misrepresentation-ai-chatbot
- Auto Remarketing, Amazon Autos (12 Dec 2024): https://www.autoremarketing.com/ar/retail/amazon-enters-car-business-partnering-with-dealers-to-sell-new-hyundais
- eCommerceNews NZ, Porsche cloud 3D configurator (12 Jan 2026): https://ecommercenews.co.nz/story/porsche-debuts-cloud-3d-configurator-for-cayenne-evs
- ZeroLight, Suzuki UK (20 Feb 2026): https://zerolight.com/customers/suzuki-3d-car-configurator
- ZeroLight, BRP (1 Dec 2022): https://zerolight.com/customers/brps-global-vehicle-configurators
- NerdWallet, Carvana review 2026: https://www.nerdwallet.com/auto-loans/reviews/carvana-used-car-financing
- Plenti, car loans: https://www.plenti.com.au/car-loans
- Finder, Driva: https://www.finder.com.au/car-loans/driva-car-loans
- Sunshine Toyota, Toyota Finance pre-application FAQ: https://www.sunshinetoyota.com.au/blog/car-buying-advice/your-top-pre-application-car-finance-faqs-answered
- Sunshine Toyota, myToyota Connect: https://www.sunshinetoyota.com.au/mytoyota-connect
- AnyAuto, Toyota Access GFV: https://www.anyauto.com.au/toyota-access-guaranteed-future-value-cars/amp/
- KBB B2B FAQs, Instant Cash Offer: https://b2b.kbb.com/faqs/
- Driven, Toyota NZ driveaway pricing (1 May 2018): https://www.drivencarguide.co.nz/news/toyotas-fixed-driveaway-pricing-on-target-despite-slow-start/
- KBB, Genesis shop-at-home (12 May 2020): https://www.kbb.com/car-news/genesis-launches-shop-at-home-services
- Ford, vehicle order status: https://www.ford.com/support/how-tos/owner-resources/sales-support/what-is-the-status-of-my-vehicle-order
- Allens, OAIC ADM guidance (Oct 2026): https://www.allens.com.au/insights-news/insights/2026/10/mandatory-automated-decision-making-disclosure-requirements-are-coming-key-takeaways-from-the-oaic-guidance/

**Tried and blocked or empty (not used as evidence)**
- toyota.com.au /finance/faq, /access, /finance, /car-finance (site outage page, 403)
- J.D. Power press releases (403); Gartner press release, 5 Mar 2025 (403): https://www.gartner.com/en/newsroom/press-releases/2025-03-05-gartner-predicts-agentic-ai-will-autonomously-resolve-80-percent-of-common-customer-service-issues-without-human-intervention-by-20290
- McKinsey "Electric-vehicle buyers demand new experiences" (timeout)
- CarGurus press page (406); AM Online (403); Carvana press (403); Carma help centre (Cloudflare 403); WhichCar (403); carsales help centre Instant Offer (403); CarMax FAQ 24-hour test drive (403); Tesla AU delivery-day and insurance pages (403); Rivian support (empty); Conversica case study (404); Kennedys privacy article (403); EY Mobility Consumer Index (404); Business Wire Carvana imaging and J.D. Power CSI (403)
