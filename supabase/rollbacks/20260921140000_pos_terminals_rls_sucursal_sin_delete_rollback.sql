-- Reversión de 20260921140000_pos_terminals_rls_sucursal_sin_delete.sql:
-- vuelve a las políticas de 20260916010000_pos_terminals.sql (solo
-- pertenencia, sin comprobar la sucursal) y restaura la política DELETE.
-- No hay datos que revertir.

drop policy if exists pos_terminals_insert on public.pos_terminals;
create policy pos_terminals_insert on public.pos_terminals
  for insert to authenticated
  with check (organization_id in (
    select om.organization_id
      from public.organization_members om
     where om.user_id = (select auth.uid())
       and om.is_active = true));

drop policy if exists pos_terminals_update on public.pos_terminals;
create policy pos_terminals_update on public.pos_terminals
  for update to authenticated
  using (organization_id in (
    select om.organization_id
      from public.organization_members om
     where om.user_id = (select auth.uid())
       and om.is_active = true))
  with check (organization_id in (
    select om.organization_id
      from public.organization_members om
     where om.user_id = (select auth.uid())
       and om.is_active = true));

drop policy if exists pos_terminals_delete on public.pos_terminals;
create policy pos_terminals_delete on public.pos_terminals
  for delete to authenticated
  using (organization_id in (
    select om.organization_id
      from public.organization_members om
     where om.user_id = (select auth.uid())
       and om.is_active = true));
