-- Aplicada el 2026-10-06 18:19:09 UTC con apply_migration (versión 20261006181909).
-- Carta QR en la mesa · 5 — «quién pidió qué» por LÍNEA.
-- Figma «16 Sitio web» 2032:75742, lámina 04: la «Ronda 3» lleva platos de «Yo» y de «Ana».
--
-- Enmienda ADITIVA de 20261006181211_carta_qr_pedido_mesa y 20261006181437_carta_qr_abono_en_linea
-- (ya aplicadas): el comensal estaba solo por pedido (web_orders.diner_label) y una ronda tiene
-- platos de varios comensales.
--
-- Qué hace:
-- 1. `web_order_items.diner_label text NULL` (≤ 40): el comensal de cada línea de la ronda. Lo
--    escribe el servidor del sitio saneado. El ERP lo copia a `sale_items.notes.diner_label` al
--    pasar la ronda a la cuenta de la mesa (lineasVentaPedidoWeb).
-- 2. CREATE OR REPLACE, con el mismo cuerpo salvo el comensal:
--    - `fn_mesa_linea_publica`: comensal = notes.diner_label → el de la ronda → «Comensal N».
--    - `fn_mesa_pedido_publico`: en las rondas por confirmar, el comensal de la línea y, si no
--      hay, el de la ronda.
--    - `fn_mesa_comensal_linea` (cuenta por comensal y abono «lo que pidió cada uno»):
--      notes.diner_label → el de la ronda → «Comensal N».
--    Mismas firmas y mismos permisos (solo service role).
--
-- ENSAYO (2026-10-06, execute_sql: un bloque `do` con esta migración entera —sin comentarios— y
-- las pruebas, deshecho con `raise exception`; org 140, Mesa 1 con sesión activa, una ronda
-- dine_in por confirmar con líneas de «Yo» y «Ana», una línea de la cuenta marcada «Ana» y una
-- conexión Wompi sandbox creadas DENTRO del bloque). Resultado tal cual:
--   ENSAYO_OK largo=23514 anon_pedido=42501 anon_lee_items=42501 auth_pedido=42501
--   auth_cuenta=42501 auth_linea=42501 | rondas=[1:servida:<plato>@Ana | 2:servida:<plato>@Comensal 1
--   | 3:lista:<plato>@Comensal 2 | 4:por_confirmar:Lomo al carbón@Yo,Limonada de coco@Ana] |
--   comensales=[Ana=27000.00,Comensal 1=29000.00,Comensal 2=27000.00] saldo=83000.00 |
--   abono_ana=true:27000.00 pago_ana=paid:saldo=56000.00
--   lineas=[Ana=27000.00:27000.00/true,mesa=29000.00:0/false,mesa=27000.00:0/false] tip=1000.00
-- Lectura: el comensal sale por línea en las rondas por confirmar y en la cuenta; «lo que pidió
-- cada uno» cobra solo las líneas de Ana (pos_checkout_v1 settle con paid_sale_item_ids: su
-- línea queda pagada, las demás intactas, propina a la venta). anon y authenticated: 42501.

set lock_timeout = '10s';

alter table public.web_order_items
  add column if not exists diner_label text null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'web_order_items_diner_label_largo'
                   and conrelid = 'public.web_order_items'::regclass) then
    alter table public.web_order_items
      add constraint web_order_items_diner_label_largo
      check (diner_label is null or char_length(diner_label) <= 40) not valid;
    alter table public.web_order_items validate constraint web_order_items_diner_label_largo;
  end if;
end $$;

comment on column public.web_order_items.diner_label is
  'Carta QR: comensal de la mesa para quien es esta línea («Ana»). El ERP lo copia a sale_items.notes.diner_label.';

create or replace function public.fn_mesa_linea_publica(p_si public.sale_items, p_comensal text, p_estado text)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $f$
  select jsonb_build_object(
    'id', p_si.id,
    'nombre', coalesce(nullif(p_si.notes->>'product_name', ''),
                       (select p.name from public.products p where p.id = p_si.product_id), 'Producto'),
    'cantidad', p_si.quantity,
    'total', round(coalesce(p_si.total, 0), 2),
    'modificadores', coalesce((
      select jsonb_agg(m.value->>'name')
        from jsonb_array_elements(case when jsonb_typeof(p_si.notes->'modifiers') = 'array'
                                       then p_si.notes->'modifiers' else '[]'::jsonb end) m
       where coalesce(m.value->>'name', '') <> ''), '[]'::jsonb),
    'nota', nullif(left(btrim(coalesce(p_si.notes->>'customer_notes', p_si.notes->>'extra', '')), 200), ''),
    'comensal', coalesce(nullif(p_si.notes->>'diner_label', ''), p_comensal,
                         case when p_si.notes ? 'guest_number' then 'Comensal ' || (p_si.notes->>'guest_number') end),
    'estado', p_estado,
    'pagada', p_si.paid_at is not null);
$f$;

revoke all on function public.fn_mesa_linea_publica(public.sale_items, text, text) from public, anon, authenticated;
grant execute on function public.fn_mesa_linea_publica(public.sale_items, text, text) to service_role;

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
  if c.session_id is null then
    return jsonb_build_object('mesa', v_mesa, 'sesion', null, 'rondas', '[]'::jsonb,
                              'total', 0, 'impuesto', 0, 'impuesto_incluido', false, 'solicitudes', '[]'::jsonb);
  end if;
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
       and wo.created_at >= coalesce(c.opened_at, now() - interval '4 hours')
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
   where r.table_session_id = c.session_id and r.status in ('open', 'ack');

  return jsonb_build_object(
    'mesa', v_mesa,
    'sesion', jsonb_build_object('estado', c.session_status, 'abierta_desde', c.opened_at,
                                 'personas', c.customers,
                                 'mesero', public.fn_mesa_qr_nombre_mesero(c.server_id)),
    'rondas', v_rondas,
    'total', round(coalesce(v_sale.total, 0), 2),
    'impuesto', round(coalesce(v_sale.tax_total, 0), 2),
    'impuesto_incluido', coalesce(v_sale.tax_included, false),
    'solicitudes', v_solicitudes);
end;
$f$;

comment on function public.fn_mesa_pedido_publico(integer, uuid) is
  'Carta QR: el pedido de la sesión ACTIVA de la mesa en rondas (QR, POS, sin comanda y por confirmar) con estado de cocina y comensal. Sin sesión: solo la mesa. Service role.';

revoke all on function public.fn_mesa_pedido_publico(integer, uuid) from public, anon, authenticated;
grant execute on function public.fn_mesa_pedido_publico(integer, uuid) to service_role;

create or replace function public.fn_mesa_comensal_linea(p_organization_id integer, p_si public.sale_items)
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $f$
  select coalesce(
    nullif(p_si.notes->>'diner_label', ''),
    (select wo.diner_label from public.web_orders wo
      where wo.organization_id = p_organization_id
        and wo.order_number = p_si.notes->>'from_web_order'
        and coalesce(p_si.notes->>'from_web_order', '') <> ''
      limit 1),
    case when p_si.notes ? 'guest_number' then 'Comensal ' || (p_si.notes->>'guest_number') end);
$f$;

revoke all on function public.fn_mesa_comensal_linea(integer, public.sale_items) from public, anon, authenticated;
grant execute on function public.fn_mesa_comensal_linea(integer, public.sale_items) to service_role;
