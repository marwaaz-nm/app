-- Surveys previously had no counterpart to references/receipts/expenses'
-- generated number — "Sahan Lr" was just the raw auto-increment `serial_no`
-- integer, with no connection to the "Survey Records" numbering settings on
-- the Settings page. `serial_no` stays exactly as-is (it's relied on for
-- sorting/search/uniqueness throughout the app); this adds a separate
-- formatted `survey_no` (e.g. SURV-2026-001) driven by those settings, shown
-- wherever the survey's public-facing number is displayed.

ALTER TABLE public.surveys
    ADD COLUMN IF NOT EXISTS survey_no VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS surveys_survey_no_key
    ON public.surveys (survey_no)
    WHERE survey_no IS NOT NULL;

CREATE OR REPLACE FUNCTION public.next_survey_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_prefix TEXT;
    v_format TEXT;
    v_digits INT;
    v_seq INT;
BEGIN
    UPDATE public.app_settings
    SET survey_number_next_seq = survey_number_next_seq + 1
    WHERE id = 1
    RETURNING survey_number_prefix, survey_number_format, survey_number_digits, survey_number_next_seq - 1
        INTO v_prefix, v_format, v_digits, v_seq;

    RETURN public.format_numbering(v_prefix, v_format, v_seq, v_digits);
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_survey_number() TO authenticated;
