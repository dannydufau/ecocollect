### ENTITY MAPPINGS

#### TABLE: ACCOUNT

ACCOUNT is the strong entity, so it has no foreign key. Its key is `account_id`, the username the person picks. It is also their Firebase uid, so there is only one id to keep track of.

The composite attribute Name is split into `first_name` and `last_name`. `public_name` is the name shown on the public page.

Age is derived from `date_of_birth`, so it is not stored. Email and the roles are kept in Firebase, so they are not columns here.

### RELATIONSHIP MAPPINGS

#### TABLE: RESIDENT

Every RESIDENT is exactly one ACCOUNT. An ACCOUNT has at most one RESIDENT (ACCOUNT 1..1 : RESIDENT 0..1). Therefore, RESIDENT gets a foreign key from ACCOUNT. The relationship is one to one, so that foreign key is also the primary key of RESIDENT.

The composite attribute Address is split into `street` and `postal_code`.

#### TABLE: VOLUNTEER

Every VOLUNTEER is exactly one ACCOUNT. An ACCOUNT has at most one VOLUNTEER (ACCOUNT 1..1 : VOLUNTEER 0..1). Therefore, VOLUNTEER gets a foreign key from ACCOUNT. The relationship is one to one, so that foreign key is also the primary key of VOLUNTEER.

An ACCOUNT can have a row in both RESIDENT and VOLUNTEER (overlapping), which is how a person has both roles. The roles are worked out from which rows exist, so there is no role column.

#### TABLE: VOLUNTEER_PREFERRED_POSTAL_CODE

Preferred_Postal_Code is a multivalued attribute of VOLUNTEER, so it becomes its own table. Every row belongs to exactly one VOLUNTEER. A VOLUNTEER has zero to three preferred postal codes (VOLUNTEER 1..1 : VOLUNTEER_PREFERRED_POSTAL_CODE 0..3). Therefore, VOLUNTEER_PREFERRED_POSTAL_CODE gets a foreign key from VOLUNTEER.

The key is (`account_id`, `postal_code`), so the same code cannot be saved twice. The `preference_slot` column (1 to 3) with UNIQUE (`account_id`, `preference_slot`) is what stops a fourth code.

### NOT ENFORCED IN THE TABLES

- Every ACCOUNT must have at least one role (total specialization). A new account and its role row are created together, so this is checked when the person registers.
- A resident cannot change their address while they have an uncollected request. This needs `pickup_request`, so it is checked in the app (or a trigger, later).
- Accounts are deactivated, not deleted, so the foreign keys from RESIDENT and VOLUNTEER use ON DELETE RESTRICT. Preferences are deleted along with their volunteer (ON DELETE CASCADE).

### FOR THE OTHER TABLES

Anything that points at a person should reference `account(account_id)` (TEXT). A table that only makes sense for one role can point at `resident(account_id)` or `volunteer(account_id)` instead, for example `pickup_request`.
