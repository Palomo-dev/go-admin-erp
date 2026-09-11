-- Rollback F-10: remove RLS policies from credit_note_applications
--
-- Reverts the 4 policies added by F-10. Leaves RLS enabled (it was enabled
-- before F-10; restoring the pre-F-10 state means no policies + RLS enabled,
-- which blocks all authenticated access — that was the original finding).

DROP POLICY IF EXISTS credit_note_applications_organization_access
  ON public.credit_note_applications;
DROP POLICY IF EXISTS credit_note_applications_organization_insert
  ON public.credit_note_applications;
DROP POLICY IF EXISTS credit_note_applications_organization_update
  ON public.credit_note_applications;
DROP POLICY IF EXISTS credit_note_applications_organization_delete
  ON public.credit_note_applications;

-- Note: RLS remains ENABLED and FORCED. To fully revert to pre-F-10 state
-- (RLS enabled but not forced, no policies), uncomment:
-- ALTER TABLE public.credit_note_applications NO FORCE ROW LEVEL SECURITY;
