SET
    search_path TO ecocollect608;

-- What happens to each request:
--   R1: Open
--   R2: Assigned to volunteer2
--   R3: Collected and delivered by volunteer3
--   R4: Collected and delivered by volunteer4
--   R5: Assigned to volunteer1, then cancelled by the resident (back to Open)
-- Needs the pickup requests, pickup windows, terms acceptances and recycling facilities to be seeded first.

INSERT INTO status_change (pickup_request_id, changed_at, status, reason) VALUES
    ('10000000-0000-4000-8000-000000000001', now() - interval '2 hours', 'Open', NULL),
    ('10000000-0000-4000-8000-000000000002', now() - interval '3 days', 'Open', NULL),
    ('10000000-0000-4000-8000-000000000002', now() - interval '2 days', 'Assigned', NULL),
    ('10000000-0000-4000-8000-000000000003', now() - interval '5 days', 'Open', NULL),
    ('10000000-0000-4000-8000-000000000003', now() - interval '4 days', 'Assigned', NULL),
    ('10000000-0000-4000-8000-000000000003', now() - interval '3 days', 'Collected', NULL),
    ('10000000-0000-4000-8000-000000000003', now() - interval '3 days' + interval '2 hours', 'Delivered', NULL),
    ('10000000-0000-4000-8000-000000000004', now() - interval '6 days', 'Open', NULL),
    ('10000000-0000-4000-8000-000000000004', now() - interval '5 days', 'Assigned', NULL),
    ('10000000-0000-4000-8000-000000000004', now() - interval '4 days', 'Collected', NULL),
    ('10000000-0000-4000-8000-000000000004', now() - interval '4 days' + interval '3 hours', 'Delivered', NULL),
    ('10000000-0000-4000-8000-000000000005', now() - interval '4 days', 'Open', NULL),
    ('10000000-0000-4000-8000-000000000005', now() - interval '3 days', 'Assigned', NULL),
    ('10000000-0000-4000-8000-000000000005', now() - interval '2 days', 'Open', 'Assignment cancelled by resident');

INSERT INTO assignment (assignment_id, pickup_request_id, account_id, pickup_window_id, terms_acceptance_id, accepted_at, collected_at, ended_at, end_reason) VALUES
    ('70000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'volunteer2', '20000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000006', now() - interval '2 days', NULL, NULL, NULL),
    ('70000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'volunteer3', '20000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000007', now() - interval '4 days', now() - interval '3 days', now() - interval '3 days' + interval '2 hours', 'Delivered'),
    ('70000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'volunteer4', '20000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000008', now() - interval '5 days', now() - interval '4 days', now() - interval '4 days' + interval '3 hours', 'Delivered'),
    ('70000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', 'volunteer1', '20000000-0000-4000-8000-000000000008', '40000000-0000-4000-8000-000000000009', now() - interval '3 days', NULL, now() - interval '2 days', 'Resident_Cancelled');

INSERT INTO delivery (delivery_id, assignment_id, facility_id, evidence_photo) VALUES
    ('90000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000003', '80000000-0000-4000-8000-000000000001', 'https://example.com/evidence/monitor.jpg'),
    ('90000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000004', '80000000-0000-4000-8000-000000000002', NULL);
