# Logical Database Model - Issue #71

This logical model covers `ITEM_CATEGORY`, `PICKUP_REQUEST`, and `PICKUP_WINDOW` from the EcoCollect ER diagram.

## 1. ITEM_CATEGORY

| Attribute | Domain | Integrity Constraint |
|---|---|---|
| `category_id` | TEXT | Primary Key |
| `name` | VARCHAR(120) | NOT NULL, UNIQUE |
| `waste_type` | VARCHAR(120) | NOT NULL |
| `standard_weight_kg` | NUMERIC(10,2) | NOT NULL, > 0 |

## 2. PICKUP_REQUEST

| Attribute | Domain | Integrity Constraint |
|---|---|---|
| `request_id` | UUID | Primary Key |
| `account_id` | TEXT | NOT NULL, FK → `RESIDENT(account_id)` |
| `category_id` | TEXT | NOT NULL, FK → `ITEM_CATEGORY(category_id)` |
| `acceptance_id` | Same as `TERMS_ACCEPTANCE.acceptance_id` | NOT NULL, UNIQUE, FK |
| `quantity` | INTEGER | NOT NULL, > 0 |
| `estimated_weight_kg` | NUMERIC(22,2) | NOT NULL |
| `created_at` | TIMESTAMPTZ | NOT NULL |
| `pickup_street` | VARCHAR(255) | NOT NULL |
| `pickup_postal_code` | VARCHAR(6) | NOT NULL, CHECK (LENGTH(pickup_postal_code) = 6) |
| `notes` | TEXT | Optional |
| `photo_url` | TEXT | Optional |

**Derived attributes:**

- `status` = latest `STATUS_CHANGE.status` for the request.
- `expires_at` = `created_at + 30 days`.
- `safety_acknowledged` = valid request-creation `TERMS_ACCEPTANCE`.

**Integrity rules:** `estimated_weight_kg` records `quantity × standard_weight_kg` at creation or edit; it is retained when the category's standard weight changes. The address is copied at creation and remains unchanged. Only Open requests may be edited. The acceptance must belong to the resident and have type `AT_RESIDENT_REQUEST_CREATION`.

## 3. PICKUP_WINDOW

| Attribute | Domain | Integrity Constraint |
|---|---|---|
| `window_id` | UUID | Primary Key |
| `request_id` | UUID | NOT NULL, FK → `PICKUP_REQUEST(request_id)` |
| `pickup_date` | DATE | NOT NULL |
| `slot` | SMALLINT | NOT NULL, 0–23 |
| `is_active` | BOOLEAN | NOT NULL |

Each request has 1–3 active windows on distinct future dates before expiry. Replaced windows remain inactive. The combination (`request_id`, `pickup_date`) is unique among active windows.

## 4. Relationship Mapping

| Relationship | Cardinality | Mapping |
|---|---|---|
| RESIDENT creates PICKUP_REQUEST | 1 : 0..N | `PICKUP_REQUEST.account_id` FK |
| ITEM_CATEGORY is for PICKUP_REQUEST | 1 : 0..N | `PICKUP_REQUEST.category_id` FK |
| PICKUP_REQUEST offers PICKUP_WINDOW | 1 : 1..3 active | `PICKUP_WINDOW.request_id` FK |
| PICKUP_REQUEST acknowledges TERMS_ACCEPTANCE | 1 : 1 | `PICKUP_REQUEST.acceptance_id` UNIQUE FK |
| PICKUP_REQUEST has STATUS_CHANGE | 1 : 1..N | Status derived from latest history record |

## 5. Relational Schemas

`ITEM_CATEGORY(category_id PK, name UNIQUE, waste_type, standard_weight_kg)`

`PICKUP_REQUEST(request_id PK, account_id FK, category_id FK, acceptance_id FK UNIQUE, quantity, estimated_weight_kg, created_at, pickup_street, pickup_postal_code, notes, photo_url)`

`PICKUP_WINDOW(window_id PK, request_id FK, pickup_date, slot, is_active)`
