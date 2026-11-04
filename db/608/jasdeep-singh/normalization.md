#### 1NF: ATOMICITY

No multivalued attributes.

#### 2NF: PARTIAL DEPENDENCIES

All non-key attributes depend on the primary key only.

#### 3NF: TRANSITIVE DEPENDENCIES

No non-key attributes depend on other non-key attributes.

`ecopoints_award.formula` can vary and there could be different values of `formula` for a same value of `ecopoints_award.role`. So, `formula` attribute isn't depended on role. New `formula` values could be later added to the enum `ecopoints_formula`.
Storing `formula` on each award also records how its points were calculated.