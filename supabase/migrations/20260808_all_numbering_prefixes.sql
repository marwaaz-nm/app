-- Add configurable numbering prefixes, sequences, format patterns, and digit padding to public.app_settings

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS survey_number_prefix TEXT NOT NULL DEFAULT 'SURV',
  ADD COLUMN IF NOT EXISTS survey_number_next_seq INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS survey_number_format TEXT NOT NULL DEFAULT 'PREFIX-YYYY-SEQ',
  ADD COLUMN IF NOT EXISTS survey_number_digits INT NOT NULL DEFAULT 3,

  ADD COLUMN IF NOT EXISTS receipt_number_prefix TEXT NOT NULL DEFAULT 'REC',
  ADD COLUMN IF NOT EXISTS receipt_number_next_seq INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS receipt_number_format TEXT NOT NULL DEFAULT 'PREFIX-YYYY-SEQ',
  ADD COLUMN IF NOT EXISTS receipt_number_digits INT NOT NULL DEFAULT 3,

  ADD COLUMN IF NOT EXISTS expense_number_prefix TEXT NOT NULL DEFAULT 'EXP',
  ADD COLUMN IF NOT EXISTS expense_number_next_seq INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS expense_number_format TEXT NOT NULL DEFAULT 'PREFIX-YYYY-SEQ',
  ADD COLUMN IF NOT EXISTS expense_number_digits INT NOT NULL DEFAULT 3,

  ADD COLUMN IF NOT EXISTS ref_number_format TEXT NOT NULL DEFAULT 'PREFIX-YYYY-SEQ',
  ADD COLUMN IF NOT EXISTS ref_number_digits INT NOT NULL DEFAULT 3;
