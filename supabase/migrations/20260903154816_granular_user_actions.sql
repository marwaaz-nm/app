-- Run before assigning the new granular permissions. Preserve existing access
-- once, then remove broad legacy grants so individual actions can be revoked.
BEGIN;

UPDATE public.profiles p SET permitted_actions = ARRAY(
  SELECT DISTINCT action FROM (
    SELECT unnest(COALESCE(p.permitted_actions, ARRAY[]::text[])) AS action
    UNION ALL SELECT unnest(ARRAY['reference.create','reference.edit','reference.delete'])
      WHERE 'reference.manage' = ANY(COALESCE(p.permitted_actions, ARRAY[]::text[]))
    UNION ALL SELECT unnest(ARRAY['payment.create','payment.edit','payment.delete','payment.pay_debt','expense.create','expense.edit','expense.delete'])
      WHERE 'finance.manage' = ANY(COALESCE(p.permitted_actions, ARRAY[]::text[]))
    UNION ALL SELECT unnest(ARRAY['transfer.edit','transfer.delete'])
      WHERE 'transfer.create' = ANY(COALESCE(p.permitted_actions, ARRAY[]::text[]))
    UNION ALL SELECT 'report.export' WHERE 'report.view' = ANY(COALESCE(p.permitted_actions, ARRAY[]::text[]))
    UNION ALL SELECT 'customer.search' WHERE '/customers' = ANY(COALESCE(p.permitted_menus, ARRAY[]::text[]))
    UNION ALL SELECT 'drive.download' WHERE '/drive-files' = ANY(COALESCE(p.permitted_menus, ARRAY[]::text[]))
    UNION ALL SELECT 'archive.upload' WHERE '/document-archive' = ANY(COALESCE(p.permitted_menus, ARRAY[]::text[]))
  ) expanded WHERE action NOT IN ('reference.manage','finance.manage')
);

-- Invoker security: evaluate only the caller's own server-managed profile.
-- This does not bypass profiles RLS or accept an arbitrary user id.
CREATE OR REPLACE FUNCTION public.can_record_action(action_name text, menu_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND (
      p.role IN ('Admin', 'SuperAdmin') OR (
        menu_path = ANY(COALESCE(p.permitted_menus, ARRAY[]::text[])) AND
        action_name = ANY(COALESCE(p.permitted_actions, ARRAY[]::text[]))
      )
    )
  );
$$;
REVOKE ALL ON FUNCTION public.can_record_action(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_record_action(text,text) TO authenticated;

-- RESTRICTIVE policies are ANDed with existing policies. Old broad permissive
-- policies cannot bypass these checks; existing ownership restrictions remain.
ALTER TABLE public.references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY granular_reference_insert ON public.references AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.can_record_action('reference.create','/references'));
CREATE POLICY granular_reference_update ON public.references AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.can_record_action('reference.edit','/references'))
  WITH CHECK (public.can_record_action('reference.edit','/references'));
CREATE POLICY granular_reference_delete ON public.references AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.can_record_action('reference.delete','/references'));

CREATE POLICY granular_payment_insert ON public.receipts AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.can_record_action('payment.create','/financials'));
CREATE POLICY granular_payment_update ON public.receipts AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.can_record_action('payment.edit','/financials'))
  WITH CHECK (public.can_record_action('payment.edit','/financials'));
CREATE POLICY granular_payment_delete ON public.receipts AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.can_record_action('payment.delete','/financials'));

CREATE POLICY granular_expense_insert ON public.expenses AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.can_record_action('expense.create','/financials'));
CREATE POLICY granular_expense_update ON public.expenses AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.can_record_action('expense.edit','/financials'))
  WITH CHECK (public.can_record_action('expense.edit','/financials'));
CREATE POLICY granular_expense_delete ON public.expenses AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.can_record_action('expense.delete','/financials'));

CREATE POLICY granular_transfer_insert ON public.transfers AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.can_record_action('transfer.create','/transfers'));
CREATE POLICY granular_transfer_update ON public.transfers AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.can_record_action('transfer.edit','/transfers'))
  WITH CHECK (public.can_record_action('transfer.edit','/transfers'));
CREATE POLICY granular_transfer_delete ON public.transfers AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.can_record_action('transfer.delete','/transfers'));

COMMIT;
