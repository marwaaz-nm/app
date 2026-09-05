BEGIN;
ALTER TABLE public.references ADD COLUMN IF NOT EXISTS verification_token uuid DEFAULT gen_random_uuid();
UPDATE public.references SET verification_token = gen_random_uuid() WHERE verification_token IS NULL;
ALTER TABLE public.references ALTER COLUMN verification_token SET DEFAULT gen_random_uuid();
ALTER TABLE public.references ALTER COLUMN verification_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS references_verification_token_idx ON public.references (verification_token);
-- Preserve existing staff policies; anonymous clients must never enumerate bearer tokens.
ALTER TABLE public.references ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.references FROM PUBLIC, anon;

CREATE TABLE IF NOT EXISTS public.public_reference_rate_limits (
  bucket text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL CHECK (hits > 0)
);
ALTER TABLE public.public_reference_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_reference_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_reference_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.allow_public_reference_request(token_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  current_window timestamptz := date_trunc('minute', clock_timestamp());
  global_hits integer;
  token_hits integer;
BEGIN
  IF token_hash IS NULL OR token_hash !~ '^[0-9a-f]{64}$' THEN RETURN false; END IF;
  DELETE FROM public.public_reference_rate_limits WHERE window_start < current_window - interval '2 minutes';
  INSERT INTO public.public_reference_rate_limits AS limits (bucket, window_start, hits)
  VALUES ('global', current_window, 1)
  ON CONFLICT (bucket) DO UPDATE SET
    window_start = EXCLUDED.window_start,
    hits = CASE WHEN limits.window_start = EXCLUDED.window_start THEN least(limits.hits + 1, 301) ELSE 1 END
  RETURNING hits INTO global_hits;
  IF global_hits > 300 THEN RETURN false; END IF;
  INSERT INTO public.public_reference_rate_limits AS limits (bucket, window_start, hits)
  VALUES ('token:' || token_hash, current_window, 1)
  ON CONFLICT (bucket) DO UPDATE SET
    window_start = EXCLUDED.window_start,
    hits = CASE WHEN limits.window_start = EXCLUDED.window_start THEN least(limits.hits + 1, 31) ELSE 1 END
  RETURNING hits INTO token_hits;
  RETURN token_hits <= 30;
END;
$$;
REVOKE ALL ON FUNCTION public.allow_public_reference_request(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allow_public_reference_request(text) TO service_role;
COMMIT;
