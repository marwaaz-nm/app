-- Org logo storage bucket: public, used for branding (sidebar/login/public verify pages).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('org-assets', 'org-assets', true, 2097152, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can view org assets"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'org-assets');

CREATE POLICY "Admins can manage org assets"
    ON storage.objects FOR ALL TO authenticated
    USING (bucket_id = 'org-assets' AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'Admin')
    WITH CHECK (bucket_id = 'org-assets' AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'Admin');

-- Configurable reference-number prefix and an atomically-incrementing sequence,
-- so "New reference" can suggest the next number (e.g. REF-2026-004) without collisions.
ALTER TABLE public.app_settings
    ADD COLUMN ref_number_prefix TEXT NOT NULL DEFAULT 'REF',
    ADD COLUMN ref_number_next_seq INT NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.next_reference_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_prefix TEXT;
    v_seq INT;
BEGIN
    UPDATE public.app_settings
    SET ref_number_next_seq = ref_number_next_seq + 1
    WHERE id = 1
    RETURNING ref_number_prefix, ref_number_next_seq - 1 INTO v_prefix, v_seq;

    RETURN v_prefix || '-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD(v_seq::TEXT, 3, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_reference_number() TO authenticated;
