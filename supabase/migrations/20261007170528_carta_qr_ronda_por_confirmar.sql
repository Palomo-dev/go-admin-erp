-- Aplicada el 2026-10-07 17:05:28 UTC con apply_migration (versión 20261007170528).
-- Carta QR en la mesa · ronda «por confirmar» visible y sin duplicados.
--
-- Caso real (org 140, Mesa 3, 2026-10-07): el comensal envió una ronda con la mesa SIN sesión; el
-- pedido quedó `pending` (correcto: lo confirma el equipo en el POS) pero la Carta QR no mostró
-- nada, el comensal reenvió y quedó un duplicado. Dos causas en fn_mesa_pedido_publico:
--   a) sin sesión retornaba antes de leer `pendientes` (rondas: []).
--   b) con sesión, `pendientes` exigía `created_at >= opened_at`: la ronda enviada a las 16:51
--      quedó fuera porque el equipo abrió la sesión a las 16:52 al confirmar la anterior.
--
-- Qué hace (ADITIVA):
-- 1. `web_orders.round_key text NULL` (8–64, [A-Za-z0-9-]): clave de idempotencia de la ronda
--    que manda la Carta QR (la misma en cada reintento). Índice ÚNICO parcial
--    (organization_id, restaurant_table_id, round_key) entre pedidos vivos (no cancelled /
--    rejected / expired): un doble clic o un reintento chocan (23505) y /api/orders devuelve el
--    pedido ya creado.
-- 2. CREATE OR REPLACE fn_mesa_pedido_publico (misma firma y permisos, solo service role):
--    - sin sesión devuelve la mesa, `sesion: null` y las rondas por confirmar con platos y total;
--    - ventana de `pendientes`: últimas 4 h sin pasar del cierre de la sesión anterior de la mesa.
--
-- ENSAYO (2026-10-07, execute_sql: un bloque `do` con esta migración entera y las pruebas,
-- deshecho con `raise exception`; filas de prueba creadas DENTRO del bloque). Resultado tal cual:
--   ENSAYO_OK | 1:lista:54000.00 | 2:por_confirmar:68000.00  ||  sesion=null rondas=1
--   r1=por_confirmar:86000.00:items=2 clave_ok=true || dup=23505 tras_expirar=ok forma=23514 || anon=42501
-- Lectura: la Mesa 3 ya ve su ronda 2 por confirmar; una mesa sin sesión ve su ronda con dos
-- platos y su total; la misma clave en la misma mesa = 23505 y, expirado el pedido, se puede
-- reusar; una clave mal formada = 23514; anon sigue en 42501.

set lock_timeout = '10s';

alter table public.web_orders
  add column if not exists round_key text null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'web_orders_round_key_forma'
                   and conrelid = 'public.web_orders'::regclass) then
    alter table public.web_orders
      add constraint web_orders_round_key_forma
      check (round_key is null or round_key ~ '^[A-Za-z0-9-]{8,64}$') not valid;
    alter table public.web_orders validate constraint web_orders_round_key_forma;
  end if;
end $$;

comment on column public.web_orders.round_key is
  'Carta QR: clave de idempotencia de la ronda (la misma en cada reintento). Única por organización y mesa entre pedidos vivos.';

create unique index if not exists idx_web_orders_round_key
  on public.web_orders (organization_id, restaurant_table_id, round_key)
  where round_key is not null and status not in ('cancelled', 'rejected', 'expired');

create or replace function public.fn_mesa_pedido_publico(p_organization_id integer, p_table_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $f$
declare
  c record;
  v_mesa jsonb;
  v_sale public.sales%rowtype;
  v_rondas jsonb;
  v_solicitudes jsonb;
begin
  if auth.uid() is not null or coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'Acceso denegado a la organización' using errcode = '42501';
  end if;
  select * into c from public.fn_mesa_qr_sesion(p_organization_id, p_table_id);
  v_mesa := jsonb_build_object('id', c.mesa_id, 'nombre', c.mesa_nombre, 'zona', c.zona,
                               'sede_id', c.branch_id, 'sede', c.sede_nombre);
  -- Sin sesión ya NO se corta aquí: las rondas del QR por confirmar (`pendientes`) se devuelven
  -- igual. Los demás bloques filtran por la sesión/venta, que son null, y no traen filas.
  if c.sale_id is not null then
    select * into v_sale from public.sales s where s.id = c.sale_id and s.organization_id = p_organization_id;
  end if;

  with
  web as (
    -- Rondas del QR ya en la cuenta de la mesa.
    select wo.id::text as clave, 'web'::text as origen, wo.created_at as creada, wo.diner_label as comensal,
           coalesce((select public.fn_mesa_estado_ronda(kt.status) from public.kitchen_tickets kt
                      where kt.web_order_id = wo.id and kt.organization_id = p_organization_id
                        and kt.ticket_type = 'order'
                      order by kt.created_at desc limit 1),
                    case when wo.status in ('ready') then 'lista'
                         when wo.status in ('delivered') then 'servida'
                         when wo.status = 'preparing' then 'en_preparacion'
                         else 'enviada' end) as estado,
           (select kt.ready_at from public.kitchen_tickets kt
             where kt.web_order_id = wo.id and kt.organization_id = p_organization_id and kt.ticket_type = 'order'
             order by kt.created_at desc limit 1) as lista_at,
           coalesce((select jsonb_agg(public.fn_mesa_linea_publica(si, wo.diner_label, null) order by si.created_at, si.id)
                       from public.sale_items si
                      where si.sale_id = c.sale_id and si.quantity > 0
                        and si.notes->>'from_web_order' = wo.order_number), '[]'::jsonb) as items,
           coalesce((select sum(si.total) from public.sale_items si
                      where si.sale_id = c.sale_id and si.quantity > 0
                        and si.notes->>'from_web_order' = wo.order_number), 0) as subtotal
      from public.web_orders wo
     where wo.table_session_id = c.session_id and wo.organization_id = p_organization_id
       and wo.status not in ('cancelled', 'rejected', 'refunded', 'expired')
  ),
  pendientes as (
    -- Rondas del QR que el equipo aún no confirma (sin la sesión todavía).
    select wo.id::text as clave, 'web'::text as origen, wo.created_at as creada, wo.diner_label as comensal,
           'por_confirmar'::text as estado, null::timestamptz as lista_at,
           coalesce((select jsonb_agg(jsonb_build_object(
                        'id', i.id, 'nombre', i.product_name, 'cantidad', i.quantity, 'total', round(coalesce(i.total, 0), 2),
                        'modificadores', coalesce((select jsonb_agg(m.value->>'name')
                                                     from jsonb_array_elements(case when jsonb_typeof(i.modifiers) = 'array'
                                                                                    then i.modifiers else '[]'::jsonb end) m
                                                    where coalesce(m.value->>'name', '') <> ''), '[]'::jsonb),
                        'nota', nullif(left(btrim(coalesce(i.notes, '')), 200), ''),
                        'comensal', coalesce(i.diner_label, wo.diner_label), 'estado', null, 'pagada', false) order by i.created_at, i.id)
                       from public.web_order_items i where i.web_order_id = wo.id), '[]'::jsonb) as items,
           coalesce(wo.total, 0) as subtotal
      from public.web_orders wo
     where wo.restaurant_table_id = c.mesa_id and wo.organization_id = p_organization_id
       and wo.table_session_id is null and wo.status = 'pending'
       -- Ventana: las últimas 4 h, sin pasar de la sesión anterior ya cerrada de esa mesa. Antes era
       -- `>= opened_at`: la ronda enviada justo antes de que el equipo abriera la sesión (al
       -- confirmar otra ronda) quedaba fuera y el comensal no la veía nunca.
       and wo.created_at >= greatest(now() - interval '4 hours',
                                     coalesce((select max(ts.closed_at) from public.table_sessions ts
                                                where ts.restaurant_table_id = c.mesa_id
                                                  and ts.organization_id = p_organization_id
                                                  and ts.status not in ('active', 'bill_requested')
                                                  and ts.closed_at is not null), '-infinity'::timestamptz))
  ),
  pos as (
    -- Rondas que el mesero mandó desde el POS.
    select kt.id::text as clave, 'mesero'::text as origen, kt.created_at as creada, null::text as comensal,
           public.fn_mesa_estado_ronda(kt.status) as estado, kt.ready_at as lista_at,
           coalesce((select jsonb_agg(public.fn_mesa_linea_publica(si, null, public.fn_mesa_estado_ronda(
                                        case ki.status when 'pending' then 'new' when 'in_progress' then 'preparing'
                                                       else ki.status end)) order by si.created_at, si.id)
                       from public.kitchen_ticket_items ki
                       join public.sale_items si on si.id = ki.sale_item_id
                      where ki.kitchen_ticket_id = kt.id and ki.status <> 'cancelled' and si.quantity > 0), '[]'::jsonb) as items,
           coalesce((select sum(si.total) from public.kitchen_ticket_items ki
                       join public.sale_items si on si.id = ki.sale_item_id
                      where ki.kitchen_ticket_id = kt.id and ki.status <> 'cancelled' and si.quantity > 0), 0) as subtotal
      from public.kitchen_tickets kt
     where kt.table_session_id = c.session_id and kt.organization_id = p_organization_id
       and kt.ticket_type = 'order' and kt.web_order_id is null and kt.status <> 'cancelled'
  ),
  otros as (
    -- En la cuenta sin comanda ni ronda web (bebidas, líneas por enviar del mesero).
    select 'otros'::text as clave, 'mesero'::text as origen, min(si.created_at) as creada, null::text as comensal,
           'servida'::text as estado, null::timestamptz as lista_at,
           jsonb_agg(public.fn_mesa_linea_publica(si, null, null) order by si.created_at, si.id) as items,
           sum(si.total) as subtotal
      from public.sale_items si
     where si.sale_id = c.sale_id and si.quantity > 0
       and coalesce(si.notes->>'from_web_order', '') = ''
       and not exists (select 1 from public.kitchen_ticket_items ki
                         join public.kitchen_tickets kt on kt.id = ki.kitchen_ticket_id
                        where ki.sale_item_id = si.id and kt.organization_id = p_organization_id
                          and kt.ticket_type = 'order')
    having count(*) > 0
  ),
  todas as (
    select * from web union all select * from pendientes union all select * from pos union all select * from otros
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'clave', t.clave, 'numero', t.numero, 'origen', t.origen, 'creada', t.creada,
           'comensal', t.comensal, 'estado', t.estado, 'lista_at', t.lista_at,
           'items', t.items, 'subtotal', round(t.subtotal, 2)) order by t.numero), '[]'::jsonb)
    into v_rondas
    from (select x.*, row_number() over (order by x.creada, x.clave) as numero from todas x) t;

  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'status', r.status, 'created_at', r.created_at)
                            order by r.created_at desc), '[]'::jsonb)
    into v_solicitudes
    from public.table_service_requests r
   where c.session_id is not null and r.table_session_id = c.session_id and r.status in ('open', 'ack');

  return jsonb_build_object(
    'mesa', v_mesa,
    'sesion', case when c.session_id is null then null
                   else jsonb_build_object('estado', c.session_status, 'abierta_desde', c.opened_at,
                                           'personas', c.customers,
                                           'mesero', public.fn_mesa_qr_nombre_mesero(c.server_id)) end,
    'rondas', v_rondas,
    'total', round(coalesce(v_sale.total, 0), 2),
    'impuesto', round(coalesce(v_sale.tax_total, 0), 2),
    'impuesto_incluido', coalesce(v_sale.tax_included, false),
    'solicitudes', v_solicitudes);
end;
$f$;

comment on function public.fn_mesa_pedido_publico(integer, uuid) is
  'Carta QR: el pedido de la mesa en rondas (QR, POS, sin comanda y por confirmar) con estado de cocina y comensal. Sin sesión: la mesa y las rondas del QR por confirmar. Service role.';

revoke all on function public.fn_mesa_pedido_publico(integer, uuid) from public, anon, authenticated;
grant execute on function public.fn_mesa_pedido_publico(integer, uuid) to service_role;
