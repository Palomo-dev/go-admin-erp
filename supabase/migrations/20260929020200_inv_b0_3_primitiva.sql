-- Inventario B0 · 3/7 — Primitiva única de movimiento de stock
-- docs/implementacion/INVENTARIO-PLAN.md §3.2 y §5.1 (migración 3).
--
-- Hasta hoy 15 funciones SQL y más de 10 servicios TypeScript escribían
-- stock_levels/stock_movements, con cuatro reglas distintas de costo promedio.
-- A partir de aquí TODO movimiento pasa por fn_inv_int_mover:
--
--   fn_inv_int_mover(org, sucursal, producto, lote, 'in'|'out', cantidad, costo,
--                    origen, id_origen, nota, usuario, opciones jsonb) → jsonb
--
-- Qué garantiza:
--   · Sucursal y producto de la organización (42501); lote del producto y de la
--     organización (22023 lote_invalido).
--   · Productos con track_stock = false se saltan con motivo (salvo `forzar`).
--   · Bloqueo de la fila (producto, sucursal, lote) con FOR UPDATE; si no existe
--     se crea sin onConflict por columnas (el UNIQUE con lot_id NULL no deduplica:
--     `on conflict do nothing` sin objetivo cubre el índice parcial y el total).
--   · Cantidad decimal > 0 en la unidad base del producto.
--   · UNA regla de costo promedio (fn_inv_int_costo_promedio):
--       existencia previa ≤ 0 → costo de la entrada;
--       si no → (existencia × promedio + cantidad × costo) ÷ (existencia + cantidad).
--     Recalculan las entradas de compra, apertura, ajuste, producción y traslado;
--     las devoluciones, notas crédito y anulaciones entran al costo que traen sin
--     mover el promedio. `recalcular_costo` en opciones lo fuerza.
--   · Salidas: costo = promedio de la fila; si es 0, fn_costo_unitario_producto
--     (costo vigente del producto y, por último, el que llegue). `costo_fijo`
--     usa el que llega (reversiones al costo original).
--   · FEFO: salida sin lote de un producto con track_lots consume primero el lote
--     que vence antes (se saltan los vencidos salvo `incluir_vencidos`); el resto
--     sale de la fila sin lote.
--   · Negativos (P5): las ventas pueden dejar existencia negativa salvo que la
--     organización active `bloquear_venta_sin_stock`; ajustes, traslados y
--     pérdidas no. Error 23514 'stock_insuficiente' con detalle JSON.
--   · Seriales opcionales: valida pertenencia, disponibilidad y que cuadren con la
--     cantidad; los deja en stock (entrada) o en `estado_serial` (salida) y deja
--     un evento de trazabilidad.
--   · Kardex con autor (`created_by`) y `avg_cost_after`.
--
-- Opciones (todas opcionales):
--   recalcular_costo bool · costo_fijo bool · permitir_negativo bool · fefo bool
--   (default true) · incluir_vencidos bool · forzar bool · seriales int[] ·
--   estado_serial text (obligatorio si hay seriales de salida)
--
-- Devuelve: { omitido, motivo, product_id, branch_id, movement_id, qty_after,
--             avg_cost_after, movimientos: [{ movement_id, lot_id, direction, qty,
--             unit_cost, qty_after, avg_cost_after, stock_level_id }] }
--
-- Solo la invocan otras funciones SECURITY DEFINER: sin EXECUTE para anon ni
-- authenticated. Las RPC públicas validan acceso y permiso antes de llamarla.

-- ── Regla única de costo promedio ────────────────────────────────────────────
create or replace function public.fn_inv_int_costo_promedio(
  p_qty_antes numeric, p_prom_antes numeric, p_qty numeric, p_costo numeric)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when coalesce(p_qty_antes, 0) <= 0 then coalesce(p_costo, 0)
    else (p_qty_antes * coalesce(p_prom_antes, 0) + p_qty * coalesce(p_costo, 0)) / (p_qty_antes + p_qty)
  end;
$$;

comment on function public.fn_inv_int_costo_promedio(numeric, numeric, numeric, numeric) is
  'Regla única de costo promedio ponderado (existencia previa ≤ 0 → costo de la entrada). Espejo TS: src/lib/inventario/nucleo/costo.ts.';

-- ── Fila de existencias bloqueada (la crea en 0 si no existe) ───────────────
create or replace function public.fn_inv_int_fila(
  p_product integer, p_branch integer, p_lot integer, p_avg_inicial numeric default 0)
returns public.stock_levels
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sl public.stock_levels;
begin
  select * into v_sl from public.stock_levels sl
   where sl.product_id = p_product and sl.branch_id = p_branch and sl.lot_id is not distinct from p_lot
   order by sl.id limit 1
   for update;
  if found then
    return v_sl;
  end if;
  insert into public.stock_levels (product_id, branch_id, lot_id, qty_on_hand, qty_reserved, avg_cost, min_level)
  values (p_product, p_branch, p_lot, 0, 0, coalesce(p_avg_inicial, 0), 0)
  on conflict do nothing;
  select * into v_sl from public.stock_levels sl
   where sl.product_id = p_product and sl.branch_id = p_branch and sl.lot_id is not distinct from p_lot
   order by sl.id limit 1
   for update;
  return v_sl;
end;
$$;

-- ── Un movimiento sobre una fila ─────────────────────────────────────────────
create or replace function public.fn_inv_int_mover_fila(
  p_org integer, p_branch integer, p_product integer, p_lot integer,
  p_direction text, p_qty numeric, p_unit_cost numeric,
  p_source text, p_source_id text, p_note text, p_user uuid,
  p_opciones jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_op jsonb := coalesce(p_opciones, '{}'::jsonb);
  v_sl public.stock_levels;
  v_nueva boolean := false;
  v_costo numeric;
  v_prom numeric;
  v_despues numeric;
  v_recalc boolean;
  v_neg boolean;
  v_mov integer;
begin
  select * into v_sl from public.stock_levels sl
   where sl.product_id = p_product and sl.branch_id = p_branch and sl.lot_id is not distinct from p_lot
   order by sl.id limit 1
   for update;
  if not found then
    insert into public.stock_levels (product_id, branch_id, lot_id, qty_on_hand, qty_reserved, avg_cost, min_level)
    values (p_product, p_branch, p_lot, 0, 0, 0, 0)
    on conflict do nothing
    returning * into v_sl;
    v_nueva := v_sl.id is not null;
    if not v_nueva then
      select * into v_sl from public.stock_levels sl
       where sl.product_id = p_product and sl.branch_id = p_branch and sl.lot_id is not distinct from p_lot
       order by sl.id limit 1
       for update;
    end if;
  end if;

  if p_direction = 'in' then
    v_costo := greatest(coalesce(p_unit_cost, 0), 0);
    v_recalc := coalesce((v_op->>'recalcular_costo')::boolean,
      p_source in ('purchase', 'purchase_order', 'purchase_invoice', 'initial', 'adjustment',
                   'production', 'transfer', 'transfer_in'));
    if v_recalc then
      v_prom := public.fn_inv_int_costo_promedio(v_sl.qty_on_hand, v_sl.avg_cost, p_qty, v_costo);
    elsif v_nueva then
      v_prom := v_costo;
    else
      v_prom := coalesce(v_sl.avg_cost, 0);
    end if;
    v_despues := coalesce(v_sl.qty_on_hand, 0) + p_qty;
  else
    if coalesce((v_op->>'costo_fijo')::boolean, false) then
      v_costo := greatest(coalesce(p_unit_cost, 0), 0);
    elsif coalesce(v_sl.avg_cost, 0) > 0 then
      v_costo := v_sl.avg_cost;
    else
      v_costo := public.fn_costo_unitario_producto(p_product, p_branch, p_unit_cost);
    end if;
    v_despues := coalesce(v_sl.qty_on_hand, 0) - p_qty;
    if v_despues < 0 then
      v_neg := coalesce((v_op->>'permitir_negativo')::boolean,
        case
          when p_source in ('sale', 'web_sale', 'mesa_sale', 'invoice_sale', 'folio_item', 'room_consumption', 'web_order')
            then not coalesce((public.fn_inventario_int_config(p_org)->>'bloquear_venta_sin_stock')::boolean, false)
          when p_source in ('adjustment', 'transfer', 'transfer_out', 'loss')
            then false
          else true
        end);
      if not v_neg then
        raise exception 'stock_insuficiente' using errcode = '23514',
          detail = jsonb_build_object('product_id', p_product, 'branch_id', p_branch, 'lot_id', p_lot,
                                      'disponible', coalesce(v_sl.qty_on_hand, 0), 'solicitado', p_qty)::text;
      end if;
    end if;
    v_prom := case when v_nueva then v_costo else coalesce(v_sl.avg_cost, 0) end;
  end if;

  update public.stock_levels
     set qty_on_hand = v_despues,
         avg_cost = v_prom,
         updated_at = now()
   where id = v_sl.id;

  insert into public.stock_movements (
    organization_id, branch_id, product_id, lot_id, direction, qty, unit_cost,
    source, source_id, note, updated_by, created_by, avg_cost_after
  ) values (
    p_org, p_branch, p_product, p_lot, p_direction, p_qty, v_costo,
    p_source, p_source_id, p_note, p_user, coalesce(auth.uid(), p_user), v_prom
  ) returning id into v_mov;

  return jsonb_build_object('movement_id', v_mov, 'lot_id', p_lot, 'direction', p_direction, 'qty', p_qty,
    'unit_cost', v_costo, 'qty_after', v_despues, 'avg_cost_after', v_prom, 'stock_level_id', v_sl.id);
end;
$$;

-- ── La primitiva ─────────────────────────────────────────────────────────────
create or replace function public.fn_inv_int_mover(
  p_org integer, p_branch integer, p_product integer, p_lot integer,
  p_direction text, p_qty numeric, p_unit_cost numeric,
  p_source text, p_source_id text, p_note text, p_user uuid,
  p_opciones jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_op jsonb := coalesce(p_opciones, '{}'::jsonb);
  v_prod record;
  v_lote record;
  v_resto numeric;
  v_toma numeric;
  v_movs jsonb := '[]'::jsonb;
  v_ultimo jsonb;
  v_hoy date;
  v_seriales integer[];
  v_n integer;
  v_estado text;
  v_evento text;
begin
  if p_direction is null or p_direction not in ('in', 'out') then
    raise exception 'direccion_invalida' using errcode = '22023';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'cantidad_invalida' using errcode = '22023', detail = coalesce(p_qty::text, 'null');
  end if;
  if p_source is null or btrim(p_source) = '' then
    raise exception 'origen_requerido' using errcode = '22023';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_branch and b.organization_id = p_org) then
    raise exception 'SUCURSAL_NO_ES_DE_LA_ORG' using errcode = '42501';
  end if;

  select p.id, p.organization_id, p.track_stock, p.track_lots into v_prod
    from public.products p where p.id = p_product;
  if v_prod.id is null then
    return jsonb_build_object('omitido', true, 'motivo', 'producto_no_encontrado', 'product_id', p_product,
      'branch_id', p_branch, 'movimientos', '[]'::jsonb);
  end if;
  if v_prod.organization_id is distinct from p_org then
    raise exception 'PRODUCTO_NO_ES_DE_LA_ORG' using errcode = '42501';
  end if;
  if v_prod.track_stock is not true and not coalesce((v_op->>'forzar')::boolean, false) then
    return jsonb_build_object('omitido', true, 'motivo', 'no_track_stock', 'product_id', p_product,
      'branch_id', p_branch, 'movimientos', '[]'::jsonb);
  end if;
  if p_lot is not null and not exists (
    select 1 from public.lots l where l.id = p_lot and l.product_id = p_product and l.organization_id = p_org
  ) then
    raise exception 'lote_invalido' using errcode = '22023', detail = p_lot::text;
  end if;

  -- Seriales: se validan antes de mover nada.
  if jsonb_typeof(v_op->'seriales') = 'array' and jsonb_array_length(v_op->'seriales') > 0 then
    select array_agg(distinct x::integer) into v_seriales from jsonb_array_elements_text(v_op->'seriales') x;
    if array_length(v_seriales, 1) <> jsonb_array_length(v_op->'seriales') then
      raise exception 'serial_repetido' using errcode = '22023';
    end if;
    if p_qty <> array_length(v_seriales, 1) then
      raise exception 'seriales_no_cuadran' using errcode = '22023',
        detail = jsonb_build_object('cantidad', p_qty, 'seriales', array_length(v_seriales, 1))::text;
    end if;
    v_estado := case when p_direction = 'in' then 'in_stock' else nullif(btrim(v_op->>'estado_serial'), '') end;
    if v_estado is null then
      raise exception 'estado_serial_requerido' using errcode = '22023';
    end if;
    select count(*) into v_n from public.serial_numbers s
     where s.id = any(v_seriales) and s.organization_id = p_org and s.product_id = p_product
       and (p_direction = 'in'
            or (s.status in ('in_stock', 'reserved') and coalesce(s.current_branch_id, s.branch_id, p_branch) = p_branch));
    if v_n <> array_length(v_seriales, 1) then
      raise exception 'serial_no_disponible' using errcode = '22023';
    end if;
  end if;

  if p_direction = 'out' and p_lot is null and v_prod.track_lots and coalesce((v_op->>'fefo')::boolean, true) then
    -- FEFO: primero el lote que vence antes; los vencidos no, salvo que se pida.
    v_resto := p_qty;
    v_hoy := (now() at time zone public.fn_timezone_for(p_org, p_branch))::date;
    for v_lote in
      select sl.lot_id, sl.qty_on_hand
        from public.stock_levels sl
        join public.lots l on l.id = sl.lot_id
       where sl.product_id = p_product and sl.branch_id = p_branch and sl.lot_id is not null
         and sl.qty_on_hand > 0
         and (l.expiry_date is null or l.expiry_date >= v_hoy or coalesce((v_op->>'incluir_vencidos')::boolean, false))
       order by l.expiry_date asc nulls last, l.id
       for update of sl
    loop
      exit when v_resto <= 0;
      v_toma := least(v_resto, v_lote.qty_on_hand);
      v_ultimo := public.fn_inv_int_mover_fila(p_org, p_branch, p_product, v_lote.lot_id, 'out', v_toma, p_unit_cost,
                                               p_source, p_source_id, p_note, p_user, v_op);
      v_movs := v_movs || jsonb_build_array(v_ultimo);
      v_resto := v_resto - v_toma;
    end loop;
    if v_resto > 0 then
      v_ultimo := public.fn_inv_int_mover_fila(p_org, p_branch, p_product, null, 'out', v_resto, p_unit_cost,
                                               p_source, p_source_id, p_note, p_user, v_op);
      v_movs := v_movs || jsonb_build_array(v_ultimo);
    end if;
  else
    v_ultimo := public.fn_inv_int_mover_fila(p_org, p_branch, p_product, p_lot, p_direction, p_qty, p_unit_cost,
                                             p_source, p_source_id, p_note, p_user, v_op);
    v_movs := jsonb_build_array(v_ultimo);
  end if;

  if v_seriales is not null then
    v_evento := case
      when p_direction = 'in' then 'received'
      when v_estado = 'sold' then 'sold'
      when v_estado = 'in_transit' then 'transferred'
      else 'status_changed'
    end;
    insert into public.serial_tracking_events (
      serial_number_id, organization_id, event_type, from_branch_id, to_branch_id, from_status, to_status,
      source_table, source_id, performed_by, event_date, notes, metadata)
    select s.id, p_org, v_evento, coalesce(s.current_branch_id, s.branch_id),
           case when p_direction = 'in' then p_branch else coalesce(s.current_branch_id, s.branch_id) end,
           s.status, v_estado, 'stock_movements', v_ultimo->>'movement_id', coalesce(auth.uid(), p_user), now(),
           p_note, jsonb_build_object('source', p_source, 'source_id', p_source_id, 'direction', p_direction)
      from public.serial_numbers s where s.id = any(v_seriales);
    update public.serial_numbers s
       set status = v_estado,
           current_branch_id = case when p_direction = 'in' then p_branch else s.current_branch_id end,
           branch_id = coalesce(s.branch_id, p_branch),
           lot_id = coalesce(p_lot, s.lot_id),
           updated_at = now(),
           updated_by = coalesce(auth.uid(), p_user)
     where s.id = any(v_seriales);
  end if;

  return jsonb_build_object('omitido', false, 'motivo', null, 'product_id', p_product, 'branch_id', p_branch,
    'movement_id', (v_ultimo->>'movement_id')::integer,
    'qty_after', v_ultimo->'qty_after', 'avg_cost_after', v_ultimo->'avg_cost_after',
    'movimientos', v_movs);
end;
$$;

comment on function public.fn_inv_int_mover(integer, integer, integer, integer, text, numeric, numeric, text, text, text, uuid, jsonb) is
  'Primitiva única de movimiento de stock (INVENTARIO-PLAN §3.2). Solo la invocan funciones SECURITY DEFINER que ya validaron acceso y permiso.';

revoke all on function public.fn_inv_int_costo_promedio(numeric, numeric, numeric, numeric) from anon, public, authenticated;
revoke all on function public.fn_inv_int_fila(integer, integer, integer, numeric) from anon, public, authenticated;
revoke all on function public.fn_inv_int_mover_fila(integer, integer, integer, integer, text, numeric, numeric, text, text, text, uuid, jsonb) from anon, public, authenticated;
revoke all on function public.fn_inv_int_mover(integer, integer, integer, integer, text, numeric, numeric, text, text, text, uuid, jsonb) from anon, public, authenticated;
grant execute on function public.fn_inv_int_costo_promedio(numeric, numeric, numeric, numeric) to service_role;
grant execute on function public.fn_inv_int_fila(integer, integer, integer, numeric) to service_role;
grant execute on function public.fn_inv_int_mover_fila(integer, integer, integer, integer, text, numeric, numeric, text, text, text, uuid, jsonb) to service_role;
grant execute on function public.fn_inv_int_mover(integer, integer, integer, integer, text, numeric, numeric, text, text, text, uuid, jsonb) to service_role;
