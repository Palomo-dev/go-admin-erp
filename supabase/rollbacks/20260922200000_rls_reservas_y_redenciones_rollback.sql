-- Rollback de 20260922200000_rls_reservas_y_redenciones.sql
--
-- Restaura las políticas abiertas de `restaurant_reservations` y la inserción
-- anónima de `coupon_redemptions`. Solo para volver atrás ante una incidencia:
-- lo que restaura deja ambas tablas accesibles con la clave anónima.

drop policy if exists "restaurant_reservations_select" on public.restaurant_reservations;
drop policy if exists "restaurant_reservations_insert" on public.restaurant_reservations;
drop policy if exists "restaurant_reservations_update" on public.restaurant_reservations;
drop policy if exists "restaurant_reservations_delete" on public.restaurant_reservations;

create policy "restaurant_reservations_select" on public.restaurant_reservations for select using (true);
create policy "restaurant_reservations_insert" on public.restaurant_reservations for insert with check (true);
create policy "restaurant_reservations_update" on public.restaurant_reservations for update using (true);
create policy "restaurant_reservations_delete" on public.restaurant_reservations for delete using (true);

create policy "Allow anon insert coupon_redemptions" on public.coupon_redemptions for insert with check (true);
