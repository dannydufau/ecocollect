INSERT INTO users.terms_document (terms_document_id, content, published_at) VALUES
('00000001-0000-4000-8000-000000000002', 'EcoCollect terms version 2', '2026-11-01T00:00:00Z')
ON CONFLICT (terms_document_id) DO NOTHING;
