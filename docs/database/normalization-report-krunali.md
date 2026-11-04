# Normalization Report – Issue #71

This report examines the `ITEM_CATEGORY`, `PICKUP_REQUEST`, and `PICKUP_WINDOW` relations using functional dependencies and the first three normal forms.

## 1. Relational Tables and Sample Records

The sample data below matches `db/seed/sample_records.sql`. The five resident and terms-acceptance ID pairs still require confirmation against the team's parent tables. `created_at` is set by PostgreSQL at insertion, and pickup dates are calculated from the current Calgary date.

### 1.1 ITEM_CATEGORY

| category_id (PK) | name (UNIQUE) | waste_type | standard_weight_kg |
|---|---|---|---:|
| laptops | Laptops | Laptop | 2.50 |
| batteries | Batteries | AA Battery | 0.50 |
| monitors | Monitors | Monitor | 4.00 |
| phones | Phones | Cell Phone | 0.25 |
| cables | Cables | Cable | 0.10 |

### 1.2 PICKUP_REQUEST

| request_id (last 4 digits) | account_id (FK) | category_id (FK) | acceptance_id (FK, UNIQUE) | quantity | estimated_weight_kg | pickup_postal_code |
|---|---|---|---:|---:|---:|---|
| 0001 | resident1 | laptops | 4000 | 2 | 5.00 | T2P1J9 |
| 0002 | resident2 | batteries | 4001 | 3 | 1.50 | T2A0A1 |
| 0003 | resident3 | monitors | 4002 | 1 | 4.00 | T3A0A1 |
| 0004 | resident4 | phones | 4003 | 2 | 0.50 | T2N1N4 |
| 0005 | both1 | cables | 4004 | 5 | 0.50 | T2E0A1 |

All five request IDs have the full form `10000000-0000-4000-8000-00000000000N`, with N from 1 to 5. Their pickup streets, notes, and optional photo URLs are defined in the seed script. Current status comes from the latest `STATUS_CHANGE` record. `expires_at` is calculated as `created_at + 30 days`.

### 1.3 PICKUP_WINDOW

| window_id (last 4 digits) | request_id (last 4 digits) | pickup_date (Calgary date + days) | slot | is_active |
|---|---|---:|---:|---|
| 0001 | 0001 | +3 | 9 | TRUE |
| 0002 | 0001 | +5 | 14 | TRUE |
| 0003 | 0002 | +4 | 10 | TRUE |
| 0004 | 0002 | +6 | 15 | TRUE |
| 0005 | 0003 | +5 | 11 | TRUE |
| 0006 | 0003 | +7 | 13 | TRUE |
| 0007 | 0004 | +8 | 10 | TRUE |
| 0008 | 0005 | +9 | 16 | TRUE |

The full window IDs are `20000000-0000-4000-8000-000000000001` through `20000000-0000-4000-8000-000000000008`. The eight windows belong to five requests, with 1–2 active windows per request.

## 2. Functional Dependencies

| Relation | Primary key | Candidate keys | Functional dependencies |
|---|---|---|---|
| `ITEM_CATEGORY` | `category_id` | `category_id`, `name` | `category_id → name, waste_type, standard_weight_kg`; `name → category_id, waste_type, standard_weight_kg` |
| `PICKUP_REQUEST` | `request_id` | `request_id`, `acceptance_id` | `request_id → account_id, category_id, acceptance_id, quantity, estimated_weight_kg, created_at, pickup_street, pickup_postal_code, notes, photo_url`; `acceptance_id → request_id` |
| `PICKUP_WINDOW` | `window_id` | `window_id` | `window_id → request_id, pickup_date, slot, is_active` |

`name` and `acceptance_id` are candidate keys because each is `UNIQUE` and `NOT NULL`. The active-window uniqueness rule on (`request_id`, `pickup_date`) does not make that pair a candidate key for the entire `PICKUP_WINDOW` relation, because inactive windows are retained.

## 3. First Normal Form (1NF)

| Relation | 1NF analysis |
|---|---|
| `ITEM_CATEGORY` | Each row has one category name, waste type, and standard weight. All values are atomic. |
| `PICKUP_REQUEST` | Each row represents one request. The pickup address is separated into street and postal code. |
| `PICKUP_WINDOW` | Each row represents one date and one hourly slot. Multiple windows are stored as separate rows rather than repeating columns. |

**Result:** All three relations satisfy 1NF.

## 4. Second Normal Form (2NF)

| Relation | 2NF analysis |
|---|---|
| `ITEM_CATEGORY` | Both candidate keys contain one attribute, so no partial dependency exists. |
| `PICKUP_REQUEST` | Both candidate keys contain one attribute, so no partial dependency exists. |
| `PICKUP_WINDOW` | Its candidate key contains one attribute, so no partial dependency exists. |

**Result:** All three relations satisfy 2NF.

## 5. Third Normal Form (3NF)

| Relation | 3NF analysis |
|---|---|
| `ITEM_CATEGORY` | Non-key attributes depend on the category identifier or unique name; there is no transitive dependency between non-key attributes. |
| `PICKUP_REQUEST` | Category details and resident profile details are kept in separate relations. The copied pickup address and recorded estimated weight describe the request itself. No non-key attribute determines another non-key attribute in the defined relation. |
| `PICKUP_WINDOW` | Window date, hourly slot, active flag, and request reference depend on `window_id`; request details are not repeated. |

**Result:** All three relations satisfy 3NF.

## 6. Final Normalized Relational Schemas

- `ITEM_CATEGORY(`**`category_id PK`**`, name UNIQUE, waste_type, standard_weight_kg)`
- `PICKUP_REQUEST(`**`request_id PK`**`, account_id FK, category_id FK, acceptance_id FK UNIQUE, quantity, estimated_weight_kg, created_at, pickup_street, pickup_postal_code, notes, photo_url)`
- `PICKUP_WINDOW(`**`window_id PK`**`, request_id FK, pickup_date, slot, is_active)`

All three relations satisfy Third Normal Form (3NF) under the stated functional dependencies.
