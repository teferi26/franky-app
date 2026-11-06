-- Defense in depth for transaction-bound permits. The schema and table stay
-- inaccessible to clients; owner-executed functions retain their current behavior.
ALTER TABLE workspace_private.visit_reschedule_permits ENABLE ROW LEVEL SECURITY;
