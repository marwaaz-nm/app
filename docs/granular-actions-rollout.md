# Granular permissions rollout

Apply `supabase/migrations/20260903154816_granular_user_actions.sql` to the linked application database **before** assigning the new permissions or deploying the UI. It preserves historical grants once and removes the legacy `manage` grants. Do not rerun the data conversion after administrators have narrowed permissions.

The migration is prepared but has not been applied or tested against the live project. The connected Supabase account returned no projects. No production rows were modified during development.

## Required verification before production

- Inspect existing policies on references, receipts, expenses, transfers and profiles. The new policies are restrictive, retaining existing row/ownership restrictions rather than replacing them.
- Confirm authenticated users can read their own profile and cannot update their role/actions directly.
- Using dedicated test accounts, verify each INSERT/UPDATE/DELETE succeeds with its matching menu + action and is denied without either. Test direct PostgREST requests, not just buttons. Never test deletion on business records.
- Confirm Admin and SuperAdmin retain access. Survey deletion, user management, settings and backups remain admin-only.
- Test `payment.pay_debt` through the server endpoint. It intentionally does not grant arbitrary receipt updates through PostgREST.
- Check Supabase security advisors and migration status after applying.

Reports export controls restrict app export workflows, not copying data already visible to a user. Customers is a search screen, so its action is `customer.search`, not invented customer CRUD permissions. Archive upload also covers replacement; no separate delete endpoint exists.

Local unit tests cover action expansion, denied permissions, menu dependencies, role protection and form validation. These are not a substitute for live RLS tests.
