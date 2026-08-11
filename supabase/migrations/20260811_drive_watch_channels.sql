-- Google Drive push-notification (webhook) state, one channel per connection. Lets new
-- or changed documents get indexed within seconds of being added to Drive, instead of
-- waiting for an admin to click "Sync Now". Google requires a channel be renewed at
-- least every 7 days (max lifetime), so watch_expires_at is checked by a daily cron that
-- renews anything close to expiring — see /api/cron/renew-drive-watches.
--
-- watch_channel_token is a random secret generated at registration time and echoed back
-- by Google on every notification (X-Goog-Channel-Token header); the webhook receiver
-- checks it matches before processing, since Drive's push endpoint is publicly reachable
-- and can't authenticate with the app's normal Supabase-session bearer tokens.

ALTER TABLE public.drive_connections
    ADD COLUMN watch_channel_id TEXT,
    ADD COLUMN watch_resource_id TEXT,
    ADD COLUMN watch_channel_token TEXT,
    ADD COLUMN watch_page_token TEXT,
    ADD COLUMN watch_expires_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX drive_connections_watch_channel_id_idx ON public.drive_connections (watch_channel_id);
