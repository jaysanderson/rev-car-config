---
title: Harbourline DMS manual - the Infomedia data pack (service menus, parts prices, campaigns, quotes)
model: all
topic: manual
---

# The Infomedia data pack

Infomedia is the Sydney company whose aftersales data most Australian dealers license: **Microcat EPC**, the electronic parts catalogue (part numbers, descriptions, supersessions, illustrations, prices and fitment by VIN), and **Superservice Menus**, the VIN-specific service and repair menus built from OEM data (operations per interval, labour times, parts, menu prices and service-plan pricing). Dealers connect them to the DMS through Infomedia's **DMSi** module: parts orders, prices and service menus are transferred into the DMS, and the DMS supplies the customer and vehicle context; more than 100 DMS providers integrate, and an Order API exists for web services. In dealer language, the **data pack** is the OEM-sourced bundle the dealer licenses: the parts price file, the labour times and menus for each model and interval, and the campaign and recall data, refreshed on a schedule.

Sources: [Superservice Menus](https://www.infomedia.com.au/products/service/superservice-menus/), [Microcat EPC](https://www.infomedia.com.au/products/parts/microcat-epc/), [DMSi v8 Integration Guide](https://www.infomedia.com.au/files/training/DMSi-v8-Integration-Guide-FEU-EN.pdf), [Infomedia company page](https://www.linkedin.com/company/infomedia-ltd), [DealerRefresh vendor profile](https://forum.dealerrefresh.com/vendors/infomedia/).

## What our pack contains

Harbourline's pack is **simulated**: Infomedia does not publish its file formats, so the DMS carries its own shape under `content/dms/infomedia/` and every figure is illustrative. It holds:

| File | Contents |
|---|---|
| service_menus | For each Toyota model in the catalogue and each interval (15,000 km, 30,000 km, 45,000 km, 60,000 km, 75,000 km, 90,000 km, 105,000 km, 120,000 km): the operations, labour hours, parts with part numbers and RRP, and the menu total at the standard labour rate |
| parts_prices | The parts price file: part number, description, supersession, RRP, dealer price and the models it fits |
| labour_rates | The labour rate per site and per work type (scheduled service, diagnosis, repair, EV high voltage) |
| campaigns | Open OEM campaigns and recalls by model, year and VIN range, with the operation and whether it is customer-pay or warranty |

Each menu set, the parts file and the campaign list are resources in the knowledge box with model labels, so the agent can answer "what does a 60,000 km service include on a 2022 RAV4 hybrid and what does it cost here" with a citation.

## How a quote is built

1. On a job card click **Quote from Infomedia menu**, or go to **Settings & API** and open **Infomedia pack** for a stand-alone quote.
2. The vehicle comes from the card (VIN, model, year, odometer). The DMS picks the next interval due from the odometer, or you choose one.
3. The quote is: menu labour hours × the site's labour rate, plus the parts at RRP, plus GST, valid for 14 days. Those figures are computed by the DMS from the pack; the agent never invents them.
4. The customer-ready text (what the service includes, what is checked, what is replaced, the price) is written by the agent from the menu resource and cites it. Edit it before sending.
5. **Add menu to job card** turns the menu into labour and parts lines on the card, marked source menu, so the invoice matches the quote.

The DMS calls `POST /dms/api/infomedia/quote` for the quote and `POST /dms/api/job-cards/:id/lines` with the menu id to add the lines.

## Campaigns and recalls

When a job card is created or checked in, the DMS looks up the VIN against the campaign list (`GET /dms/api/infomedia/campaigns?vin=`). Open campaigns show on the card under **Campaigns and recalls** with **Add to lines**. Warranty campaigns are added at zero customer price. Tell the customer at check-in; it is a reason many customers say yes to the booking.

## Parts lookup

In the line editor, type a part number or a description to search the price file (`GET /dms/api/infomedia/parts?q=`). The result shows the current part, the superseded number if there is one, RRP and dealer price, and the models it fits. Choosing it fills the line.

## Asking the pack

**Ask Infomedia** on the pack page answers questions over the pack: "Which intervals include brake fluid on a Kluger?", "Is there an open campaign for 2023 HiLux?", "What is the labour rate for EV high-voltage work at Hornsby?". The DMS calls `POST /dms/api/infomedia/ask`.

## Rules

- A quote given to a customer must come from the pack through the quote function, not from memory.
- When a menu line and the supplier invoice disagree, the invoice is matched at its price and the difference is recorded as a parts memo on the card.
- The pack is simulated demo data. In production the DMS would receive the real pack through DMSi or the Order API on Infomedia's refresh schedule.
