#### 1NF: ATOMICITY

No multivalued attributes. Name is split into `first_name` and `last_name`, and Address into `street` and `postal_code`. The preferred postal codes (up to three) are rows in `volunteer_preferred_postal_code`, not a list in a column.

#### 2NF: PARTIAL DEPENDENCIES

`account`, `resident` and `volunteer` each have a single-column key, so there cannot be a partial dependency.

`volunteer_preferred_postal_code` has a two-column key (`account_id`, `postal_code`). Its only other column, `preference_slot`, belongs to that exact pair (which code is in which slot for which volunteer), so it depends on the whole key.

#### 3NF: TRANSITIVE DEPENDENCIES

No non-key attributes depend on other non-key attributes.

Age is not stored. It would depend on `date_of_birth`, which is not a key, so it is worked out when needed. The same goes for Combined_Ecopoints, which is a sum of the awards.

`street` and `postal_code` are saved together on `resident` and do not decide each other, so there is nothing to split out. City is not stored for the same reason.

`public_name` is chosen by the person and does not depend on `first_name` or `last_name`.

#### BCNF

`volunteer_preferred_postal_code` has two candidate keys, (`account_id`, `postal_code`) and (`account_id`, `preference_slot`). Every dependency in the table starts from one of them, so it is in BCNF. The other tables have a single-column key and no other dependencies.
