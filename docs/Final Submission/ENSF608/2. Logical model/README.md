# Logical database model

Open `Logical Database Model.drawio` in draw.io. It contains the relational schema, attribute types, primary keys and foreign-key arrows. The rules below complete the model with nullability, constraints and the explanation of how the conceptual model maps to relations.

The sources are the conceptual ER diagram in `../1. Conceptual Model(ER diagram)/ER-Diagram.drawio`, its business rules, the ENSF607 requirements, and `contracts/README.md`. This document specifies the logical model. Database migrations implement these constraints in the physical model.

## Mapping from the conceptual model

| Conceptual element | Relational mapping |
|---|---|
| ACCOUNT, RESIDENT and VOLUNTEER | Each has its own table. `resident.account_id` and `volunteer.account_id` are both primary keys and foreign keys to `account.account_id`. An account may occur in both subtype tables and must occur in at least one (BR1). The account ID is the immutable username and Firebase UID. Email is held by Firebase (BR56). |
| Preferred postal codes | The multivalued volunteer attribute becomes `volunteer_preferred_postal_code(account_id, postal_code)`. Its composite primary key prevents repeated codes for one volunteer (BR9). |
| Facility acceptance | The many-to-many relationship between facilities and categories becomes `facility_accepts(facility_id, category_id)`. Both columns form its primary key and reference their parent tables. |
| STATUS_CHANGE | This weak entity uses `(pickup_request_id, changed_at)` as its composite primary key. The request ID is also a foreign key. Every request starts with an Open history entry, and later entries are append-only (BR16–BR18). |
| Request owner and category | `pickup_request.account_id` references `resident.account_id`, and `category_id` references `item_category.category_id`. Each request has one owner and one category. The pickup address is copied at creation (BR13, BR34). |
| Pickup windows and assignments | Each window references its request. Each assignment references a request, volunteer, offered window and terms acceptance. The window and request must agree (BR19). Ended assignments and inactive windows remain as history. |
| Delivery | `delivery.assignment_id` references an assignment and is unique. Each delivery references one facility and one required evidence photo. This maps the assignment's optional one-to-one delivery relationship (BR25). |
| EcoPoints recipient | `ecopoints_award` references its assignment and either a resident or a volunteer. Exactly one recipient foreign key is populated (BR11). A self-delivery creates two award rows, one for each role. |
| Notifications | Each notification references one account and exactly one source, either a pickup request or an EcoPoints award (BR10, BR48). |
| Photos | `photo.file_id` is the ImageKit key. An optional request foreign key permits item photos to be reused by rescheduled requests. A delivery has one required evidence photo. A photo belongs to the request-photo relationship or the delivery-photo relationship (BR51, BR60). |
| Terms and push subscriptions | Each acceptance references an account and a terms document. Each subscription references an account and is identified by its endpoint. Request and assignment acceptances must belong to their respective actors (BR29, BR43). |
| Rescheduling | The nullable self-reference `rescheduled_from_request_id` links a new request to its missed predecessor. Its uniqueness allows each missed request to be rescheduled once (BR50). |
| Derived attributes | Request status comes from the latest status change. Assignment status comes from collection and ending fields. Delivery time comes from assignment ending time. Award kind and time come from its assignment. EcoPoints totals, expiry and eligible facilities are computed from their source relations (BR12, BR24, BR33, BR44–BR45, BR57, BR59). |

## Nullability

All primary-key columns are required. Every column is `NOT NULL` except the columns explicitly listed below. Composite foreign keys require all their columns.

| Relation | Nullable columns and meaning |
|---|---|
| `account` | `deactivated_at` until deactivation. |
| `resident` | None. Street and Calgary postal code are required. |
| `volunteer` | None. |
| `volunteer_preferred_postal_code` | None. Zero saved codes is represented by zero rows. |
| `push_subscription` | `expiration_time` when the push service supplies no expiry, and `user_agent` when unavailable. |
| `terms_document` | None. |
| `terms_acceptance` | None. |
| `item_category` | None. |
| `photo` | None. Both the ImageKit file ID and path are required. |
| `pickup_request` | `notes`, `file_id` when there is no item photo, and `rescheduled_from_request_id` for an original request. |
| `pickup_window` | None. |
| `status_change` | `reason` when no explanation was supplied. |
| `assignment` | `collected_at` before collection, and `ended_at` / `end_reason` until ending. Both ending fields must be null together or set together (BR23). |
| `delivery` | None. The assignment, facility and evidence `file_id` are required. |
| `recycling_facility` | `special_instructions` when absent. |
| `facility_accepts` | None. |
| `ecopoints_award` | `resident_id` and `volunteer_id`, with exactly one non-null. |
| `notification` | `pushed_at` until a push is actually sent, plus `pickup_request_id` and `ecopoints_award_id`, with exactly one source non-null. Metadata is a required JSON object, which may be empty. |

## Value constraints

- `account_id` uses `VARCHAR(50)` throughout. Account IDs are 3–50 lowercase characters from `a-z`, `0-9`, `_` and `-` (contract Conventions). Required names and IDs must contain text.
- Postal codes use `CHAR(6)`, uppercase with no spaces, in Canadian letter-digit-letter-digit-letter-digit form. Calgary validity is checked during account/profile validation (BR7).
- `pickup_request.quantity` is an integer greater than zero. Category standard weight and request estimated weight are positive exact decimals. The stored request weight is calculated from quantity and the category weight when created or edited (BR30–BR31).
- `pickup_window.start_hour` is an integer from 0 through 23. A window stores its Calgary date and hour directly. The server validates future start times and the original creation-time limit, retaining inactive history (BR32–BR36).
- `status_change.status` is one of `Open`, `Assigned`, `Collected`, `Delivered`, `Cancelled`, `Expired`, `Missed`. `reason` is optional free text (BR17–BR18).
- Non-null `assignment.end_reason` is one of `Delivered`, `Resident_Cancelled`, `Volunteer_Cancelled`, `Missed_Pickup`. Collection cannot precede acceptance, and ending cannot precede acceptance or collection. A Delivered assignment must have been collected (BR21–BR26).
- `terms_acceptance.type` is one of `AT_RESIDENT_REGISTRATION_OR_ACTIVATION`, `AT_VOLUNTEER_REGISTRATION_OR_ACTIVATION`, `AT_RESIDENT_REQUEST_CREATION`, `AT_VOLUNTEER_ACCEPTANCE`.
- `notification.type` uses the closed list from contract section 13.1, reproduced in the diagram's domain-rules panel. `is_read`, `is_expired` and window `is_active` are required booleans.
- EcoPoints use exact `NUMERIC(23,2)` values and store the formula text used at award time. Volunteer points are `3 * quantity + 4 * estimated_weight_kg`, and resident points are half the volunteer points, following BR41 and contract section 15.1.

## Relationship and uniqueness constraints

| Rule | Logical constraint / enforcement |
|---|---|
| Assignment uses a window from its own request (BR19) | `UNIQUE (pickup_request_id, pickup_window_id)` on `pickup_window`, with composite foreign key `assignment(pickup_request_id, pickup_window_id)` referencing that pair. |
| One unfinished assignment per request (BR20) | Partial unique index on `assignment(pickup_request_id)` where `ended_at IS NULL`. |
| One delivery per assignment (BR25) | `UNIQUE (assignment_id)` on `delivery`. |
| A missed request is rescheduled once (BR50) | `UNIQUE (rescheduled_from_request_id)` on `pickup_request`. The server also verifies that the referenced request was reported missed and prevents self-reference. |
| Exactly one award recipient (BR11) | `CHECK ((resident_id IS NOT NULL) <> (volunteer_id IS NOT NULL))`. |
| At most one award per assignment and role (BR55) | Separate partial unique indexes on `assignment_id`, one where `resident_id IS NOT NULL`, the other where `volunteer_id IS NOT NULL`. |
| Exactly one notification source (BR48) | `CHECK ((pickup_request_id IS NOT NULL) <> (ecopoints_award_id IS NOT NULL))`. |
| Ending fields agree (BR23) | `CHECK ((ended_at IS NULL) = (end_reason IS NULL))`, together with the allowed end-reason values. |
| No repeated preferred code or facility/category pair | Composite primary keys on the two relationship tables. |
| No repeated active pickup slot | Partial unique index on `(pickup_request_id, pickup_date, start_hour)` where `is_active = TRUE`. Historical inactive rows are retained. |
| A delivery photo belongs to one delivery (BR60) | `UNIQUE (file_id)` on `delivery`. A transaction/trigger verifies that the photo is not also referenced by a pickup request. Multiple requests may share an item photo after rescheduling. |

The following rules involve several rows or time-dependent decisions. Enforce them in transactions that lock the relevant account/request/assignment, or with equivalent concurrency-safe database triggers. They cannot be expressed by an ordinary row-level check alone.

- Every account has at least one role and is at least 18 at registration (BR1, BR6).
- A volunteer has at most three preferred postal codes (BR9).
- A request has one to three active, valid pickup windows and an initial status-change entry (BR16, BR32).
- Terms acceptances use the current document, correct actor and action type (BR29, BR38, BR43, BR54).
- Delivery requires collection and a facility that accepts the request's category (BR25–BR28).
- Award recipients match the assignment volunteer or request resident. Cancellation and self-delivery follow BR11 and contract section 15.
- Address edits, cancellation, collection, missed-pickup reports, expiry and deactivation follow their server transition rules (BR8, BR22, BR35, BR53).

## Reference data

The category table uses predefined categories with a required name, waste type and standard weight (BR37).
