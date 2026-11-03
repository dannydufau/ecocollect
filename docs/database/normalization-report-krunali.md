# Normalization Report - Issue #71

## 1. Overview

This report examines the normalization of the three EcoCollect relations assigned in Issue #71:

- `ITEM_CATEGORY`
- `PICKUP_REQUEST`
- `PICKUP_WINDOW`

The three relations are examined using functional dependencies and the first three normal forms (1NF, 2NF, and 3NF).

## 2. Functional Dependencies

### 2.1 ITEM_CATEGORY

**Relation:**

`item_category(category_id, name, waste_type, standard_weight_kg)`

**Primary Key:** `category_id`

**Candidate Keys:** `category_id`, `name`

**Functional Dependencies:**

`category_id → name, waste_type, standard_weight_kg`

`name → category_id, waste_type, standard_weight_kg`

Each category identifier determines its category name, waste type, and standard weight. Since the category name is unique and cannot be NULL, it also identifies a category.

### 2.2 PICKUP_REQUEST

**Relation:**

`pickup_request(request_id, account_id, category_id, acceptance_id, quantity, created_at, status, pickup_street, pickup_postal_code, notes, photo_url)`

**Primary Key:** `request_id`

**Candidate Keys:** `request_id`, `acceptance_id`

**Functional Dependencies:**

`request_id → account_id, category_id, acceptance_id, quantity, created_at, status, pickup_street, pickup_postal_code, notes, photo_url`

`acceptance_id → request_id`

Each request identifier determines the attributes of that pickup request.

Since `acceptance_id` is defined as UNIQUE and NOT NULL in the logical model, it also uniquely identifies a pickup request.

### 2.3 PICKUP_WINDOW

**Relation:**

`pickup_window(window_id, request_id, pickup_date, slot, is_active)`

**Primary Key:** `window_id`

**Candidate Key:** `window_id`

**Functional Dependency:**

`window_id → request_id, pickup_date, slot, is_active`

Each window identifier determines the associated pickup request, pickup date, time slot, and active status.

## 3. First Normal Form (1NF)

A relation satisfies 1NF when every attribute contains a single, atomic value and repeating groups are removed.

| Relation | Explanation |
|---|---|
| ITEM_CATEGORY | Each attribute contains a single value, such as one category name, waste type, or standard weight. |
| PICKUP_REQUEST | Each request contains one category, quantity, and status. The composite pickup address is separated into `pickup_street` and `pickup_postal_code`. |
| PICKUP_WINDOW | Each row represents one pickup window with one date and one time slot. Multiple pickup windows are stored as separate rows instead of repeating attributes in PICKUP_REQUEST. |

**Result:** All three relations satisfy 1NF.

## 4. Second Normal Form (2NF)

A relation satisfies 2NF when it is in 1NF and every non-prime attribute is fully dependent on the entire candidate key. Partial dependencies must not exist.

| Relation | Explanation |
|---|---|
| ITEM_CATEGORY | Both candidate keys, `category_id` and `name`, contain a single attribute. Therefore, no partial-key dependency exists. |
| PICKUP_REQUEST | Both candidate keys, `request_id` and `acceptance_id`, contain a single attribute. Therefore, no partial-key dependency exists. |
| PICKUP_WINDOW | The candidate key `window_id` contains a single attribute. Therefore, no partial-key dependency exists. |

None of these relations has a composite candidate key, so partial-key dependencies do not occur.

**Result:** All three relations satisfy 2NF.

## 5. Third Normal Form (3NF)

A relation satisfies 3NF when it is in 2NF and no non-prime attribute is transitively dependent on a candidate key through another non-prime attribute.

### 5.1 ITEM_CATEGORY

The attributes `waste_type` and `standard_weight_kg` depend on the category identifier or unique category name.

Both `category_id` and `name` are candidate keys. No non-key attribute determines another non-key attribute in the defined relation.

**Result:** ITEM_CATEGORY satisfies 3NF.

### 5.2 PICKUP_REQUEST

The attributes describing a pickup request depend on its request identifier.

Category details, including `name`, `waste_type`, and `standard_weight_kg`, are stored separately in ITEM_CATEGORY and referenced through `category_id`.

Resident information is referenced through `account_id` rather than duplicated in PICKUP_REQUEST.

The pickup address is stored as a request-specific snapshot because it must remain unchanged after the request is created.

The derived attributes `estimated_weight_kg` and `expires_at` are calculated rather than stored as independent columns.

Based on the defined functional dependencies, no non-prime attribute is transitively dependent on a candidate key.

**Result:** PICKUP_REQUEST satisfies 3NF.

### 5.3 PICKUP_WINDOW

The attributes `request_id`, `pickup_date`, `slot`, and `is_active` depend on `window_id`.

Pickup request details are stored separately in PICKUP_REQUEST and accessed through the `request_id` foreign key.

No transitive dependencies are identified among the non-key attributes.

**Result:** PICKUP_WINDOW satisfies 3NF.

## 6. Normalization Summary

| Relation | 1NF | 2NF | 3NF |
|---|---|---|---|
| ITEM_CATEGORY | Satisfied | Satisfied | Satisfied |
| PICKUP_REQUEST | Satisfied | Satisfied | Satisfied |
| PICKUP_WINDOW | Satisfied | Satisfied | Satisfied |

All three relations satisfy Third Normal Form (3NF) based on the functional dependencies and constraints defined in the logical database model.

The design reduces unnecessary duplication by separating item categories, pickup requests, and pickup windows into individual relations connected through foreign keys. This helps maintain data consistency and prevents insertion, update, and deletion anomalies.
