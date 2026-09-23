-- categories: fin de la lectura anónima y de la lectura entre organizaciones
-- (auditoría del catálogo, docs/design/AUDITORIA-CATALOGO-PRODUCCION.md).
--
-- "Allow anon select categories" tenía USING (true) para el rol public, así
-- que no solo anon: cualquier usuario autenticado veía las 1.113 categorías de
-- todas las organizaciones (verificado: un usuario de la org 137 veía 1.060
-- ajenas). Las permisivas se combinan con OR y esa anulaba al resto.
--
-- Consumidores sin sesión revisados antes de cerrar: la tienda web
-- (goadmin-websites) lee categories solo desde el servidor con service_role
-- (lib/supabase/queries.ts, lib/outlet/catalog-helpers.ts,
-- app/api/products/search); su cliente de navegador solo consulta customers y
-- product_reviews. Las Edge Functions usan service_role.
--
-- Las cuatro políticas por pertenencia se reescriben: solo authenticated,
-- membresía activa, (select auth.uid()) para que el subplan sea hasheado, y
-- UPDATE con WITH CHECK (antes un miembro podía mover una categoría a otra
-- organización cambiando organization_id).

set local lock_timeout = '3s';

drop policy if exists "Allow anon select categories" on public.categories;
drop policy if exists categories_select_policy on public.categories;
drop policy if exists categories_insert_policy on public.categories;
drop policy if exists categories_update_policy on public.categories;
drop policy if exists categories_delete_policy on public.categories;

create policy categories_select_policy on public.categories
  for select to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active = true
    )
  );

create policy categories_insert_policy on public.categories
  for insert to authenticated
  with check (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active = true
    )
  );

create policy categories_update_policy on public.categories
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

create policy categories_delete_policy on public.categories
  for delete to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active = true
    )
  );

revoke all on public.categories from anon;
revoke truncate on public.categories from authenticated;
