-- Seguridad: web_orders deja de estar abierta a la clave pública (anon) y a pedidos ajenos.
--
-- Qué había (verificado por MCP el 2026-11-25):
--   · "Allow anon select web_orders (checkout flow)"  SELECT  to public  using (true)
--   · "Allow anon update web_orders"                  UPDATE  to public  using (true)
--   · "Allow public insert web_orders"                INSERT  to public  with check (true)
--   · "Users can update web_orders of their organization" UPDATE to public (pertenencia, sin with check)
--   y grants completos (incluido DELETE y TRUNCATE) a anon y authenticated.
--   Cualquiera con la clave pública del proyecto podía leer los pedidos de todas las tiendas
--   (nombre, correo, teléfono, dirección, factura) y cambiarlos (estado, total, pago).
--
-- Quién lo usa de verdad (inventario del 2026-11-25, logs de 24 h: cero peticiones con anon sin sesión):
--   · Tienda (goadmin-websites): checkout, /api/orders, consultar pedido, rastreo, webhooks de las
--     pasarelas, reintento de pago, anticipo, reseñas, correos y cuenta del cliente → service_role
--     en el servidor (createAdminClient / createPublicClient). Única lectura con sesión del
--     comprador: el conteo de pedidos de /mi-cuenta (lib/queries/customer-portal.ts), que pasa al
--     cliente de servidor en el mismo cambio de la tienda.
--   · ERP: lecturas y cambios de estado con la sesión del miembro (authenticated); altas y bajas
--     de pedidos por service_role (api/web-orders, pedidos manuales).
--   · Super, Edge Functions (ai-auto-response, chat-widget): service_role. Sellers: no lo usa.
--   · Desktop: la réplica offline lee con la sesión del miembro.
--
-- Qué queda:
--   · SELECT y UPDATE solo para miembros activos de la organización del pedido (authenticated).
--   · INSERT y DELETE: ninguna política → solo service_role (servidor, webhooks, crons).
--   · anon sin ningún grant sobre web_orders ni web_order_items.
--   · web_order_items: mismas reglas de pertenencia, reescritas con (select auth.uid()) y
--     IN (SELECT … JOIN) (sin EXISTS anidado), solo para authenticated.

-- 1 · web_orders: fuera las políticas abiertas
drop policy if exists "Allow anon select web_orders (checkout flow)" on public.web_orders;
drop policy if exists "Allow anon update web_orders" on public.web_orders;
drop policy if exists "Allow public insert web_orders" on public.web_orders;
drop policy if exists "Users can update web_orders of their organization" on public.web_orders;

drop policy if exists web_orders_select_miembros on public.web_orders;
create policy web_orders_select_miembros on public.web_orders
  for select to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true));

drop policy if exists web_orders_update_miembros on public.web_orders;
create policy web_orders_update_miembros on public.web_orders
  for update to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true))
  with check (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true));

-- 2 · web_order_items: misma pertenencia, sin la evaluación por fila de auth.uid()
drop policy if exists "Users can view web_order_items of their organization" on public.web_order_items;
drop policy if exists "Users can insert web_order_items" on public.web_order_items;
drop policy if exists "Users can update web_order_items" on public.web_order_items;

drop policy if exists web_order_items_select_miembros on public.web_order_items;
create policy web_order_items_select_miembros on public.web_order_items
  for select to authenticated
  using (web_order_id in (
    select w.id from public.web_orders w
      join public.organization_members om on om.organization_id = w.organization_id
     where om.user_id = (select auth.uid()) and om.is_active = true));

drop policy if exists web_order_items_insert_miembros on public.web_order_items;
create policy web_order_items_insert_miembros on public.web_order_items
  for insert to authenticated
  with check (web_order_id in (
    select w.id from public.web_orders w
      join public.organization_members om on om.organization_id = w.organization_id
     where om.user_id = (select auth.uid()) and om.is_active = true));

drop policy if exists web_order_items_update_miembros on public.web_order_items;
create policy web_order_items_update_miembros on public.web_order_items
  for update to authenticated
  using (web_order_id in (
    select w.id from public.web_orders w
      join public.organization_members om on om.organization_id = w.organization_id
     where om.user_id = (select auth.uid()) and om.is_active = true))
  with check (web_order_id in (
    select w.id from public.web_orders w
      join public.organization_members om on om.organization_id = w.organization_id
     where om.user_id = (select auth.uid()) and om.is_active = true));

-- 3 · Grants: anon fuera; authenticated sin altas, bajas ni truncate (eso es del servidor)
revoke all on table public.web_orders from anon;
revoke all on table public.web_order_items from anon;
revoke insert, delete, truncate, references, trigger on table public.web_orders from authenticated;
revoke truncate, references, trigger on table public.web_order_items from authenticated;

comment on policy web_orders_select_miembros on public.web_orders is
  'Pedidos web: solo miembros activos de la organización. La tienda lee y escribe con service_role en el servidor; anon no tiene grants (2026-11-25).';
