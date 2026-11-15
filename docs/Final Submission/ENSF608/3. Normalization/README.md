# Normalization

## Scope and result

This is the shared normalization review for the complete EcoCollect relational model. It assesses the 18 relations in the [logical model](<../2. Logical model/README.md>) merged through PR #172 and identifies the corrections needed for a consistent 3NF submission.

The review finds meaningful normalization decisions already represented in the model, particularly the separation of roles, preferred postal codes, categories, facilities, windows and status history. It also finds redundant ownership and assignment references, role-dependent award recipient data, and structured notification metadata that require further treatment. The current logical model cannot yet be certified as fully normalized to 3NF under the course definitions.

The decompositions below are proposed corrections for review. They have not been applied to the conceptual diagram, logical diagram, contracts or SQL implementation. Once the corrections are agreed, those artifacts must be aligned with this document before the final database is described as 3NF. This document is the main normalization artifact; individual entity submissions provide supporting contribution history.

## References and method

- ENSF 608 Team Project Description, section 3, requires relevant functional dependencies and explanations of 1NF, 2NF and 3NF, with attention to partial and transitive dependencies.
- Dr. Ronnie de Souza Santos, ENSF608 Lecture 8, Database Normalization, slides 3–11, explains atomic values, removal of repeating groups, full-key dependence and elimination of transitive dependencies.
- The [conceptual model](<../1. Conceptual Model(ER diagram)/ER-Diagram.drawio>) supplies the business rules referenced as BR numbers below.
- The [implementation contract](../../../../contracts/README.md), particularly Q4, sections 12, 13.1 and 15, supplies the shared acceptance, history, notification and award semantics.

Dependencies are derived from these rules, rather than coincidences in sample rows. `X → Y` means that any two valid rows agreeing on `X` must agree on `Y`. A candidate key is a minimal determinant of the whole row. A superkey can contain extra attributes. A prime attribute belongs to at least one candidate key.

For 2NF, each non-prime attribute must depend on a whole candidate key, without a dependency on a proper subset. For 3NF, every non-trivial dependency `X → A` must have a superkey as its determinant or a prime attribute on its right-hand side. Declaring a surrogate primary key does not remove other dependencies.

## Keys and dependencies in the current model

In every row of this table, the primary key determines all remaining attributes of that relation. Additional determinants, qualifications and findings are listed where they affect the analysis. Names, postal codes and timestamps are not assumed unique unless the model declares the corresponding rule.

| Relation | Primary key | Additional keys, dependencies and findings |
|---|---|---|
| `account` | `account_id` | Determines names, birth date, creation time and deactivation time. Names are not keys. Age and total points are derived elsewhere. |
| `resident` | `account_id` | Determines the current street and postal code. The PK is also an FK to `account`. |
| `volunteer` | `account_id` | Key-only subtype relation. |
| `volunteer_preferred_postal_code` | `(account_id, postal_code)` | Key-only relationship. Neither component identifies the whole preference. |
| `push_subscription` | `endpoint` | Determines account, subscription keys, optional expiry, user agent and update time. One account can have several endpoints. |
| `terms_document` | `terms_document_id` | Determines content and publication time. Publication time is not declared unique. |
| `terms_acceptance` | `terms_acceptance_id` | Determines document, account, acceptance time and action type. An account can accept several documents or perform the same action more than once. |
| `item_category` | `category_id` | Determines name, waste type and current standard weight. Waste type does not identify a category. Category name is not declared an alternate key. |
| `photo` | `file_id` | Determines file path. A path is not declared an alternate key. |
| `pickup_request` | `pickup_request_id` | `terms_acceptance_id → account_id` is an additional non-key dependency. Q4 permits several requests to share an acceptance, so the acceptance is not a candidate key. See section 3NF. |
| `pickup_window` | `pickup_window_id` | Determines request, date, hour and active flag. `(pickup_request_id, pickup_window_id)` is a superkey containing the PK. Active-slot uniqueness is conditional, since inactive historical slots may repeat. |
| `status_change` | `(pickup_request_id, changed_at)` | Determines status and optional reason. A timestamp is unique within its request, rather than across all requests. |
| `assignment` | `assignment_id` | `pickup_window_id → pickup_request_id` holds independently of the assignment key. Actor-matching also gives `terms_acceptance_id → volunteer_id`. See section 3NF. |
| `delivery` | `delivery_id` | `assignment_id` and `file_id` are also candidate keys because both are required and unique. Each determines the whole delivery row. |
| `recycling_facility` | `facility_id` | Determines name, street, postal code and optional instructions. A postal code does not identify one facility or address. |
| `facility_accepts` | `(facility_id, category_id)` | Key-only relationship. Either facility or category can participate in several pairs. |
| `ecopoints_award` | `ecopoints_award_id` | Within each earned-role subset, `assignment_id` identifies at most one award. Recipient facts are also derivable from the assignment and role. The nullable recipient design requires the role-aware review below. |
| `notification` | `notification_id` | The recipient of an award notification is determined by its award. Structured metadata must also be assessed against the course's atomic-value definition. See sections 1NF and 3NF. |

The nullable unique `rescheduled_from_request_id` identifies a replacement only among requests that have a predecessor. It is not a candidate key for the whole relation because original requests have no predecessor. Likewise, the partial uniqueness rule for an unfinished assignment does not make `pickup_request_id` a candidate key across assignment history.

## First Normal Form

The relational mapping already removes the main repeating groups.

| Conceptual information | Relational treatment | Why it satisfies the atomic-value requirement |
|---|---|---|
| A volunteer's preferred postal codes | One row per `(account_id, postal_code)` | Each row contains one code. There are no `postal_code_1`, `postal_code_2` columns or comma-separated lists. |
| The categories accepted by a facility | One row per `(facility_id, category_id)` | The many-to-many relationship is represented by individual pairs. |
| Pickup windows | Separate `pickup_window` rows | A request's dates and hours are separate values, with retained historical rows. |
| Status history | Separate `status_change` rows | Each row records one status at one time. |
| Resident and volunteer membership | Separate subtype rows | An account can have either or both roles without a list-valued role attribute in `account`. |
| Multiple item categories in Q4 | One `pickup_request` per selected category | Each request references one category and stores one quantity. |

Free-text notes, document content and a formula description are treated as single text values for the operations in this system. Their individual words are not independently queried relationship members.

### Notification metadata needs a relational representation

The current `notification.metadata` JSON object contains event facts such as `requestSeq`, `transitionId`, edit reason and changed fields (BR58 and contract 13.1). SQL can store a JSON object in one column, but that alone does not establish atomicity under Lecture 8. In particular, a collection of changed field names is a multivalued attribute.

Proposed treatment:

- Represent a request event with `request_event(pickup_request_id, request_seq, transition_id)`, keyed by `(pickup_request_id, request_seq)`. The sequence belongs to its request and identifies the event within that request (BR61).
- Store an edit action's reason in `request_edit_action(transition_id, reason)`, keyed by `transition_id`, when it is an edit action. This uses the contract's action ID to identify the edit facts.
- Represent changed fields in `request_edit_field(transition_id, field_name)`, with both attributes as the key. Several changed fields produce several rows.
- Link request notifications to their event using its complete request/sequence key. The notification-source decomposition below shows this link.

The edit-action interpretation must be confirmed against the event producer: its action ID must identify one edit action and one set of changed fields. If that guarantee is unavailable, key the edit facts and changed fields by the complete `(pickup_request_id, request_seq)` event key instead. The normalization decision must follow the actual event identity.

These relations retain the event facts separately from the request's current state. They also let multiple notifications about one event reference the same event facts. The API may assemble its existing metadata object when returning a response.

## Second Normal Form

The model's three composite primary keys deserve explicit examination.

| Relation | Dependence on the complete key |
|---|---|
| `volunteer_preferred_postal_code(account_id, postal_code)` | There are no non-key attributes, so no partial dependency exists. An account can save several codes, and several volunteers can save the same code. |
| `facility_accepts(facility_id, category_id)` | There are no non-key attributes. Facility names and category descriptions stay in their parent relations. |
| `status_change(pickup_request_id, changed_at, status, reason)` | The complete pair determines the status and reason. One request has several changes, and different requests can change at the same time. Neither key component determines those facts alone. |

For example, adding `facility_name` to `facility_accepts` would introduce the partial dependency `facility_id → facility_name`. Adding `category_name` would introduce `category_id → category_name`. Keeping those values in `recycling_facility` and `item_category` avoids update, insertion and deletion anomalies.

Relations with one-attribute candidate keys have no proper non-empty subset of those keys. This establishes the corresponding 2NF check after 1NF is established, but does not prove 3NF. Additional and conditional dependencies still need examination. The notification metadata issue must be resolved before the complete database can be described as 1NF or higher under the course definition.

## Third Normal Form

### Separate descriptions from relationship occurrences

The mapping already stores category descriptions in `item_category`, facility descriptions in `recycling_facility`, photo paths in `photo`, and terms content in `terms_document`.

For example, storing a facility's name and street in every delivery would create `delivery_id → facility_id → facility details`. The existing `delivery.facility_id` reference avoids that repetition. The same reasoning applies to category names in requests, file paths in requests/deliveries, and terms content in acceptances. Each descriptive fact can be changed in its own relation without updating every referencing row.

Resident and volunteer subtypes reuse the account key. Shared names and birth dates belong to `account`; the resident's current address belongs to `resident`. An account with both roles therefore has one set of shared account facts (BR1–BR5).

### Correct the request's duplicate owner reference

Current dependency:

```text
pickup_request_id → terms_acceptance_id → account_id
```

A request's acceptance must belong to its creating resident (BR43). Q4 creates one request per item and shares one acceptance across the submission. Consequently, two requests can have the same `terms_acceptance_id`, while that acceptance still identifies one account. The determinant is not a superkey of `pickup_request`, and `account_id` is not a prime attribute in the declared whole-relation keys. This is a transitive dependency.

Proposed decomposition:

```text
pickup_request(
    pickup_request_id, category_id, terms_acceptance_id, quantity,
    estimated_weight_kg, created_at, request_seq, pickup_street,
    pickup_postal_code, notes, file_id, rescheduled_from_request_id
)

terms_acceptance(
    terms_acceptance_id, terms_document_id, account_id, accepted_at, type
)
```

Remove the duplicate `pickup_request.account_id` and obtain the owner through its required acceptance. Preserve the checks that the acceptance has type `AT_RESIDENT_REQUEST_CREATION` and its account is a resident. The existing owner information can be reconstructed by a many-to-one join on `terms_acceptance_id`.

That join is lossless: every request has exactly one referenced acceptance, and the acceptance key identifies exactly one account. It neither loses a request nor multiplies its owner. A compatibility view can expose the owner field needed by readers while the underlying relations store the fact once.

### Correct the assignment's duplicate request reference

Current dependency:

```text
assignment_id → pickup_window_id → pickup_request_id
```

Each window belongs to one request (BR19). Several ended assignments can use the same offered window over time, so `pickup_window_id` is not declared unique in assignment history. The request ID therefore depends on a non-key determinant.

The composite FK in the current model prevents an assignment from pairing a window with the wrong request. It enforces consistency between the duplicated values, but the functional dependency remains.

Proposed decomposition:

```text
assignment(
    assignment_id, pickup_window_id, terms_acceptance_id,
    accepted_at, collected_at, ended_at, end_reason
)

pickup_window(
    pickup_window_id, pickup_request_id, pickup_date, start_hour, is_active
)
```

Obtain the request from `pickup_window`. The join is lossless because each assignment has one required window FK and each window ID identifies one request.

The same proposal obtains the volunteer from the assignment's terms acceptance. BR29 requires that acceptance to belong to the assigned volunteer, so `terms_acceptance_id → volunteer_id`. If the model guarantees that one acceptance can belong to only one assignment, that acceptance is an alternate candidate key and should be declared unique. Without that guarantee, retaining the duplicate volunteer reference creates another non-key dependency. Deriving the actor avoids relying on an undeclared uniqueness assumption, while retaining the role/action checks for `AT_VOLUNTEER_ACCEPTANCE`.

Removing the stored request ID changes how the one-unfinished-assignment rule is enforced. The physical implementation must lock the request and check assignments through their windows, with a concurrency-safe constraint trigger or equivalent transactional guard. The existing partial index on `assignment(pickup_request_id)` cannot simply be retained after that column is removed. The rule and its concurrency tests must survive the decomposition.

### Represent award roles without duplicating their actors

The present award table has nullable `resident_id` and `volunteer_id` references, with exactly one populated. Analyze the role projections separately rather than treating null values as ordinary candidate-key values.

For resident awards, an assignment determines its request and that request's resident. For volunteer awards, an assignment determines its volunteer. Within either role projection, BR55 makes the assignment identify at most one award. These conditional keys explain why a delivery can have two awards while a self-delivery can award the same account twice through different roles.

The current layout nevertheless stores an actor already determined by the assignment and role. A surrogate award ID and an exactly-one-recipient check do not, by themselves, prove a conventional 3NF relation for the combined nullable layout. Proposed treatment:

```text
ecopoints_award(ecopoints_award_id, assignment_id, points, formula)
resident_award(ecopoints_award_id)
volunteer_award(ecopoints_award_id)
```

Both subtype keys are FKs to `ecopoints_award`. Every award must occur in exactly one subtype. An assignment may have at most one award in each role; this remains a required cross-relation uniqueness rule. Award recipients are obtained through the assignment and its request/acceptance relationships. No separate recipient ID is stored in the award.

The role projections preserve all original information: the common award row supplies points, formula and assignment; subtype membership supplies the earned role; the assignment supplies the corresponding actor. Self-delivery still creates two separate award IDs, one in each subtype. Resident cancellation still creates only the eligible volunteer award (BR11, BR41, BR55).

An explicit earned-role column with `UNIQUE (assignment_id, earned_role)` is another possible mapping. The subtype proposal is used here to retain the conceptual model's resident/volunteer relationships without restoring a stored role attribute that was previously removed from the model. The team must review the selected mapping before updating the logical diagram.

### Separate request and award notification sources

Request notifications need an explicit recipient because several accounts can be notified about the same request. An award notification belongs to the account that earned that award (BR48). Repeating that account ID in an award notification creates a conditional duplicate of the award-recipient relationship.

Proposed treatment, together with the 1NF metadata correction:

```text
notification(
    notification_id, type, created_at, pushed_at, is_read, is_expired
)

request_notification(
    notification_id, account_id, pickup_request_id, request_seq
)

award_notification(notification_id, ecopoints_award_id)
```

The source-table primary keys are also FKs to `notification`, and every notification must appear in exactly one source table. `request_notification` references the complete `(pickup_request_id, request_seq)` key of `request_event`. `award_notification.ecopoints_award_id` is required and unique for BR48's one notification per award. Its recipient is obtained through the award's earned role.

The source subtypes reconstruct the original notification losslessly. Recombining a notification with its one source restores its request/event or award and its recipient. The union is disjoint because the source membership is exclusive. Notification type must still agree with its source. Award notifications retain their non-expiring behavior, and account deactivation still removes the relevant notifications (BR47–BR49).

## Historical facts and derived values

### Pickup address

`resident.street` and `resident.postal_code` describe the current profile address. `pickup_request.pickup_street` and `pickup_postal_code` describe the address captured for that request (BR34). A resident can change their profile after their active work ends, while completed requests retain their original addresses. Therefore, the resident ID does not determine one historical pickup address across all of their requests.

These are different temporal facts. Replacing every historical pickup address with a join to the current resident row would change the meaning of old requests. The proposed request decomposition retains the historical address. Further grouping by submission would require an explicit submission identity and guarantees about which creation facts are shared; those dependencies are not assumed here.

### Estimated weight

The standard weight in `item_category` is the current category value. BR31 states that changing it does not recalculate existing requests. Thus `(category_id, quantity) → estimated_weight_kg` does not hold across all valid requests: identical categories and quantities can have different stored estimates when created or edited under different standard weights.

The estimate is a request-level historical calculation, retained and recalculated only when the request is created or edited. It must be calculated by the system. The normalization review does not introduce an undeclared current-weight dependency or remove the historical estimate.

### Award points and formula

Points and formula text are retained at award creation (BR41). A reopened request may later change after a cancellation award, and later formula changes affect new awards. Joining an old award to current request values and recomputing its points would not preserve the recorded award fact.

Role-specific award identity, points and the formula actually used must therefore be retained. Repeated formula text alone does not establish `earned_role → formula`, since the rules allow formula changes over time. The proposed subtype mapping removes redundant actor references while keeping the award facts.

### Values already derived from their source relations

| Value | Source |
|---|---|
| Current request status | Latest `status_change` for the request (BR45) |
| Assignment status | Collection and ending fields (BR24) |
| Request expiry | Latest active window start (BR33) |
| Delivery time | Assignment ending time for a Delivered assignment (BR44) |
| Award kind and time | Assignment end reason and ending time (BR57) |
| Combined EcoPoints | Sum of resident and volunteer awards (BR12) |
| Eligible facilities | Request category joined to `facility_accepts` (BR59) |
| Notification title and body | Related source facts, as specified in BR58 |

Maintaining these values in additional writable columns would create extra synchronization obligations. The model derives them from their existing sources.

## Proposed 3NF result and integration checks

Relations with straightforward key dependencies can remain as mapped: `account`, `resident`, `volunteer`, `volunteer_preferred_postal_code`, `push_subscription`, `terms_document`, `terms_acceptance`, `item_category`, `photo`, `pickup_window`, `status_change`, `delivery`, `recycling_facility` and `facility_accepts`.

The proposed request and assignment relations remove the identified non-key actor/request determinants. The award subtypes record only role membership, while award-specific facts remain under the award key. The notification subtypes separate recipients that must be supplied from recipients determined by an award. Event and changed-field relations replace the structured metadata values. Their keys and dependencies must be incorporated into the updated logical schema and constraints before the complete 3NF claim is finalized.

| Required alignment | Review check |
|---|---|
| Conceptual-to-logical mapping | Preserve ownership, assignment participation, earned-role and notification-source relationships when their physical representation changes. Document the new role/source subtypes and metadata mapping. |
| Functional dependencies | Confirm the assignment-acceptance candidate-key rule and the event/action identity used for edit facts. Record every resulting PK, alternate key and FK. |
| Logical diagram and README | Apply the agreed decompositions, revise relation definitions and replace the obsolete duplicate-column and composite-FK descriptions. |
| Physical implementation | Replace direct ownership/request lookups with the required joins or compatibility views. Preserve active-assignment uniqueness, actor/action validation, source exclusivity, role exclusivity and per-role award uniqueness. |
| Services and contract readers | Coordinate changes with the User, Request, Reward and Notification readers listed in contract section 8. Review storage changes without silently changing API behavior. |
| Population and queries | Populate the revised relations in FK order and update the operations and joins to the selected mapping. |
| Tests | Demonstrate lossless reconstruction, shared Q4 acceptance, multiple ended assignments on one window, self-delivery, eligible cancellation awards, repeated event recipients and historical address/weight/formula preservation. |

Check constraints, foreign keys and transactions remain necessary after normalization. They enforce value domains, participation, timing and cross-row business rules. Their presence does not replace the dependency analysis, and normalization does not replace their enforcement.

The final submission can claim 3NF when the agreed corrections, their keys and their business-rule enforcement are represented consistently in the conceptual mapping, logical schema, SQL, data, operations and test results.
