-- Reversión de 20260921150000_pos_terminals_update_rol_admin_manager.sql:
-- vuelve a la política UPDATE de 20260921140000 (pertenencia de cualquier
-- miembro activo + sucursal de la misma organización), sin exigir rol.
-- No hay datos que revertir.

drop policy if exists pos_terminals_update on public.pos_terminals;
create policy pos_terminals_update on public.pos_terminals
  for update to authenticated
  using (organization_id in (
    select om.organization_id
      from public.organization_members om
     where om.user_id = (select auth.uid())
       and om.is_active = true))
  with check (
    organization_id in (
      select om.organization_id
        from public.organization_members om
       where om.user_id = (select auth.uid())
         and om.is_active = true)
    and branch_id in (
      select b.id
        from public.branches b
       where b.organization_id = pos_terminals.organization_id));
