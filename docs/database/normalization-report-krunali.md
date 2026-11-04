# Normalization Report – Issue #71

This report examines the `ITEM_CATEGORY`, `PICKUP_REQUEST`, and `PICKUP_WINDOW` relations using functional dependencies and the first three normal forms.

## 1. Relational Tables and Sample Records

The following illustrative records use our proposed seed IDs. Resident and terms-acceptance IDs are temporary until the team's parent records are available.

### 1.1 ITEM_CATEGORY

| category_id (PK) | name (UNIQUE) | waste_type | standard_weight_kg |
|---|---|---|---:|
| laptops | Computers/Laptops | Laptop | 2.50 |
| batteries | Household Batteries | AA Battery | 0.30 |
| monitors | Computer Monitors | Monitor | 4.50 |
| phones | Mobile Phones | Cell Phone | 0.25 |
| cables | Cables and Chargers | Cable | 0.10 |

### 1.2 PICKUP_REQUEST

The columns are displayed in two parts for readability; both parts represent the same five rows of one relation.

**Part A – Request details**

| request_id (PK) | account_id (FK) | category_id (FK) | acceptance_id (FK, UNIQUE) | quantity | estimated_weight_kg | created_at |
|---|---|---|---|---:|---:|---|
| 10000000-0000-4000-8000-000000000001 | resident_test_01 | laptops | 00000000-0000-4000-8000-000000000101 | 2 | 5.00 | 2026-11-03 10:00-07 |
| 10000000-0000-4000-8000-000000000002 | resident_test_02 | batteries | 00000000-0000-4000-8000-000000000102 | 4 | 1.20 | 2026-11-03 10:15-07 |
| 10000000-0000-4000-8000-000000000003 | resident_test_03 | monitors | 00000000-0000-4000-8000-000000000103 | 1 | 4.50 | 2026-11-03 10:30-07 |
| 10000000-0000-4000-8000-000000000004 | resident_test_04 | phones | 00000000-0000-4000-8000-000000000104 | 3 | 0.75 | 2026-11-03 10:45-07 |
| 10000000-0000-4000-8000-000000000005 | resident_test_05 | cables | 00000000-0000-4000-8000-000000000105 | 5 | 0.50 | 2026-11-03 11:00-07 |

**Part B – Pickup address and optional details**

| request_id (PK, same record) | pickup_street | pickup_postal_code | notes | photo_url |
|---|---|---|---|---|
| 10000000-0000-4000-8000-000000000001 | 101 Centre Street | T2P1J9 | Front door pickup | NULL |
| 10000000-0000-4000-8000-000000000002 | 202 8 Avenue SW | T2P1B3 | Small box | NULL |
| 10000000-0000-4000-8000-000000000003 | 303 10 Street NW | T2N1V5 | NULL | NULL |
| 10000000-0000-4000-8000-000000000004 | 404 17 Avenue SW | T2S0A1 | Call on arrival | NULL |
| 10000000-0000-4000-8000-000000000005 | 505 4 Street NE | T2E3S1 | Porch pickup | NULL |

The current request status is obtained from the latest `STATUS_CHANGE` record. `expires_at` is calculated as `created_at + 30 days`. These derived values are not independent columns in this relation.

### 1.3 PICKUP_WINDOW

| window_id (PK) | request_id (FK) | pickup_date | slot (hour 0–23) | is_active |
|---|---|---|---:|---|
| 20000000-0000-4000-8000-000000000001 | 10000000-0000-4000-8000-000000000001 | 2026-11-10 | 9 | TRUE |
| 20000000-0000-4000-8000-000000000002 | 10000000-0000-4000-8000-000000000001 | 2026-11-11 | 14 | TRUE |
| 20000000-0000-4000-8000-000000000003 | 10000000-0000-4000-8000-000000000001 | 2026-11-12 | 18 | TRUE |
| 20000000-0000-4000-8000-000000000004 | 10000000-0000-4000-8000-000000000002 | 2026-11-13 | 10 | TRUE |
| 20000000-0000-4000-8000-000000000005 | 10000000-0000-4000-8000-000000000002 | 2026-11-14 | 15 | TRUE |
| 20000000-0000-4000-8000-000000000006 | 10000000-0000-4000-8000-000000000003 | 2026-11-15 | 11 | TRUE |
| 20000000-0000-4000-8000-000000000007 | 10000000-0000-4000-8000-000000000004 | 2026-11-16 | 16 | TRUE |
| 20000000-0000-4000-8000-000000000008 | 10000000-0000-4000-8000-000000000005 | 2026-11-17 | 13 | TRUE |

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
