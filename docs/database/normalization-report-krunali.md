# Normalization Report - Issue #71 (Revised to Combined-Nov-5)

## 1. Overview

This report checks the functional dependencies and the first three normal forms (1NF, 2NF, and 3NF) for the three EcoCollect relations assigned in Issue #71. The schemas follow the updated logical database model and the team's Combined-Nov-5 business rules.

## 2. Functional Dependencies

### 2.1 ITEM_CATEGORY

**Relation:** `item_category(category_id, name, waste_type, standard_weight_kg)`

**Primary key:** `category_id`. **Candidate keys:** `category_id`, `name` (because `name` is UNIQUE and NOT NULL).

**Functional dependencies:**

- `category_id → name, waste_type, standard_weight_kg`
- `name → category_id, waste_type, standard_weight_kg`

Each category ID determines one name, waste type, and standard weight. A unique category name can also identify the row.

### 2.2 PICKUP_REQUEST

**Relation:** `pickup_request(request_id, account_id, category_id, acceptance_id, quantity, estimated_weight_kg, created_at, pickup_street, pickup_postal_code, notes, photo_url)`

**Primary key:** `request_id`. **Candidate keys:** `request_id`, `acceptance_id` (assuming the team retains `UNIQUE NOT NULL` for the request-creation acceptance).

**Functional dependencies:**

- `request_id → account_id, category_id, acceptance_id, quantity, estimated_weight_kg, created_at, pickup_street, pickup_postal_code, notes, photo_url`
- `acceptance_id → request_id`

The recorded `estimated_weight_kg` is a historical value calculated at request creation or a permitted edit. It depends on the request's quantity and the **standard weight used at that time**, not necessarily the category's current standard weight. Thus, `category_id → estimated_weight_kg` does not hold, and a category-weight change does not overwrite earlier request weights (BR31).

Current `status` is not stored in this relation; it comes from the latest `STATUS_CHANGE` row (BR47). `expires_at` is derived from `created_at + 30 days` (BR33).

### 2.3 PICKUP_WINDOW

**Relation:** `pickup_window(window_id, request_id, pickup_date, slot, is_active)`

**Primary key:** `window_id`. **Candidate key:** `window_id`.

**Functional dependency:**

- `window_id → request_id, pickup_date, slot, is_active`

The `slot` is an integer starting hour from 0 to 23. An active-date uniqueness constraint applies only to active rows, so (`request_id`, `pickup_date`) is **not** a candidate key for the entire table, which also retains inactive history.

## 3. First Normal Form (1NF)

A relation satisfies 1NF when attributes contain atomic values and repeating groups are removed.

| Relation | Explanation |
|---|---|
| ITEM_CATEGORY | Each row stores one category name, one waste type, and one standard weight. |
| PICKUP_REQUEST | Each request has atomic attributes. The pickup address is split into street and postal code. Current status is represented through a separate history relation. |
| PICKUP_WINDOW | Each row stores one date, one starting hour, and one active flag. Multiple windows are stored as separate rows. |

**Result:** All three relations satisfy 1NF.

## 4. Second Normal Form (2NF)

A relation satisfies 2NF when it satisfies 1NF and no non-prime attribute depends on only part of a candidate key.

| Relation | Explanation |
|---|---|
| ITEM_CATEGORY | Candidate keys `category_id` and `name` are each single attributes. |
| PICKUP_REQUEST | Candidate keys `request_id` and `acceptance_id` are each single attributes. |
| PICKUP_WINDOW | Candidate key `window_id` is a single attribute. |

There are no composite candidate keys in these relations, so partial-key dependencies do not occur.

**Result:** All three relations satisfy 2NF.

## 5. Third Normal Form (3NF)

A relation satisfies 3NF when it is in 2NF and does not contain a non-key attribute that determines another non-key attribute through a transitive dependency.

### 5.1 ITEM_CATEGORY

`waste_type` and `standard_weight_kg` depend on the category ID or its unique name. There is no identified non-key-to-non-key dependency.

**Result:** ITEM_CATEGORY satisfies 3NF.

### 5.2 PICKUP_REQUEST

Resident details are held in the RESIDENT/ACCOUNT tables and category details are held in ITEM_CATEGORY. The request stores foreign keys instead of duplicating those details. The pickup address is a deliberate snapshot of the address at creation (BR34).

The recorded estimated weight is also a deliberate historical snapshot (BR31). It cannot be reliably derived later from the **current** category standard weight, because that standard weight can change. Its storage does not create a transitive dependency among the attributes of this relation under the stated business rules.

Status history is kept in STATUS_CHANGE, while expiry is derived from the original creation time. No other transitive dependency is identified among the stored attributes.

**Result:** PICKUP_REQUEST satisfies 3NF under the stated dependencies.

### 5.3 PICKUP_WINDOW

The date, hourly slot, active flag, and parent request ID are determined by `window_id`. Request details remain in PICKUP_REQUEST. There is no identified non-key-to-non-key dependency.

**Result:** PICKUP_WINDOW satisfies 3NF.

## 6. Normalization Summary

| Relation | 1NF | 2NF | 3NF |
|---|---|---|---|
| ITEM_CATEGORY | Satisfied | Satisfied | Satisfied |
| PICKUP_REQUEST | Satisfied | Satisfied | Satisfied |
| PICKUP_WINDOW | Satisfied | Satisfied | Satisfied |

All three relations satisfy 3NF based on the functional dependencies and business rules described here. Storing a historical address and estimated weight is intentional: these values describe the request at the relevant time and should not be replaced when current profile or category values change.

**Integration note:** These normalization conclusions assume `name` and `acceptance_id` are enforced as unique non-null identifiers, and that each request's recorded estimated weight is a historical snapshot rather than a value always recomputed from the current category row.
