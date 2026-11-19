# Logical database model

This logical schema contains 25 relations and 100 attributes. Open `Logical Database Model.drawio` for the horizontal relation tables and foreign-key arrows, with the relational schema in the yellow notes panel. The additional pages cover conceptual mapping, nullability, domains, integrity rules and derived data. The [normalization document](<../3. Normalization/README.md>) explains the functional dependencies and the decompositions adopted in this mapping.

The [conceptual model](<../1. Conceptual Model(ER diagram)/ER-Diagram.drawio>) supplies the business rules. Normalization maps ownership and assignment participation through existing keys, uses role/source subtypes, and separates multivalued event facts into relations.

Service-support tables for outbox messages, idempotency keys, processed events and expiry jobs are outside this course model; they are specified separately in the implementation contract.

The conceptual ER diagram shows request events, update events, changed fields and the two notification source subtypes. These map to `request_event`, `request_update_event`, `request_changed_field`, `request_notification` and `award_notification`.

## Conceptual-to-relational mapping

| Conceptual information | Relational representation |
|---|---|
| Account and roles | `account` stores shared facts. `resident` and `volunteer` use its key as both PK and FK. Membership is overlapping and total: every account has one or both roles (BR1). |
| Preferred postal codes | `volunteer_preferred_postal_code` has one row per volunteer/code pair, with no repeated codes and at most three per volunteer (BR9). |
| Resident owns a request | `pickup_request.terms_acceptance_id` identifies the request-creation acceptance and its resident account. Q4 can share that acceptance across several item requests. Ownership is obtained through this required relationship (BR13, BR43). |
| Request address and item | Each request stores one category, quantity, historical estimated weight and pickup-address snapshot. The category reference supplies its description and current standard weight (BR30–BR35). |
| Windows and status history | Window rows contain individual Calgary slots. `status_change` uses `(pickup_request_id, changed_at)` for append-only history. A request starts Open (BR16–BR18, BR32, BR36). |
| Assignment participation | The selected window identifies the request. The volunteer-acceptance row identifies the volunteer. `assignment` stores its own acceptance, collection and ending facts (BR19–BR29). |
| Delivery and facilities | `delivery` has unique assignment and evidence-photo references. `facility_accepts` maps the facility/category relationship. Every facility accepts at least one category, and every category has at least one accepting facility (BR25–BR28, BR66). |
| Award earned through a role | `ecopoints_award` stores assignment, points and the formula used. Exactly one of `resident_award` or `volunteer_award` contains its key. The corresponding actor is derived through the assignment (BR11, BR41, BR55). |
| Notification source | Exactly one of `request_notification` or `award_notification` contains each notification key. Request notifications store their recipient. Award notifications derive their recipient through the award (BR10, BR48). |
| Event metadata | `request_event` stores request sequence and action identity. `request_update_event` stores the update reason. `request_changed_field` stores one changed field per row. Notifications reference their event (BR58, BR61). |
| Photos | `photo.file_id` is the ImageKit key. Requests may share an item photo after rescheduling. One delivery has one unique evidence photo, and item and evidence use are exclusive (BR51, BR60). |
| Terms and subscriptions | Each acceptance identifies one account, document, action and time. Each subscription endpoint identifies one browser subscription (BR2, BR29, BR38, BR40, BR43, BR54). |
| Rescheduling | A nullable unique predecessor reference links a replacement request to one Missed request. Each predecessor has at most one replacement (BR50). |

## Complete relational schema

All attributes are required except those marked `NULL`. `PK` identifies the primary key. `UQ` identifies declared uniqueness, with the nullable predecessor qualification stated below. All foreign keys reference the listed parent keys. Account identifiers use `VARCHAR(50)` throughout.

### `account`

```text
account(
    account_id VARCHAR(50) NOT NULL,
    first_name VARCHAR(80) NOT NULL,
    last_name VARCHAR(80) NOT NULL,
    public_name VARCHAR(80) NOT NULL,
    date_of_birth DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    deactivated_at TIMESTAMPTZ NULL
)
```

- PK `(account_id)`.

### `resident`

```text
resident(
    account_id VARCHAR(50) NOT NULL,
    street VARCHAR(255) NOT NULL,
    postal_code CHAR(6) NOT NULL
)
```

- PK `(account_id)`.
- FK `(account_id)` → `account(account_id)`.

### `volunteer`

```text
volunteer(
    account_id VARCHAR(50) NOT NULL
)
```

- PK `(account_id)`.
- FK `(account_id)` → `account(account_id)`.

### `volunteer_preferred_postal_code`

```text
volunteer_preferred_postal_code(
    account_id VARCHAR(50) NOT NULL,
    postal_code CHAR(6) NOT NULL
)
```

- PK `(account_id, postal_code)`.
- FK `(account_id)` → `volunteer(account_id)`.

### `push_subscription`

```text
push_subscription(
    endpoint TEXT NOT NULL,
    account_id VARCHAR(50) NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    expiration_time TIMESTAMPTZ NULL,
    user_agent TEXT NULL,
    updated_at TIMESTAMPTZ NOT NULL
)
```

- PK `(endpoint)`.
- FK `(account_id)` → `account(account_id)`.

### `terms_document`

```text
terms_document(
    terms_document_id UUID NOT NULL,
    content TEXT NOT NULL,
    published_at TIMESTAMPTZ NOT NULL
)
```

- PK `(terms_document_id)`.

### `terms_acceptance`

```text
terms_acceptance(
    terms_acceptance_id UUID NOT NULL,
    terms_document_id UUID NOT NULL,
    account_id VARCHAR(50) NOT NULL,
    accepted_at TIMESTAMPTZ NOT NULL,
    type VARCHAR(40) NOT NULL
)
```

- PK `(terms_acceptance_id)`.
- FK `(account_id)` → `account(account_id)`.
- FK `(terms_document_id)` → `terms_document(terms_document_id)`.

### `item_category`

```text
item_category(
    category_id TEXT NOT NULL,
    name VARCHAR(120) NOT NULL,
    waste_type VARCHAR(120) NOT NULL,
    standard_weight_kg NUMERIC(10,2) NOT NULL
)
```

- PK `(category_id)`.

### `photo`

```text
photo(
    file_id TEXT NOT NULL,
    file_path TEXT NOT NULL
)
```

- PK `(file_id)`.

### `pickup_request`

```text
pickup_request(
    pickup_request_id UUID NOT NULL,
    category_id TEXT NOT NULL,
    terms_acceptance_id UUID NOT NULL,
    quantity INTEGER NOT NULL,
    estimated_weight_kg NUMERIC(22,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    request_seq BIGINT NOT NULL,
    pickup_street VARCHAR(255) NOT NULL,
    pickup_postal_code CHAR(6) NOT NULL,
    notes TEXT NULL,
    file_id TEXT NULL,
    rescheduled_from_request_id UUID NULL
)
```

- PK `(pickup_request_id)`.
- UQ `(rescheduled_from_request_id)`.
- FK `(category_id)` → `item_category(category_id)`.
- FK `(file_id)` → `photo(file_id)`.
- FK `(rescheduled_from_request_id)` → `pickup_request(pickup_request_id)`.
- FK `(terms_acceptance_id)` → `terms_acceptance(terms_acceptance_id)`.

### `pickup_window`

```text
pickup_window(
    pickup_window_id UUID NOT NULL,
    pickup_request_id UUID NOT NULL,
    pickup_date DATE NOT NULL,
    start_hour SMALLINT NOT NULL,
    is_active BOOLEAN NOT NULL
)
```

- PK `(pickup_window_id)`.
- FK `(pickup_request_id)` → `pickup_request(pickup_request_id)`.

### `status_change`

```text
status_change(
    pickup_request_id UUID NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(30) NOT NULL,
    reason TEXT NULL
)
```

- PK `(pickup_request_id, changed_at)`.
- FK `(pickup_request_id)` → `pickup_request(pickup_request_id)`.

### `assignment`

```text
assignment(
    assignment_id UUID NOT NULL,
    pickup_window_id UUID NOT NULL,
    terms_acceptance_id UUID NOT NULL,
    accepted_at TIMESTAMPTZ NOT NULL,
    collected_at TIMESTAMPTZ NULL,
    ended_at TIMESTAMPTZ NULL,
    end_reason VARCHAR(30) NULL
)
```

- PK `(assignment_id)`.
- FK `(terms_acceptance_id)` → `terms_acceptance(terms_acceptance_id)`.
- FK `(pickup_window_id)` → `pickup_window(pickup_window_id)`.

### `recycling_facility`

```text
recycling_facility(
    facility_id UUID NOT NULL,
    name VARCHAR(120) NOT NULL,
    street VARCHAR(255) NOT NULL,
    postal_code CHAR(6) NOT NULL,
    special_instructions TEXT NULL
)
```

- PK `(facility_id)`.

### `facility_accepts`

```text
facility_accepts(
    facility_id UUID NOT NULL,
    category_id TEXT NOT NULL
)
```

- PK `(facility_id, category_id)`.
- FK `(category_id)` → `item_category(category_id)`.
- FK `(facility_id)` → `recycling_facility(facility_id)`.

### `delivery`

```text
delivery(
    delivery_id UUID NOT NULL,
    assignment_id UUID NOT NULL,
    facility_id UUID NOT NULL,
    file_id TEXT NOT NULL
)
```

- PK `(delivery_id)`.
- UQ `(assignment_id)`.
- UQ `(file_id)`.
- FK `(assignment_id)` → `assignment(assignment_id)`.
- FK `(facility_id)` → `recycling_facility(facility_id)`.
- FK `(file_id)` → `photo(file_id)`.

### `ecopoints_award`

```text
ecopoints_award(
    ecopoints_award_id UUID NOT NULL,
    assignment_id UUID NOT NULL,
    points NUMERIC(23,2) NOT NULL,
    formula TEXT NOT NULL
)
```

- PK `(ecopoints_award_id)`.
- FK `(assignment_id)` → `assignment(assignment_id)`.

### `resident_award`

```text
resident_award(
    ecopoints_award_id UUID NOT NULL
)
```

- PK `(ecopoints_award_id)`.
- FK `(ecopoints_award_id)` → `ecopoints_award(ecopoints_award_id)`.

### `volunteer_award`

```text
volunteer_award(
    ecopoints_award_id UUID NOT NULL
)
```

- PK `(ecopoints_award_id)`.
- FK `(ecopoints_award_id)` → `ecopoints_award(ecopoints_award_id)`.

### `notification`

```text
notification(
    notification_id UUID NOT NULL,
    type VARCHAR(80) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    pushed_at TIMESTAMPTZ NULL,
    is_read BOOLEAN NOT NULL,
    is_expired BOOLEAN NOT NULL
)
```

- PK `(notification_id)`.

### `request_event`

```text
request_event(
    pickup_request_id UUID NOT NULL,
    request_seq BIGINT NOT NULL,
    transition_id UUID NOT NULL
)
```

- PK `(pickup_request_id, request_seq)`.
- FK `(pickup_request_id)` → `pickup_request(pickup_request_id)`.

### `request_update_event`

```text
request_update_event(
    pickup_request_id UUID NOT NULL,
    request_seq BIGINT NOT NULL,
    reason VARCHAR(10) NOT NULL
)
```

- PK `(pickup_request_id, request_seq)`.
- FK `(pickup_request_id, request_seq)` → `request_event(pickup_request_id, request_seq)`.

### `request_changed_field`

```text
request_changed_field(
    pickup_request_id UUID NOT NULL,
    request_seq BIGINT NOT NULL,
    field_name VARCHAR(20) NOT NULL
)
```

- PK `(pickup_request_id, request_seq, field_name)`.
- FK `(pickup_request_id, request_seq)` → `request_update_event(pickup_request_id, request_seq)`.

### `request_notification`

```text
request_notification(
    notification_id UUID NOT NULL,
    account_id VARCHAR(50) NOT NULL,
    pickup_request_id UUID NOT NULL,
    request_seq BIGINT NOT NULL
)
```

- PK `(notification_id)`.
- FK `(notification_id)` → `notification(notification_id)`.
- FK `(account_id)` → `account(account_id)`.
- FK `(pickup_request_id, request_seq)` → `request_event(pickup_request_id, request_seq)`.

### `award_notification`

```text
award_notification(
    notification_id UUID NOT NULL,
    ecopoints_award_id UUID NOT NULL
)
```

- PK `(notification_id)`.
- UQ `(ecopoints_award_id)`.
- FK `(notification_id)` → `notification(notification_id)`.
- FK `(ecopoints_award_id)` → `ecopoints_award(ecopoints_award_id)`.

## Nullability and candidate keys

Nullable attributes are `account.deactivated_at`; `push_subscription.expiration_time` and `user_agent`; `pickup_request.notes`, `file_id` and `rescheduled_from_request_id`; `status_change.reason`; `assignment.collected_at`, `ended_at` and `end_reason`; `recycling_facility.special_instructions`; and `notification.pushed_at`.

All primary keys are candidate keys. `delivery.assignment_id` and `delivery.file_id` are additional candidate keys because each is required and unique. Both attributes of `award_notification` are candidate keys for the same reason. The nullable unique predecessor reference identifies a replacement only within the non-null subset, so it is not a candidate key for the whole request relation. Partial active-slot uniqueness also does not identify historical window rows globally.

## Value domains

| Attributes | Domain |
|---|---|
| Account IDs | 3–50 lowercase characters from `a-z`, `0-9`, `_` and `-`; immutable username and Firebase UID. Email is held by Firebase (BR3, BR56). |
| Required names, IDs and file paths | Non-empty text. |
| Postal codes | Six uppercase Canadian letter/digit characters with no space. Application validation checks the Calgary address (BR7). |
| Date of birth | At least 18 at registration; birth date cannot be in the future (BR6). |
| Quantity and weights | Positive integer quantity; positive exact standard and historical estimated weights. The system calculates the estimate at creation/edit (BR30–BR31). |
| `start_hour` | Integer 0–23. Dates and hours are stored as Calgary local calendar values (BR32). |
| Request/event sequences | Positive BIGINT. `pickup_request.request_seq` tracks the latest published event. `request_event.request_seq` is the historical sequence for the referenced event (BR61). |
| Status | `Open`, `Assigned`, `Collected`, `Delivered`, `Cancelled`, `Expired`, `Missed` (BR18). |
| End reason | `Delivered`, `Resident_Cancelled`, `Volunteer_Cancelled`, `Missed_Pickup` (BR23). |
| Terms type | `AT_RESIDENT_REGISTRATION_OR_ACTIVATION`, `AT_VOLUNTEER_REGISTRATION_OR_ACTIVATION`, `AT_RESIDENT_REQUEST_CREATION`, `AT_VOLUNTEER_ACCEPTANCE`. |
| Update reason | `edited` or `reopened`, from the RequestUpdated event. |
| Changed field | `category`, `quantity`, `notes`, `windows` or `photo`; rows occur only for an `edited` update. |
| Points and formula | Positive exact `NUMERIC(23,2)` points and the formula text used at award creation. Volunteer points are `3 * quantity + 4 * estimated_weight_kg`; resident points are half that amount (BR41). |
| Booleans | Required `is_active`, `is_read` and `is_expired` values. |

The request estimate uses `NUMERIC(22,2)` to accommodate an integer quantity multiplied by a `NUMERIC(10,2)` unit weight. Points use `NUMERIC(23,2)` to accommodate the reward formula while retaining exact decimals.

Notification type uses the closed list in [contract section 13.1](../../../../contracts/README.md#131-notification-types):

```text
REQUEST_CREATED
NEW_MATCHING_REQUEST
REQUEST_UPDATED_RESIDENT
REQUEST_ASSIGNED_RESIDENT
REQUEST_ASSIGNED_VOLUNTEER
REQUEST_COLLECTED_RESIDENT
REQUEST_COLLECTED_VOLUNTEER
REQUEST_DELIVERED_RESIDENT
REQUEST_DELIVERED_VOLUNTEER
ASSIGNMENT_CANCELLED_BY_RESIDENT_RESIDENT
ASSIGNMENT_CANCELLED_BY_RESIDENT_VOLUNTEER
ASSIGNMENT_CANCELLED_BY_VOLUNTEER_RESIDENT
ASSIGNMENT_CANCELLED_BY_VOLUNTEER_VOLUNTEER
ASSIGNMENT_MISSED_RESIDENT
ASSIGNMENT_MISSED_VOLUNTEER
REQUEST_CANCELLED_RESIDENT
REQUEST_EXPIRED_RESIDENT
ECOPOINTS_AWARDED_ON_DELIVERY_RESIDENT
ECOPOINTS_AWARDED_ON_DELIVERY_VOLUNTEER
ECOPOINTS_AWARDED_ON_ASSIGNMENT_CANCELLATION_VOLUNTEER
```

## Relationship and transaction constraints

| Rule | Required enforcement |
|---|---|
| Total account specialization | Every account has a resident row, a volunteer row or both. Serialize role changes on the account row and check the final state (BR1). |
| Preferred-code limit | Composite PK prevents duplicates. In a transaction, lock the volunteer row with `SELECT ... FOR UPDATE`, then check that the resulting list has at most three postal codes (BR9). |
| Request and assignment actors | In the insertion transaction, check that a request uses its resident's request-creation acceptance and an assignment uses its volunteer's acceptance. Check the account role, acceptance type and current terms document. Actor and acceptance links remain unchanged (BR29, BR38, BR43, BR54). |
| Request history | Each request has its initial Open entry. Later entries append in time order and are retained (BR16–BR18). |
| Active pickup slots | In a transaction, lock the request row with `SELECT ... FOR UPDATE`, then require one to three active windows and no duplicate `(pickup_request_id, pickup_date, start_hour)` among them. Each new window starts in the future and ends within 30 days of the original creation time (BR32–BR36). |
| Window history | Retain replaced windows as inactive. Assignments retain their selected window reference (BR36). |
| One unfinished assignment per request | In the Q11 transaction, first lock the request row with `SELECT ... FOR UPDATE`. Find its assignments through `pickup_window` and reject a new assignment if any has `ended_at IS NULL` (BR20). |
| Assignment ending | Ending fields are null together or set together. Collection follows acceptance; ending follows acceptance and collection. A Delivered ending requires collection and one delivery (BR21–BR26). |
| Delivery | Unique assignment and evidence photo; the facility accepts the request's category. Use a transaction for assignment ending and delivery insertion (BR25–BR28, BR44). |
| Facility acceptance | Every facility has at least one `facility_accepts` row, and every category appears in at least one such row. Check both requirements in the same transaction when changing these links (BR66). |
| Award role | Insert the award and exactly one `resident_award` or `volunteer_award` row in the same transaction. Insert the processed-event ID first; its primary key rejects repeat processing. Check at most one award per assignment and role in this transaction. Self-delivery creates one award per role; eligible resident cancellation creates only a volunteer award, excluding self-cancellation (BR11, BR55). |
| Notification source | Insert the notification and exactly one `request_notification` or `award_notification` row in the same transaction, checking that its type matches the source. The required unique award FK allows at most one notification per award (BR48). |
| Event identity | `(pickup_request_id, request_seq)` identifies an event. `transition_id` is not unique: cancellation/reopening and missed/rescheduled pairs share an action ID (contract 10.2). |
| Event details | An update-event subtype has reason `edited` or `reopened`. Its changed-field rows are distinct and permitted only for `edited`. Request notifications reference the whole event key (BR58). |
| Photos | Item photos may be shared by requests after rescheduling. In the transaction that attaches a photo, lock its row with `SELECT ... FOR UPDATE` and check that it is not used by both a delivery and a request (BR51, BR60). |
| Rescheduling | Predecessor reference is unique when present, is not self-referential, belongs to the same owner and points to a Missed request. Copy the specified item facts and record new terms/windows/address/creation time (BR50). |
| Deactivation and history | Apply active-work guards; retain historical requests, assignments and awards. Remove the account's notifications and subscriptions as specified (BR40, BR42, BR47, BR53). |

Rules involving several rows are checked in a transaction. Lock the relevant parent row with `SELECT ... FOR UPDATE` before reading and changing related rows. Use the lecture SQL features and transactions for these checks; do not rely on database triggers or partial indexes.

## Derived data and service reads

The normalized read paths are:

- Request owner: `pickup_request → terms_acceptance.account_id`.
- Assignment request: `assignment → pickup_window.pickup_request_id`.
- Assignment volunteer: `assignment → terms_acceptance.account_id`.
- Award role: membership in `resident_award` or `volunteer_award`.
- Resident award recipient: award → assignment → window → request → request acceptance → account.
- Volunteer award recipient: award → assignment → volunteer acceptance → account.
- Request notification recipient: `request_notification.account_id`.
- Award notification recipient: award notification → award → role-specific recipient path.
- Request notification metadata: its event's request sequence and transition ID, optional update reason, and the changed-field rows. Services can assemble the response metadata object from these scalar relations.

Request status, assignment status, request expiry, delivery time, award kind/time, EcoPoints totals, eligible facilities and notification title/body continue to be derived from their documented source facts (BR12, BR24, BR33, BR44–BR45, BR57–BR59). Historical pickup addresses, estimates and award formulas retain their time-specific meaning.

## Reference categories

| Category ID | Name | Waste type | Standard weight (kg) |
|---|---|---|---|
| `laptops` | Computers/Laptops | Computers | 2.50 |
| `desktops` | Computers/Desktops | Computers | 8.00 |
| `monitors` | Monitors | Displays | 5.00 |
| `tvs` | Televisions | Displays | 12.00 |
| `phones` | Phones | Mobile Devices | 0.20 |
| `tablets` | Tablets | Mobile Devices | 0.50 |
| `printers` | Printers | Printers | 6.00 |
| `small-appliances` | Small Appliances | Small Appliances | 3.00 |
| `cables-chargers` | Cables and Chargers | Accessories | 0.30 |

## Physical implementation

The SQL implementation must follow this 25-relation mapping, including its keys, domains and cross-row constraints. Service joins, seed scripts, operations and tests must use the same relations. Contract section 8 identifies the User, Request, Reward and Notification readers. Compatibility views or service projections can supply their API fields from the normalized relations.

The Notification Service owns the event/detail/source relations that store its consumed event facts. Request Service publishes the request sequences and transition IDs used by these relations.
