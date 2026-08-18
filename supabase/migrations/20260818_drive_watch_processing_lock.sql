-- Serializes Google Drive webhook processing per connection. Drive may send several
-- notifications for the same burst of changes; without a shared lock, separate Vercel
-- instances download and parse the same DOCX files concurrently.

ALTER TABLE public.drive_connections
    ADD COLUMN IF NOT EXISTS watch_processing_until TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS watch_processing_pending BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.claim_drive_watch_processing(
    p_connection_id BIGINT,
    p_lease_seconds INTEGER DEFAULT 120
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_until TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT watch_processing_until
      INTO current_until
      FROM public.drive_connections
     WHERE id = p_connection_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    IF current_until IS NOT NULL AND current_until > CURRENT_TIMESTAMP THEN
        UPDATE public.drive_connections
           SET watch_processing_pending = true
         WHERE id = p_connection_id;
        RETURN false;
    END IF;

    UPDATE public.drive_connections
       SET watch_processing_until = CURRENT_TIMESTAMP + make_interval(secs => GREATEST(30, p_lease_seconds)),
           watch_processing_pending = false
     WHERE id = p_connection_id;
    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_drive_watch_processing(p_connection_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    should_repeat BOOLEAN;
BEGIN
    SELECT watch_processing_pending
      INTO should_repeat
      FROM public.drive_connections
     WHERE id = p_connection_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    IF should_repeat THEN
        UPDATE public.drive_connections
           SET watch_processing_pending = false,
               watch_processing_until = CURRENT_TIMESTAMP + INTERVAL '120 seconds'
         WHERE id = p_connection_id;
        RETURN true;
    END IF;

    UPDATE public.drive_connections
       SET watch_processing_until = NULL,
           watch_processing_pending = false
     WHERE id = p_connection_id;
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_drive_watch_processing(p_connection_id BIGINT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE public.drive_connections
       SET watch_processing_until = NULL,
           watch_processing_pending = false
     WHERE id = p_connection_id;
$$;

REVOKE ALL ON FUNCTION public.claim_drive_watch_processing(BIGINT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_drive_watch_processing(BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_drive_watch_processing(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_drive_watch_processing(BIGINT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_drive_watch_processing(BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_drive_watch_processing(BIGINT) TO service_role;

