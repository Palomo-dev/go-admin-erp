-- Inventario B3 · Traslados y distribución: consultas, distribución y avisos.
--
-- Antes: la lista y el detalle se armaban en el navegador (N consultas por
-- renglón, «disponible» siempre 0 porque filtraba stock_levels por una columna
-- que no existe, «Creado por» con el UUID) y la distribución tomaba la
-- organización de localStorage y creaba traslados uno a uno sin transacción.
--
-- Ahora (todas SECURITY DEFINER, fn_inventario_exigir_permiso, REVOKE anon):
-- * fn_traslados_listado(org, filtros): paginado en el servidor con KPI reales
--   (por despachar, en tránsito, recibidos del mes, con diferencia) y los
--   traslados en tránsito hace más de 30 días (aviso de Figma).
-- * fn_traslado_detalle(org, id): renglones con lote, seriales, costo (solo con
--   permiso de costos), lo disponible en el origen y los seriales que se pueden
--   escanear al despachar; seguimiento con autor; movimientos del kardex.
-- * fn_traslado_productos(org, origen, busqueda, ids, limite): el buscador del
--   nuevo traslado con lo disponible en el origen por lote.
-- * fn_distribucion_ordenes(org, origen) y fn_distribucion_crear(org, datos,
--   clave): distribución = varios traslados desde un origen, con la orden de
--   producción opcional; tope por lo disponible y por lo que falta distribuir de
--   la orden; todo en una transacción e idempotente.
-- * fn_inv_documentos: el número del traslado es su código (TR-0041) y la merma
--   por faltante en el transporte (loss «traslado:<id>») enlaza al traslado.
--   Parche sobre la definición viva con marcadores únicos (B0.5).
-- * fn_auto_journal_inventory_transfer queda sin efecto: el asiento lo hace
--   fn_traslado_recibir por cada recepción (antes buscaba source 'transfer',
--   que ya nadie escribe, y nunca asentaba).
-- * fn_notify_transfer_status / _created: estados reales y código legible.

-- ─── Listado ────────────────────────────────────────────────────────────────

create or replace function public.fn_traslados_listado(p_org integer, p_filtros jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_tz text := public.fn_timezone_for(p_org, null);
  v_hoy date := (now() at time zone public.fn_timezone_for(p_org, null))::date;
  v_mes timestamptz;
  v_busqueda text := nullif(btrim(coalesce(f->>'busqueda', '')), '');
  v_estados text[];
  v_sucursal integer := public.fn_traslado_int_entero(f->>'sucursal');
  v_origen integer := public.fn_traslado_int_entero(f->>'origen');
  v_destino integer := public.fn_traslado_int_entero(f->>'destino');
  v_op integer := public.fn_traslado_int_entero(f->>'orden_produccion');
  v_solo_prod boolean := coalesce((f->>'solo_produccion')::boolean, false);
  v_sin_cancel boolean := coalesce((f->>'excluir_cancelados')::boolean, false);
  v_desde date;
  v_hasta date;
  v_por_codigo boolean := coalesce(f->>'orden', 'fecha') = 'codigo';
  v_asc boolean := coalesce(f->>'direccion', 'desc') = 'asc';
  v_offset integer := greatest(coalesce(public.fn_traslado_int_entero(f->>'desde_fila'), 0), 0);
  v_limite integer := least(greatest(coalesce(public.fn_traslado_int_entero(f->>'limite'), 25), 1), 5000);
  v_ver_costos boolean;
  v_out jsonb;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['ver']);
  v_ver_costos := coalesce((public.fn_inventario_permisos(p_org)->>'costos')::boolean, false);
  v_mes := date_trunc('month', v_hoy)::timestamp at time zone v_tz;

  if jsonb_typeof(f->'estados') = 'array' then
    select array_agg(x) into v_estados from jsonb_array_elements_text(f->'estados') x
     where x in ('pending', 'in_transit', 'received', 'con_diferencia', 'cancelled');
  end if;
  if coalesce(f->>'desde', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then v_desde := (f->>'desde')::date; end if;
  if coalesce(f->>'hasta', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then v_hasta := (f->>'hasta')::date; end if;
  if f->>'periodo' = 'hoy' then
    v_desde := v_hoy;
  elsif f->>'periodo' = '7d' then
    v_desde := v_hoy - 6;
  elsif f->>'periodo' = 'mes' then
    v_desde := date_trunc('month', v_hoy)::date;
  end if;

  with base as materialized (
    -- Alcance: organización, sucursal del encabezado, origen y producción.
    select t.id, t.code, t.status, t.origin_branch_id, t.dest_branch_id, t.created_at, t.created_by,
           t.shipped_at, t.received_at, t.cancelled_at, t.cancel_reason, t.notes, t.production_order_id,
           coalesce(i.productos, 0) as productos, coalesce(i.renglones, 0) as renglones,
           coalesce(i.enviadas, 0) as enviadas, coalesce(i.recibidas, 0) as recibidas,
           coalesce(i.faltantes, 0) as faltantes, coalesce(i.devueltas, 0) as devueltas,
           coalesce(i.valor, 0) as valor, i.primer_producto
      from public.inventory_transfers t
      left join lateral (
        select count(distinct ti.product_id)::integer as productos, count(*)::integer as renglones,
               sum(ti.quantity) as enviadas, sum(coalesce(ti.received_qty, 0)) as recibidas,
               sum(ti.missing_qty) as faltantes, sum(ti.returned_qty) as devueltas,
               sum(ti.quantity * coalesce(ti.unit_cost, 0)) as valor,
               (select p.name from public.transfer_items t2 join public.products p on p.id = t2.product_id
                 where t2.inventory_transfer_id = t.id order by t2.id limit 1) as primer_producto
          from public.transfer_items ti where ti.inventory_transfer_id = t.id
      ) i on true
     where t.organization_id = p_org
       and (v_sucursal is null or t.origin_branch_id = v_sucursal or t.dest_branch_id = v_sucursal)
       and (v_origen is null or t.origin_branch_id = v_origen)
       and (not v_solo_prod or t.production_order_id is not null)
       and (v_op is null or t.production_order_id = v_op)
  ),
  filtrada as (
    select b.* from base b
     where (v_destino is null or b.dest_branch_id = v_destino)
       and (not v_sin_cancel or b.status <> 'cancelled')
       and (v_estados is null
            or (b.status = 'pending' and 'pending' = any(v_estados))
            or (b.status = 'in_transit' and 'in_transit' = any(v_estados))
            or (b.status = 'received' and b.faltantes = 0 and 'received' = any(v_estados))
            or (b.faltantes > 0 and 'con_diferencia' = any(v_estados))
            or (b.status = 'cancelled' and 'cancelled' = any(v_estados)))
       and (v_desde is null or b.created_at >= (v_desde::timestamp at time zone v_tz))
       and (v_hasta is null or b.created_at < ((v_hasta + 1)::timestamp at time zone v_tz))
       and (v_busqueda is null
            or b.code ilike '%' || v_busqueda || '%'
            or coalesce(b.notes, '') ilike '%' || v_busqueda || '%'
            or exists (select 1 from public.branches br where br.id in (b.origin_branch_id, b.dest_branch_id)
                        and br.name ilike '%' || v_busqueda || '%')
            or exists (select 1 from public.transfer_items ti join public.products p on p.id = ti.product_id
                        where ti.inventory_transfer_id = b.id
                          and (p.name ilike '%' || v_busqueda || '%' or coalesce(p.sku, '') ilike '%' || v_busqueda || '%'
                               or coalesce(p.barcode, '') = v_busqueda)))
  ),
  pagina as (
    select x.*, row_number() over (
             order by
               case when v_por_codigo and v_asc then substring(x.code from '[0-9]+')::bigint end asc nulls last,
               case when v_por_codigo and not v_asc then substring(x.code from '[0-9]+')::bigint end desc nulls last,
               case when not v_por_codigo and v_asc then x.created_at end asc,
               case when not v_por_codigo and not v_asc then x.created_at end desc,
               x.id desc) as n
      from filtrada x
  )
  select jsonb_build_object(
    'filas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'code', x.code, 'estado', x.status, 'con_diferencia', x.faltantes > 0,
               'origen', jsonb_build_object('id', x.origin_branch_id, 'nombre', bo.name),
               'destino', jsonb_build_object('id', x.dest_branch_id, 'nombre', bd.name),
               'creado_en', x.created_at,
               'autor', nullif(btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''),
               'despachado_en', x.shipped_at, 'recibido_en', x.received_at, 'cancelado_en', x.cancelled_at,
               'motivo_cancelacion', x.cancel_reason, 'notas', x.notes,
               'productos', x.productos, 'renglones', x.renglones, 'enviadas', x.enviadas, 'recibidas', x.recibidas,
               'faltantes', x.faltantes, 'devueltas', x.devueltas,
               'valor', case when v_ver_costos then round(x.valor, 2) end,
               'primer_producto', x.primer_producto,
               'orden_produccion', case when x.production_order_id is not null
                 then jsonb_build_object('id', x.production_order_id, 'numero', 'OP-' || x.production_order_id) end,
               'atascado', x.status = 'in_transit' and coalesce(x.shipped_at, x.created_at) < now() - interval '30 days'
             ) order by x.n)
        from pagina x
        left join public.branches bo on bo.id = x.origin_branch_id
        left join public.branches bd on bd.id = x.dest_branch_id
        left join public.profiles pr on pr.id = x.created_by
       where x.n > v_offset and x.n <= v_offset + v_limite), '[]'::jsonb),
    'total', (select count(*) from filtrada),
    'kpis', (select jsonb_build_object(
        'por_despachar', count(*) filter (where status = 'pending'),
        'por_despachar_unidades', coalesce(sum(enviadas) filter (where status = 'pending'), 0),
        'en_transito', count(*) filter (where status = 'in_transit'),
        'en_transito_unidades', coalesce(sum(enviadas - recibidas - faltantes - devueltas) filter (where status = 'in_transit'), 0),
        'en_transito_desde', min(coalesce(shipped_at, created_at)) filter (where status = 'in_transit'),
        'recibidos_mes', count(*) filter (where status = 'received' and received_at >= v_mes),
        'recibidos_mes_unidades', coalesce(sum(recibidas) filter (where status = 'received' and received_at >= v_mes), 0),
        'con_diferencia', count(*) filter (where faltantes > 0),
        'con_diferencia_enviadas', coalesce(sum(enviadas) filter (where faltantes > 0), 0),
        'con_diferencia_recibidas', coalesce(sum(recibidas) filter (where faltantes > 0), 0),
        'total', count(*)) from base),
    'atascados', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'code', a.code, 'unidades', a.enviadas - a.recibidas - a.faltantes - a.devueltas,
               'origen', (select br.name from public.branches br where br.id = a.origin_branch_id),
               'destino', (select br.name from public.branches br where br.id = a.dest_branch_id),
               'desde', coalesce(a.shipped_at, a.created_at)) order by coalesce(a.shipped_at, a.created_at))
        from (select * from base
               where status = 'in_transit' and coalesce(shipped_at, created_at) < now() - interval '30 days'
               order by coalesce(shipped_at, created_at) limit 3) a), '[]'::jsonb),
    'hoy', v_hoy
  ) into v_out;

  return v_out;
end;
$$;

-- ─── Detalle ────────────────────────────────────────────────────────────────

create or replace function public.fn_traslado_detalle(p_org integer, p_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_t record;
  v_costos boolean;
  v_items jsonb;
  v_eventos jsonb;
  v_movs jsonb;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['ver']);
  v_costos := coalesce((public.fn_inventario_permisos(p_org)->>'costos')::boolean, false);
  select * into v_t from public.inventory_transfers t where t.id = p_id and t.organization_id = p_org;
  if not found then
    raise exception 'traslado_no_encontrado' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', ti.id, 'product_id', ti.product_id, 'nombre', p.name, 'sku', p.sku, 'unidad', p.unit_code,
           'variante', (select string_agg(v.value, ' / ' order by v.key) from jsonb_each_text(
                          case when jsonb_typeof(p.variant_data) = 'object' then p.variant_data else '{}'::jsonb end) v
                        where btrim(v.value) <> ''),
           'track_serial', coalesce(p.track_serial, false), 'track_lots', coalesce(p.track_lots, false),
           'lote', case when l.id is not null then jsonb_build_object('id', l.id, 'codigo', l.lot_code, 'vence', l.expiry_date) end,
           'cantidad', ti.quantity, 'recibido', coalesce(ti.received_qty, 0), 'faltante', ti.missing_qty,
           'devuelto', ti.returned_qty,
           'pendiente', ti.quantity - coalesce(ti.received_qty, 0) - ti.missing_qty - ti.returned_qty,
           'costo', case when v_costos then coalesce(ti.unit_cost,
                          case when v_t.status = 'pending' then
                            (select sl.avg_cost from public.stock_levels sl
                              where sl.product_id = ti.product_id and sl.branch_id = v_t.origin_branch_id
                                and sl.lot_id is not distinct from ti.lot_id order by sl.id limit 1) end) end,
           'motivo', ti.difference_reason, 'estado', ti.status,
           'seriales', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'serial', s.serial, 'estado', s.status) order by s.serial), '[]'::jsonb)
                          from public.serial_numbers s where s.id = any(coalesce(ti.serial_ids, array[]::integer[]))),
           'disponible', case when v_t.status = 'pending'
                           then public.fn_traslado_int_disponible(p_org, v_t.origin_branch_id, ti.product_id, ti.lot_id) end,
           'seriales_disponibles', case when v_t.status = 'pending' and coalesce(p.track_serial, false) then
             (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'serial', s.serial) order by s.serial), '[]'::jsonb)
                from (select s.id, s.serial from public.serial_numbers s
                       where s.organization_id = p_org and s.product_id = ti.product_id and s.status = 'in_stock'
                         and coalesce(s.current_branch_id, s.branch_id, v_t.origin_branch_id) = v_t.origin_branch_id
                         and (ti.lot_id is null or s.lot_id is null or s.lot_id = ti.lot_id)
                       order by s.serial limit 500) s) end
         ) order by ti.id), '[]'::jsonb)
    into v_items
    from public.transfer_items ti
    join public.products p on p.id = ti.product_id
    left join public.lots l on l.id = ti.lot_id
   where ti.inventory_transfer_id = p_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'tipo', e.tipo, 'fecha', e.created_at,
           'autor', nullif(btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''),
           'detalle', case when v_costos then e.detalle - 'resultado'
                           else e.detalle - 'resultado' - 'valor' - 'valor_faltante' end
         ) order by e.created_at, e.id), '[]'::jsonb)
    into v_eventos
    from public.inventory_transfer_events e
    left join public.profiles pr on pr.id = e.created_by
   where e.transfer_id = p_id and e.organization_id = p_org;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'branch_id', m.branch_id, 'product_id', m.product_id, 'lot_id', m.lot_id,
           'direccion', m.direction, 'cantidad', m.qty, 'origen', m.source, 'fecha', m.created_at,
           'costo', case when v_costos then m.unit_cost end
         ) order by m.id), '[]'::jsonb)
    into v_movs
    from public.stock_movements m
   where m.organization_id = p_org
     and ((m.source in ('transfer', 'transfer_in', 'transfer_out') and m.source_id = p_id::text)
          or (m.source = 'loss' and m.source_id = 'traslado:' || p_id));

  return jsonb_build_object(
    'traslado', jsonb_build_object(
      'id', v_t.id, 'code', v_t.code, 'estado', v_t.status, 'notas', v_t.notes,
      'origen', (select jsonb_build_object('id', b.id, 'nombre', b.name) from public.branches b where b.id = v_t.origin_branch_id),
      'destino', (select jsonb_build_object('id', b.id, 'nombre', b.name) from public.branches b where b.id = v_t.dest_branch_id),
      'creado_en', v_t.created_at, 'despachado_en', v_t.shipped_at, 'recibido_en', v_t.received_at,
      'cancelado_en', v_t.cancelled_at, 'motivo_cancelacion', v_t.cancel_reason,
      'autor', (select nullif(btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), '')
                  from public.profiles pr where pr.id = v_t.created_by),
      'despachado_por', (select nullif(btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), '')
                           from public.profiles pr where pr.id = v_t.shipped_by),
      'recibido_por', (select nullif(btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), '')
                         from public.profiles pr where pr.id = v_t.received_by),
      'orden_produccion', case when v_t.production_order_id is not null
        then jsonb_build_object('id', v_t.production_order_id, 'numero', 'OP-' || v_t.production_order_id) end,
      'atascado', v_t.status = 'in_transit' and coalesce(v_t.shipped_at, v_t.created_at) < now() - interval '30 days',
      'legado', v_t.created_at < timestamptz '2026-09-29'
    ),
    'items', v_items, 'eventos', v_eventos, 'movimientos', v_movs, 'ver_costos', v_costos);
end;
$$;

-- ─── Buscador de productos del nuevo traslado ──────────────────────────────

create or replace function public.fn_traslado_productos(
  p_org integer, p_origen integer, p_busqueda text default null, p_ids integer[] default null, p_limite integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_q text := nullif(btrim(coalesce(p_busqueda, '')), '');
  v_lim integer := least(greatest(coalesce(p_limite, 30), 1), 100);
  v_costos boolean;
  v_hoy date;
  v_out jsonb;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['ver']);
  if not exists (select 1 from public.branches b where b.id = p_origen and b.organization_id = p_org) then
    raise exception 'SUCURSAL_NO_ES_DE_LA_ORG' using errcode = '42501';
  end if;
  v_costos := coalesce((public.fn_inventario_permisos(p_org)->>'costos')::boolean, false);
  v_hoy := (now() at time zone public.fn_timezone_for(p_org, p_origen))::date;

  select coalesce(jsonb_agg(fila order by orden, nombre), '[]'::jsonb) into v_out
    from (
      select p.name as nombre,
             case when v_q is not null and (p.barcode = v_q or p.sku = v_q) then 0 else 1 end as orden,
             jsonb_build_object(
               'product_id', p.id, 'nombre', p.name, 'sku', p.sku, 'barcode', p.barcode, 'unidad', p.unit_code,
               'variante', (select string_agg(v.value, ' / ' order by v.key) from jsonb_each_text(
                              case when jsonb_typeof(p.variant_data) = 'object' then p.variant_data else '{}'::jsonb end) v
                            where btrim(v.value) <> ''),
               'track_lots', coalesce(p.track_lots, false), 'track_serial', coalesce(p.track_serial, false),
               'disponible', public.fn_traslado_int_disponible(p_org, p_origen, p.id, null),
               'costo_promedio', case when v_costos then
                 (select sl.avg_cost from public.stock_levels sl
                   where sl.product_id = p.id and sl.branch_id = p_origen and sl.lot_id is null order by sl.id limit 1) end,
               'lotes', (select coalesce(jsonb_agg(jsonb_build_object(
                                  'lot_id', l.id, 'codigo', l.lot_code, 'vence', l.expiry_date, 'disponible', sl.qty_on_hand,
                                  'vencido', l.expiry_date is not null and l.expiry_date < v_hoy)
                                order by l.expiry_date nulls last, l.id), '[]'::jsonb)
                           from public.stock_levels sl join public.lots l on l.id = sl.lot_id
                          where sl.product_id = p.id and sl.branch_id = p_origen and sl.qty_on_hand > 0)
             ) as fila
        from public.products p
       where p.organization_id = p_org
         and coalesce(p.track_stock, false)
         and not coalesce(p.is_parent, false)
         and coalesce(p.product_type, '') <> 'service'
         and coalesce(p.status, 'active') <> 'deleted'
         and (p_ids is null or p.id = any(p_ids))
         and (p_ids is not null or v_q is not null
              or exists (select 1 from public.stock_levels sl where sl.product_id = p.id and sl.branch_id = p_origen and sl.qty_on_hand > 0))
         and (v_q is null or p.name ilike '%' || v_q || '%' or coalesce(p.sku, '') ilike '%' || v_q || '%'
              or coalesce(p.barcode, '') = v_q)
       order by case when v_q is not null and (p.barcode = v_q or p.sku = v_q) then 0 else 1 end, p.name
       limit v_lim
    ) s;
  return v_out;
end;
$$;

-- ─── Distribución ───────────────────────────────────────────────────────────

create or replace function public.fn_distribucion_ordenes(p_org integer, p_origen integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_out jsonb;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['ver']);
  if not exists (select 1 from public.branches b where b.id = p_origen and b.organization_id = p_org) then
    raise exception 'SUCURSAL_NO_ES_DE_LA_ORG' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(fila order by completado desc nulls last, id desc), '[]'::jsonb) into v_out
    from (
      select o.id, o.completed_at as completado, jsonb_build_object(
               'id', o.id, 'numero', 'OP-' || o.id, 'completado_en', o.completed_at,
               'producto', jsonb_build_object('id', p.id, 'nombre', p.name, 'sku', p.sku, 'unidad', p.unit_code),
               'producido', coalesce(o.produced_qty, 0),
               'ya_distribuido', d.ya,
               'disponible', public.fn_traslado_int_disponible(p_org, p_origen, p.id, null),
               'por_distribuir', greatest(least(coalesce(o.produced_qty, 0) - d.ya,
                                                public.fn_traslado_int_disponible(p_org, p_origen, p.id, null)), 0)
             ) as fila
        from public.production_orders o
        join public.products p on p.id = o.product_id
        cross join lateral (
          select coalesce(sum(ti.quantity - ti.returned_qty), 0) as ya
            from public.inventory_transfers t join public.transfer_items ti on ti.inventory_transfer_id = t.id
           where t.organization_id = p_org and t.production_order_id = o.id and t.status <> 'cancelled'
             and ti.product_id = o.product_id
        ) d
       where o.organization_id = p_org and o.branch_id = p_origen and o.status = 'completed'
         and coalesce(o.produced_qty, 0) > 0
       order by o.completed_at desc nulls last, o.id desc
       limit 50
    ) s;
  return v_out;
end;
$$;

create or replace function public.fn_distribucion_crear(p_org integer, p_datos jsonb, p_clave text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_origen integer;
  v_op integer;
  v_despachar boolean;
  v_notas text;
  v_clave text := nullif(btrim(coalesce(p_clave, '')), '');
  v_envio jsonb;
  v_destino integer;
  v_res jsonb;
  v_out jsonb := '[]'::jsonb;
  v_orden record;
  v_ya numeric;
  v_tot record;
  v_disp numeric;
  v_repetido boolean := false;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['trasladar']);
  if jsonb_typeof(p_datos) is distinct from 'object' then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  v_origen := public.fn_traslado_int_entero(p_datos->>'origen');
  v_op := public.fn_traslado_int_entero(p_datos->>'production_order_id');
  v_despachar := coalesce((p_datos->>'despachar')::boolean, false);
  v_notas := nullif(left(btrim(coalesce(p_datos->>'notas', '')), 500), '');
  perform public.fn_traslado_int_sucursal(p_org, v_origen);
  if jsonb_typeof(p_datos->'envios') is distinct from 'array' or jsonb_array_length(p_datos->'envios') = 0 then
    raise exception 'items_requeridos' using errcode = '22023';
  end if;
  if jsonb_array_length(p_datos->'envios') > 30 then
    raise exception 'demasiados_renglones' using errcode = '22023', detail = 'máximo 30 destinos';
  end if;

  if v_op is not null then
    select o.id, o.product_id, o.branch_id, coalesce(o.produced_qty, 0) as producido, o.status into v_orden
      from public.production_orders o where o.id = v_op and o.organization_id = p_org for update;
    if not found or v_orden.status <> 'completed' or v_orden.branch_id <> v_origen then
      raise exception 'orden_produccion_invalida' using errcode = '22023';
    end if;
  end if;

  -- Totales por producto y lote: no más de lo disponible en el origen ni de lo
  -- que falta distribuir de la orden (salvo que la creación ya se hubiera hecho).
  if v_clave is null or not exists (
    select 1 from public.inventory_transfers t where t.organization_id = p_org and t.client_key like v_clave || ':%'
  ) then
    for v_tot in
      select public.fn_traslado_int_entero(i->>'product_id') as product_id,
             public.fn_traslado_int_entero(i->>'lot_id') as lot_id,
             sum(public.fn_traslado_int_numero(i->>'quantity')) as qty
        from jsonb_array_elements(p_datos->'envios') e, jsonb_array_elements(e->'items') i
       group by 1, 2
    loop
      v_disp := public.fn_traslado_int_disponible(p_org, v_origen, v_tot.product_id, v_tot.lot_id);
      if v_tot.qty > v_disp then
        raise exception 'stock_insuficiente' using errcode = '23514',
          detail = jsonb_build_object('product_id', v_tot.product_id, 'branch_id', v_origen, 'lot_id', v_tot.lot_id,
                                      'disponible', v_disp, 'solicitado', v_tot.qty)::text;
      end if;
    end loop;
    if v_op is not null then
      select coalesce(sum(ti.quantity - ti.returned_qty), 0) into v_ya
        from public.inventory_transfers t join public.transfer_items ti on ti.inventory_transfer_id = t.id
       where t.organization_id = p_org and t.production_order_id = v_op and t.status <> 'cancelled'
         and ti.product_id = v_orden.product_id;
      if (select coalesce(sum(public.fn_traslado_int_numero(i->>'quantity')), 0)
            from jsonb_array_elements(p_datos->'envios') e, jsonb_array_elements(e->'items') i
           where public.fn_traslado_int_entero(i->>'product_id') = v_orden.product_id) > v_orden.producido - v_ya then
        raise exception 'excede_orden_produccion' using errcode = '22023',
          detail = jsonb_build_object('producido', v_orden.producido, 'ya_distribuido', v_ya)::text;
      end if;
    end if;
  end if;

  for v_envio in select * from jsonb_array_elements(p_datos->'envios') loop
    v_destino := public.fn_traslado_int_entero(v_envio->>'destino');
    v_res := public.fn_traslado_guardar(p_org,
               jsonb_build_object('origen', v_origen, 'destino', v_destino, 'notas', v_notas,
                                  'production_order_id', v_op, 'items', v_envio->'items'),
               case when v_clave is not null then v_clave || ':' || coalesce(v_destino::text, '?') end);
    v_repetido := v_repetido or coalesce((v_res->>'repetido')::boolean, false);
    if v_despachar then
      v_res := v_res || public.fn_traslado_despachar(p_org, (v_res->>'id')::integer, null,
                          case when v_clave is not null then v_clave || ':' || v_destino end);
    end if;
    v_out := v_out || jsonb_build_object('id', (v_res->>'id')::integer, 'code', v_res->>'code',
                                         'status', v_res->>'status', 'destino', v_destino);
  end loop;

  return jsonb_build_object('traslados', v_out, 'repetido', v_repetido);
end;
$$;

-- ─── fn_inv_documentos: código del traslado y merma por faltante ───────────

do $parche$
declare
  v_def text;
  v_m1 text := 'select t.id into v_x from public.inventory_transfers t where t.id = v_int and t.organization_id = p_org;';
  v_n1 text := 'select t.id, t.code into v_x from public.inventory_transfers t where t.id = v_int and t.organization_id = p_org;';
  v_m2 text := 'v_num := ''TR-'' || v_x.id;';
  v_n2 text := 'v_num := coalesce(v_x.code, ''TR-'' || v_x.id);';
  v_m3 text := 'elsif v_s in (''initial'', ''loss'') then';
  v_n3 text := 'elsif v_s = ''loss'' and v_id like ''traslado:%'' then
      -- B3: merma por faltante en el transporte, enlaza al traslado.
      v_tipo := ''traslado'';
      v_int := public.fn_traslado_int_entero(substr(v_id, length(''traslado:'') + 1));
      select t.id, t.code into v_x from public.inventory_transfers t where t.id = v_int and t.organization_id = p_org;
      if v_x.id is not null then
        v_num := coalesce(v_x.code, ''TR-'' || v_x.id);
        v_ruta := ''/app/inventario/transferencias/'' || v_x.id;
      end if;

    elsif v_s in (''initial'', ''loss'') then';
begin
  v_def := pg_get_functiondef('public.fn_inv_documentos(integer,jsonb)'::regprocedure);
  if position('B3: merma por faltante' in v_def) > 0 then
    return; -- ya aplicado
  end if;
  if (length(v_def) - length(replace(v_def, v_m1, ''))) / length(v_m1) <> 1
     or (length(v_def) - length(replace(v_def, v_m2, ''))) / length(v_m2) <> 1
     or (length(v_def) - length(replace(v_def, v_m3, ''))) / length(v_m3) <> 1 then
    raise exception 'fn_inv_documentos cambió: los marcadores de B3 no son únicos';
  end if;
  v_def := replace(replace(replace(v_def, v_m1, v_n1), v_m2, v_n2), v_m3, v_n3);
  execute v_def;
end;
$parche$;

-- ─── Asiento: lo hace fn_traslado_recibir por recepción ───────────────────

create or replace function public.fn_auto_journal_inventory_transfer()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  -- B3 (2026-09-29): sin efecto. El asiento entre sucursales lo hace
  -- fn_traslado_int_asiento en cada recepción (fn_traslado_recibir), con el
  -- valor que entró al destino. Esta versión buscaba source 'transfer' (que ya
  -- nadie escribe) y el avg_cost de cualquier producto de la sucursal.
  return new;
end;
$$;

-- ─── Notificaciones con los estados reales ─────────────────────────────────

create or replace function public.fn_notify_transfer_created()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform public.fn_create_org_notification(
    new.organization_id, null, 'app', 'transfer_created',
    'Nuevo traslado de inventario',
    'Traslado ' || coalesce(new.code, '#' || new.id) || ' creado.',
    jsonb_build_object('transfer_id', new.id::text, 'code', new.code, 'status', new.status)
  );
  return new;
end;
$$;

create or replace function public.fn_notify_transfer_status()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_destino text;
begin
  if old.status is distinct from new.status and new.status in ('in_transit', 'received', 'cancelled') then
    select b.name into v_destino from public.branches b where b.id = new.dest_branch_id;
    perform public.fn_create_org_notification(
      new.organization_id,
      case when new.status = 'in_transit' then null else new.created_by end,
      'app',
      'transfer_' || new.status,
      case new.status
        when 'in_transit' then 'Traslado en camino'
        when 'received' then 'Traslado recibido'
        else 'Traslado cancelado' end,
      'El traslado ' || coalesce(new.code, '#' || new.id)
        || case new.status
             when 'in_transit' then ' salió hacia ' || coalesce(v_destino, 'su destino') || '.'
             when 'received' then ' fue recibido en ' || coalesce(v_destino, 'su destino') || '.'
             else ' fue cancelado.' end,
      jsonb_build_object('transfer_id', new.id::text, 'code', new.code, 'status', new.status)
    );
  end if;
  return new;
end;
$$;

-- ─── Permisos de ejecución ─────────────────────────────────────────────────

revoke all on function public.fn_traslados_listado(integer, jsonb) from public, anon;
revoke all on function public.fn_traslado_detalle(integer, integer) from public, anon;
revoke all on function public.fn_traslado_productos(integer, integer, text, integer[], integer) from public, anon;
revoke all on function public.fn_distribucion_ordenes(integer, integer) from public, anon;
revoke all on function public.fn_distribucion_crear(integer, jsonb, text) from public, anon;
revoke all on function public.fn_auto_journal_inventory_transfer() from public, anon, authenticated;
revoke all on function public.fn_notify_transfer_created() from public, anon, authenticated;
revoke all on function public.fn_notify_transfer_status() from public, anon, authenticated;

grant execute on function public.fn_traslados_listado(integer, jsonb) to authenticated;
grant execute on function public.fn_traslado_detalle(integer, integer) to authenticated;
grant execute on function public.fn_traslado_productos(integer, integer, text, integer[], integer) to authenticated;
grant execute on function public.fn_distribucion_ordenes(integer, integer) to authenticated;
grant execute on function public.fn_distribucion_crear(integer, jsonb, text) to authenticated;
