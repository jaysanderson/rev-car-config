// dms-schema.mjs — single source of truth for the DMS table schemas, the Domo dataset
// descriptors (content/dms/domo-datasets.json) and content/dms/data/README.md.
// Used by scripts/dms-seed.mjs; column names match the JSON keys exactly.

const REFRESH_TABLE = 'Nightly 02:00 Australia/Sydney (DMS export); API writes are live';
const REFRESH_DERIVED = 'Nightly 02:15 Australia/Sydney, recomputed from the tables (on request via /dms/api/domo/export)';

// [name, type, description] — types: string, integer, number, boolean, datetime (ISO 8601 with +10:00/+11:00), date (YYYY-MM-DD), month (YYYY-MM), json (array/object, JSON-encoded in CSV)
export const TABLES = {
  sites: {
    description: 'The four Harbourline Toyota dealerships. salesTarget mirrors the targets table (units per month).',
    primaryKey: ['id'],
    columns: [
      ['id', 'string', 'Site id: par Parramatta (home), hor Hornsby, pen Penrith, liv Liverpool'],
      ['name', 'string', 'Display name'], ['legalName', 'string', 'Trading name'], ['address', 'string', 'Street address'], ['phone', 'string', 'Showroom phone'],
      ['home', 'boolean', 'True for the group home site (Parramatta)'], ['distanceKm', 'integer', 'Road distance from Parramatta (transfers)'], ['transferRun', 'string', 'Weekday of the inter-site transfer truck'],
      ['managerId', 'string', 'staff.id of the sales manager'], ['salesTarget', 'json', '{ "YYYY-MM": units } for Oct 2024 to Dec 2026'],
    ],
  },
  staff: {
    description: 'Group staff and demo logins. 14 salespeople with different conversion, discounting and F&I attach; sales managers appraise trades and approve desks; business managers run finance.',
    primaryKey: ['id'],
    columns: [
      ['id', 'string', 'st-gm, st-sm-<site>, st-sp-01..14, st-dxm, st-bm-<site>'], ['name', 'string', 'Full name'], ['role', 'string', 'gm | sales_manager | salesperson | dxm | finance'], ['title', 'string', 'Job title'],
      ['siteId', 'string', 'Home site (sites.id)'], ['email', 'string', 'Login email (@harbourline.demo)'], ['avatarInitials', 'string', 'Initials for the UI'], ['phone', 'string', 'Direct line'],
      ['startedAt', 'date', 'Start date (Josh Pereira, sales1@, started 1 Jun 2026; Ben Whitfield Jul 2025; Aaron Fifita Feb 2025)'], ['active', 'boolean', 'Currently employed'], ['demoLogin', 'boolean', 'One of the five documented demo logins'],
    ],
  },
  customers: {
    description: 'People and businesses with at least one named enquiry. Synthetic: emails use example.* domains, mobiles the ACMA fiction block 0491 57x xxx, landlines (02) 5550 xxxx.',
    primaryKey: ['id'],
    columns: [
      ['id', 'string', 'C-#####, in order of first enquiry'], ['firstName', 'string', 'Given name (contact person for businesses)'], ['lastName', 'string', 'Family name'], ['company', 'string', 'Business name for fleet/ABN customers, else null'],
      ['email', 'string', 'Synthetic email'], ['phone', 'string', 'Synthetic phone'], ['suburb', 'string', 'Suburb in the site catchment'], ['postcode', 'string', 'NSW postcode'], ['state', 'string', 'Always NSW'],
      ['siteId', 'string', 'Nearest/home site'], ['source', 'string', 'web-configurator | walk-in | phone | referral | campaign | service | web-form (from the first enquiry)'], ['createdAt', 'datetime', 'First enquiry'],
      ['tags', 'json', 'fleet, abn-holder, owner, repeat-buyer, configurator, finance-customer, trade-in, service-customer, ev-interest, family, tradie, campaign-responder'], ['notes', 'string', 'Free-text CRM note'],
      ['unitsPurchased', 'integer', 'Delivered deals'], ['marketingConsent', 'boolean', 'Opted in to marketing'],
    ],
  },
  vehicles: {
    description: 'Stock ledger: the 22 configurator units (content/domo/stock_by_site.json, unchanged), from-stock units sold over 24 months, demonstrators, units allocated to customer orders and the November stock order (allocation).',
    primaryKey: ['stockNo'],
    columns: [
      ['vin', 'string', '17-character VIN (configurator units keep theirs)'], ['stockNo', 'string', 'HL-####. Configurator units keep their ids (HL-1941..HL-2720); history/demo HL-1000..HL-1899; ordered/allocated HL-2801+'],
      ['siteId', 'string', 'sites.id'], ['model', 'string', 'Catalogue model id (catalog.json)'], ['grade', 'string', 'Catalogue grade id'], ['colour', 'string', 'Catalogue colour id'], ['interior', 'string', 'Catalogue interior id'], ['packs', 'json', 'Factory/port packs fitted (tow, protection, roof)'],
      ['status', 'string', 'on_lot | in_transit | sold | demo | allocated | ordered'], ['daysInStock', 'integer', 'Age today (on_lot/demo) or at sale (sold)'],
      ['landedCost', 'integer', 'Dealer cost ex on-roads (AUD)'], ['listPrice', 'integer', 'Vehicle price ex on-roads (AUD); deals.vehiclePrice for that unit'], ['arrivedAt', 'datetime', 'Arrival on the lot (null in transit/ordered/allocated)'], ['soldAt', 'datetime', 'Delivery (RDA) date for sold units'],
      ['dealId', 'string', 'deals.id that sold or reserved the unit'], ['bonusHeadroom', 'integer', 'Manager-approvable ready-now/aged bonus (AUD)'], ['movePriority', 'integer', 'Domo move priority (1 = move first)'], ['reasonCode', 'string', 'aged_60d | aged_90d | days_of_supply'],
      ['etaDays', 'integer', 'Days until arrival for in_transit/allocated/ordered'], ['source', 'string', 'configurator | dms | demonstrator | allocation'],
    ],
  },
  leads: {
    description: 'Every enquiry (one per touch). Merged duplicate touches keep mergedIntoLeadId and status lost (lostReasonCode duplicate); exclude them from conversion maths. Configurator leads are test-drive bookings from the configurator.',
    primaryKey: ['id'],
    columns: [
      ['id', 'string', 'L-######'], ['customerId', 'string', 'customers.id; null only for anonymous configurator bookings that never turned up'], ['customerRef', 'string', 'Configurator session id when customerId is null'],
      ['siteId', 'string', 'sites.id'], ['ownerId', 'string', 'staff.id of the salesperson'], ['source', 'string', 'Marketing source: showroom, service-department, referral, repeat-customer, drive-by, google, toyota.com.au, harbourline.com.au, carsales, google-ads, facebook, <channel>-campaign, web-configurator'],
      ['channel', 'string', 'configurator | web-form | phone | walk-in | campaign'], ['status', 'string', 'new | contacted | qualified | test_drive_booked | quoted | won | lost'],
      ['createdAt', 'datetime', 'Enquiry time'], ['updatedAt', 'datetime', 'Last status change'], ['interest', 'json', '{ modelId, gradeId, colourId, stockNo }'],
      ['configuratorSessionId', 'string', 'Configurator sid (joins configurator_events.sid)'], ['finderAnswers', 'json', '[{ id, value }] finder answers (use, people, towing, power, budget, when …)'], ['viewed', 'json', '[{ modelId, gradeId, unitId }] cars looked at in the configurator'],
      ['bookingId', 'string', 'test_drives.id of the configurator booking (TD-xxxxx)'], ['campaignId', 'string', 'campaigns.id for campaign leads'], ['mergedIntoLeadId', 'string', 'Primary lead this duplicate touch was merged into'],
      ['lostReason', 'string', 'Human label'], ['lostReasonCode', 'string', 'Lead: no_response, invalid, researching, budget, wait_time, bought_elsewhere, duplicate, used_car, not_suitable, deferred. Deal codes when lost as a deal.'],
      ['score', 'integer', 'Lead score 0-100 (channel intent + progress − staleness)'], ['statusHistory', 'json', '[{ status, at }] every status reached'],
    ],
  },
  test_drives: {
    description: 'Test drives booked from leads (configurator bookings carry the handover sheet and incentive). No-shows are rebooked about half the time.',
    primaryKey: ['id'],
    columns: [
      ['id', 'string', 'TD-xxxxx (same alphabet as the configurator)'], ['leadId', 'string', 'leads.id'], ['customerId', 'string', 'customers.id (null for anonymous configurator bookings)'], ['siteId', 'string', 'sites.id'], ['staffId', 'string', 'Salesperson'],
      ['stockNo', 'string', 'Demonstrator or stock unit driven'], ['modelId', 'string', 'Model'], ['gradeId', 'string', 'Grade'], ['when', 'datetime', 'Appointment'], ['bookedAt', 'datetime', 'When it was booked'],
      ['status', 'string', 'booked | completed | no_show | cancelled'], ['channel', 'string', 'Lead channel'], ['questions', 'json', '[{ id, question, answer }] the three pre-visit questions'],
      ['incentive', 'json', '{ id, title, value, reason } (configurator bookings)'], ['handover', 'json', 'Salesperson handover sheet: car, viewed, finderAnswers, promotionsToOffer, incentive, talkingPoints'], ['outcome', 'string', 'quoted | considering | not_for_them | second_drive_requested | no_show | cancelled_by_customer | rescheduled'],
    ],
  },
  deals: {
    description: 'Desked deals from quote to delivery. frontGross = vehiclePrice − discount − bonus − landedCost + accessoriesGross − promotionCost − tradeOverAllowance; backGross = finance commission + insurance/warranty products; grossProfit = front + back. Only stage = delivered is realised gross.',
    primaryKey: ['id'],
    columns: [
      ['id', 'string', 'D-##### (D-10482 and D-10517 are the document-processing demo contracts)'], ['leadId', 'string', 'leads.id'], ['customerId', 'string', 'customers.id'], ['siteId', 'string', 'sites.id'], ['salespersonId', 'string', 'staff.id'], ['businessManagerId', 'string', 'staff.id of the F&I manager when financed'],
      ['modelId', 'string', 'Model'], ['gradeId', 'string', 'Grade'], ['colourId', 'string', 'Colour'], ['stockNo', 'string', 'vehicles.stockNo for stock/allocated units or the unit being quoted'], ['order', 'json', '{ modelId, gradeId, colourId, etaWeeks, stockNo? } for allocated/factory orders and order quotes'],
      ['fulfilment', 'string', 'stock | allocated | factory (set at contract)'], ['stage', 'string', 'quote | negotiation | finance | approval | contract | delivery | delivered | lost'],
      ['createdAt', 'datetime', 'Quote raised'], ['updatedAt', 'datetime', 'Last event'], ['closedAt', 'datetime', 'Delivered or lost'], ['contractAt', 'datetime', 'Contract signed'],
      ['vehiclePrice', 'integer', 'Vehicle price ex on-roads'], ['onRoadCosts', 'integer', 'Stamp duty, rego, CTP, plates'], ['landedCost', 'integer', 'Dealer cost'], ['accessories', 'json', '[{ id, name, price }] dealer-fit accessories'],
      ['accessoriesTotal', 'integer', 'Sum of accessory prices'], ['accessoriesGross', 'integer', 'Accessory margin'], ['promotions', 'json', '[{ id, title, value }] promotions.id applied'], ['promotionCost', 'integer', 'Dealer cost of the promotions'],
      ['tradeInId', 'string', 'trade_ins.id'], ['tradeOverAllowance', 'integer', 'Trade offered above valuation (excl. promotion bonus), charged to front gross'], ['bonus', 'integer', 'Ready-now/aged bonus drawn from vehicles.bonusHeadroom'], ['discount', 'integer', 'Discount off the vehicle'],
      ['driveAway', 'integer', 'vehiclePrice + onRoadCosts + accessoriesTotal − bonus − discount (before trade-in)'], ['deposit', 'integer', 'Deposit taken at contract'], ['financeAppId', 'string', 'Latest finance_apps.id'],
      ['frontGross', 'integer', 'Front-end gross'], ['backGross', 'integer', 'Back-end (F&I) gross'], ['grossProfit', 'integer', 'front + back'], ['grossStatus', 'string', 'realised (delivered) | projected (open) | lost'],
      ['deliveryDate', 'datetime', 'Actual (delivered) or scheduled delivery'], ['lostReason', 'string', 'Human label'], ['lostReasonCode', 'string', 'price | other_toyota | competitor | wait_time | finance_declined | trade_gap | deferred | no_response'], ['lostStage', 'string', 'Stage the deal was lost from'],
      ['stageHistory', 'json', '[{ stage, at }] every stage entered'], ['events', 'json', '[{ at, type, note, staffId }] timeline with human notes (flattened in deal_events)'], ['demo', 'string', 'document-processing for the two demo contracts'],
    ],
  },
  trade_ins: {
    description: 'Trade-in appraisals (about half of deals). Valuation follows age, kilometres, condition and make; over-allowance above valuation is charged to front gross.',
    primaryKey: ['id'],
    columns: [
      ['id', 'string', 'TI-##### (TI-30418 and TI-30441 match the sample appraisal PDFs)'], ['dealId', 'string', 'deals.id'], ['customerId', 'string', 'customers.id'], ['siteId', 'string', 'sites.id'],
      ['make', 'string', 'Make'], ['model', 'string', 'Model/variant'], ['year', 'integer', 'Build year'], ['km', 'integer', 'Odometer'], ['condition', 'string', 'excellent | good | fair | poor'],
      ['valuation', 'integer', 'Appraised trade value'], ['reconditioning', 'integer', 'Estimated reconditioning cost'], ['offered', 'integer', 'Amount offered (incl. any trade-in promotion bonus)'], ['overAllowance', 'integer', 'offered − valuation − promotion bonus (≥ 0)'],
      ['appraisedAt', 'datetime', 'Appraisal'], ['appraisedBy', 'string', 'staff.id (sales manager)'], ['rego', 'string', 'NSW plate'], ['vin', 'string', 'VIN when captured'], ['documents', 'json', 'Files collected'], ['payout', 'integer', 'Finance owing on the trade'],
    ],
  },
  finance_apps: {
    description: 'Finance applications. Declines are resubmitted to a second lender most of the time (sequence 2). Approval rates: Toyota Finance ≈ 90%, Macquarie ≈ 85%, ANZ ≈ 80%, Westpac ≈ 75%.',
    primaryKey: ['id'],
    columns: [
      ['id', 'string', 'FA-#####'], ['dealId', 'string', 'deals.id'], ['customerId', 'string', 'customers.id'], ['siteId', 'string', 'sites.id'], ['businessManagerId', 'string', 'staff.id'],
      ['lender', 'string', 'Toyota Finance | Macquarie | ANZ | Westpac'], ['amount', 'integer', 'Amount financed = driveAway − deposit − trade equity − cash'], ['termMonths', 'integer', '36-84'], ['rate', 'number', 'Annual rate %'], ['balloon', 'integer', 'Balloon/residual'],
      ['status', 'string', 'submitted | approved | conditional | declined | settled'], ['submittedAt', 'datetime', 'Submitted'], ['decisionAt', 'datetime', 'First decision'], ['conditionsClearedAt', 'datetime', 'Conditional approval cleared'], ['settledAt', 'datetime', 'Settled after delivery'],
      ['conditions', 'string', 'Outstanding conditions'], ['sequence', 'integer', '1 = first lender, 2 = resubmission'],
    ],
  },
  promotions: {
    description: 'Promotion register: 17 historical/scheduled offers plus the 8 current ones mirrored from content/dealer/promotions.json, with provenance (Domo signal, KB policy).',
    primaryKey: ['id'],
    columns: [
      ['id', 'string', 'promo-…'], ['title', 'string', 'Offer'], ['kind', 'string', 'servicing | accessory-bundle | trade-in | delivery | finance | drive-away | experience'], ['value', 'integer', 'Customer value (AUD) or null'],
      ['source', 'json', '{ domo, kb } why it exists'], ['startsAt', 'datetime', 'Start'], ['endsAt', 'datetime', 'End'], ['appliesTo', 'json', '{ models, units, aged, bodies, onLot? }'], ['status', 'string', 'active | expired | scheduled'],
      ['dealsApplied', 'integer', 'Deals carrying the promotion'], ['short', 'string', 'Short phrase (current offers)'], ['desc', 'string', 'Customer description (current offers)'], ['reason', 'string', 'Internal reason (current offers)'],
    ],
  },
  campaigns: {
    description: '18 marketing campaigns over 24 months. leads = count of leads.campaignId; deals = those leads that were won/delivered.',
    primaryKey: ['id'],
    columns: [
      ['id', 'string', 'CMP-###'], ['name', 'string', 'Campaign'], ['channel', 'string', 'email | sms | web | social'], ['audience', 'string', 'Audience definition'], ['siteIds', 'json', 'Sites targeted'],
      ['startsAt', 'datetime', 'Start'], ['endsAt', 'datetime', 'End'], ['status', 'string', 'completed | live | scheduled'], ['promotionIds', 'json', 'promotions.id featured'],
      ['sent', 'integer', 'Messages sent (email/sms) or impressions (web/social)'], ['sentMetric', 'string', 'messages | impressions'], ['opened', 'integer', 'Opens (email/sms) or engagements'], ['clicked', 'integer', 'Clicks'], ['leads', 'integer', 'Leads attributed'], ['deals', 'integer', 'Won leads'], ['budget', 'integer', 'Spend (AUD)'], ['costPerLead', 'integer', 'budget ÷ leads'],
    ],
  },
  documents: {
    description: '60 deal documents. DOC-1001..DOC-1006 are the synthetic sample PDFs in content/dms/samples (status uploaded, `expected` holds the ground truth for the ARAG extraction demo); the rest are already processed.',
    primaryKey: ['id'],
    columns: [
      ['id', 'string', 'DOC-####'], ['kind', 'string', 'contract | trade_in_form | supplier_invoice | licence | insurance'], ['dealId', 'string', 'deals.id'], ['customerId', 'string', 'customers.id'], ['siteId', 'string', 'sites.id (samples)'], ['stockNo', 'string', 'vehicles.stockNo (invoices)'],
      ['fileName', 'string', 'File name'], ['title', 'string', 'Title (samples)'], ['uploadedAt', 'datetime', 'Upload'], ['status', 'string', 'uploaded | processing | extracted | verified'], ['samplePdf', 'string', 'Repo path of the sample PDF'],
      ['expected', 'json', 'Ground-truth fields for the sample PDFs'], ['extracted', 'json', 'Fields extracted by ARAG'], ['confidence', 'json', '{ field: 0-1 }'], ['verifyFields', 'json', 'Fields below 0.9 confidence to check'],
      ['aragResourceId', 'string', 'KB resource id once uploaded'], ['verifiedAt', 'datetime', 'Verified'], ['verifiedBy', 'string', 'staff.id'],
    ],
  },
  targets: {
    description: 'Monthly unit and gross targets per site (Oct 2024 to Dec 2026; Oct 2024 pro-rated from the 15th). Set from last year plus growth and seasonality, so attainment varies month to month.',
    primaryKey: ['siteId', 'month'],
    columns: [['siteId', 'string', 'sites.id'], ['month', 'month', 'YYYY-MM'], ['units', 'integer', 'Delivered-units target'], ['grossTarget', 'integer', 'Total gross target (AUD)']],
  },
};

export const DERIVED_DATASETS = {
  sales_daily: {
    description: 'One row per day × site × model with any activity: leads (excl. merged duplicates), completed test drives, deals created, contracts, deliveries (and from stock), lost deals, revenue and gross of deliveries.',
    primaryKey: ['date', 'siteId', 'modelId'], derivedFrom: ['leads', 'test_drives', 'deals'],
    columns: [['date', 'date', 'Local date'], ['month', 'month', 'YYYY-MM'], ['week', 'date', 'Monday of the week'], ['siteId', 'string', 'sites.id'], ['modelId', 'string', 'Model'], ['leads', 'integer', 'New leads'], ['testDrivesCompleted', 'integer', 'Completed test drives'], ['dealsCreated', 'integer', 'Quotes raised'], ['contractsSigned', 'integer', 'Contracts'], ['unitsDelivered', 'integer', 'Deliveries (RDA)'], ['unitsDeliveredFromStock', 'integer', 'Deliveries fulfilled from stock'], ['dealsLost', 'integer', 'Deals lost'], ['revenue', 'integer', 'Drive-away of deliveries'], ['discount', 'integer', 'Discount + bonus on deliveries'], ['frontGross', 'integer', 'Front gross of deliveries'], ['backGross', 'integer', 'Back gross of deliveries'], ['grossProfit', 'integer', 'Total gross of deliveries'], ['financeDeals', 'integer', 'Deliveries with finance'], ['tradeIns', 'integer', 'Deliveries with a trade']],
  },
  stock_ageing_daily: {
    description: 'End-of-day stock snapshot per date × site × model (on-lot units only, demonstrators excluded), rebuilt from vehicles.arrivedAt/soldAt.',
    primaryKey: ['date', 'siteId', 'modelId'], derivedFrom: ['vehicles'],
    columns: [['date', 'date', 'Snapshot date'], ['siteId', 'string', 'sites.id'], ['modelId', 'string', 'Model'], ['unitsOnLot', 'integer', 'Units on the lot'], ['avgDaysInStock', 'integer', 'Mean age'], ['maxDaysInStock', 'integer', 'Oldest unit age'], ['units60Plus', 'integer', 'Units over 60 days'], ['units90Plus', 'integer', 'Units over 90 days'], ['stockValueLanded', 'integer', 'Landed cost of units on the lot']],
  },
  funnel_weekly: {
    description: 'Lead cohorts by creation week × site × channel: how many reached each funnel step (by now), plus conversion ratios. Merged duplicate touches are counted separately.',
    primaryKey: ['week', 'siteId', 'channel'], derivedFrom: ['leads', 'test_drives', 'deals'],
    columns: [['week', 'date', 'Monday of the cohort week'], ['siteId', 'string', 'sites.id'], ['channel', 'string', 'Lead channel'], ['leads', 'integer', 'Leads (excl. duplicates)'], ['duplicates', 'integer', 'Merged duplicate touches'], ['contacted', 'integer', 'Reached contacted'], ['qualified', 'integer', 'Reached qualified'], ['testDriveBooked', 'integer', 'Reached test_drive_booked'], ['testDrivesCompleted', 'integer', 'Completed a test drive'], ['quoted', 'integer', 'Got a quote (deal)'], ['won', 'integer', 'Won'], ['delivered', 'integer', 'Delivered'], ['lost', 'integer', 'Lost'], ['open', 'integer', 'Still open'], ['leadToTestDrive', 'number', 'testDrivesCompleted ÷ leads'], ['leadToQuote', 'number', 'quoted ÷ leads'], ['leadToWon', 'number', 'won ÷ leads']],
  },
  configurator_events: {
    description: 'Configurator first-party events: live rows from content/dealer/events.jsonl (origin live) plus sessions reconstructed from configurator leads that predate the event log (origin dms_reconstructed). No personal data.',
    primaryKey: ['sid', 'at', 'type'], derivedFrom: ['events.jsonl', 'leads', 'test_drives'],
    columns: [['at', 'datetime', 'Event time (Sydney)'], ['date', 'date', 'Local date'], ['sid', 'string', 'Session id (joins leads.configuratorSessionId)'], ['type', 'string', 'finder_answer | finder_result | build_change | offer_view | offer_click | ask | booking | booking_answer'], ['modelId', 'string', 'Model'], ['gradeId', 'string', 'Grade'], ['colourId', 'string', 'Colour'], ['unitId', 'string', 'vehicles.stockNo'], ['questionId', 'string', 'Finder/booking question'], ['value', 'string', 'Answer'], ['bookingId', 'string', 'test_drives.id'], ['siteId', 'string', 'sites.id'], ['leadId', 'string', 'leads.id (reconstructed rows)'], ['origin', 'string', 'live | dms_reconstructed']],
  },
  dealer_signals: {
    description: 'Domo Intelligence rows per model (content/domo/dealer_signals.json, read-through) joined to ERP facts and a derived move priority.',
    primaryKey: ['model'], derivedFrom: ['dealer_signals.json', 'vehicles', 'deals'],
    columns: [['month', 'month', 'Signal month'], ['model', 'string', 'Model'], ['unitsInStock', 'integer', 'Domo: on lot + in transit'], ['sales90d', 'integer', 'Domo: retail (from-stock) deliveries, last 90 days'], ['daysOfSupply', 'integer', 'Domo: unitsInStock ÷ (sales90d ÷ 90)'], ['allocationNextMonth', 'integer', 'Domo: November allocation'], ['targetGap', 'integer', 'Domo: units still needed this month'], ['avgDaysInStock', 'integer', 'Domo: mean on-lot age'], ['marginHeadroomAvg', 'integer', 'Domo: mean approvable incentive'], ['erpUnitsOnLot', 'integer', 'ERP on_lot units'], ['erpUnitsInTransit', 'integer', 'ERP in_transit units'], ['erpUnitsInbound', 'integer', 'ERP ordered + allocated'], ['erpStockDeliveries90d', 'integer', 'ERP from-stock deliveries, 90 days'], ['erpAllDeliveries90d', 'integer', 'ERP all deliveries, 90 days'], ['erpDaysOfSupply', 'integer', 'ERP days of supply'], ['agedUnits', 'integer', 'On-lot units over 60 days'], ['oldestStockNo', 'string', 'Unit to move first'], ['openDeals', 'integer', 'Open deals for the model'], ['priorityScore', 'integer', 'Derived move score'], ['recommendedAction', 'string', 'Plain-language action'], ['priorityRank', 'integer', '1 = act first']],
  },
  deal_events: {
    description: 'Deal timelines flattened: one row per event with the human note (for activity and stage-duration analysis).',
    primaryKey: ['dealId', 'at', 'type'], derivedFrom: ['deals'],
    columns: [['dealId', 'string', 'deals.id'], ['siteId', 'string', 'sites.id'], ['salespersonId', 'string', 'staff.id'], ['modelId', 'string', 'Model'], ['at', 'datetime', 'Event time'], ['date', 'date', 'Local date'], ['type', 'string', 'created | quote_sent | note | call | stage_change | trade_appraisal | finance_submitted | finance_decision | manager_approval | contract_signed | order_placed | eta_update | delivery_booked | delivered | lost'], ['staffId', 'string', 'Who logged it'], ['note', 'string', 'Human note'], ['dealStage', 'string', 'Current deal stage']],
  },
};

const col = ([name, type, description]) => ({ name, type, description });
const DOMO_TYPE = { string: 'STRING', integer: 'LONG', number: 'DOUBLE', boolean: 'STRING', datetime: 'DATETIME', date: 'DATE', month: 'STRING', json: 'STRING' };

export function buildDescriptors(counts, derivedCounts = {}) {
  const datasets = [];
  for (const [name, t] of Object.entries(TABLES)) {
    datasets.push({ name, kind: 'table', description: t.description, primaryKey: t.primaryKey, refresh: REFRESH_TABLE, rowCount: counts[name] ?? null, file: `content/dms/data/${name}.json`, csv: `/dms/api/domo/export/${name}.csv`, derivedFrom: null, columns: t.columns.map((c) => ({ ...col(c), domoType: DOMO_TYPE[c[1]] })) });
  }
  for (const [name, t] of Object.entries(DERIVED_DATASETS)) {
    datasets.push({ name, kind: 'derived', description: t.description, primaryKey: t.primaryKey, refresh: REFRESH_DERIVED, rowCount: derivedCounts[name] ?? null, file: null, csv: `/dms/api/domo/export/${name}.csv`, derivedFrom: t.derivedFrom, function: `server/dms/derive.mjs DERIVED.${name}`, columns: t.columns.map((c) => ({ ...col(c), domoType: DOMO_TYPE[c[1]] })) });
  }
  return {
    catalogue: 'Harbourline DMS → Domo datasets',
    version: 1,
    asOf: '2026-10-14T08:00:00+11:00',
    conventions: {
      timezone: 'Australia/Sydney; datetimes are ISO 8601 with +10:00 (AEST) or +11:00 (AEDT)',
      money: 'AUD integers, GST-inclusive retail figures',
      json: 'array/object columns are JSON-encoded strings in CSV',
      ids: 'string ids; join keys documented per column',
    },
    datasets,
  };
}

// ── README ───────────────────────────────────────────────────────────────────
export function readme(counts, meta, derivedCounts = {}) {
  const tbl = (cols) => `| field | type | meaning |\n|---|---|---|\n${cols.map(([n, t, d]) => `| \`${n}\` | ${t} | ${d.replace(/\|/g, '\\|')} |`).join('\n')}`;
  const L = [];
  L.push('# Harbourline DMS seed data');
  L.push('');
  L.push(`Generated by \`node scripts/dms-seed.mjs\` (seed \`${meta.seed}\`, deterministic) as of **${meta.asOf}**, with history from ${meta.historyFrom.slice(0, 10)}. Re-run it to regenerate; \`node scripts/dms-seed.mjs --check\` prints a sanity report and integrity checks. All people, businesses, emails, phones, VINs and ABNs are synthetic.`);
  L.push('');
  L.push('Each table is a JSON array in `content/dms/data/<table>.json`. `_meta.json` holds counts and the Domo signal baseline used for calibration. Dataset descriptors for Domo are in `content/dms/domo-datasets.json`; derived datasets are computed by `server/dms/derive.mjs`.');
  L.push('');
  L.push('## Volumes');
  L.push('');
  L.push('| table | rows | | derived dataset | rows |');
  L.push('|---|---:|---|---|---:|');
  const tn = Object.keys(TABLES), dn = Object.keys(DERIVED_DATASETS);
  for (let i = 0; i < Math.max(tn.length, dn.length); i++) L.push(`| ${tn[i] ? `\`${tn[i]}\`` : ''} | ${tn[i] ? counts[tn[i]] : ''} | | ${dn[i] ? `\`${dn[i]}\`` : ''} | ${dn[i] ? (derivedCounts[dn[i]] ?? '') : ''} |`);
  L.push('');
  L.push('Read-through (not generated here): `content/domo/dealer_signals.json` (Domo signals), `content/dealer/events.jsonl` (configurator events), `content/dealer/bookings.json` (live bookings). Configurator sessions that booked in `events.jsonl` appear as `channel = configurator` leads with the same session id and booking id.');
  L.push('');
  L.push('## How the data behaves');
  L.push('');
  L.push(`- **Seasonality**: lead flow follows June EOFY and December peaks and a January dip (Christmas–New Year close-down), Saturday-heavy walk-ins, Sunday web/phone only, NSW public holidays closed, and about 7% growth a year. Deliveries are pulled forward into June (instant asset write-off) and before Christmas.`);
  L.push('- **Funnel**: lead → contacted → qualified → test drive → quote (deal) → negotiation → finance (if financed through the dealer) → manager approval → contract → delivery → delivered. Probabilities depend on channel (walk-ins convert best, campaign leads worst, configurator bookings are high intent) and on the salesperson (close rate, discounting, response speed, F&I attach differ: e.g. Priya Natarajan and Jake Morrison convert ~40% of leads, Ben Whitfield and Aaron Fifita ~15%).');
  L.push('- **Fulfilment**: won deals are delivered from stock (2-7 days), from an allocated inbound unit (2-7 weeks) or by factory order (order-bank ETAs, longer for Prado and LandCruiser). From-stock deliveries in the last 90 days match `dealer_signals.sales90d` per model exactly, so days of supply agrees with Domo.');
  L.push('- **Stock**: the 22 configurator units are copied unchanged (HL-2231 94 days, HL-1941 110 days …). Historic units sold from stock (HL-1000..1899) carry their age at sale; aged units used their bonus headroom. `ordered` units equal Toyota\'s November allocation per model (Kluger 14).');
  L.push('- **Gross**: `frontGross = vehiclePrice − discount − bonus − landedCost + accessoriesGross − promotionCost − tradeOverAllowance`; `backGross` = finance commission (≈1.1–2.1% of amount) + insurance/warranty products, or small product income for cash deals; `grossProfit = frontGross + backGross`. `driveAway = vehiclePrice + onRoadCosts + accessoriesTotal − bonus − discount`. Typical front $1,000–$4,000, financed back $600–$2,800.');
  L.push('- **Demo scenarios**: open deals stuck in `finance` for more than 5 days at Penrith and Parramatta, deals waiting in `approval` for more than 3 days, `sales1@harbourline.demo` (Josh Pereira, started June 2026) with ~40 leads and ~25 deals, ~50 anonymous configurator bookings (`customerId` null, `customerRef` = session id), and the two document-processing contracts D-10482 (Priya Raman, HL-2231) and D-10517 (Daniel Okafor, HL-1941, GM-approved $2,900 concession) whose PDFs are DOC-1001..1006.');
  L.push('');
  L.push('## Join keys');
  L.push('');
  L.push('```');
  L.push('sites.id ─┬─ staff.siteId, customers.siteId, vehicles.siteId, leads.siteId, test_drives.siteId, deals.siteId, targets.siteId');
  L.push('staff.id ─┬─ leads.ownerId, deals.salespersonId, deals.businessManagerId, test_drives.staffId, deals.events[].staffId, trade_ins.appraisedBy');
  L.push('customers.id ─ leads.customerId, deals.customerId, test_drives.customerId, trade_ins.customerId, finance_apps.customerId, documents.customerId');
  L.push('leads.id ─ deals.leadId, test_drives.leadId, leads.mergedIntoLeadId;  leads.bookingId = test_drives.id;  leads.campaignId = campaigns.id');
  L.push('leads.configuratorSessionId = configurator_events.sid (= events.jsonl sid)');
  L.push('deals.id ─ trade_ins.dealId, finance_apps.dealId, documents.dealId, vehicles.dealId;  deals.tradeInId, deals.financeAppId (latest)');
  L.push('vehicles.stockNo ─ deals.stockNo, deals.order.stockNo, test_drives.stockNo, documents.stockNo, leads.interest.stockNo;  vehicles.model = dealer_signals.model');
  L.push('promotions.id ─ deals.promotions[].id, campaigns.promotionIds[]');
  L.push('targets (siteId, month) ─ month of deals.closedAt where stage = delivered');
  L.push('```');
  L.push('');
  L.push('## Domo modelling guide');
  L.push('');
  L.push('Load every table and derived dataset from `/dms/api/domo/export/<name>.csv` (catalogue at `/dms/api/domo/datasets`). Keep datetimes as DATETIME in Australia/Sydney. JSON columns arrive as strings: flatten them in Magic ETL (JSON Expand) only where needed; `deal_events` is already flat.');
  L.push('');
  L.push('| dashboard card (spec §4) | datasets | how |');
  L.push('|---|---|---|');
  L.push('| Units vs target | `sales_daily` + `targets` | Sum `unitsDelivered` by `month`, `siteId`; join `targets` on (siteId, month). Attainment = units ÷ target. |');
  L.push('| Gross by site | `sales_daily` (or `deals` where stage = delivered) | Sum `frontGross`, `backGross`; GPU = gross ÷ `unitsDelivered`. Join `targets.grossTarget`. |');
  L.push('| Funnel | `funnel_weekly` | Sum steps by `week`/`channel`/`siteId`; plot leads → testDrivesCompleted → quoted → won. Use `leads` (duplicates excluded). |');
  L.push('| Stock ageing | `stock_ageing_daily` (trend) + `vehicles` (today) | Heat map of `avgDaysInStock` by site × model; bands from `units60Plus`, `units90Plus`. Today: vehicles where status in (on_lot, in_transit). |');
  L.push('| Days of supply | `dealer_signals` (+ `vehicles`, `deals`) | `daysOfSupply` (Domo) next to `erpDaysOfSupply`; inbound = `erpUnitsInbound`. |');
  L.push('| Leaderboard | `deals` + `staff` + `leads` | Group deals by `salespersonId`: delivered units, GPU, win rate; leads by `ownerId` for lead→delivery. |');
  L.push('| Configurator / DXM | `configurator_events` + `leads` + `test_drives` + `campaigns` | Sessions = distinct `sid`; bookings = type booking; join `sid` → `leads.configuratorSessionId` → `deals.leadId` for configurator-sourced sales. |');
  L.push('| Finance | `finance_apps` | Approval rate by `lender` = approved/conditional/settled ÷ decided; penetration = deals with financeAppId ÷ delivered. |');
  L.push('| Stage durations / stuck deals | `deal_events` or `deals.stageHistory` | Time between consecutive `stage_change` rows; open deals with `updatedAt` older than N days in a stage. |');
  L.push('');
  L.push('Suggested beast modes (Domo SQL-style):');
  L.push('');
  L.push('```sql');
  L.push('-- Gross per unit (sales_daily)');
  L.push('SUM(`grossProfit`) / NULLIF(SUM(`unitsDelivered`), 0)');
  L.push('-- Target attainment % (sales_daily joined to targets on siteId, month)');
  L.push('SUM(`unitsDelivered`) / NULLIF(MAX(`units`), 0)');
  L.push('-- Lead to delivery conversion (funnel_weekly)');
  L.push('SUM(`delivered`) / NULLIF(SUM(`leads`), 0)');
  L.push('-- Test-drive rate (funnel_weekly)');
  L.push('SUM(`testDrivesCompleted`) / NULLIF(SUM(`leads`), 0)');
  L.push('-- Close rate on test drives');
  L.push('SUM(`quoted`) / NULLIF(SUM(`testDrivesCompleted`), 0)');
  L.push('-- F&I penetration (sales_daily)');
  L.push('SUM(`financeDeals`) / NULLIF(SUM(`unitsDelivered`), 0)');
  L.push('-- Days of supply from vehicles + sales_daily (90-day window)');
  L.push("COUNT(CASE WHEN `status` IN ('on_lot','in_transit') THEN 1 END) / NULLIF(SUM(`unitsDeliveredFromStock`) / 90, 0)");
  L.push('-- Aged stock flag (vehicles)');
  L.push("CASE WHEN `daysInStock` > 90 THEN '90+' WHEN `daysInStock` > 60 THEN '61-90' WHEN `daysInStock` > 30 THEN '31-60' ELSE '0-30' END");
  L.push('-- Realised gross only (deals)');
  L.push("SUM(CASE WHEN `stage` = 'delivered' THEN `grossProfit` ELSE 0 END)");
  L.push('-- Discount + bonus as % of vehicle price (deals)');
  L.push('SUM(`discount` + `bonus`) / NULLIF(SUM(`vehiclePrice`), 0)');
  L.push('-- Days in current stage (deals, open)');
  L.push("DATEDIFF(CURRENT_DATE(), `updatedAt`)");
  L.push('```');
  L.push('');
  L.push('Gotchas: count leads with `mergedIntoLeadId` empty; only `stage = delivered` gross is realised (`grossStatus`); `sales90d`/days of supply use from-stock deliveries (`fulfilment = stock`), not all deliveries; October 2026 is month-to-date; October 2024 starts on the 15th (its target is pro-rated).');
  L.push('');
  L.push('## Schema');
  for (const [name, t] of Object.entries(TABLES)) {
    L.push('');
    L.push(`### \`${name}\` (${counts[name]} rows, key ${t.primaryKey.map((k) => `\`${k}\``).join(' + ')})`);
    L.push('');
    L.push(t.description);
    L.push('');
    L.push(tbl(t.columns));
  }
  L.push('');
  L.push('## Derived datasets (`server/dms/derive.mjs`)');
  for (const [name, t] of Object.entries(DERIVED_DATASETS)) {
    L.push('');
    L.push(`### \`${name}\` (from ${t.derivedFrom.join(', ')}; key ${t.primaryKey.map((k) => `\`${k}\``).join(' + ')})`);
    L.push('');
    L.push(t.description);
    L.push('');
    L.push(tbl(t.columns));
  }
  L.push('');
  return L.join('\n');
}
