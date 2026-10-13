# Harbourline Toyota Configurator - content pack

Prepared 13 October 2026 for the prototype configurator (fictional dealership: Harbourline Toyota, Parramatta). All text is original plain-language writing; no Toyota marketing copy, logos or artwork is reproduced.

## Files

- `catalog.json` - 15 models, grades, colours, interiors, accessory packs consumed by the front-end. All `price`/`fromPrice` values are **illustrative NSW drive-away estimates**.
- `kb/*.md` - 31 knowledge-base articles with YAML frontmatter (`title`, `model`, `topic`) for ARAG ingest: 15 `spec-*`, 6 `grades-*`, and 10 range-wide articles (towing, accessories, pricing, warranty, service, finance, safety, dealer policy, NSW school dates, finder).

## How prices were built

1. A **list price before on-road costs** was taken per grade (2WD/cheapest variant): official/launch pricing where found, otherwise back-calculated from CarExpert's 2026 Sydney drive-away figures and rounded.
2. Drive-away = list + $2,190 dealer delivery + NSW motor vehicle duty ($3/$100 to $45k; $1,350 + $5/$100 above) + 12 months rego ($690 / $820 / $1,050 by size band) + $650 CTP, rounded up to the next $x90.
3. Premium paint $675 (confirmed for HiLux 2026; applied range-wide). Leather-accented interior upgrade $1,900 is a prototype assumption, not a Toyota price.

## Verified (source found, 2025-26)

- RAV4 6th gen grades and list prices (GX $45,990 to Cruiser AWD $60,340; Edge AWD only; XSE/PHEV exist) - GoAuto, WhichCar, Fleet Auto News, CarExpert.
- HiLux 2026: 2.8 diesel range-wide, 48V on autos, WorkMate $33,990 / SR $52,990 / SR5 $63,990 / Rogue & Rugged X $71,990, on sale 9 Dec 2025; paint $675 - NRMA, Chasing Cars, WhichCar.
- bZ4X 2026: 74.7 kWh, 591/517 km WLTP, 22 kW AC, AWD towing 1,500 kg, $55,990 / $67,990, Touring added mid-2026 - toyota.com.au news, CarExpert.
- Prado 250 launch prices, 2.8 diesel 150 kW/500 Nm, 3,500 kg - CarExpert, 4X4 Australia.
- Kluger GX $62,410 and Grande $85,135 list, 184 kW, 2,000 kg - CarExpert, CarsGuide.
- Camry hybrid-only 170 kW, 524 L, 400 kg; Corolla 2026 (ZR sedan dropped) list prices - CarExpert, Cars24.
- GR Yaris / GR Corolla 2025 list prices; GR86 2026 drive-away - CarExpert, GoAuto.
- Toyota Warranty Advantage terms (5 yr unlimited; 7 yr engine/driveline with logbook servicing; hybrid battery to 10 yrs with annual health check; commercial 5 yr/160,000 km) - toyota.com.au.
- Capped service: RAV4 hybrid 2026 $325 (12 mo/15,000 km), Prado 2026 $395 (6 mo/10,000 km) - Toyota certified listings.
- NSW 2026 term and holiday dates, 2027 terms - education.nsw.gov.au.
- RAV4 launched without ANCAP rating (five stars expected late 2026) - WhichCar, CarExpert.

## Estimated / unverified (marked "est." or "confirm" in the KB)

- Several list prices back-calculated from drive-away: Yaris Cross, Corolla Cross, C-HR, Camry, Kluger GXL, Fortuner, LandCruiser 300 (2026), GR86.
- HiLux top grades are Rogue and Rugged X (both $71,990 list); the unconfirmed GR Sport grade was replaced by `rugged-x` after content QA.
- RAV4 2WD towing (~800 kg), RAV4 boot (~580 L), RAV4 per-drivetrain outputs.
- Corolla hybrid towing (set to 0 / "not rated" - sources conflict).
- Boot volumes for Corolla Cross, GR models, Fortuner, Kluger third-row-folded; HiLux dimensions.
- Service prices other than RAV4 and Prado; bZ4X battery warranty specifics.
- ANCAP status for Yaris Cross, HiLux 2026, LandCruiser 300, GR Corolla.
- Colour names/hex values are representative; not every colour is offered on every Toyota in reality. "Silver Sky", "Jungle Khaki" and "Dusty Bronze" are used as configurator swatches.
- All accessory prices, the Harbourline dealer policies, factory-order lead times and finance examples are fictional/illustrative.

## Open verification items

Internal reviewer notes were removed from the customer-facing KB and catalog after content QA (13 Oct 2026). These are the items that still need checking against official Toyota Australia sources:

- RAV4 2WD braked towing (shown as about 800 kg), boot volume (about 580 L), and combined output by drivetrain (about 143 kW).
- Corolla hybrid towing: shown as not rated; sources conflict (some list 1,300 kg for hybrid hatches).
- Boot volumes for Corolla hatch, Corolla Cross, Fortuner, GR Yaris, GR Corolla and Kluger (third row folded); HiLux double cab dimensions; Corolla Cross and Fortuner fuel figures; bZ4X DC peak charging rate.
- ANCAP status: Yaris Cross (2021), HiLux 2026 (five stars reported, year unconfirmed), RAV4 (launched unrated), LandCruiser 300 (shown as not rated), GR Corolla.
- LandCruiser 300: some 2026 dealer listings mention a 341 kW petrol-electric hybrid (GR Sport / Sahara ZX); the configurator lists diesel only.
- List prices back-calculated from 2026 drive-away listings: Yaris Cross, Corolla Cross, C-HR, Camry, Kluger GXL, Fortuner, LandCruiser 300, GR86. GR Yaris and GR Corolla use 2025 list prices; Prado uses launch-era list prices still seen on 2026 stock.
- Service: bZ4X interval and capped-price period; GR model intervals; diesel capped-price period of 5 years / 100,000 km is inferred; capped prices other than RAV4 ($325) and Prado ($395) are indicative.
- bZ4X high-voltage battery warranty period and capacity-retention condition.
- Roadside assistance terms (removed from warranty.md because not verified).
- HiLux Rugged X equipment details and leather-accented trim flag (set true).
- Camry: the PM queried an SX grade; Toyota dealer listings and CarExpert show the 2026 line-up as Ascent / Ascent Sport / SL, so `ascent-sport` was kept. Ascent Sport wheel size corrected to 17-inch.
- Factory-order waits in kb/dealer-policy.md are indicative and differ from domo/order_bank_eta.json for some models; align if the Domo figures are canonical.

## Sources

- https://web1.goauto.com.au/new-models/toyota/rav4/new-gen-toyota-rav4-prices-up-for-australia/2025-11-11/97903.html
- https://www.whichcar.com.au/news/2026-toyota-rav4-australian-pricing-announced-ahead-of-early-2026-deliveries
- https://fleetautonews.com.au/toyota-launches-all-new-rav4-for-2026-and-phev-joins-the-range/
- https://www.whichcar.com.au/news/new-toyota-rav4-on-sale-without-ancap-safety-rating
- https://www.carexpert.com.au/toyota/rav4/2026 (and /kluger, /camry, /corolla, /corolla-cross, /c-hr, /yaris-cross, /fortuner, /bz4x, /prado, /landcruiser, /hilux, /gr86 2026 pages)
- https://www.mynrma.com.au/open-road/news/2025/2026-toyota-hilux-pricing
- https://www.chasingcars.com.au/news/new-car-prices/iconic-model-hit-with-big-price-hike-toyota-hilux-2026-pricing-and-features-confirmed-for-ford-ranger-byd-shark-6-rival/
- https://web1.goauto.com.au/new-models/toyota/hilux/up-to-6k-price-increase-for-new-gen-toyota-hilux/2025-11-12/97899.html
- https://www.toyota.com.au/discover/news/upgraded-toyota-bz4x-family-expanded-with-larger-more-powerful-all-new-touring-grade
- https://www.cars24.com.au/car-news/2026-toyota-corolla-price-and-specs-detailed/
- https://www.carsguide.com.au/toyota/kluger/price
- https://www.4x4australia.com.au/toyota/landcruiser-prado
- https://goauto.com.au/new-models/toyota/gr/2025-01-05/95375.html
- https://www.toyota.com.au/owners/warranty
- https://www.toyota.com.au/discover/news/toyota-introduces-toyota-warranty-advantage
- https://www.toyota.com.au/used-vehicles/vehicle-listing/Toyota-Prado-SUM5DFVIXQ (capped service $395)
- https://www.toyota.com.au/used-vehicles/vehicle-listing/Toyota-RAV4-HVVRIMTMMQ (capped service $325)
- https://education.nsw.gov.au/schooling/calendars/2026
- https://education.nsw.gov.au/schooling/calendars/future-and-past-nsw-term-and-vacation-dates

`spec-*.md` price tables were generated from the same figures as `catalog.json`; if you change a price, update both. Keep ids stable because the front-end and stock data reference them.
