-- Reward Service test seed, loaded by backend/scripts/reward/load-db.sh --test after
-- db/init (categories and the current terms document) and db/reward.
-- One delivered assignment with its two awards, and one active assignment without awards.
BEGIN;
SET search_path TO users, requests, rewards, pg_catalog;

INSERT INTO account (account_id, first_name, last_name, public_name, date_of_birth, created_at) VALUES
    ('resident1', 'Avery', 'Chen', 'Avery C.', '1995-01-15', '2026-11-01T00:00:00Z'),
    ('volunteer1', 'Maya', 'Brown', 'Maya B.', '1995-01-15', '2026-11-01T00:00:00Z');
INSERT INTO resident (account_id, street, postal_code) VALUES ('resident1', '100 Example Street SW', 'T2P1J9');
INSERT INTO volunteer (account_id) VALUES ('volunteer1');

INSERT INTO terms_acceptance (terms_acceptance_id, terms_document_id, account_id, accepted_at, type) VALUES
    ('f0000000-0000-4000-8000-000000000001', '00000001-0000-4000-8000-000000000002', 'resident1', '2026-11-10T00:00:00Z', 'AT_RESIDENT_REQUEST_CREATION'),
    ('f0000000-0000-4000-8000-000000000002', '00000001-0000-4000-8000-000000000002', 'volunteer1', '2026-11-11T00:00:00Z', 'AT_VOLUNTEER_ACCEPTANCE');

INSERT INTO pickup_request (pickup_request_id, category_id, terms_acceptance_id, quantity, estimated_weight_kg, created_at, request_seq, pickup_street, pickup_postal_code) VALUES
    ('b0000000-0000-4000-8000-000000000001', 'laptops', 'f0000000-0000-4000-8000-000000000001', 2, 5.00, '2026-11-10T00:00:00Z', 1, '100 Example Street SW', 'T2P1J9'),
    ('b0000000-0000-4000-8000-000000000002', 'phones', 'f0000000-0000-4000-8000-000000000001', 4, 0.80, '2026-11-10T00:00:00Z', 1, '100 Example Street SW', 'T2P1J9');

INSERT INTO pickup_window (pickup_window_id, pickup_request_id, pickup_date, start_hour, is_active) VALUES
    ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', '2026-11-12', 14, true),
    ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', '2026-11-12', 15, true);

INSERT INTO assignment (assignment_id, pickup_window_id, terms_acceptance_id, accepted_at, collected_at, ended_at, end_reason) VALUES
    ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', '2026-11-11T00:00:00Z', '2026-11-12T21:00:00Z', '2026-11-12T22:00:00Z', 'Delivered'),
    ('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000002', '2026-11-11T00:00:00Z', NULL, NULL, NULL);

INSERT INTO ecopoints_award (ecopoints_award_id, assignment_id, points, formula) VALUES
    ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 26.00, '3 * quantity + 4 * estimatedWeightKg'),
    ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 13.00, '(3 * quantity + 4 * estimatedWeightKg) / 2');
INSERT INTO volunteer_award (ecopoints_award_id) VALUES ('e0000000-0000-4000-8000-000000000001');
INSERT INTO resident_award (ecopoints_award_id) VALUES ('e0000000-0000-4000-8000-000000000002');

COMMIT;