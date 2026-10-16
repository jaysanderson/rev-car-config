# Track: Marketplaces, dealer groups and dealer digital-retailing platforms

Research date: 16 October 2026. Researcher track: what a franchised dealer can realistically deliver today, and what Australian buyers already see.

Method: live sites were opened in a browser from Australia, and investor releases and trade press were opened directly. Several US sites block Australian visitors. AutoNation.com shows "not available in your country or region", Driveway.com returns "Blocked by WAF policy", and Autotrader.com, EchoPark.com and Upstart's auto-retail page did not load (Upstart's returned "Page not found"). Where a site could not be opened, the evidence comes from the company's own filings or dated third-party reporting, and the gap is stated. Stage keys: Discover, Choose, Configure, Price, Finance and trade-in (F/T), Reserve and buy (R/B), Deliver, Own.

---

## Toyota Australia (toyota.com.au) and the One Toyota dealer platform

This is the most important finding of the track. Toyota Australia's site and the network's shared dealer sites (`<dealer>.dealer.toyota.com.au`) already run an end-to-end "Order Online" flow on VIN-level stock.

- **Discover and choose:** model pages carry "Build and Price", "Book a test drive" and "Explore finance" calls to action. The site is personalised to a selected dealer (it defaulted to Bendigo Toyota) and notes that prices vary by location.
- **Configure and price:** `/rav4/prices` is a single-page configurator. It covers grade (GX, GXL, Edge, XSE, Cruiser, GR Sport, each with a "driveaway from" price), colour (9 swatches), trim, drivetrain (2WD/AWD), engine (2.5L Hybrid or Plug-in Hybrid), transmission and "Important extras" (for example a full-size spare). It has Cash / Finance / Full-Service Lease tabs. Full driveaway was $50,928 for a RAV4 GX 2WD hybrid, "based on Bendigo Toyota Epsom VIC 3551". The price includes 12 months' registration and CTP, the maximum dealer delivery charge and stamp duty. A sticky footer offers "Contact a Dealer" and "Check Local Stock".
- **Stock:** "Check Local Stock" hands off to the dealer's site, filtered to that grade (UTM `campaign=dealer_integration`). The list shows in-stock cars with VIN, colour, trim and driveaway price, plus demonstrators (with km, inclusions and location) and "Make it your own" build-to-order configurations.
- **F/T:** **Toyota Access** is a loan with a **Guaranteed Future Value** set as the balloon. At the end of the term the owner can trade, keep or return. Excess-km adjustment is $0.0635/km, and the owner gives notice about 180 days before the end. **Toyota Personalised Repayments** is a 3-minute personalised rate that "you can see across the entire Toyota range". Fixed Rate Loan terms run 1 to 7 years. However, on every RAV4 we checked at both Bendigo Toyota and Sydney City Toyota, the stock page said "Online Finance is currently disabled for this vehicle. Please request a Finance Quote". Trade-in is captured as a Yes/No on the enquiry form. The Order Online FAQ includes "What is Estimated KMs used for?" and "What if my trade in has finance outstanding?"
- **R/B:** "Order Online" on the vehicle detail page opens `/purchase/newcars`: "Pay a holding deposit of $1000 today and pay the rest at the dealership." It has four steps: 01 Vehicle, 02 Details, 03 Payment (cash or finance), 04 Summary and pay deposit. Step 1 offers Toyota Genuine Accessories (exterior and interior) as interest flags only: "this doesn't confirm your commitment to purchase". The FAQ says the deposit is credited to the purchase, that changes can still be made "once the dealer calls you", and that the dealer contacts the buyer about readiness for collection. The dealer page claims ordering "only takes 10 minutes".
- **Deliver:** collection at the dealer. No home delivery is offered in the flow.
- **Own:** the Toyota Go membership (service scheduling, recalls, manuals; same login as the myToyota Connect app), Toyota Finance Online, and 5-year unlimited-km Warranty Advantage.
- **Weaknesses:** online finance is switched off at the vehicle level (seen on every RAV4 checked). Trade-in has no instant valuation. Accessories are leads, not priced line items. Configured builds hand off to stock or enquiry rather than to a priced order.
- **Available to AU Toyota dealers today:** yes. It is the network platform.

## Sydney City Toyota (Waterloo and Glebe, NSW)

- The dealer's own site (sydneycitytoyota.com.au) describes itself as the "No.1 Toyota Dealer in NSW" and "the largest Toyota dealership in Sydney". It covers used search (about 31 used cars listed), Test Drive, Finance & Insurance enquiry, Sell Your Car, chat ("Open chat" widget) and a review feed. Its "New Vehicles" navigation links to sydneycitytoyota.dealer.toyota.com.au, the One Toyota platform above.
- **Stock seen:** on the RAV4 listing, 7 new in-stock VINs (GXL 2WD $53,873 to $54,583; XSE PHEV 2WD $64,928; XSE PHEV AWD $69,653; GR Sport PHEV AWD $72,803), 2 demonstrators (about 2,700 km, $63,490 and $71,690) and 11 "Make it your own" builds. Online finance was disabled on all of them.
- **Trade-in:** "Sell Your Car" is a 2-step contact form (name, mobile, email, location) promising "No Obligations, Free Appraisal, Competitive Offers". It gives no instant number.
- **Implication:** a Sydney Toyota buyer can see the real VIN, a driveaway price and a $1,000 online holding deposit. They cannot get an online trade value, a live finance approval, or delivery to their home.

## Carsales (carsales.com.au, CAR Group)

- **Discover:** "Quick search" and an "Ask carsales" entry point on the home page. CAR Group's FY26 release (10 Aug 2026) says it "enhanced the customer experience through conversational search and personalisation" and launched **Nexgate**, a "next generation dealer platform". The AGM address (Oct 2025) says CAR Group reaches a "unique monthly audience of 49 million people" across its global marketplaces.
- **Choose and price:** new-car listings are labelled "Dealer new" with a drive-away price, or "New car to order" with an "Indicative drive away" price. It also has a special-offers hub and expert reviews scored out of 100.
- **F/T:** **Instant Offer** asks for make, model, badge, year, condition, service history, finance status, km, rego and postcode. The offer is valid for 7 days. An inspection at the buyer's premises or by a mobile inspector follows, and payment comes "the next business day". Pricing uses "live market data" including RedBook. Carsales claims "83% of Instant Offers are priced higher than a trade-in" (no method given). Users can also value a car "with no follow-up calls" and track its value in their account.
- **R/B, deliver, own:** for new cars, the deal transacts at the dealer. Carsales owns RedBook (valuation data).
- **Weakness:** no new-car checkout. Instant Offer is for selling, not a trade-in netted into a new-car deal.
- **Available to AU Toyota dealers:** yes, as advertisers and buyers. Dealer tools are Autogate/Nexgate.

## Carwow (UK; also Germany and Spain)

- **Model:** a reverse auction. The buyer configures (engine, gearbox, trim, colour, extras, postcode). Approved dealers then send upfront, no-haggle offers, shown alongside "the nearest, the cheapest and the ones rated highest by carwow buyers" (Carwow guide, dated 2017). The buyer contacts the chosen dealer to complete the purchase and can part-exchange with them. Offers often show a cash price and a finance price, and some dealers add a deposit contribution. Carwow's RAV4 page: "We take the hassle and haggle out of car buying by finding you great deals from local and national dealers".
- **Other tools:** Car Chooser (filters on body, fuel, boot, price), lease deals (for example 48 months, 5,000 miles a year), Sell My Car (offer, accept, collection), Carwow Wallet and Carwow Collects 2.0.
- **Numbers:** 12M+ customers. "Nearly £3 billion" of cars bought on site last year. 6,000+ dealer partners. Trustpilot 4.3 from 85,577 reviews. 11M+ YouTube subscribers. 2025 revenue was £104.2M (+22%), marketplace income £74.3M (+26%), and adjusted EBITDA a £7.6M loss (AM, 28 Sep 2026). Carwow is investing in AI for remote vehicle appraisal. A consumer "AI car finder" could not be verified from a primary source.
- **Weaknesses:** price competition squeezes dealer margin. Finance and delivery stay with the dealer.
- **AU availability:** none.

## Auto Trader (UK)

- 476,090 cars searchable on the home page (16 Oct 2026). Free instant valuation for part-exchange or sale. Leasing with "The price you see is the price you get" (for example £197 a month, £2,599 upfront including a £245 processing fee). History checks.
- **Deal Builder** (online deal and reservation): Auto Trader's FY26 results (year to 31 Mar 2026) say it produces "higher quality enquiries that convert at double the rate into sales". At year end there were more than 3x as many retailers on it and almost 3x as many full-reservation deals. But its accelerated rollout caused retailer pushback: H2 revenue growth slowed to 3% and cancellations rose. Auto Trader then let retailers choose between full reservation and "request-a-reservation". Buyers spend 11x more time on Autotrader than on the nearest competitor. AI is used in Co-Driver (dealer listing tool), Buying Signals and search, including within ChatGPT.
- **Lesson:** dealers resist marketplace-owned checkout that they cannot control.
- **AU availability:** none.

## Cars.com (US)

- Carson™ AI search ("search using your own words"), search by plate or VIN, Instant Offer for sellers (plate, VIN or photos), loan prequalification that "won't affect your credit", a payment calculator, compare, and safety/recall lookups. The home page showed no checkout.
- **AU availability:** none.

## Autotrader (US) and Cox Automotive Accelerate My Deal

- Autotrader.com was unavailable from Australia. Cox's 2 Feb 2026 release launched **Accelerate My Deal Elite** on Autotrader and Dealer.com sites. It offers complete online checkout, ID verification, document upload, e-signatures, delivery scheduling, Dealertrack F&I, and works with any CRM or DMS. Cox justifies it with 2025 Car Buyer Journey figures: 28% of shoppers want to buy their next vehicle online, but only 7% do.
- **AU availability:** not found on the pages opened.

## CarGurus (US, UK, Canada)

- **Deal ratings:** IMV (Instant Market Value) is "an estimated fair retail price" from comparable current and past listings, updated daily. Ratings run Great, Good, Fair, High, Overpriced, and search ranks best deals first "rather than by what dealers pay". CarGurus calls itself the "No. 1 visited automotive shopping site in the U.S." (Similarweb).
- **2025 results (19 Feb 2026):** revenue $907.0M (+14%), 34,409 paying dealers. It **wound down CarOffer**, including Instant Max Cash Offer, because the model "proven less effective in today's more volatile and unpredictable pricing environment". cargurus.com itself would not load from Australia.
- **AU availability:** none.

## Amazon Autos (US)

- Per WardsAuto (2 Sep 2025): new Hyundai sales began December 2024, and used/CPO cars were added in August 2025. Dealers in more than 130 cities take part. Dealers are invitation-only, are the seller of record, and must show clear no-haggle list prices and use Amazon's workflow. Buyers pay on Amazon and **pick up at the dealer**. Returns are allowed within 3 days or 300 miles, with a minimum 30-day/1,000-mile warranty. Inventory within 75 miles is shown. Amazon takes no cut of the sale but may charge a listing fee. Hertz Car Sales joined in August 2025.
- **Lesson:** a marketplace forces price transparency on dealers, but fulfilment stays at the dealer.
- **AU availability:** none.

## AutoNation (AutoNation Express)

- AutoNation.com is geo-blocked in Australia. The AutoNation Toyota South Austin "Buy your car online" page lists 8 steps: Start Purchase Online on the vehicle page; pre-qualify (no credit score impact); trade appraisal (estimate, then on-the-spot check at any store); payment calculator including taxes, fees and incentives; protection plans; credit application with co-buyer; upload licence and insurance; purchase summary, after which an associate finalises. No deposit or delivery terms are shown on that page.
- **Captive finance:** the AutoNation Finance portfolio reached $2.2B (Q4 2025). FY2025 revenue was $27.6B.
- **AU availability:** none.

## Lithia & Driveway (Driveway.com)

- Driveway.com blocks Australian traffic. As described by Clark Howard/AJC (2021): owned national inventory at a haggle-free price, checkout with finance, cash or lease, a delivery time and place chosen at checkout, trade-in collected at delivery, an instant trade offer valid 7 days, and a 7-day/400-mile return policy.
- **Lithia FY2025 (11 Feb 2026):** revenue $37.63B. **Driveway Finance penetration 15.0%** (average FICO 751). 425,381 used retail units.
- **Lesson:** a captive lender plus owned checkout works at group scale.
- **AU availability:** none. Lithia's Q4 revenue split was US, UK and Canada only.

## Sonic Automotive (EchoPark)

- EchoPark is a used-only format. It retailed 67,636 units in 2025 (−2%) with record adjusted EBITDA of $49.2M (per search reporting). Q2 2026 brought 19,601 units (+17%), and expansion "beginning in the fourth quarter of 2026" (Auto Remarketing, 5 Aug 2026). The site could not be opened, so consumer features are not verified.
- **AU availability:** none.

## Arnold Clark (UK)

- Over 200 UK branches. "No hidden fees, the price you see is the price you pay". A price guarantee pays back "double the difference" if a buyer finds the same car cheaper. Buy used online with **Click & Collect or home delivery**. Free instant valuation. Rated 4.7 from 196,417 reviews. Representative finance example: £17,998 car, £249 deposit, 60 months, 10.9% APR. The home page gives no reservation-deposit figure.
- **AU availability:** none. It is a model of what a large franchised group does with fixed pricing.

## Eagers Automotive (easyauto123; Carzoos history)

- easyauto123 is a used "big box" format. It offers "Haggle-free fixed pricing", "shop 100% online" or in store, nationwide delivery, a 7-day money-back guarantee, 12 months' roadside assistance on Quality Verified cars, online finance and appraisal booking. It claims "100,000+ happy customers" and a 4.7 Google rating, with stores in Sydney, Melbourne, Brisbane, Perth, Adelaide, Hobart, Newcastle and Maitland.
- **History** (GoAuto, 7 Dec 2020): Eagers folded its online used-car sites, **including Carzoos**, into easyauto123, which it modelled on CarMax. Eagers then sold about 100,000 new cars a year through about 200 franchised dealerships.
- **Ownership:** Mitsubishi Corporation agreed (1 Oct 2025) to take 20% of a new easyauto123 holding company, with Eagers holding 80%.
- **AU Toyota dealers:** Eagers owns many Toyota franchises. easyauto123 shows fixed-price, online-capable retail working in Australia, but for used cars only.

## Peter Warren Automotive (NSW/QLD/VIC)

- Group site: "over 14" brands including Toyota. About 1,900 vehicles across sites (Warwick Farm 702, Campbelltown 491). Filters cover new, demo and used. It offers a **"fully refundable $200 online reservation"**, a free "Value My Car" trade valuation, online finance applications and a budget tool. No chat or delivery was seen.
- **AU Toyota:** yes. A listed group already runs refundable online reservation on stock.

## Suttons Group (NSW)

- Family-owned since 1943. Rated 4.6 from 23.9k Google reviews. The site covers about 20 car brands plus trucks, new/demo/used search, a Sell My Car inspection and valuation, a finance page, Afterpay for service, and online appointment booking. No online reservation or instant trade value was seen. Toyota appears only as a bare brand link, so Toyota stock could not be confirmed.

## Roadster (CDK Global)

- Roadster's consumer site (roadster.com) shows "Buy Your Next Car Online™: Instant Pricing. Express Checkout. Home Delivery." and "68,603 new cars available within 100 miles". Its Express Storefront runs six steps: Choose, Pricing (all incentives applied, plus a deal sheet with cash, finance and lease before commitment), Trade-In ("firm online offer from the dealership"), Credit (online application, licence and insurance upload), Final review, Delivery (pickup or doorstep, paperwork ready, trade collected). It also offers an "Upfront Pricing Guarantee". The CDK product page could not be opened (it redirects to a 404).
- **AU availability:** not established from sources opened.

## Tekion

- Its Automotive Retail Cloud covers DMS, CRM, Digital Retail ("tierless", with online document signing), Tekion Pay, and an OEM-level Automotive Enterprise Cloud with a configurator, real-time purchasing, finance and add-ons. AI agents include T1 conversational, Service Scheduler AI and F&I AI. Self-reported figures: 3,000+ dealerships, "70%+ of consumers signing documents online", and "up to 2x lead-to-sale conversion on Tier 1 brand sites".
- **AU:** not mentioned on the site.

## Upstart Auto Retail

- Launched October 2021 from the Prodigy acquisition (Upstart IR). As of 16 Oct 2026, upstart.com/auto-retail returns "Page not found". Its current status is unverified.
- **AU:** no evidence of availability.

## Gubagoo (Reynolds and Reynolds)

- Chat, Virtual Retailing, Desking and a "Curator" intelligence engine. Its "Single Calc Engine" through the Reynolds ERA DMS means "no re-keying or re-desking". It offers real-time lender decisions, smart F&I menus (claimed "up to 2.75x higher revenue margins per deal"), integrated service scheduling in chat, and WhatsApp/Facebook integrations. It powers Asbury's Clicklane and Hendrick.
- **AU:** none stated.

## Impel

- Sales AI (books appointments), Chat AI (24/7), Voice AI, Service AI, and Merchandising AI (360 WalkArounds, Feature Tour, Video Tour, F&I Advantage, AI image enhancement). Claims 8,000+ dealer and OEM clients in 51 countries and $11.4B in revenue influenced.
- **AU:** the site has an "Australia & New Zealand" region selector. This is the only platform in this list showing an AU presence.

## Fullpath

- A dealer customer data platform (200+ integrations, single shopper identity). It offers an Omni AI Agent, a Lead Handling Agent, an Agentic CRM (limited release), and VIN-specific, equity and "dynamic payments" campaigns. Claims 3,000+ dealers "across North America" and 250K attributed annual sales.
- **AU:** none stated.

---

## Industry research: what buyers want

| # | Finding | Source, year |
|---|---|---|
| 1 | Total time to buy a vehicle was **just under 14 hours**, 20 minutes less than 2024. New-car buyers spent about 30 fewer minutes at the dealership and nearly 2 fewer hours researching online. | Cox Automotive Car Buyer Journey Study 2025 (via Digital Dealer, 19 Jan 2026; Cox Deal Central) |
| 2 | **28%** of shoppers want to buy their next vehicle online, but only **7%** do. | Cox 2025 CBJ, cited in Cox AMD Elite release, Feb 2026 |
| 3 | **44%** of new buyers follow a hybrid online-plus-store path. "Mostly digital" buyers save **41 minutes** at the dealer and report **78% vs 65%** satisfaction. | Cox CBJ 2025 |
| 4 | The biggest gaps between wanting a step online and actually doing it: F&I product selection **24 points**, finance application **15 points**, finance-approval notification **14 points**. | Cox CBJ 2025 (Digital Dealer) |
| 5 | **25%** of new-car buyers used AI tools. Mostly digital buyers who used AI vs those who did not: overall satisfaction **84% vs 71%**, belief they got a good deal **81% vs 67%**. | Cox CBJ 2025 |
| 6 | **82%** of new buyers who completed more than half the steps online were highly satisfied with the dealer. New-car buyers who completed key steps online saved **49 minutes**. | Cox CBJ 2024 (released 7 Jan 2025) |
| 7 | Sales satisfaction scored **802/1,000**. The 6 drivers, in order: delivery, dealer personnel, working out the deal, paperwork, facility, website. Deal satisfaction is **800 when the trade value is justified vs 672** when it is not. **28%** said their trade value was lower than expected. | J.D. Power US SSI 2025 (n=32,616) |
| 8 | **22%** want a follow-up feature explanation a few weeks after delivery, and **53%** of them never get one. | J.D. Power US SSI 2025 |
| 9 | Service satisfaction scored **868**. **64%** want photo or video evidence with repair recommendations. Only **26%** experienced 9 or 10 of the top service KPIs. | J.D. Power US CSI 2026 (12 Mar 2026) |
| 10 | Australians are the most likely of 18 markets to consider buying from an online car retailer (**21%**). **23%** would buy from manufacturers selling online and offline. About **75%** research online before buying, and **24%** visit carsales while researching. | YouGov 2022 (n=1,091 AU); Nielsen AU, 14 Oct 2025 |

Context: Auto Trader UK (FY26) reports that Deal Builder enquiries convert at **2x**. Deloitte's 2026 Global Automotive Consumer Study (28,500+ consumers, 27 countries) finds the top purchase priorities are getting a good deal, transparent pricing and physically interacting with the vehicle, but its figures sit in interactive charts and could not be extracted. Bain's often-cited figures ("up to 65% would consider online, about 2% did") date from 2017. AADA and Canstar Blue dealer-sales satisfaction data could not be opened, so no Australian sales-satisfaction benchmark is included.

---

## Cross-cutting patterns

| # | Pattern | Who does it | Can a Sydney Toyota dealer do it today? |
|---|---|---|---|
| 1 | **One all-in price** (drive-away, or fixed/no-haggle) shown before contact | Toyota AU (postcode drive-away), carsales, Carwow, Amazon, Arnold Clark, easyauto123, Roadster guarantee | **Yes.** Toyota's driveaway is already per dealer postcode. The gap is showing the dealer's actual transaction price where it differs. |
| 2 | **VIN-level stock linked from the configurator** | Toyota AU to dealer.toyota.com.au, Roadster "Build & Find", Peter Warren | **Yes.** "Check Local Stock" already does this. Ranking stock by closeness to the configured spec is missing. |
| 3 | **Small online holding deposit** | Toyota Order Online ($1,000, credited), Peter Warren ($200, refundable), Auto Trader Deal Builder (full or request-a-reservation) | **Yes, live.** Refundability terms were not visible in the Toyota FAQ answers we opened. |
| 4 | **Instant, firm trade value inside the deal** | Roadster ("firm online offer"), Driveway (7-day offer), AutoNation (estimate then on-the-spot check), carsales Instant Offer (sell only) | **Partly.** Sydney City Toyota has a contact-form appraisal only. A RedBook/carsales-style instant range plus JDP-style justification is feasible. |
| 5 | **Live finance with personalised rate and approval** | Toyota Personalised Repayments (3 minutes, whole range), AutoNation pre-qual, Gubagoo real-time lenders, Cars.com soft-pull prequalification | **Tool exists but disabled per vehicle.** Online finance was off on every RAV4 we checked at both dealers. Enabling it is the largest gap Cox data identifies (15 to 24 points). |
| 6 | **Online F&I and protection menus** | Gubagoo smart menus, AutoNation step 5, Tekion F&I AI, Cox AMD Elite (Dealertrack F&I) | **No.** Toyota's flow captures accessory interest only. |
| 7 | **Single calculation engine from web to DMS** (no re-desking) | Gubagoo with Reynolds ERA, Tekion, Cox AMD Elite (works with any DMS) | **Not observed.** This is the opening for a DMS vendor such as Revolution. |
| 8 | **Dealer-controlled vs marketplace-controlled checkout** | Auto Trader had to retreat on Deal Builder, Amazon requires dealer workflow rules, Carwow hands off to the dealer | Toyota's model keeps the dealer as seller of record. Keep it that way. |
| 9 | **Conversational / AI search and lead handling** | Ask carsales, Cars.com Carson, Auto Trader in ChatGPT, Impel, Fullpath, Tekion T1 | **Partly.** Sydney City Toyota has chat. Impel lists an ANZ region. |
| 10 | **Home delivery and returns windows** | Driveway (7 days/400 mi), easyauto123 (7-day money-back), Amazon (3 days/300 mi), Arnold Clark home delivery, Roadster | **New cars: not in the Toyota flow** (collection only). Used: easyauto123 proves it works in Australia. |
| 11 | **Captive finance as the profit engine** | Driveway Finance 15.0% penetration, AutoNation Finance $2.2B, Toyota Access GFV | **Yes.** Toyota Access with GFV is a ready-made "trade, keep or return" story that most US marketplaces cannot match. |
| 12 | **After-delivery education and ownership** | JDP: 22% want follow-up, 53% do not get it. Toyota Go/myToyota Connect app. CSI: 64% want photo/video | **Yes.** It needs process plus a content trigger from the DMS. |

---

## Sources

All opened on 16 October 2026 unless noted.

- https://www.toyota.com.au/car-finance/toyota-access (redirected from /toyota-access)
- https://www.toyota.com.au/ ; https://www.toyota.com.au/rav4 ; https://www.toyota.com.au/rav4/prices
- https://bendigotoyota.dealer.toyota.com.au/new-vehicles/rav4/gx/2wd
- https://bendigotoyota.dealer.toyota.com.au/inventory/rav4/gx/2wd/2026/JTM5DABV10D340212
- https://bendigotoyota.dealer.toyota.com.au/purchase/newcars?v=1587&m=74599301DFB20040&b=13086056 (Order Online and FAQ)
- https://www.sydneycitytoyota.com.au/ ; https://www.sydneycitytoyota.com.au/trade-in
- https://sydneycitytoyota.dealer.toyota.com.au/new-vehicles-all/rav4
- https://www.carsales.com.au/ ; https://www.carsales.com.au/instant-offer/
- https://announcements.asx.com.au/asxpdf/20260810/pdf/072l1bhtmsqlrr.pdf (CAR Group FY26 results, 10 Aug 2026)
- https://cargroup.com/wp-content/uploads/2025/10/2025-AGM-MD-addresses.pdf
- https://www.carwow.co.uk/how-it-works ; https://www.carwow.co.uk/ ; https://www.carwow.co.uk/buy-a-car ; https://www.carwow.co.uk/toyota/rav4
- https://www.carwow.co.uk/blog/how-to-buy-a-car-with-carwow-0140 (dated 2017)
- https://www.am-online.com/news/carwow-revenue-passes-100m-but-investment-leaves-76m-ebitda-loss (28 Sep 2026)
- https://www.autotrader.co.uk/
- https://plc.autotrader.co.uk/media/usjleen0/full-year-press-release-fy26.pdf
- https://www.cars.com/
- https://www.coxautoinc.com/insights-hub/cox-automotive-unveils-accelerate-my-deal-elite-the-only-complete-online-vehicle-buying-solution-for-both-dealers-car-buyers/ (2 Feb 2026)
- https://investors.cargurus.com/news-releases/news-release-details/cargurus-announces-fourth-quarter-and-full-year-2025-results (19 Feb 2026)
- https://cargurus.helpscoutdocs.com/article/10-what-is-imv
- https://www.wardsauto.com/finance-insurance/amazon-pushes-deeper-into-auto-sales-with-hyundai (2 Sep 2025)
- https://www.autonation.com/express (geo-blocked)
- https://www.autonationtoyotasouthaustin.com/buy-your-car-online.htm
- https://www.sec.gov/Archives/edgar/data/350698/000035069825000082/anearningsrelease33125ex991.htm (AutoNation Q1 2025)
- https://www.driveway.com/ (blocked)
- https://www.ajc.com/news/driveway-5-things-to-know-before-you-buy-or-sell-a-car-online/RIOBX35LUZHKXK2Y46ATJLWDLY (6 Jul 2021)
- https://investors.lithiadriveway.com/press-releases/mlhx5dwodygiwog5j1b (11 Feb 2026)
- https://www.autoremarketing.com/ar/retail/echopark-used-car-stores-help-drive-records-for-sonic-in-q2/ (5 Aug 2026)
- https://www.arnoldclark.com/
- https://www.easyauto123.com.au/
- https://premium.goauto.com.au/eagers-brings-carmax-to-australia/ (7 Dec 2020)
- https://www.acnnewswire.com/press-release/English/102870/Strategic-Partnership-and-Inve (1 Oct 2025)
- https://www.peterwarren.com.au/
- https://www.suttons.com.au/
- https://www.roadster.com/
- https://www.cdk.com/solutions/digital-retailing (redirect to 404)
- https://tekion.com/
- https://www.upstart.com/auto-retail (page not found)
- https://www.gubagoo.com/
- https://impel.ai/
- https://www.fullpath.com/
- https://digitaldealer.com/news/efficiency-digital-tools-and-ai-drive-car-buyer-satisfaction-to-record-highs-cox-automotive-study-finds/169157/ (19 Jan 2026)
- https://www.coxautoinc.com/deal-central/resources/how-to-build-smarter-deals/
- https://www.coxautoinc.com/insights-hub/cox-automotives-car-buyer-journey-study-reveals-record-high-satisfaction-among-new-and-ev-buyers/ (7 Jan 2025)
- https://www.jdpower.com/business/press-releases/2025-us-sales-satisfaction-index-ssi-study (6 Nov 2025)
- https://www.repairerdrivennews.com/2025/11/10/study-tariffs-accelerate-new-car-buying-decisions-transparency-drives-sales-satisfaction/
- https://www.jdpower.com/business/press-releases/2026-us-customer-service-index-csi-study (12 Mar 2026)
- https://www.deloitte.com/us/en/insights/industry/retail-distribution/global-automotive-consumer-study.html
- https://www.bain.com/insights/the-future-of-car-sales-is-omnichannel/ (13 Sep 2017)
- https://yougov.com/articles/44127-australians-most-likely-globally-consider-online-c (20 Oct 2022)
- https://www.nielsen.com/news-center/2025/nielsen-data-shows-aussies-are-set-to-swap-utes-for-evs-in-green-gold-rush/ (14 Oct 2025)
