-- Rollback de 20260928140300_saldo_favor_4_rls_solo_lectura.
-- Devuelve los grants y las políticas de escritura anteriores.
-- ADVERTENCIA: reabre la escritura directa desde el navegador (y el GRANT a
-- anon) que esta migración cerró. Úsese solo para volver atrás en una emergencia.

grant all on table public.credit_notes to anon, authenticated;
grant all on table public.credit_note_applications to anon, authenticated;

drop policy if exists credit_notes_select_miembros on public.credit_notes;
drop policy if exists "Users can only access credit notes from their organization" on public.credit_notes;
create policy "Users can only access credit notes from their organization" on public.credit_notes
  for all to authenticated
  using (organization_id in (
    select organization_members.organization_id from public.organization_members
     where organization_members.user_id = auth.uid()
  ));

drop policy if exists credit_note_applications_organization_insert on public.credit_note_applications;
create policy credit_note_applications_organization_insert on public.credit_note_applications
  for insert to authenticated
  with check (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = auth.uid() and om.is_active = true
  ));
drop policy if exists credit_note_applications_organization_update on public.credit_note_applications;
create policy credit_note_applications_organization_update on public.credit_note_applications
  for update to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = auth.uid() and om.is_active = true
  ))
  with check (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = auth.uid() and om.is_active = true
  ));
drop policy if exists credit_note_applications_organization_delete on public.credit_note_applications;
create policy credit_note_applications_organization_delete on public.credit_note_applications
  for delete to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = auth.uid() and om.is_active = true
  ));
