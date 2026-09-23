-- Unidades globales de solo lectura para los usuarios (auditoría del catálogo,
-- docs/design/AUDITORIA-CATALOGO-PRODUCCION.md, hallazgos de RLS).
--
-- units: es global (no tiene organization_id). La política
-- units_insert_update_policy dejaba escribir a cualquier usuario con
-- role_id = 2 en CUALQUIER organización, así que un administrador cambiaba o
-- borraba las unidades de todos los tenants. Verificado antes de aplicar: un
-- administrador de la org 137 actualizaba las 13 filas.
--
-- unit_conversions: unit_conversions_org_isolation (ALL, sin WITH CHECK)
-- admitía organization_id IS NULL también para escribir. Verificado: un
-- miembro NO administrador de la org 135 borraba las 10 conversiones globales
-- (KG↔GR, LT↔ML, MT↔CM, PAQ = 10 UN, CAJ = 25 UN).
--
-- Desde aquí: las filas globales solo se leen; las escribe service_role.
-- Las conversiones propias de una organización las escriben sus miembros
-- activos. anon no lee ninguna de las dos (ningún consumidor lo hace).

set local lock_timeout = '3s';

-- units ---------------------------------------------------------------------
drop policy if exists units_insert_update_policy on public.units;
drop policy if exists units_select_policy on public.units;
drop policy if exists units_lectura on public.units;

create policy units_lectura on public.units
  for select to authenticated
  using (true);

revoke all on public.units from anon;
revoke insert, update, delete, truncate on public.units from authenticated;

-- unit_conversions ----------------------------------------------------------
drop policy if exists unit_conversions_org_isolation on public.unit_conversions;
drop policy if exists unit_conversions_lectura on public.unit_conversions;
drop policy if exists unit_conversions_insercion on public.unit_conversions;
drop policy if exists unit_conversions_edicion on public.unit_conversions;
drop policy if exists unit_conversions_borrado on public.unit_conversions;

create policy unit_conversions_lectura on public.unit_conversions
  for select to authenticated
  using (
    organization_id is null
    or organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active = true
    )
  );

-- organization_id IS NULL nunca pasa un IN: las globales quedan fuera.
create policy unit_conversions_insercion on public.unit_conversions
  for insert to authenticated
  with check (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active = true
    )
  );

create policy unit_conversions_edicion on public.unit_conversions
  for update to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active = true
    )
  )
  with check (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active = true
    )
  );

create policy unit_conversions_borrado on public.unit_conversions
  for delete to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active = true
    )
  );

revoke all on public.unit_conversions from anon;
revoke truncate on public.unit_conversions from authenticated;
