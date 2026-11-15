# Normalization

## Scope and references

This document explains the 1NF, 2NF and 3NF decisions in the [25-relation logical schema](<../2. Logical model/README.md>). It follows section 3 of the ENSF 608 Team Project Description and Dr. Ronnie de Souza Santos's Lecture 8, Database Normalization, slides 3–11. Business-rule references come from the [conceptual model](<../1. Conceptual Model(ER diagram)/ER-Diagram.drawio>) and event semantics from the [implementation contract](../../../../contracts/README.md).

The logical diagram and its README use the decompositions described here. Physical implementation, data and service-query integration are subsequent deliverables. The normal-form conclusions concern the relation definitions and stated functional dependencies.

## Functional dependencies and keys

`X → Y` means any two valid rows agreeing on `X` agree on `Y`. Dependencies follow the business rules, rather than coincidental values in sample data. A candidate key is a minimal determinant of the whole row. A superkey may contain additional attributes. A prime attribute belongs to at least one candidate key.

For 2NF, no non-prime attribute depends on a proper subset of a candidate key. For 3NF, each non-trivial dependency `X → A` has a superkey determinant or a prime right-hand attribute. A surrogate primary key alone does not establish 3NF.

Each primary key below determines all other attributes in its relation. The logical README specifies the full attributes, domains, nullability, PKs, unique constraints and FKs.

| Relation | Candidate keys and meaningful dependencies |
|---|---|
| `account` | `account_id →` shared account facts. Names are not keys; age and total points are derived. |
| `resident` | `account_id → street, postal_code` for the current profile. |
| `volunteer` | Key-only `account_id`. |
| `volunteer_preferred_postal_code` | Key-only `(account_id, postal_code)`. |
| `push_subscription` | `endpoint →` account and subscription facts; one account can have multiple endpoints. |
| `terms_document` | `terms_document_id → content, published_at`; publication time is not a declared key. |
| `terms_acceptance` | `terms_acceptance_id →` account, document, action type and acceptance time. |
| `item_category` | `category_id → name, waste_type, standard_weight_kg`; waste type does not identify one category. |
| `photo` | `file_id → file_path`; paths are not declared alternate keys. |
| `pickup_request` | `pickup_request_id →` request facts and its acceptance. Owner is obtained from that acceptance. |
| `pickup_window` | `pickup_window_id → pickup_request_id, pickup_date, start_hour, is_active`. Active-slot uniqueness is conditional. |
| `status_change` | `(pickup_request_id, changed_at) → status, reason`. |
| `assignment` | `assignment_id →` selected window, acceptance and lifecycle times/reason. Request and volunteer are obtained through its FKs. |
| `delivery` | `delivery_id`, `assignment_id` and `file_id` are candidate keys. Each determines the entire row. |
| `recycling_facility` | `facility_id →` facility facts. A postal code does not identify one facility or street address. |
| `facility_accepts` | Key-only `(facility_id, category_id)`. |
| `ecopoints_award` | `ecopoints_award_id → assignment_id, points, formula`. Per-role assignment uniqueness is enforced across the subtype joins. |
| `resident_award` | Key-only `ecopoints_award_id`, also an FK to the award. |
| `volunteer_award` | Key-only `ecopoints_award_id`, also an FK to the award. |
| `notification` | `notification_id → type, created_at, pushed_at, is_read, is_expired`. |
| `request_notification` | `notification_id → account_id, pickup_request_id, request_seq`. Multiple accounts/types can be notified about one event. |
| `award_notification` | Both `notification_id` and required unique `ecopoints_award_id` are candidate keys. |
| `request_event` | `(pickup_request_id, request_seq) → transition_id`. One transition can span several events and requests. |
| `request_update_event` | `(pickup_request_id, request_seq) → reason`. Neither component alone determines the reason. |
| `request_changed_field` | Key-only `(pickup_request_id, request_seq, field_name)`. |

The nullable unique predecessor reference is a key only within the subset of rescheduled requests. The active-slot and unfinished-assignment rules also apply to subsets, so they are not whole-history candidate keys. The schema does not assume uniqueness of names, timestamps, addresses, formula text or subscription accounts.

## First Normal Form

The mapping represents repeated and multivalued information as individual rows:

| Information | Atomic relational representation |
|---|---|
| Preferred postal codes | One `volunteer_preferred_postal_code` row per account/code pair. |
| Facility acceptance | One `facility_accepts` row per facility/category pair. |
| Pickup slots | Separate `pickup_window` rows, each with one date and start hour. |
| Status history | One `status_change` row per request/time pair. |
| Account roles | Resident and volunteer subtype rows. |
| Selected item categories | One request per category in a Q4 submission. |
| Changed request fields | One `request_changed_field` row per event/field pair. |

The former notification JSON metadata combined sequence, action identity, update reason and a collection of changed fields. Under Lecture 8's atomic-value interpretation, storing a list of field names in one attribute does not demonstrate 1NF. The adopted mapping uses scalar `request_event` and `request_update_event` attributes plus the separate changed-field relation.

The full event key is `(pickup_request_id, request_seq)`. Contract section 10.2 establishes that several events can share a `transition_id`, including the old/new request pair during rescheduling. Therefore, the action ID is not used as an event key. Field rows reference the complete update-event key, which removes the earlier proposal's reliance on an additional edit-action identity assumption.

Notes, terms content and formula descriptions are single text values for the operations supported by this system. Their individual words are not relationship members. All relation attributes now have single values in their stated domains, and keys identify distinct rows.

## Second Normal Form

The composite-key relations require an explicit full-key check:

| Relation | Full-key dependence |
|---|---|
| Preferred postal code | Both key attributes identify the preference. There are no non-key attributes. |
| Facility accepts | Both key attributes identify the accepted pair. There are no non-key attributes. |
| Status change | A request has several changes and timestamps can repeat across requests. The complete request/time pair determines status and reason. |
| Request event | One request has many events and the same sequence can occur on different requests. The complete request/sequence pair determines its transition. |
| Request update event | Update reasons can vary across one request's history and across different requests with the same sequence number. The complete pair determines the reason. |
| Request changed field | All three attributes are key attributes. There are no non-key attributes. |

For example, storing facility name in `facility_accepts` would introduce `facility_id → facility_name`, a partial dependency on its composite key. Storing category name there would introduce another partial dependency. Descriptions remain in their respective parent relations.

The other declared candidate keys are single attributes and therefore have no proper non-empty subset. Together with atomic attributes, the listed dependencies establish 2NF for the mapped relations.

## Third Normal Form

### Request owner

The previous request relation contained both its acceptance and its resident account:

```text
pickup_request_id → terms_acceptance_id → account_id
```

Q4 shares an acceptance across item requests, so an acceptance is not a key of the request relation. It still determines one account (BR43). Keeping both attributes in the request therefore introduced a transitive dependency on a non-key determinant.

The normalized request keeps `terms_acceptance_id` and obtains its owner from `terms_acceptance.account_id`. The join is lossless because each request references one required acceptance key. Several item requests can share that parent without duplicating or losing any request. The actor's resident role and request-creation action type remain required business checks.

### Assignment request and volunteer

The previous assignment stored a request ID beside its selected window:

```text
assignment_id → pickup_window_id → pickup_request_id
```

Each window belongs to one request, and multiple ended assignments can refer to the same offered window over time. A composite FK checked agreement between the duplicate values, but did not eliminate this dependency.

The normalized assignment keeps the selected window and derives its request through `pickup_window`. It also derives its volunteer through the required volunteer-acceptance row (BR29). The relation stores its own acceptance, collection and ending facts. Both parent joins use required FKs to primary keys and therefore reconstruct each assignment without multiplying rows.

No uniqueness of assignment acceptances is assumed. If one acceptance were declared unique per assignment, it could be an alternate key; the adopted mapping obtains the actor through the acceptance in either case.

One unfinished assignment per request remains a cross-row invariant. Its implementation must serialize on the request and inspect assignments through windows. Removing the request column also removes the basis for the earlier direct partial index, so the physical model must supply an equivalent concurrency-safe guard.

### Award role and recipient

The earlier award layout combined nullable resident and volunteer recipient columns. Its earned-role subsets had conditional assignment keys, and each actor was already determined by the assignment and role. That nullable representation required a role-aware analysis rather than an unqualified single-key 3NF claim.

The adopted mapping uses:

```text
ecopoints_award(ecopoints_award_id, assignment_id, points, formula)
resident_award(ecopoints_award_id)
volunteer_award(ecopoints_award_id)
```

Each award has exactly one subtype row. The key-only subtypes store role membership, and their PK/FK join to the award is one-to-one. The recipient is obtained from the assignment's corresponding actor path. The union of the two role projections restores the award's earned role and recipient without duplicate stored actor attributes.

At most one award per assignment and role must be checked across the subtype joins. Self-delivery still has two award IDs, one per role. Eligible resident cancellation has only the volunteer award and excludes self-cancellation (BR11, BR55).

### Notification source and event facts

Request notifications require an explicit recipient because one event can notify several accounts. An award notification obtains its recipient from its unique award. Separate `request_notification` and `award_notification` relations express those different dependencies.

The common notification stores notification-specific type, times and read/expiry state. Exactly one source subtype references it. `award_notification.ecopoints_award_id` is a required unique FK, so both its columns are candidate keys. `request_notification` references one complete event key and stores its recipient.

The event relation stores `request_seq` and `transition_id` once per event. Its optional update-event row stores the reason, and changed-field rows store the multivalued detail. Multiple notification recipients can reference the same event facts. Source/role joins are lossless under their required total and exclusive subtype participation rules. Services can reconstruct the response's source, recipient and metadata object from these relations.

### Descriptions remain with their identifiers

Category names, waste types and current standard weights depend on `category_id`; facility descriptions depend on `facility_id`; paths depend on `file_id`; and terms content depends on `terms_document_id`. Referencing relations retain those identifiers rather than repeating their descriptions.

This avoids dependencies such as `delivery_id → facility_id → facility address` within a delivery row. Shared account names and birth dates likewise remain in `account`, while the resident's current address remains in `resident`. Changes to those facts have one owning relation.

## Historical facts and derived values

Normalization must preserve the meaning of historical values:

- A resident's current profile address can change after their active work ends. Each request retains its original pickup address (BR34). Thus one resident ID does not determine a single historical address across all requests.
- Category standard weight can change while earlier requests retain their estimates (BR31). Therefore, `(category_id, quantity) → estimated_weight_kg` is not a dependency across all valid historical requests. The system computes the request-level estimate on creation/edit.
- Award points and the formula used are frozen facts (BR41). A request may be edited after a cancellation award, and later formulas can affect new awards. Current request values must not overwrite an old award's meaning. Repeated formula text does not establish a permanent role-to-formula dependency.

Request status, assignment status, expiry, delivery time, award kind/time, totals, eligible facilities and notification title/body are derived from their source relations as specified by BR12, BR24, BR33, BR44–BR45 and BR57–BR59.

## Normal-form conclusion and implementation checks

The 25 mapped relations have atomic attributes. The identified composite-key dependencies use their whole keys. Non-key descriptive facts and repeated actor/event facts are stored with their determinants. Under the stated business dependencies, the logical schema satisfies 1NF, 2NF and 3NF.

The logical README and diagram record the adopted relation definitions, keys, domains and cross-row requirements. Implementing this design also requires:

1. Required FK joins and reconstruction views/projections for owners, assignment participants, earned roles and notification recipients.
2. Total and exclusive award/source subtype membership, per-role award uniqueness, one notification per award and distinct changed fields.
3. A concurrency-safe one-unfinished-assignment rule after removing the duplicate assignment request ID.
4. Population scripts, service joins, operations and tests that use the new mapping and preserve historical facts.

The decomposition changes the relational representation of the existing conceptual relationships. Physical SQL must be revised to implement it, and the readers listed in contract section 8 must adopt the joins or compatibility projections. Normalization establishes the dependency structure; value domains, timing, participation and concurrency still require their documented constraints and transactions.
