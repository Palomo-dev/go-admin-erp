-- Rollback de 20261007170528_carta_qr_ronda_por_confirmar.
-- Vuelve fn_mesa_pedido_publico al cuerpo de 20261006181909 (sin sesión: solo la mesa, sin
-- rondas; pendientes desde opened_at) y quita el índice, la restricción y la columna round_key.
-- ⚠️ Pierde web_orders.round_key: no se restaura (solo servía para no duplicar reintentos).
-- El sitio tolera la columna ausente: /api/orders reintenta el insert sin la clave.

set lock_timeout = '10s';

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

drop index if exists public.idx_web_orders_round_key;
alter table public.web_orders drop constraint if exists web_orders_round_key_forma;
alter table public.web_orders drop column if exists round_key;
