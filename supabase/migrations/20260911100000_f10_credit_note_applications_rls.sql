-- F-10: RLS policies for credit_note_applications
--
-- Security advisor finding: table had RLS enabled but no policies.
-- Table has organization_id (NOT NULL) but no branch_id.
-- Pattern matches accounts_receivable organization policy.
--
-- All 4 policies filter by active membership in the organization.

ALTER TABLE public.credit_note_applications
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.credit_note_applications
  FORCE ROW LEVEL SECURITY;

-- SELECT: user sees rows from organizations where they are an active member
CREATE POLICY credit_note_applications_organization_access
  ON public.credit_note_applications
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id
      FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.is_active = true
    )
  );

-- INSERT: user can insert only for organizations where they are an active member
CREATE POLICY credit_note_applications_organization_insert
  ON public.credit_note_applications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT om.organization_id
      FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.is_active = true
    )
  );

-- UPDATE: user can update only rows in their organizations
CREATE POLICY credit_note_applications_organization_update
  ON public.credit_note_applications
  FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id
      FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.is_active = true
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT om.organization_id
      FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.is_active = true
    )
  );

-- DELETE: user can delete only rows in their organizations
CREATE POLICY credit_note_applications_organization_delete
  ON public.credit_note_applications
  FOR DELETE
  TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id
      FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.is_active = true
    )
  );
