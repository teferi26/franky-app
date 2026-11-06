-- Only the server may list, read, upload or overwrite review objects.
-- Approved public downloads use the public Storage URL, without client SQL access.
CREATE POLICY ugc_server_managed_objects ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated
USING (bucket_id NOT IN ('ugc-pending-image','ugc-pending-audio','ugc-pending-video','ugc-approved'))
WITH CHECK (bucket_id NOT IN ('ugc-pending-image','ugc-pending-audio','ugc-pending-video','ugc-approved'));
