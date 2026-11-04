### RELATIONSHIP MAPPINGS

#### TABLE: TERMS_ACCEPTANCE

Every TERMS_ACCEPTANCE belongs to exactly one TERMS_DOCUMENT. TERMS_DOCUMENT has a one to many relationship with TERMS_ACCEPTANCE (TERMS_DOCUMENT 1..1 : TERMS_ACCEPTANCE 0..N). Therefore, TERMS_ACCEPTANCE gets a foreign key from TERMS_DOCUMENT.

Every TERMS_ACCEPTANCE belongs to exactly one ACCOUNT. ACCOUNT has a one to many relationship with TERMS_ACCEPTANCE (ACCOUNT 1..1 : TERMS_ACCEPTANCE 1..N). Therefore, TERMS_ACCEPTANCE gets a foreign key from ACCOUNT.

#### TABLE: ECOPOINTS_AWARD

Every ECOPOINTS_AWARD belongs to exactly one ACCOUNT. ACCOUNT has a one to many relationship with ECOPOINTS_AWARD (ACCOUNT 1..1 : ECOPOINTS_AWARD 0..N). Therefore, ECOPOINTS_AWARD gets a foreign key from ACCOUNT.

Every ECOPOINTS_AWARD is generated from exactly one ASSIGNMENT. ASSIGNMENT has a one to many relationship with ECOPOINTS_AWARD (ASSIGNMENT 1..1 : ECOPOINTS_AWARD 0..2). Therefore, ECOPOINTS_AWARD gets a foreign key from ASSIGNMENT.

#### TABLE: NOTIFICATION

Every NOTIFICATION is linked to exactly one PICKUP_REQUEST.
PICKUP_REQUEST has a one to many relationship with NOTIFICATION (PICKUP_REQUEST 1..1 : NOTIFICATION 1..N). Therefore, NOTIFICATION gets a foreign key from PICKUP_REQUEST.

Similarly, Every NOTIFICATION is linked to exactly one ACCOUNT. ACCOUNT has a one to many relationship with NOTIFICATION (ACCOUNT 1..1 : NOTIFICATION 0..N). Therefore, NOTIFICATION gets a foreign key from ACCOUNT.

Every ECOPOINTS_AWARD generates a NOTIFICATION, but not every NOTIFICATION is associated with an ECOPOINTS_AWARD (ECOPOINTS_AWARD 0..1 : NOTIFICATION 1..1). Since ECOPOINTS_AWARD is created first, NOTIFICATION gets an optional foreign key from ECOPOINTS_AWARD, if the NOTIFICATION was created for an ECOPOINTS_AWARD record.
