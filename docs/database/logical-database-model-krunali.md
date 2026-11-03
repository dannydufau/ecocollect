# Logical Database Model - Issue #71

## 1. Overview

This logical database model is derived from the final conceptual ER diagram for EcoCollect. It covers the three assigned entities: `ITEM_CATEGORY`, `PICKUP_REQUEST`, and `PICKUP_WINDOW`.

The model defines their attributes, domains, primary keys, foreign keys, integrity constraints, and relationship mappings.

## 2. ITEM_CATEGORY

**Relation:** `item_category`

| Attribute | Domain | Integrity Constraints |
|---|---|---|
| category_id | TEXT | Primary Key |
| name | VARCHAR(120) | NOT NULL |
| waste_type | VARCHAR(20) | NOT NULL |
| standard_weight_kg | NUMERIC(10,2) | NOT NULL, greater than 0 |

**Primary Key:** `category_id`

**Business Rules:**

- Each item category has a unique identifier.
- `waste_type` must be either `E-waste` or `Battery`.
- `standard_weight_kg` must be greater than zero.
- One item category can be associated with zero or many pickup requests.

## 3. PICKUP_REQUEST

**Relation:** `pickup_request`

| Attribute | Domain | Integrity Constraints |
|---|---|---|
| request_id | UUID | Primary Key |
| account_id | TEXT | Foreign Key → `resident(account_id)`, NOT NULL |
| category_id | TEXT | Foreign Key → `item_category(category_id)`, NOT NULL |
| acceptance_id | Same domain as `terms_acceptance.acceptance_id` | Foreign Key → `terms_acceptance(acceptance_id)`, NOT NULL, UNIQUE |
| quantity | INTEGER | NOT NULL, greater than 0 |
| created_at | TIMESTAMPTZ | NOT NULL |
| status | VARCHAR(12) | NOT NULL |
| pickup_street | VARCHAR(255) | NOT NULL |
| pickup_postal_code | VARCHAR(6) | NOT NULL |
| notes | TEXT | Optional |
| photo_url | TEXT | Optional |

**Primary Key:** `request_id`

**Foreign Keys:**

- `account_id` references `resident(account_id)`.
- `category_id` references `item_category(category_id)`.
- `acceptance_id` references `terms_acceptance(acceptance_id)`.

**Business Rules:**

- Each pickup request is created by exactly one resident.
- Each pickup request belongs to exactly one item category.
- A separate request is created for each selected category, with all requests from one submission created atomically.
- `quantity` must be a positive integer.
- `status` must be `Open`, `Assigned`, `Collected`, `Delivered`, `Cancelled`, or `Expired`.
- Only requests with status `Open` can be edited.
- The pickup address is copied from the resident profile when the request is created and cannot be changed afterward.
- Each pickup request requires exactly one safety acknowledgement.
- Each pickup request is associated with exactly one terms acceptance.
- Only `Open` requests expire after 30 days from their original creation time.
- Reopening a request does not reset its expiry time.

**Derived Attributes:**

| Attribute | Derivation |
|---|---|
| estimated_weight_kg | `quantity × item_category.standard_weight_kg`, calculated to two decimal places |
| expires_at | `created_at + 30 days` |
| safety_acknowledged | Derived safety acknowledgement indicator, as identified in the conceptual ER model |

These derived attributes are not stored as independent columns in this logical model.

The composite attribute `Pickup_Address` is mapped into two atomic attributes: `pickup_street` and `pickup_postal_code`.

## 4. PICKUP_WINDOW

**Relation:** `pickup_window`

| Attribute | Domain | Integrity Constraints |
|---|---|---|
| window_id | UUID | Primary Key |
| request_id | UUID | Foreign Key → `pickup_request(request_id)`, NOT NULL |
| pickup_date | DATE | NOT NULL |
| slot | VARCHAR(12) | NOT NULL |
| is_active | BOOLEAN | NOT NULL |

**Primary Key:** `window_id`

**Foreign Key:**

- `request_id` references `pickup_request(request_id)`.

**Business Rules:**

- Each pickup window belongs to exactly one pickup request.
- Each pickup request must offer between one and three active pickup windows.
- Active pickup windows must have distinct future dates.
- Each pickup window has exactly one slot: `Morning`, `Afternoon`, or `Evening`.
- Pickup dates must be before the request's expiry time.
- Replaced pickup windows are retained as inactive records for assignment history.
- Active pickup windows must have a unique combination of `request_id` and `pickup_date`.

## 5. Relationship Mapping

| Conceptual ER Relationship | Cardinality | Logical Mapping |
|---|---|---|
| RESIDENT CREATES PICKUP_REQUEST | One resident creates 0..N requests; each request belongs to exactly 1 resident | `pickup_request.account_id` references `resident.account_id` |
| PICKUP_REQUEST IS_FOR ITEM_CATEGORY | One category has 0..N requests; each request belongs to exactly 1 category | `pickup_request.category_id` references `item_category.category_id` |
| PICKUP_REQUEST OFFERS PICKUP_WINDOW | One request offers 1..3 active windows; each window belongs to exactly 1 request | `pickup_window.request_id` references `pickup_request.request_id` |
| PICKUP_REQUEST ACKNOWLEDGES TERMS_ACCEPTANCE | Each request has exactly 1 acceptance; each acceptance is associated with 0..1 request | `pickup_request.acceptance_id` references `terms_acceptance.acceptance_id`, with NOT NULL and UNIQUE |

The one-to-many relationships are mapped by placing the primary key of the entity on the one side as a foreign key in the table on the many side.

The one-to-one relationship between `PICKUP_REQUEST` and `TERMS_ACCEPTANCE` is mapped using a unique, non-null foreign key in `PICKUP_REQUEST`.

## 6. Logical Relational Schema

**ITEM_CATEGORY**

`item_category(category_id PK, name, waste_type, standard_weight_kg)`

**PICKUP_REQUEST**

`pickup_request(request_id PK, account_id FK, category_id FK, acceptance_id FK UNIQUE, quantity, created_at, status, pickup_street, pickup_postal_code, notes, photo_url)`

**PICKUP_WINDOW**

`pickup_window(window_id PK, request_id FK, pickup_date, slot, is_active)`
