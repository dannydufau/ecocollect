-- Reward Service course tables, in its own schema "rewards" (contract 2.1 and 8:
-- the Reward Service owns these tables). These definitions are the ENSF 608
-- physical implementation. The foreign key to assignment points to the requests
-- schema, which 010_request_tables.sql creates.
-- The service's operational tables and login are in db/reward/.

CREATE SCHEMA IF NOT EXISTS rewards;
SET search_path TO rewards, pg_catalog;

CREATE TABLE IF NOT EXISTS ecopoints_award (
    ecopoints_award_id UUID NOT NULL,
    assignment_id UUID NOT NULL,
    points NUMERIC(23,2) NOT NULL,
    formula TEXT NOT NULL,
    CONSTRAINT ecopoints_award_pk PRIMARY KEY (ecopoints_award_id),
    CONSTRAINT ecopoints_award_fk1 FOREIGN KEY (assignment_id)
        REFERENCES requests.assignment (assignment_id),
    CONSTRAINT ecopoints_award_ck1 CHECK (points > 0),
    CONSTRAINT ecopoints_award_ck2 CHECK (TRIM(formula) <> '')
);

CREATE TABLE IF NOT EXISTS resident_award (
    ecopoints_award_id UUID NOT NULL,
    CONSTRAINT resident_award_pk PRIMARY KEY (ecopoints_award_id),
    CONSTRAINT resident_award_fk1 FOREIGN KEY (ecopoints_award_id)
        REFERENCES ecopoints_award (ecopoints_award_id)
);

CREATE TABLE IF NOT EXISTS volunteer_award (
    ecopoints_award_id UUID NOT NULL,
    CONSTRAINT volunteer_award_pk PRIMARY KEY (ecopoints_award_id),
    CONSTRAINT volunteer_award_fk1 FOREIGN KEY (ecopoints_award_id)
        REFERENCES ecopoints_award (ecopoints_award_id)
);