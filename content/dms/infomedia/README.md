# Simulated Infomedia data pack

What a Toyota dealer licenses from Infomedia, as we model it (see docs/DMS-PHASE2-SPEC.md §6). Infomedia does not publish its formats; this shape is ours and every figure is illustrative.

- service_menus.json: 156 VIN-era service menus (model × interval) with operations, labour hours and parts at RRP.
- parts_prices.json: 186 parts with RRP, dealer price, supersession and fitment.
- labour_rates.json: retail labour rate per site and GST.
- campaigns.json: 6 campaigns and recalls by model, year and VIN prefix.

Ingested into the knowledge box with topic/infomedia and model labels by scripts/ingest-dms-phase2.mjs. Quote = menu hours × site rate + parts RRP + GST (server/dms/infomedia.mjs).
