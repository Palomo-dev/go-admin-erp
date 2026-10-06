-- Aplicada el 2026-10-06 18:12:11 UTC con apply_migration (versión 20261006181211).
-- Carta QR en la mesa · 2/4 — rondas y «quién pidió qué».
-- Figma «16 Sitio web» 2032:75742, láminas 04, 05, 06, 15 y 20 «Conectado».
--
-- Problema: el comensal no veía el pedido de su mesa: ni las rondas que pidió el mesero en el
-- POS ni las que mandó desde el QR, ni su estado en cocina. Y el pedido web no guardaba quién
-- de la mesa pidió cada ronda.
--
-- Qué hace (aditivo):
-- 1. `web_orders.diner_label text NULL` (≤ 40): el comensal que pidió la ronda en la Carta QR
--    («Yo», «Ana»). Lo escribe el servidor del sitio ya saneado; el POS lo muestra.
-- 2. `restaurant_booking_settings.qr_rounds_auto_confirm boolean NOT NULL DEFAULT false`: ajuste
--    por sede «las rondas de la Carta QR entran solas a la mesa, sin confirmar». Apagado por
--    defecto (hoy entran cuando el equipo las confirma en POS › Pedidos online). Lo usa el
--    endpoint del ERP POST /api/web-orders/[id]/mesa-ronda, que reutiliza agregarPedidoALaMesa
--    (pos_mesa_agregar_pedido_web con el reparto de webOrderTotals): la base no reparte líneas.
-- 3. `fn_mesa_estado_ronda(estado_comanda)`: new → enviada, preparing → en_preparacion,
--    ready → lista, delivered → servida, cancelled → cancelada.
-- 4. RPC pública `fn_mesa_pedido_publico(org, mesa)` (service role): el pedido de la sesión
--    ACTIVA de esa mesa, en rondas:
--    - rondas web de la sesión (web_orders.table_session_id) con sus líneas de la cuenta
--      (sale_items.notes.from_web_order) y el estado de su comanda (kitchen_tickets.web_order_id);
--    - rondas del POS (kitchen_tickets de la sesión sin web_order_id) con sus líneas;
--    - lo que está en la cuenta sin comanda (bebidas que no van a cocina, líneas por enviar);
--    - rondas del QR que el equipo aún no confirma (web_orders pending de la mesa, desde que se
--      abrió la sesión): «por confirmar».
--    Cada línea con su comensal (diner_label de la ronda web, o «Comensal N» del POS).
--    Sin sesión activa: solo la mesa (el QR fotografiado no deja ver cuentas cerradas).
--    Nada de datos personales: ni cliente, ni teléfono, ni correo, ni mesero más allá de su
--    primer nombre.
--
-- Verificado por MCP (2026-10-06): web_orders (restaurant_table_id, table_session_id, status,
-- order_number, created_at), web_order_items (product_name, quantity, total, modifiers jsonb
-- [{name, groupName, extraPrice}], notes), sale_items (sale_id, quantity, total, notes jsonb con
-- product_name, from_web_order, modifiers, customer_notes, guest_number, por_enviar, ronda),
-- kitchen_tickets (table_session_id, web_order_id, ticket_type order|adjustment, status
-- new|preparing|ready|delivered|cancelled, created_at, ready_at), kitchen_ticket_items
-- (kitchen_ticket_id, sale_item_id, status), sales (total, tax_total, tax_included),
-- restaurant_booking_settings UNIQUE (organization_id, branch_id).
-- Depende de 20261006180921_carta_qr_solicitudes_mesa (fn_mesa_qr_sesion, fn_mesa_qr_nombre_mesero).
--
-- ENSAYO (2026-10-06, execute_sql: UN bloque `do` con las 4 migraciones 20261006180921…181513
-- enteras —sin comentarios— y las pruebas, que se deshace con `raise exception`. Org 140, sede
-- 115, Mesa 1 con sesión activa (venta de 83.000, 3 líneas) y Mesa 2 libre; una conexión Wompi
-- sandbox y su método de pago creados DENTRO del bloque). Resultado tal cual:
--   ENSAYO_OK anon_pedido=42501 anon_solicitar=42501 anon_cuenta=42501 anon_resultado=42501
--   anon_valorar=42501 anon_atender=42501 anon_lee_solicitudes=42501 anon_lee_abonos=42501
--   anon_lee_valoraciones=42501 | auth_pedido=42501 auth_solicitar=42501 auth_abono=42501
--   auth_resultado=42501 auth_valorar=42501 auth_insert=42501 | sin_sesion=SIN_SESION
--   pedido_sin_sesion=null/0 otra_org=P0002 MESA_INVALIDA solicitar=true:open:mesero=<nombre>
--   repetido=true:true cancelar=true cuenta=true:bill_requested:bill_requested
--   cuenta_repetida=true avisos=2 aviso_cuenta=[Mesa 1 pide la cuenta | /app/pos/mesas/<mesa>]
--   | pedido: sesion=bill_requested rondas=3 total=83000.00 items_r1=1 estado_r1=servida
--   solicitudes=1 | cuenta: total=83000.00 saldo=83000.00 pasarela=null comensales=2
--   abono_sin_pasarela=SIN_PASARELA | iguales_visto_mal=MONTO_CAMBIO:41500.00
--   iguales=true:41500.00+4150.00:wompi_co:ref_ok=true en_curso=PAGO_EN_CURSO monto_bajo=MONTO
--   otra_org=42501 pago=paid:saldo=41500.00 repetido=YA_PROCESADO
--   pagos=1:invoice_sales/wompi/45650.00/carta_qr/tx-ensayo-1 abonado_lineas=41500.00
--   tip=4150.00 venta=pending/partial/41500.00 tips=1 | cuenta2: pagado=45650.00 saldo=41500.00
--   abonos=1 pend_comensal0=14500.00 resto=41500.00 pago2=paid:saldo=0.00
--   pago_que_excede=paid_unapplied:NO_APLICADO:venta_ya_pagada tras_pagar=CUENTA_PAGADA
--   venta_final=paid/paid/0.00 lineas_sin_pagar=0 avisos_pago=3 valorar_activa=true |
--   cerrada_pedido=null cerrada_solicitar=SIN_SESION valorar=true:El servicio+La comida:4
--   valorar_6=22023 valorar_sin_sesion=SIN_SESION | auth_lee_solicitudes=2 auth_lee_abonos=3
--   auth_lee_valoraciones=2 atender_ack=ack ack_otra_vez=false done=done actor_ajeno=42501
--   otra_org=42501
-- Lectura: anon y authenticated no ejecutan ninguna RPC pública ni leen/escriben las tablas
-- nuevas (authenticated miembro sí lee por RLS y atiende con la RPC de staff). Sin sesión
-- activa todo responde SIN_SESION. Otra organización: MESA_INVALIDA / 42501. El abono reparte
-- con pos_checkout_v1 (paid_amount 41.500 en líneas, propina 4.150 en sales.tip_amount y tips,
-- pago invoice_sales/wompi con origen carta_qr y la transacción); el mismo evento dos veces =
-- YA_PROCESADO; un segundo abono que llega con la cuenta ya pagada queda paid_unapplied con
-- aviso (venta_ya_pagada). Archivo del ensayo: no se versiona (scratchpad).

set lock_timeout = '10s';

-- ── 1 y 2. Columnas ─────────────────────────────────────────────────────────────────────────
alter table public.web_orders
  add column if not exists diner_label text null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'web_orders_diner_label_largo'
                   and conrelid = 'public.web_orders'::regclass) then
    alter table public.web_orders
      add constraint web_orders_diner_label_largo
      check (diner_label is null or char_length(diner_label) <= 40) not valid;
    alter table public.web_orders validate constraint web_orders_diner_label_largo;
  end if;
end $$;

comment on column public.web_orders.diner_label is
  'Carta QR: comensal de la mesa que pidió esta ronda («Ana»). Lo escribe el sitio saneado (≤ 40).';

alter table public.restaurant_booking_settings
  add column if not exists qr_rounds_auto_confirm boolean not null default false;

comment on column public.restaurant_booking_settings.qr_rounds_auto_confirm is
  'Carta QR: las rondas pedidas desde el QR de una mesa con sesión activa entran solas a la cuenta y a cocina, sin confirmar en POS › Pedidos online. Apagado por defecto.';

-- ── 3. Estado de la ronda para el comensal ──────────────────────────────────────────────────
create or replace function public.fn_mesa_estado_ronda(p_estado_comanda text)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $f$
  select case p_estado_comanda
           when 'new' then 'enviada'
           when 'preparing' then 'en_preparacion'
           when 'ready' then 'lista'
           when 'delivered' then 'servida'
           when 'cancelled' then 'cancelada'
           else 'enviada'
         end;
$f$;

revoke all on function public.fn_mesa_estado_ronda(text) from public, anon;
grant execute on function public.fn_mesa_estado_ronda(text) to authenticated, service_role;

-- Línea de la cuenta para el comensal (interna): nombre, cantidad, total, extras, nota.
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
    'comensal', coalesce(p_comensal,
                         case when p_si.notes ? 'guest_number' then 'Comensal ' || (p_si.notes->>'guest_number') end),
    'estado', p_estado,
    'pagada', p_si.paid_at is not null);
$f$;

revoke all on function public.fn_mesa_linea_publica(public.sale_items, text, text) from public, anon, authenticated;
grant execute on function public.fn_mesa_linea_publica(public.sale_items, text, text) to service_role;

-- ── 4. Pedido de la mesa ────────────────────────────────────────────────────────────────────
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
                        'comensal', wo.diner_label, 'estado', null, 'pagada', false) order by i.created_at, i.id)
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
