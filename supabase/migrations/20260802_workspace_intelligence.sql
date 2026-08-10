-- GeoSurvey Pro: reports/workspace permissions (safe to run more than once)
ALTER TABLE public.profiles
  ALTER COLUMN permitted_actions SET DEFAULT ARRAY[
    'survey.create', 'survey.edit', 'survey.submit',
    'reference.manage', 'transfer.create', 'finance.manage', 'report.view'
  ]::TEXT[];

UPDATE public.profiles
SET permitted_actions = array_append(COALESCE(permitted_actions, ARRAY[]::TEXT[]), 'report.view')
WHERE role <> 'Admin' AND NOT ('report.view' = ANY(COALESCE(permitted_actions, ARRAY[]::TEXT[])));

UPDATE public.profiles
SET permitted_menus = array_append(COALESCE(permitted_menus, ARRAY[]::TEXT[]), '/reports')
WHERE role <> 'Admin' AND NOT ('/reports' = ANY(COALESCE(permitted_menus, ARRAY[]::TEXT[])));
