-- Fix IDOR vulnerability by assigning an unguessable UUID verification_token to each reference.
-- Public QR codes and verification links will use this verification_token instead of sequential integer IDs.

ALTER TABLE public.references
  ADD COLUMN IF NOT EXISTS verification_token UUID DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS references_verification_token_idx
  ON public.references (verification_token);

-- Backfill any existing reference records with random UUIDs
UPDATE public.references
SET verification_token = gen_random_uuid()
WHERE verification_token IS NULL;
