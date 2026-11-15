# Normalization

## Scope and references

This document explains how the [logical schema with 25 tables](<../2. Logical model/README.md>) meets First, Second and Third Normal Form (1NF, 2NF and 3NF). Business-rule references come from the [conceptual model](<../1. Conceptual Model(ER diagram)/ER-Diagram.drawio>) and the rules for events come from the [implementation contract](../../../../contracts/README.md).

The logical diagram and its README use the table changes explained here. SQL scripts, sample data and service queries still need to be updated to match. This document checks the table design and its dependencies.

## Functional dependencies and keys

A functional dependency describes how one value identifies another. `X → Y` means that rows with the same `X` must also have the same `Y`. For example, a category ID identifies its name and standard weight. These rules come from the business requirements, rather than patterns that happen to appear in sample data.

The following key terms are used in this document:

- **Candidate key:** a column, or group of columns, that uniquely identifies a row. Every column in the key is needed.
- **Primary key (PK):** the candidate key chosen as the main identifier for a table.
- **Composite key:** a key made up of two or more columns. A candidate key can be a single column or a composite key.
- **Superkey:** any column or group of columns that uniquely identifies a row, even if some of those columns are unnecessary.
- **Key column (prime attribute):** a column that belongs to at least one candidate key. A non-key column belongs to none of the candidate keys.
- **Foreign key (FK):** a column or group of columns that references a key in another table, or in the same table.

For **2NF**, every non-key column must depend on the whole of each candidate key. If a candidate key contains several columns, a non-key column must not depend on just part of that composite key.

For **3NF**, whenever `X → A` and `A` is not already part of `X`, either `X` must uniquely identify the row, or `A` must belong to a candidate key. For the tables discussed below, this means removing cases where the key identifies one non-key column, which then identifies another non-key column in the same table. Adding a generated ID as the primary key does not, by itself, make a table satisfy 3NF.

Each primary key below identifies all other values in its table. The logical README lists all columns, allowed values and types, optional fields, keys and uniqueness rules.

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

`rescheduled_from_request_id` is unique when present, but it is empty for requests that were not rescheduled. It therefore does not identify every row in the request table. Similarly, rules for active slots and unfinished assignments do not identify all historical rows. Names, timestamps, addresses and formula text can repeat. One account can also have several subscriptions.

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

The previous notification metadata stored the event sequence, action ID, update reason and a list of changed fields together in JSON. Lecture 8 treats a value as atomic when it is stored as one value rather than as a list of separate facts. To follow that approach, the design stores the event details in `request_event`, the update reason in `request_update_event`, and each changed field in its own `request_changed_field` row.

An event is identified by both `pickup_request_id` and `request_seq`. Under contract section 10.2, several events can share one `transition_id`, including events for the old and new requests during rescheduling. Each changed-field row references both event-key columns so it points to exactly one update event.

Notes, terms content and formula descriptions remain single text values because the system uses each as a whole. It does not treat individual words as separate records. Every column now holds one value of its defined type, and each row has a key.

## Second Normal Form

For tables with composite candidate keys, check whether each non-key column depends on the whole key:

| Table | Why the whole key is needed |
|---|---|
| Preferred postal code | Both key columns identify the preference. There are no non-key columns. |
| Facility accepts | Both key columns identify the facility/category pair. There are no non-key columns. |
| Status change | A request has several changes and timestamps can repeat across requests. The complete request/time pair determines status and reason. |
| Request event | One request has many events and the same sequence can occur on different requests. The complete request/sequence pair determines its transition. |
| Request update event | Update reasons can vary across one request's history and across different requests with the same sequence number. The complete pair determines the reason. |
| Request changed field | All three columns belong to the key. There are no non-key columns. |

For example, the key of `facility_accepts` is `(facility_id, category_id)`. If this table also stored the facility name, that name would depend only on `facility_id`, not on the whole key. This is a **partial dependency**, which breaks 2NF. A category name stored here would have the same problem. These descriptions stay in `recycling_facility` and `item_category` instead.

The other candidate keys each contain just one column, so they cannot have a dependency on only part of the key. Together with the 1NF checks above, these checks show that the tables meet 2NF.

## Third Normal Form

### Request owner

The previous request table stored both its terms acceptance ID and its resident account ID:

```text
pickup_request_id → terms_acceptance_id → account_id
```

Q4 allows several item requests to share one terms acceptance, so the acceptance ID does not uniquely identify a request. However, each acceptance identifies one account (BR43). Storing both IDs in the request creates a **transitive dependency**: the request ID identifies the acceptance, and the acceptance identifies the account.

The request keeps `terms_acceptance_id`. Its owner is found through `terms_acceptance.account_id`. Each request must reference exactly one existing acceptance. Joining the two tables therefore recovers the owner without losing or duplicating request rows; this is called a **lossless join**. Business checks must still confirm that the account is a resident and that the acceptance was for request creation.

### Assignment request and volunteer

The previous assignment stored a request ID beside its selected window:

```text
assignment_id → pickup_window_id → pickup_request_id
```

Each window belongs to one request, and multiple ended assignments can refer to the same offered window over time. A composite FK ensured that the request ID matched the selected window, but the same request ID was still stored twice.

The assignment keeps its selected window ID and finds the request through `pickup_window`. It finds the volunteer through its required terms acceptance (BR29). The assignment stores its own acceptance, collection and ending details. Each FK points to exactly one parent row, so these joins recover the details without duplicating assignments.

The design does not require each assignment to have a unique terms acceptance ID. If that uniqueness rule were added, the acceptance ID could be another candidate key. Either way, the acceptance identifies the volunteer.

A request may still have only one unfinished assignment. This rule involves several rows, so the SQL implementation must lock the request while checking its assignments through their windows. The earlier index relied on storing the request ID directly in `assignment`. After removing that column, another check must prevent simultaneous actions from creating two unfinished assignments.

### Award role and recipient

The earlier award table had separate resident and volunteer recipient columns, with one left empty depending on the role. Within each role, an assignment could have only one award. The assignment and role already identified the recipient, so checking only the award ID was not enough to justify 3NF.

The design uses these three tables:

```text
ecopoints_award(ecopoints_award_id, assignment_id, points, formula)
resident_award(ecopoints_award_id)
volunteer_award(ecopoints_award_id)
```

Each award has a row in exactly one of `resident_award` or `volunteer_award`. These role tables contain only the award ID, which is both their PK and an FK to `ecopoints_award`. The role table identifies which role earned the award. Joining through the assignment identifies that role's recipient, so the recipient ID does not need to be stored again in the award.

The award and role tables must be checked together to allow at most one award per assignment for each role. Self-delivery still has two award IDs, one per role. Eligible resident cancellation has only the volunteer award and excludes self-cancellation (BR11, BR55).

### Notification source and event facts

Request notifications require an explicit recipient because one event can notify several accounts. An award notification obtains its recipient from its unique award. Separate `request_notification` and `award_notification` tables store these two cases.

The `notification` table stores the type, times, and read/expiry state. Each notification has a row in exactly one of the two source tables. In `award_notification`, `ecopoints_award_id` is required and unique, so either column can identify the row. A `request_notification` stores its recipient and both columns of the event key.

The event table stores `request_seq` and `transition_id` once for each event. An update event also has a row containing its reason, with one separate row per changed field. Several notifications can reference the same event without repeating these details. Requiring exactly one source row per notification and one role row per award makes it possible to recover the source, recipient and metadata without losing or duplicating rows.

### Descriptions remain with their identifiers

Category names, waste types and current standard weights depend on `category_id`; facility descriptions depend on `facility_id`; paths depend on `file_id`; and terms content depends on `terms_document_id`. Tables that reference these records store their IDs rather than repeating their descriptions.

This avoids dependencies such as `delivery_id → facility_id → facility address` within a delivery row. Shared account names and birth dates likewise remain in `account`, while the resident's current address remains in `resident`. Each of these shared details is updated in one table.

## Historical facts and derived values

Normalization must preserve the meaning of historical values:

- A resident's current profile address can change after their active work ends. Each request retains its original pickup address (BR34). Thus one resident ID does not determine a single historical address across all requests.
- Category standard weight can change while earlier requests retain their estimates (BR31). Therefore, the same category and quantity can have different estimates on requests created at different times. `(category_id, quantity) → estimated_weight_kg` does not hold across the full request history. The system calculates the estimate when a request is created or edited.
- Award points and the formula used are frozen facts (BR41). A request may be edited after a cancellation award, and later formulas can affect new awards. Current request values must not overwrite an old award's meaning. Repeating the same formula text does not mean that a role must always use that formula.

Request status, assignment status, expiry, delivery time, award kind/time, totals, eligible facilities and notification title/body are calculated or read from their stored source records, as specified by BR12, BR24, BR33, BR44–BR45 and BR57–BR59.

## Conclusion and implementation checks

The 25 tables meet the normal forms under the stated business rules:

- **1NF:** each column holds one value, and lists are stored as separate rows.
- **2NF:** non-key columns depend on the whole candidate key, including every part of a composite key.
- **3NF:** descriptions, people and event details are stored with the IDs that identify them, instead of being repeated in related tables in ways that create transitive dependencies.

The logical README and diagram list the tables, keys, allowed values and rules involving several rows. Implementing the design also requires:

1. Queries or database views that follow the required FKs to find request owners, assignment participants, award roles and notification recipients.
2. Checks for exactly one role row per award, exactly one source row per notification, at most one award per assignment and role, one notification per award, and no repeated changed field within an event.
3. A check that prevents two simultaneous actions from creating more than one unfinished assignment for a request, after removing the repeated request ID from `assignment`.
4. Data-loading scripts, service queries, database operations and tests that use these tables and preserve historical values.

These changes reorganize how the existing conceptual relationships are stored in tables. The SQL scripts and the services listed in contract section 8 must use the updated tables and joins, or views that provide the expected fields. Normalization checks how values depend on keys. Allowed values, timing rules, required relationships and simultaneous actions still need the constraints and transactions described in the logical model.
