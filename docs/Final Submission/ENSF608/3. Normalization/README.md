# Normalization

## Scope and references

This document explains how the [logical schema with 25 tables](<../2. Logical model/README.md>) meets First, Second and Third Normal Form (1NF, 2NF and 3NF). Business-rule references come from the [conceptual model](<../1. Conceptual Model(ER diagram)/ER-Diagram.drawio>) and the rules for events come from the [implementation contract](../../../../contracts/README.md).

## Functional dependencies and keys

`X → Y` means that rows with the same `X` must also have the same `Y`. These dependencies follow the business rules. A **candidate key** uniquely identifies a row using only the columns it needs. A **composite key** contains two or more columns. In this document, a **non-key column** means a column that belongs to no candidate key.

The following summary lists the keys and dependencies. The [logical model](<../2. Logical model/README.md>) provides the complete column definitions and constraints.

| Table | Candidate keys and important dependencies |
|---|---|
| `account` | `account_id →` shared account details. Names do not uniquely identify accounts; age and total points are calculated. |
| `resident` | `account_id → street, postal_code` for the current profile. |
| `volunteer` | The only column is the key, `account_id`. |
| `volunteer_preferred_postal_code` | The two columns, `(account_id, postal_code)`, form the whole key. |
| `push_subscription` | `endpoint →` account and subscription details; one account can have multiple endpoints. |
| `terms_document` | `terms_document_id → content, published_at`; publication time is not required to be unique. |
| `terms_acceptance` | `terms_acceptance_id →` account, document, action type and acceptance time. |
| `item_category` | `category_id → name, waste_type, standard_weight_kg`; waste type does not identify one category. |
| `photo` | `file_id → file_path`; paths are not required to be unique. |
| `pickup_request` | `pickup_request_id →` request details and its terms acceptance. The acceptance identifies the owner. |
| `pickup_window` | `pickup_window_id → pickup_request_id, pickup_date, start_hour, is_active`. Only active slots must have a unique request/date/hour combination. |
| `status_change` | `(pickup_request_id, changed_at) → status, reason`. |
| `assignment` | `assignment_id →` selected window, terms acceptance, and acceptance/collection/ending details. The window identifies the request; the terms acceptance identifies the volunteer. |
| `delivery` | `delivery_id`, `assignment_id` and `file_id` are candidate keys. Each determines the entire row. |
| `recycling_facility` | `facility_id →` facility details. Several facilities or addresses can share a postal code. |
| `facility_accepts` | The two columns, `(facility_id, category_id)`, form the whole key. |
| `ecopoints_award` | `ecopoints_award_id → assignment_id, points, formula`. Checking the award and role tables together ensures at most one award per assignment for each role. |
| `resident_award` | The only column is `ecopoints_award_id`, which is both the PK and an FK to the award. |
| `volunteer_award` | The only column is `ecopoints_award_id`, which is both the PK and an FK to the award. |
| `notification` | `notification_id → type, created_at, pushed_at, is_read, is_expired`. |
| `request_notification` | `notification_id → account_id, pickup_request_id, request_seq`. Several notifications, with different recipients or types, can refer to one event. |
| `award_notification` | Each of `notification_id` and `ecopoints_award_id` uniquely identifies the row; neither can be empty. |
| `request_event` | `(pickup_request_id, request_seq) → transition_id`. One action can produce several events, including events for different requests. |
| `request_update_event` | `(pickup_request_id, request_seq) → reason`. Both key columns are needed to identify the reason. |
| `request_changed_field` | All three columns, `(pickup_request_id, request_seq, field_name)`, form the key. |

`rescheduled_from_request_id` is unique only when present, so it is not a candidate key for the whole table. Rules that apply only to active slots or unfinished assignments also do not identify every historical row.

## First Normal Form

1NF requires each column to hold one value in each row. Information that can have several values is stored in separate rows:

| Information | How it is stored |
|---|---|
| Preferred postal codes | One `volunteer_preferred_postal_code` row per account/code pair. |
| Facility acceptance | One `facility_accepts` row per facility/category pair. |
| Pickup slots | Separate `pickup_window` rows, each with one date and start hour. |
| Status history | One `status_change` row per request/time pair. |
| Account roles | A row in `resident`, `volunteer`, or both, linked to the account. |
| Selected item categories | One request per category in a Q4 submission. |
| Changed request fields | One `request_changed_field` row per event/field pair. |

The conceptual ER diagram shows these source records. Its multivalued Changed_Field becomes separate rows in `request_changed_field`.

The previous notification JSON combined event details with a list of changed fields. Following Lecture 8, these are separated into `request_event`, `request_update_event`, and one `request_changed_field` row for each changed field.

An event needs both `pickup_request_id` and `request_seq` to identify it. A `transition_id` is not unique because one action can produce several events, including events for both requests during rescheduling (contract 10.2).

Notes, terms content and formula descriptions remain single text values because the system uses each as a whole. Each table has a key that identifies its rows.

## Second Normal Form

2NF requires 1NF and requires every non-key column to depend on the whole of each candidate key. For a composite candidate key, depending on just part of the key is a **partial dependency**.

| Table | Why the whole key is needed |
|---|---|
| `status_change` | A request has several status changes, and different requests can share a timestamp. Both `pickup_request_id` and `changed_at` identify the status and reason. |
| `request_event` | A request can have zero or more consumed events, and sequence numbers can repeat across requests. Both `pickup_request_id` and `request_seq` identify the transition. |
| `request_update_event` | Update reasons vary across events. Both `pickup_request_id` and `request_seq` identify the reason. |

`volunteer_preferred_postal_code`, `facility_accepts` and `request_changed_field` contain only key columns, so they have no non-key columns with partial dependencies.

For example, the key of `facility_accepts` is `(facility_id, category_id)`. If this table also stored the facility name, that name would depend only on `facility_id`, not on the whole key. This is a **partial dependency**, which breaks 2NF. A category name stored here would have the same problem. These descriptions stay in `recycling_facility` and `item_category` instead.

The remaining candidate keys each contain one column, so they cannot have dependencies on just part of a key. These checks establish 2NF.

## Third Normal Form

3NF requires 2NF. In the cases below, a non-key column must not identify another non-key column in the same table. The design removes these **transitive dependencies** by storing each fact with the key that identifies it.

### Request owner

The previous request table stored both its terms acceptance ID and its resident account ID:

```text
pickup_request_id → terms_acceptance_id → account_id
```

Several item requests can share one terms acceptance, so it is not a candidate key for a request. Each acceptance identifies one account (BR43). Storing the account ID in the request would repeat a value already identified by its acceptance.

The request keeps `terms_acceptance_id` and finds its owner through `terms_acceptance.account_id`. Each request references exactly one acceptance, so the join recovers the owner without losing or duplicating request rows. This is a **lossless join**.

### Assignment request and volunteer

The previous assignment stored a request ID beside its selected window:

```text
assignment_id → pickup_window_id → pickup_request_id
```

Each window belongs to one request, but can appear in several past assignments. The window ID therefore identifies the request without uniquely identifying an assignment.

The assignment keeps the window ID and finds the request through `pickup_window`. Similarly, `assignment_id → terms_acceptance_id → account_id` identifies the volunteer (BR29), so the volunteer ID is not repeated in `assignment`. Both joins point to exactly one parent row and recover the details without duplicating assignments.

### Award role and recipient

The assignment and earned role already identify an award recipient. Storing the recipient again in the award would repeat that information. The role must remain explicit because one person can earn awards as both a resident and a volunteer.

The design uses these three tables:

```text
ecopoints_award(ecopoints_award_id, assignment_id, points, formula)
resident_award(ecopoints_award_id)
volunteer_award(ecopoints_award_id)
```

Each award has a row in exactly one role table: `resident_award` or `volunteer_award`. Its award ID is both the primary key and a foreign key. The role table and assignment together identify the recipient without repeating the recipient ID in the award.

Exactly one role row is required per award, with at most one award per assignment and role. Self-delivery can still produce two awards, one per role. Eligible resident cancellation gives only a volunteer award and excludes self-cancellation (BR11, BR55).

### Notification source and event facts

Request notifications require an explicit recipient because one event can notify several accounts. An award notification obtains its recipient from its unique award. Separate `request_notification` and `award_notification` tables store these two cases.

The `notification` table stores the type, times, and read/expiry state. Each notification has a row in exactly one of the two source tables. In `award_notification`, `ecopoints_award_id` is required and unique, so either column can identify the row. A `request_notification` stores its recipient and both columns of the event key.

Event details are stored once and referenced by notifications. This removes dependencies such as `notification_id → (pickup_request_id, request_seq) → transition_id`. The update reason is stored once in `request_update_event`, rather than repeated for each changed field. Joining on the complete event key recovers these details without duplicating them in storage.

### Descriptions remain with their identifiers

Category names, waste types and current standard weights depend on `category_id`; facility descriptions depend on `facility_id`; paths depend on `file_id`; and terms content depends on `terms_document_id`. Tables that reference these records store their IDs rather than repeating their descriptions.

This avoids dependencies such as `delivery_id → facility_id → facility address` within a delivery row. Shared account names and birth dates likewise remain in `account`, while the resident's current address remains in `resident`. Each of these shared details is updated in one table.

## Historical facts and derived values

Normalization must preserve the meaning of historical values:

- A resident's current profile address can change after their active work ends. Each request retains its original pickup address (BR34). Thus one resident ID does not determine a single historical address across all requests.
- Category standard weight can change while earlier requests retain their estimates (BR31). Therefore, the same category and quantity can have different estimates on requests created at different times. `(category_id, quantity) → estimated_weight_kg` does not hold across the full request history. The system calculates the estimate when a request is created or edited. A replacement created after a missed pickup is a new request, so its estimate uses the current category weight. The missed request keeps its previous estimate (contract 12.5).
- Award points and the formula used are frozen facts (BR41). A request may be edited after a cancellation award, and later formulas can affect new awards. Current request values must not overwrite an old award's meaning. Repeating the same formula text does not mean that a role must always use that formula.

## Conclusion

Under the stated business rules, the 25-table logical schema satisfies:

- **1NF:** each column holds one value, with repeated information stored in separate rows.
- **2NF:** non-key columns depend on the whole candidate key, including every part of a composite key.
- **3NF:** the request, assignment, award and notification changes remove the transitive dependencies described above. Shared descriptions remain in their own tables.
