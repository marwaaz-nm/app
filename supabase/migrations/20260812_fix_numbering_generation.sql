-- The Settings page lets admins configure a format pattern and digit padding for
-- each numbering series (References, Receipts, Expenses), but the actual number
-- generation for references was a hardcoded RPC that ignored those two columns
-- (always "PREFIX-YYYY-<3 digits>"), and receipts/expenses never generated a
-- number server-side at all — the client just read the *current* next_seq value
-- as a preview and never incremented it, so every receipt got the same number
-- (colliding with the receipts.receipt_no UNIQUE constraint on the second save).
-- This adds a shared formatter and one atomic "next number" RPC per series.

CREATE OR REPLACE FUNCTION public.format_numbering(
    p_prefix TEXT,
    p_format TEXT,
    p_seq INT,
    p_digits INT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_prefix TEXT := COALESCE(NULLIF(TRIM(p_prefix), ''), 'REF');
    v_digits INT := COALESCE(p_digits, 3);
    v_year4 TEXT := EXTRACT(YEAR FROM now())::TEXT;
    v_year2 TEXT := RIGHT(v_year4, 2);
    v_padded TEXT := LPAD(GREATEST(COALESCE(p_seq, 1), 1)::TEXT, v_digits, '0');
BEGIN
    RETURN CASE COALESCE(p_format, 'PREFIX-YYYY-SEQ')
        WHEN 'PREFIX/SEQ/YY' THEN v_prefix || '/' || v_padded || '/' || v_year2
        WHEN 'PREFIX/SEQ/YYYY' THEN v_prefix || '/' || v_padded || '/' || v_year4
        WHEN 'PREFIX-SEQ' THEN v_prefix || '-' || v_padded
        WHEN 'PREFIX/YYYY/SEQ' THEN v_prefix || '/' || v_year4 || '/' || v_padded
        ELSE v_prefix || '-' || v_year4 || '-' || v_padded
    END;
END;
$$;

CREATE OR REPLACE FUNCTION public.next_reference_number()
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
    SET ref_number_next_seq = ref_number_next_seq + 1
    WHERE id = 1
    RETURNING ref_number_prefix, ref_number_format, ref_number_digits, ref_number_next_seq - 1
        INTO v_prefix, v_format, v_digits, v_seq;

    RETURN public.format_numbering(v_prefix, v_format, v_seq, v_digits);
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_reference_number() TO authenticated;

CREATE OR REPLACE FUNCTION public.next_receipt_number()
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
    SET receipt_number_next_seq = receipt_number_next_seq + 1
    WHERE id = 1
    RETURNING receipt_number_prefix, receipt_number_format, receipt_number_digits, receipt_number_next_seq - 1
        INTO v_prefix, v_format, v_digits, v_seq;

    RETURN public.format_numbering(v_prefix, v_format, v_seq, v_digits);
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_receipt_number() TO authenticated;

-- Expenses had no number column at all — the "Expense Records" numbering settings
-- were configurable but nothing ever consumed them.
ALTER TABLE public.expenses
    ADD COLUMN IF NOT EXISTS expense_no VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS expenses_expense_no_key
    ON public.expenses (expense_no)
    WHERE expense_no IS NOT NULL;

CREATE OR REPLACE FUNCTION public.next_expense_number()
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
    SET expense_number_next_seq = expense_number_next_seq + 1
    WHERE id = 1
    RETURNING expense_number_prefix, expense_number_format, expense_number_digits, expense_number_next_seq - 1
        INTO v_prefix, v_format, v_digits, v_seq;

    RETURN public.format_numbering(v_prefix, v_format, v_seq, v_digits);
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_expense_number() TO authenticated;
