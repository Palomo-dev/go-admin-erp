-- Reversión de 20261125193932_seguridad_web_orders_cerrar_anon.
--
-- ADVERTENCIA: deja web_orders otra vez ABIERTA a la clave pública (lectura, alta y cambio de
-- pedidos de todas las tiendas). Úsese solo si un consumidor legítimo quedó roto y no hay otra
-- salida, y por el menor tiempo posible. No toca datos.

drop policy if exists web_orders_select_miembros on public.web_orders;
drop policy if exists web_orders_update_miembros on public.web_orders;
drop policy if exists web_order_items_select_miembros on public.web_order_items;
drop policy if exists web_order_items_insert_miembros on public.web_order_items;
drop policy if exists web_order_items_update_miembros on public.web_order_items;

drop policy if exists "Allow anon select web_orders (checkout flow)" on public.web_orders;
create policy "Allow anon select web_orders (checkout flow)" on public.web_orders
  for select to public using (true);
drop policy if exists "Allow anon update web_orders" on public.web_orders;
create policy "Allow anon update web_orders" on public.web_orders
  for update to public using (true);
drop policy if exists "Allow public insert web_orders" on public.web_orders;
create policy "Allow public insert web_orders" on public.web_orders
  for insert to public with check (true);
drop policy if exists "Users can update web_orders of their organization" on public.web_orders;
create policy "Users can update web_orders of their organization" on public.web_orders
  for update to public
  using (organization_id in (select organization_members.organization_id from organization_members
          where organization_members.user_id = auth.uid() and organization_members.is_active = true));

drop policy if exists "Users can view web_order_items of their organization" on public.web_order_items;
create policy "Users can view web_order_items of their organization" on public.web_order_items
  for select to public
  using (web_order_id in (select web_orders.id from web_orders where web_orders.organization_id in (
          select organization_members.organization_id from organization_members
           where organization_members.user_id = auth.uid() and organization_members.is_active = true)));
drop policy if exists "Users can insert web_order_items" on public.web_order_items;
create policy "Users can insert web_order_items" on public.web_order_items
  for insert to public
  with check (web_order_id in (select web_orders.id from web_orders where web_orders.organization_id in (
          select organization_members.organization_id from organization_members
           where organization_members.user_id = auth.uid() and organization_members.is_active = true)));
drop policy if exists "Users can update web_order_items" on public.web_order_items;
create policy "Users can update web_order_items" on public.web_order_items
  for update to public
  using (web_order_id in (select web_orders.id from web_orders where web_orders.organization_id in (
          select organization_members.organization_id from organization_members
           where organization_members.user_id = auth.uid() and organization_members.is_active = true)));

grant select, insert, update, delete, truncate, references, trigger on table public.web_orders to anon, authenticated;
grant select, insert, update, delete, truncate, references, trigger on table public.web_order_items to anon, authenticated;
