# EasyDrive (EDC) Pricing – Partner Handoff

## Goal
Provide **instant retail quotes** from a local pricing table:

- Retail shown to customers: **price before tax** + “+ applicable tax”
- Fulfillment timeline note:
  - **Montreal routes:** 1–2 business days
  - **All other routes:** 3–8 business days

## Core rule
**Retail Price = North Line Cost + $35 markup**

- `northline_cost` must be **hidden from customers**.
- In the current frontend-only implementation, `northline_cost` exists in code and is not rendered, but it is **not truly secret** (browser code can be inspected). For real secrecy, the pricing should come from a backend/partner service.

## Where pricing lives (single source of truth)
All route/service-area pricing is centralized here:

- `src/pricing/pricingTable.ts`

Exports:
- `QUOTE_MARKUP` = `35`
- `OFFICIAL_CITY_TOTAL_PRICES[]` (route/service-area retail prices)
- `SERVICE_AREAS[]` (dropdown list)
- `SERVICE_AREA_GEOCODE_QUERY` (used for map pin defaulting)
- `getOfficialCityPriceForServiceArea()`
- `getOfficialCityPriceForAddress()`
- `PRICING_TABLE[]` (computed rows with `northline_cost`, `retail_price`, `days_min`, `days_max`)
- `getPricingRow(route, vehicleType)`

## Components that use pricing
### 1) Homepage instant quote
- File: `src/components/HomePage.tsx`
- Uses:
  - `PRICING_TABLE` (route dropdown)
  - `getPricingRow()` (quote lookup)
- Displays:
  - Retail price (pre-tax)
  - “+ applicable tax”
  - Timeline note (days min/max)

### 2) Upload / manual order form quote
- File: `src/components/FileUploadSection.tsx`
- Uses:
  - `SERVICE_AREAS` (Route / Service Area select)
  - `SERVICE_AREA_GEOCODE_QUERY` (map pin)
  - `getOfficialCityPriceForServiceArea` and `getOfficialCityPriceForAddress` (pricing determination)

## Updating prices
To update a retail price for a route:
1. Open `src/pricing/pricingTable.ts`
2. Edit the entry in `OFFICIAL_CITY_TOTAL_PRICES` for the matching `city`
3. The app will automatically compute:
   - `northline_cost = retail - 35`
   - timeline (Montreal vs non-Montreal)

## Vehicle type + service type
Currently implemented:
- `VehicleType`: `standard` only
- `ServiceType`: `pickup_one_way` or `delivery_one_way`

Notes:
- Pricing is currently route-based and not differentiated by service type.
- If partner wants different pricing per service type, extend `PRICING_TABLE` to include `service_type` and update lookups.

## Tax
Phase 1 currently displays “+ applicable tax” but does not calculate provincial tax totals yet.

Recommended next step when partner DB/logic is ready:
- Add a tax function: `tax = subtotal * rate`
- Decide tax basis: pickup province vs dropoff province vs billing province

---

If you need this in a message format to send to your partner, tell me and I’ll provide a short copy/paste summary.
