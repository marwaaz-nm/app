-- Normalize legacy survey foreign keys. CREATE TABLE IF NOT EXISTS in the
-- governance rollout did not update constraints on installations where these
-- tables already existed, so some databases retained ON DELETE NO ACTION.
SET lock_timeout = '5s';
SET statement_timeout = '30s';

DO $migration$
DECLARE
  relation_name TEXT;
  constraint_name TEXT;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['references', 'transfers', 'survey_revisions', 'survey_documents']
  LOOP
    FOR constraint_name IN
      SELECT con.conname
      FROM pg_constraint AS con
      JOIN pg_class AS child ON child.oid = con.conrelid
      JOIN pg_namespace AS child_namespace ON child_namespace.oid = child.relnamespace
      WHERE con.contype = 'f'
        AND child_namespace.nspname = 'public'
        AND child.relname = relation_name
        AND con.confrelid = 'public.surveys'::regclass
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', relation_name, constraint_name);
    END LOOP;
  END LOOP;
END
$migration$;

ALTER TABLE public.references
  ADD CONSTRAINT references_survey_id_fkey
  FOREIGN KEY (survey_id) REFERENCES public.surveys(id) ON DELETE SET NULL;

ALTER TABLE public.transfers
  ADD CONSTRAINT transfers_survey_id_fkey
  FOREIGN KEY (survey_id) REFERENCES public.surveys(id) ON DELETE SET NULL;

ALTER TABLE public.survey_revisions
  ADD CONSTRAINT survey_revisions_survey_id_fkey
  FOREIGN KEY (survey_id) REFERENCES public.surveys(id) ON DELETE CASCADE;

ALTER TABLE public.survey_documents
  ADD CONSTRAINT survey_documents_survey_id_fkey
  FOREIGN KEY (survey_id) REFERENCES public.surveys(id) ON DELETE CASCADE;
