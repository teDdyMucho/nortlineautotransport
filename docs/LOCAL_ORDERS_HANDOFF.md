# EasyDrive (EDC) Local Orders – Partner Handoff

## Goal
Implement the Phase 1 flow **entirely locally** (no partner DB required yet):

- Quote → checkout/disclosures → "place order" → receipt/confirmation
- Persist orders to browser `localStorage`
- Provide a basic Orders screen for tracking + status updates (local admin/testing)

When partner backend is ready, swap local storage for API calls but keep the UI.

---

## Local storage keys
- **Orders list:** `ed_local_orders_v1`
  - JSON array of `LocalOrder`

Other existing keys already used by the app:
- `ed_receipts_pending`, `ed_receipts_by_user_*` (ReceiptHistory)
- `ed_extractedFormData`, `ed_submitMessage`, `ed_submitError` (FileUploadSection)

---

## Local Order schema (TypeScript)
File: `src/orders/localOrders.ts`

### `LocalOrder`
Fields:
- `id` (string): generated like `EDC-YYYYMMDD-XXXXXX`
- `created_at`, `updated_at` (ISO string)
- `service_type`: `pickup_one_way` | `delivery_one_way`
- `vehicle_type`: `standard`
- `route_area` (string)
- `fulfillment_days_min`, `fulfillment_days_max` (numbers)
- `totals`:
  - `subtotal` (before tax)
  - `tax_rate`, `tax`, `total`
  - `tax_note` (ex: `ON (HST)` or `QC (GST+QST)`)
- `customer` (optional): name/email/phone
- `form_data` (optional): full form snapshot from `FileUploadSection`
- `documents[]`: list of uploaded docs metadata (name/type/size/kind)
- `receipt_text` (optional)
- `status`: `Scheduled | Picked Up | In Transit | Delayed | Out for Delivery | Delivered`
- `status_events[]`: timeline entries `{status, at, note?}`

### Local helper functions
- `makeLocalOrderId()`
- `computeTotals(subtotal, routeArea)`
- `upsertLocalOrder(order)`
- `listLocalOrders()` / `getLocalOrderById(id)`
- `updateLocalOrderStatus(id, status, note?)`
- `deleteLocalOrder(id)`

---

## Where local orders are created
File: `src/components/FileUploadSection.tsx`

- On successful submission/receipt generation, the UI creates a new `LocalOrder` and saves it with `upsertLocalOrder(order)`.
- The receipt modal displays:
  - `Order ID`
  - totals (subtotal + tax + total)

### Disclosures (mandatory)
A local Checkout modal requires 3 checkboxes before proceeding:
- timelines are estimates
- customer responsible for vehicle payments
- once picked up, vehicle is in transit

---

## Where local orders are viewed/updated
File: `src/components/LocalOrders.tsx`

Features:
- List recent local orders
- Search by Order ID
- View totals + route + fulfillment days
- Update status + add optional status note
- View status timeline
- Delete an order (local only)

Wired into:
- `src/components/Dashboard.tsx` (new nav button: **Orders**)

---

## Tax calculation (local placeholder)
Current rule in `computeTaxRateForRoute(routeArea)`:
- Routes containing `montreal` or `quebec` → QC rate **14.975%**
- Otherwise → ON rate **13%**

This is a placeholder for Phase 1 demo/testing.
Partner should replace with the real business tax rule.

---

## Recommended backend API replacement (partner)
When partner backend is ready, replace local storage with:

### Create order
`POST /orders`
Request:
- service_type
- route_area
- vehicle_type
- form_data
- documents metadata
- totals (or backend recomputes totals)

Response:
- orderId
- payment_url (optional)
- current status + timeline

### Update status (admin)
`POST /orders/:id/status`

### Get order
`GET /orders/:id`

---

## What to send your partner
- `src/pricing/pricingTable.ts`
- `docs/PRICING_HANDOFF.md`
- `src/orders/localOrders.ts`
- `src/components/LocalOrders.tsx`
- `src/components/Dashboard.tsx` (Orders button)
- `src/components/FileUploadSection.tsx` (local order creation + checkout/disclosures)
- `docs/LOCAL_ORDERS_HANDOFF.md`
