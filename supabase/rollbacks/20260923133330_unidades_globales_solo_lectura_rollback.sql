-- Rollback de unidades_globales_solo_lectura: restaura las políticas y los
-- GRANT anteriores, TAMBIÉN el agujero (cualquier administrador de cualquier
-- organización escribe units; cualquier miembro borra conversiones globales).
-- No toca datos.

set local lock_timeout = '3s';

drop policy if exists units_lectura on public.units;
drop policy if exists units_select_policy on public.units;
drop policy if exists units_insert_update_policy on public.units;

create policy units_select_policy on public.units
  for select to public
  using (true);

create policy units_insert_update_policy on public.units
  for all to public
  using (auth.uid() in (
    select organization_members.user_id from organization_members
    where organization_members.role_id = 2
  ));

grant all on public.units to anon;
grant insert, update, delete, truncate on public.units to authenticated;

drop policy if exists unit_conversions_lectura on public.unit_conversions;
drop policy if exists unit_conversions_insercion on public.unit_conversions;
drop policy if exists unit_conversions_edicion on public.unit_conversions;
drop policy if exists unit_conversions_borrado on public.unit_conversions;
drop policy if exists unit_conversions_org_isolation on public.unit_conversions;

create policy unit_conversions_org_isolation on public.unit_conversions
  for all to public
  using (
    (organization_id is null) or (organization_id in (
      select organization_members.organization_id from organization_members
      where (organization_members.user_id = auth.uid()) and (organization_members.is_active = true)
    ))
  );

grant all on public.unit_conversions to anon;
grant truncate on public.unit_conversions to authenticated;
