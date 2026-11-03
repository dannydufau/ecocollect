# Logical Database Model - Issue #71 (Revised to Combined-Nov-5)

## 1. Overview

This logical database model covers the three EcoCollect entities assigned in Issue #71: `ITEM_CATEGORY`, `PICKUP_REQUEST`, and `PICKUP_WINDOW`. It follows the team's Combined-Nov-5 business rules, especially BR13, BR16–18, BR30–38, BR45, and BR47. Attributes belonging to other teammates' entities are referenced but not redefined here.

## 2. ITEM_CATEGORY

**Relation:** `item_category`

| Attribute | Domain | Integrity constraints |
|---|---|---|
| `category_id` | TEXT | Primary key |
| `name` | VARCHAR(120) | NOT NULL, UNIQUE |
| `waste_type` | VARCHAR(120) | NOT NULL; one supported waste type per category |
| `standard_weight_kg` | NUMERIC(10,2) | NOT NULL; greater than zero |

**Primary key:** `category_id`. **Alternate candidate key:** `name`.

Each item category has one waste type and a positive standard weight. BR37 gives examples such as cell phone, AA battery, and refrigerator. The complete supported-value list must be agreed by the team; the older restriction to only `E-waste` or `Battery` is not retained. A category may be referenced by zero or many requests.

## 3. PICKUP_REQUEST

**Relation:** `pickup_request`

| Attribute | Domain | Integrity constraints |
|---|---|---|
| `request_id` | UUID | Primary key |
| `account_id` | TEXT | NOT NULL; FK to `resident(account_id)` |
| `category_id` | TEXT | NOT NULL; FK to `item_category(category_id)` |
| `acceptance_id` | Same domain as `terms_acceptance.acceptance_id` | NOT NULL, UNIQUE; FK to `terms_acceptance(acceptance_id)` |
| `quantity` | INTEGER | NOT NULL; greater than zero |
| `estimated_weight_kg` | NUMERIC(22,2) (proposed physical precision) | NOT NULL; computed and recorded at creation, recalculated on permitted edits |
| `created_at` | TIMESTAMPTZ | NOT NULL |
| `pickup_street` | VARCHAR(255) | NOT NULL; copied from resident address at creation |
| `pickup_postal_code` | VARCHAR(6) | NOT NULL; six-character Calgary postal code, copied at creation |
| `notes` | TEXT | Optional |
| `photo_url` | TEXT | Optional |

**Primary key:** `request_id`. **Alternate candidate key:** `acceptance_id`, provided the team confirms that a request-creation acceptance cannot be reused by another request.

**Business rules:**

- A resident owns each request and cannot transfer its ownership (BR13).
- The resident must acknowledge the safety requirements when creating a request. The referenced `TERMS_ACCEPTANCE` must belong to the same resident and have type `AT_RESIDENT_REQUEST_CREATION` (BR38, BR45). This requires checking the referenced acceptance's account and type, not only its ID.
- Quantity is a positive integer (BR30).
- Estimated weight is calculated as `quantity × standard_weight_kg` to two decimal places. The calculated result is **recorded as a historical snapshot**. It is recalculated when an Open request is edited, but later changes to the category's standard weight do not change existing request values (BR31).
- The pickup street and postal code are copied from the resident's profile at creation and never changed (BR34).
- Only requests whose **current derived status** is Open can be edited (BR35, BR47).
- A new request and its first `STATUS_CHANGE` (Open) must be created in the same transaction. Further changes append history rows; history rows are not edited (BR16–18).
- Each request has one to three active pickup windows, enforced when the request creation or edit transaction completes (BR32, BR36).

**Derived attributes (not independent stored columns in this relation):**

| Attribute | Derivation |
|---|---|
| `status` | Latest `STATUS_CHANGE.status` for the request, ordered by `changed_at` (BR47) |
| `expires_at` | Original `created_at + INTERVAL '30 days'`; reopening does not reset it (BR33) |
| `safety_acknowledged` | Confirmed through the valid request-creation `TERMS_ACCEPTANCE` (BR38, BR45) |

The current status must be one of Open, Assigned, Collected, Delivered, Cancelled, or Expired (BR18). Only requests currently Open expire automatically at their original deadline (BR33).

**Implementation note:** The conceptual diagram can show estimated weight as calculated, while the physical database retains its calculated value as a snapshot to satisfy BR31. `NUMERIC(22,2)` is a proposed storage precision; the team should use a consistent precision in its shared schema. The actual domain of `acceptance_id` must match the team's parent table.

## 4. PICKUP_WINDOW

**Relation:** `pickup_window`

| Attribute | Domain | Integrity constraints |
|---|---|---|
| `window_id` | UUID | Primary key |
| `request_id` | UUID | NOT NULL; FK to `pickup_request(request_id)` |
| `pickup_date` | DATE | NOT NULL |
| `slot` | SMALLINT | NOT NULL; integer starting hour from 0 through 23 |
| `is_active` | BOOLEAN | NOT NULL |

**Primary key:** `window_id`.

Each window belongs to exactly one request. A request offers one to three **active** windows on distinct future dates, with the selected hour before the request's expiry timestamp (BR32). Replaced windows remain stored with `is_active = false` so assignment history is preserved (BR36). The combination (`request_id`, `pickup_date`) must be unique **among active windows**, but may recur in inactive historical rows. The date and hour must be interpreted in the agreed local time zone when checking the expiry deadline.

The minimum-one-active-window rule needs transaction-level or deferred enforcement; a simple `CHECK` on an individual window row cannot enforce it.

## 5. Relationship Mapping

| Relationship | Cardinality | Logical mapping |
|---|---|---|
| RESIDENT creates PICKUP_REQUEST | Each request belongs to exactly one resident; a resident may have many requests | `pickup_request.account_id` FK to `resident.account_id` |
| PICKUP_REQUEST is for ITEM_CATEGORY | Each request has exactly one category; a category may have many requests | `pickup_request.category_id` FK to `item_category.category_id` |
| PICKUP_REQUEST offers PICKUP_WINDOW | Each request has 1–3 active windows; each window belongs to one request | `pickup_window.request_id` FK to `pickup_request.request_id` |
| PICKUP_REQUEST acknowledges TERMS_ACCEPTANCE | One request-creation acceptance per request; acceptance ID cannot be reused for another request | `pickup_request.acceptance_id` UNIQUE NOT NULL FK; verify type and resident |
| PICKUP_REQUEST has STATUS_CHANGE history | Every request has at least one history row, starting with Open | Referenced team's `STATUS_CHANGE` relation; current status derived from latest history row |

## 6. Logical Relational Schemas

`ITEM_CATEGORY(category_id PK, name UNIQUE, waste_type, standard_weight_kg)`

`PICKUP_REQUEST(request_id PK, account_id FK, category_id FK, acceptance_id FK UNIQUE, quantity, estimated_weight_kg, created_at, pickup_street, pickup_postal_code, notes, photo_url)`

`PICKUP_WINDOW(window_id PK, request_id FK, pickup_date, slot, is_active)`

**Team integration dependencies:** Confirm the actual parent-table names, the `TERMS_ACCEPTANCE.acceptance_id` domain, the accepted waste-type values, and the shared decimal precision. These are not assumed to be finalized by this document.
