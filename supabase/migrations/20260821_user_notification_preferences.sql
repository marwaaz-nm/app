-- Per-user notification controls. Missing menu keys default to enabled.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notification_menu_preferences JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE OR REPLACE FUNCTION public.enqueue_menu_notification(
  target_menu TEXT,
  target_entity_type TEXT,
  target_entity_id BIGINT,
  notification_title TEXT,
  notification_body TEXT,
  target_href TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.app_notifications(
    recipient_id, menu_path, entity_type, entity_id, title, body, href
  )
  SELECT
    profile.id,
    target_menu,
    target_entity_type,
    target_entity_id,
    notification_title,
    notification_body,
    target_href
  FROM public.profiles AS profile
  WHERE (
      profile.role IN ('Admin', 'SuperAdmin')
      OR target_menu = ANY(COALESCE(profile.permitted_menus, ARRAY[]::TEXT[]))
    )
    AND profile.notifications_enabled = TRUE
    AND COALESCE(
      (profile.notification_menu_preferences ->> target_menu)::BOOLEAN,
      TRUE
    ) = TRUE
  ON CONFLICT (recipient_id, entity_type, entity_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_menu_notification(TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT)
  FROM PUBLIC, authenticated;
