-- RLS: cerrar `restaurant_reservations` y la inserción anónima de
-- `coupon_redemptions`.
--
-- `restaurant_reservations` tenía sus CUATRO políticas con `USING (true)` /
-- `WITH CHECK (true)` para el rol `public`, así que cualquiera con la clave
-- anónima —que viaja en el navegador— podía leer, modificar y **borrar** las
-- reservas de todas las organizaciones. Se sustituyen por pertenencia activa,
-- el mismo patrón que el resto del esquema (IN (SELECT ... ) con
-- `(select auth.uid())`, que es el que no degrada el plan: ver
-- docs/POLITICA-MIGRACIONES.md y el incidente de EXISTS anidado).
--
-- `coupon_redemptions` conserva su política de pertenencia, pero tenía además
-- «Allow anon insert» con `WITH CHECK (true)`: sin autenticarse se podían
-- insertar redenciones de un cupón ajeno y, con el disparador que incrementa
-- el uso, agotarlo. La tienda web inserta redenciones desde el servidor
-- (service_role, que no pasa por RLS), así que retirarla no rompe el
-- escaparate.
--
-- La tabla de reservas está VACÍA (0 filas) al aplicar esta migración, así que
-- no hay riesgo de dejar datos fuera de alcance.
-- Reversión: supabase/rollbacks/20260922200000_rls_reservas_y_redenciones_rollback.sql

alter table public.restaurant_reservations enable row level security;

drop policy if exists "restaurant_reservations_select" on public.restaurant_reservations;
drop policy if exists "restaurant_reservations_insert" on public.restaurant_reservations;
drop policy if exists "restaurant_reservations_update" on public.restaurant_reservations;
drop policy if exists "restaurant_reservations_delete" on public.restaurant_reservations;

create policy "restaurant_reservations_select" on public.restaurant_reservations
  for select to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
    )
  );

create policy "restaurant_reservations_insert" on public.restaurant_reservations
  for insert to authenticated
  with check (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
    )
  );

create policy "restaurant_reservations_update" on public.restaurant_reservations
  for update to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
    )
  )
  with check (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
    )
  );

create policy "restaurant_reservations_delete" on public.restaurant_reservations
  for delete to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
    )
  );

drop policy if exists "Allow anon insert coupon_redemptions" on public.coupon_redemptions;
