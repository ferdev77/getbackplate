DELETE FROM integration_run_items WHERE organization_id = '55fa3893-666f-4562-a39e-fae5fe06d6f1';
DELETE FROM integration_outbox_files WHERE organization_id = '55fa3893-666f-4562-a39e-fae5fe06d6f1';
DELETE FROM integration_runs WHERE organization_id = '55fa3893-666f-4562-a39e-fae5fe06d6f1';
UPDATE integration_settings SET last_run_at = NULL WHERE organization_id = '55fa3893-666f-4562-a39e-fae5fe06d6f1';
UPDATE qbo_r365_sync_configs SET last_run_at = NULL WHERE organization_id = '55fa3893-666f-4562-a39e-fae5fe06d6f1';
SELECT 'limpio' AS resultado;
