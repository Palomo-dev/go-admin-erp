-- Inventario B3 · Traslados: RPC transaccionales (INVENTARIO-PLAN.md §5.4, P5 y P7).
--
-- Antes: el navegador creaba cabecera y renglones en dos llamadas (si fallaban
-- los renglones, borraba la cabecera), llamaba a update_stock_level (no existe),
-- filtraba stock_levels por organization_id (no existe) y escribía estados que
-- el CHECK rechaza. Resultado: ningún traslado movía existencias.
--
-- Ahora, una RPC por operación, todas SECURITY DEFINER con
-- fn_inventario_exigir_permiso (pertenencia + permiso) y el movimiento SOLO por
-- la primitiva fn_inv_int_mover (bloqueo de la fila, costo promedio único,
-- lote, FEFO, seriales, kardex con autor):
--
-- * fn_traslado_guardar(org, traslado, clave): crea o edita un traslado
--   PENDIENTE (no mueve stock). Valida sucursales (el origen, de las del
--   usuario), productos con control de stock, lote del producto, renglón
--   repetido y que no se pida más de lo disponible en el origen.
-- * fn_traslado_despachar(org, id, seriales, clave): P7 — sale del origen con
--   transfer_out al costo promedio del origen y queda «en tránsito». P5 — si
--   deja el origen en negativo, falla (stock_insuficiente) y no mueve nada. Los
--   lotes viajan (FEFO reparte en un renglón por lote) y los seriales pasan a
--   in_transit. Idempotente: despachar dos veces no vuelve a descontar.
-- * fn_traslado_recibir(org, id, lineas, clave): P7 — quien recibe confirma;
--   entra al destino con transfer_in al MISMO costo con que salió (recalcula el
--   promedio del destino). La diferencia la decide quien recibe: «faltante en
--   el transporte» (con motivo: entra y sale como merma `loss` en el destino,
--   que asienta la pérdida) o «sigue en camino» (queda en tránsito). Recibir
--   dos veces con la misma clave no duplica. Asienta el traslado entre
--   sucursales si tienen subcuentas de inventario distintas.
-- * fn_traslado_cancelar(org, id, motivo): solo pendientes (no mueve stock).
-- * fn_traslado_devolver(org, id, motivo, clave): lo que sigue en tránsito
--   vuelve al origen con transfer_in al mismo costo.

-- ─── Internas ────────────────────────────────────────────────────────────────

create or replace function public.fn_traslado_int_entero(p_valor text)
returns integer
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select case when btrim(coalesce(p_valor, '')) ~ '^[0-9]{1,9}$' then btrim(p_valor)::integer end;
$$;

create or replace function public.fn_traslado_int_numero(p_valor text)
returns numeric
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select case when btrim(coalesce(p_valor, '')) ~ '^-?[0-9]{1,12}(\.[0-9]{1,6})?$' then round(btrim(p_valor)::numeric, 3) end;
$$;

-- La sucursal es de la organización y el usuario tiene acceso a ella
-- (app_branch_access: admin, asignado o sin restricción). Sin sesión (servicio): pasa.
create or replace function public.fn_traslado_int_sucursal(p_org integer, p_branch integer)
returns void
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if p_branch is null or not exists (select 1 from public.branches b where b.id = p_branch and b.organization_id = p_org) then
    raise exception 'SUCURSAL_NO_ES_DE_LA_ORG' using errcode = '42501';
  end if;
  if auth.uid() is not null and not coalesce(public.app_branch_access(p_branch), false) then
    raise exception 'sucursal_sin_acceso' using errcode = '42501', detail = p_branch::text;
  end if;
end;
$$;

-- Lo que la primitiva dejaría sacar sin quedar en negativo: el lote pedido; si
-- el producto lleva lotes y no se pide uno, los lotes vigentes (FEFO) más la
-- fila sin lote; si no, la fila sin lote.
create or replace function public.fn_traslado_int_disponible(p_org integer, p_branch integer, p_product integer, p_lot integer)
returns numeric
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_lotes boolean;
  v_hoy date;
  v_total numeric;
begin
  if p_lot is not null then
    return coalesce((select sum(sl.qty_on_hand) from public.stock_levels sl
                      where sl.product_id = p_product and sl.branch_id = p_branch and sl.lot_id = p_lot), 0);
  end if;
  select coalesce(p.track_lots, false) into v_lotes from public.products p where p.id = p_product;
  v_total := greatest(coalesce((select sum(sl.qty_on_hand) from public.stock_levels sl
                                 where sl.product_id = p_product and sl.branch_id = p_branch and sl.lot_id is null), 0), 0);
  if v_lotes then
    v_hoy := (now() at time zone public.fn_timezone_for(p_org, p_branch))::date;
    v_total := v_total + coalesce((select sum(sl.qty_on_hand)
                                     from public.stock_levels sl join public.lots l on l.id = sl.lot_id
                                    where sl.product_id = p_product and sl.branch_id = p_branch
                                      and sl.qty_on_hand > 0
                                      and (l.expiry_date is null or l.expiry_date >= v_hoy)), 0);
  end if;
  return v_total;
end;
$$;

-- Asiento entre sucursales: débito inventario del destino, crédito inventario
-- del origen, por el valor que entró al destino (recibido + faltante, que luego
-- sale como merma con su propio asiento). Solo si las dos sucursales tienen
-- subcuenta 1405 distinta (con la misma cuenta no hay nada que reclasificar).
create or replace function public.fn_traslado_int_asiento(
  p_org integer, p_transfer integer, p_code text, p_origen integer, p_destino integer,
  p_monto numeric, p_source_id text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_origen text;
  v_destino text;
begin
  if coalesce(p_monto, 0) <= 0 then
    return;
  end if;
  if exists (select 1 from public.journal_entries je
              where je.organization_id = p_org and je.source = 'inventory_transfer' and je.source_id = p_source_id) then
    return;
  end if;
  select m.sub_account_code into v_origen from public.branch_account_mappings m
   where m.organization_id = p_org and m.branch_id = p_origen and m.base_account_code = '1405' limit 1;
  select m.sub_account_code into v_destino from public.branch_account_mappings m
   where m.organization_id = p_org and m.branch_id = p_destino and m.base_account_code = '1405' limit 1;
  if v_origen is null or v_destino is null or v_origen = v_destino then
    return;
  end if;
  perform public.fn_create_journal_entry(
    p_org, p_destino, now(),
    'Traslado de inventario ' || coalesce(p_code, 'TR-' || p_transfer),
    'inventory_transfer', p_source_id,
    v_destino, v_origen, round(p_monto, 2));
end;
$$;

-- ─── Guardar (crear o editar un pendiente) ─────────────────────────────────

create or replace function public.fn_traslado_guardar(p_org integer, p_traslado jsonb, p_clave text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id integer;
  v_origen integer;
  v_destino integer;
  v_notas text;
  v_op integer;
  v_clave text := nullif(btrim(coalesce(p_clave, '')), '');
  v_t record;
  v_item jsonb;
  v_prod record;
  v_pid integer;
  v_lot integer;
  v_qty numeric;
  v_disp numeric;
  v_vistos text[] := array[]::text[];
  v_n integer := 0;
  v_unidades numeric := 0;
  v_editado boolean := false;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['trasladar']);
  if jsonb_typeof(p_traslado) is distinct from 'object' then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;

  v_id := public.fn_traslado_int_entero(p_traslado->>'id');
  v_origen := public.fn_traslado_int_entero(p_traslado->>'origen');
  v_destino := public.fn_traslado_int_entero(p_traslado->>'destino');
  v_notas := nullif(left(btrim(coalesce(p_traslado->>'notas', '')), 500), '');
  v_op := public.fn_traslado_int_entero(p_traslado->>'production_order_id');

  if v_origen is null or v_destino is null then
    raise exception 'sucursales_requeridas' using errcode = '22023';
  end if;
  if v_origen = v_destino then
    raise exception 'misma_sucursal' using errcode = '22023';
  end if;
  perform public.fn_traslado_int_sucursal(p_org, v_origen);
  if not exists (select 1 from public.branches b where b.id = v_destino and b.organization_id = p_org) then
    raise exception 'SUCURSAL_NO_ES_DE_LA_ORG' using errcode = '42501';
  end if;
  if exists (select 1 from public.branches b where b.id in (v_origen, v_destino) and b.is_active is false) then
    raise exception 'sucursal_inactiva' using errcode = '22023';
  end if;
  if v_op is not null and not exists (
    select 1 from public.production_orders o where o.id = v_op and o.organization_id = p_org
  ) then
    raise exception 'orden_produccion_invalida' using errcode = '22023';
  end if;
  if jsonb_typeof(p_traslado->'items') is distinct from 'array' or jsonb_array_length(p_traslado->'items') = 0 then
    raise exception 'items_requeridos' using errcode = '22023';
  end if;
  if jsonb_array_length(p_traslado->'items') > 500 then
    raise exception 'demasiados_renglones' using errcode = '22023', detail = 'máximo 500';
  end if;

  if v_id is null and v_clave is not null then
    select t.id, t.code, t.status into v_t from public.inventory_transfers t
     where t.organization_id = p_org and t.client_key = v_clave;
    if found then
      return jsonb_build_object('id', v_t.id, 'code', v_t.code, 'status', v_t.status, 'repetido', true);
    end if;
  end if;

  if v_id is not null then
    select * into v_t from public.inventory_transfers t where t.id = v_id and t.organization_id = p_org for update;
    if not found then
      raise exception 'traslado_no_encontrado' using errcode = 'P0002';
    end if;
    if v_t.status <> 'pending' then
      raise exception 'estado_invalido' using errcode = '22023', detail = v_t.status;
    end if;
    perform public.fn_traslado_int_sucursal(p_org, v_t.origin_branch_id);
    update public.inventory_transfers
       set origin_branch_id = v_origen, dest_branch_id = v_destino, notes = v_notas,
           production_order_id = v_op, updated_at = now()
     where id = v_id;
    delete from public.transfer_items where inventory_transfer_id = v_id;
    v_editado := true;
  else
    insert into public.inventory_transfers (organization_id, origin_branch_id, dest_branch_id, status, created_by,
                                            notes, production_order_id, client_key)
    values (p_org, v_origen, v_destino, 'pending', auth.uid(), v_notas, v_op, v_clave)
    returning id into v_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_traslado->'items') loop
    v_pid := public.fn_traslado_int_entero(v_item->>'product_id');
    v_lot := public.fn_traslado_int_entero(v_item->>'lot_id');
    v_qty := public.fn_traslado_int_numero(v_item->>'quantity');
    if v_pid is null then
      raise exception 'renglon_invalido' using errcode = '22023';
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'cantidad_invalida' using errcode = '22023', detail = coalesce(v_item->>'quantity', 'null');
    end if;
    select p.id, p.organization_id, p.name, coalesce(p.track_stock, false) as track_stock,
           coalesce(p.track_serial, false) as track_serial, coalesce(p.is_parent, false) as is_parent,
           p.product_type
      into v_prod
      from public.products p where p.id = v_pid;
    if v_prod.id is null or v_prod.organization_id is distinct from p_org then
      raise exception 'PRODUCTO_NO_ES_DE_LA_ORG' using errcode = '42501';
    end if;
    if not v_prod.track_stock or v_prod.is_parent or v_prod.product_type = 'service' then
      raise exception 'producto_no_trasladable' using errcode = '22023', detail = v_prod.name;
    end if;
    if v_prod.track_serial and v_qty <> trunc(v_qty) then
      raise exception 'cantidad_invalida' using errcode = '22023', detail = 'seriales: unidades enteras';
    end if;
    if v_lot is not null and not exists (
      select 1 from public.lots l where l.id = v_lot and l.product_id = v_pid and l.organization_id = p_org
    ) then
      raise exception 'lote_invalido' using errcode = '22023', detail = v_lot::text;
    end if;
    if (v_pid || ':' || coalesce(v_lot, 0)) = any(v_vistos) then
      raise exception 'renglon_repetido' using errcode = '22023', detail = v_prod.name;
    end if;
    v_vistos := v_vistos || (v_pid || ':' || coalesce(v_lot, 0));

    v_disp := public.fn_traslado_int_disponible(p_org, v_origen, v_pid, v_lot);
    if v_qty > v_disp then
      raise exception 'stock_insuficiente' using errcode = '23514',
        detail = jsonb_build_object('product_id', v_pid, 'branch_id', v_origen, 'lot_id', v_lot,
                                    'disponible', v_disp, 'solicitado', v_qty)::text;
    end if;

    insert into public.transfer_items (inventory_transfer_id, product_id, quantity, lot_id, received_qty, status)
    values (v_id, v_pid, v_qty, v_lot, 0, 'pending');
    v_n := v_n + 1;
    v_unidades := v_unidades + v_qty;
  end loop;

  insert into public.inventory_transfer_events (organization_id, transfer_id, tipo, detalle)
  values (p_org, v_id, case when v_editado then 'editado' else 'creado' end,
          jsonb_build_object('renglones', v_n, 'unidades', v_unidades));

  select t.id, t.code, t.status into v_t from public.inventory_transfers t where t.id = v_id;
  return jsonb_build_object('id', v_t.id, 'code', v_t.code, 'status', v_t.status, 'repetido', false,
                            'renglones', v_n, 'unidades', v_unidades);
end;
$$;

-- ─── Despachar (P7: sale del origen y queda en tránsito) ──────────────────

create or replace function public.fn_traslado_despachar(p_org integer, p_id integer, p_seriales jsonb default null, p_clave text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_t record;
  v_it record;
  v_destino text;
  v_ser integer[];
  v_op jsonb;
  v_res jsonb;
  v_mov jsonb;
  v_primero boolean;
  v_unidades numeric := 0;
  v_valor numeric := 0;
  v_movs integer := 0;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['trasladar']);
  select * into v_t from public.inventory_transfers t where t.id = p_id and t.organization_id = p_org for update;
  if not found then
    raise exception 'traslado_no_encontrado' using errcode = 'P0002';
  end if;
  if v_t.status in ('in_transit', 'received') and v_t.shipped_at is not null then
    return jsonb_build_object('id', v_t.id, 'code', v_t.code, 'status', v_t.status, 'ya_despachado', true);
  end if;
  if v_t.status <> 'pending' then
    raise exception 'estado_invalido' using errcode = '22023', detail = v_t.status;
  end if;
  perform public.fn_traslado_int_sucursal(p_org, v_t.origin_branch_id);
  if p_seriales is not null and jsonb_typeof(p_seriales) <> 'object' then
    raise exception 'datos_invalidos' using errcode = '22023', detail = 'seriales';
  end if;
  select b.name into v_destino from public.branches b where b.id = v_t.dest_branch_id;

  for v_it in
    select ti.id, ti.product_id, ti.lot_id, ti.quantity, p.name, coalesce(p.track_serial, false) as track_serial
      from public.transfer_items ti join public.products p on p.id = ti.product_id
     where ti.inventory_transfer_id = p_id
     order by ti.id
     for update of ti
  loop
    v_ser := null;
    if p_seriales is not null and jsonb_typeof(p_seriales->(v_it.id::text)) = 'array' then
      select array_agg(public.fn_traslado_int_entero(x)) into v_ser from jsonb_array_elements_text(p_seriales->(v_it.id::text)) x;
      if v_ser is not null and array_position(v_ser, null) is not null then
        raise exception 'datos_invalidos' using errcode = '22023', detail = 'seriales';
      end if;
    end if;
    if v_it.track_serial and coalesce(cardinality(v_ser), 0) = 0 then
      raise exception 'seriales_requeridos' using errcode = '22023',
        detail = jsonb_build_object('item_id', v_it.id, 'product_id', v_it.product_id, 'producto', v_it.name)::text;
    end if;
    v_op := jsonb_build_object('estado_serial', 'in_transit');
    if coalesce(cardinality(v_ser), 0) > 0 then
      v_op := v_op || jsonb_build_object('seriales', to_jsonb(v_ser));
    end if;

    v_res := public.fn_inv_int_mover(p_org, v_t.origin_branch_id, v_it.product_id, v_it.lot_id, 'out', v_it.quantity,
                                     null, 'transfer_out', p_id::text,
                                     'Traslado ' || coalesce(v_t.code, 'TR-' || p_id) || ' hacia ' || coalesce(v_destino, ''),
                                     auth.uid(), v_op);
    if coalesce((v_res->>'omitido')::boolean, false) then
      raise exception 'producto_no_trasladable' using errcode = '22023', detail = v_it.name;
    end if;

    v_primero := true;
    for v_mov in select * from jsonb_array_elements(v_res->'movimientos') loop
      if v_primero then
        update public.transfer_items
           set lot_id = (v_mov->>'lot_id')::integer,
               quantity = (v_mov->>'qty')::numeric,
               unit_cost = (v_mov->>'unit_cost')::numeric,
               serial_ids = case when coalesce(cardinality(v_ser), 0) > 0 then v_ser end,
               status = 'in_transit',
               updated_at = now()
         where id = v_it.id;
        v_primero := false;
      else
        -- FEFO repartió la salida en otro lote: el lote viaja en su propio renglón.
        insert into public.transfer_items (inventory_transfer_id, product_id, quantity, lot_id, received_qty, status, unit_cost)
        values (p_id, v_it.product_id, (v_mov->>'qty')::numeric, (v_mov->>'lot_id')::integer, 0, 'in_transit',
                (v_mov->>'unit_cost')::numeric);
      end if;
      v_unidades := v_unidades + (v_mov->>'qty')::numeric;
      v_valor := v_valor + (v_mov->>'qty')::numeric * coalesce((v_mov->>'unit_cost')::numeric, 0);
      v_movs := v_movs + 1;
    end loop;
  end loop;

  if v_movs = 0 then
    raise exception 'items_requeridos' using errcode = '22023';
  end if;

  update public.inventory_transfers
     set status = 'in_transit', shipped_at = now(), shipped_by = auth.uid(), updated_at = now()
   where id = p_id;

  insert into public.inventory_transfer_events (organization_id, transfer_id, tipo, clave, detalle)
  values (p_org, p_id, 'despachado', nullif(btrim(coalesce(p_clave, '')), ''),
          jsonb_build_object('unidades', v_unidades, 'valor', round(v_valor, 2), 'movimientos', v_movs));

  return jsonb_build_object('id', p_id, 'code', v_t.code, 'status', 'in_transit', 'ya_despachado', false,
                            'unidades', v_unidades, 'valor', round(v_valor, 2), 'movimientos', v_movs);
end;
$$;

-- ─── Recibir (P7: quien recibe confirma y decide la diferencia) ──────────

create or replace function public.fn_traslado_recibir(p_org integer, p_id integer, p_lineas jsonb, p_clave text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_t record;
  v_it record;
  v_l jsonb;
  v_clave text := nullif(btrim(coalesce(p_clave, '')), '');
  v_prev jsonb;
  v_origen text;
  v_item_id integer;
  v_rec numeric;
  v_pend numeric;
  v_dif numeric;
  v_dec text;
  v_mot text;
  v_costo numeric;
  v_pend_ser integer[];
  v_rec_ser integer[];
  v_falt_ser integer[];
  v_vistos integer[] := array[]::integer[];
  v_op jsonb;
  v_nota text;
  v_unidades numeric := 0;
  v_faltantes numeric := 0;
  v_en_camino numeric := 0;
  v_valor_entrada numeric := 0;
  v_valor_faltante numeric := 0;
  v_completo boolean;
  v_evento bigint;
  v_resultado jsonb;
  v_detalle jsonb := '[]'::jsonb;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['trasladar', 'recibir']);
  select * into v_t from public.inventory_transfers t where t.id = p_id and t.organization_id = p_org for update;
  if not found then
    raise exception 'traslado_no_encontrado' using errcode = 'P0002';
  end if;
  if v_clave is not null then
    select e.detalle into v_prev from public.inventory_transfer_events e
     where e.transfer_id = p_id and e.tipo = 'recibido' and e.clave = v_clave;
    if found then
      return coalesce(v_prev->'resultado', '{}'::jsonb) || jsonb_build_object('repetido', true);
    end if;
  end if;
  if v_t.status = 'received' then
    return jsonb_build_object('id', v_t.id, 'code', v_t.code, 'status', v_t.status, 'ya_recibido', true);
  end if;
  if v_t.status <> 'in_transit' then
    raise exception 'estado_invalido' using errcode = '22023', detail = v_t.status;
  end if;
  perform public.fn_traslado_int_sucursal(p_org, v_t.dest_branch_id);
  if jsonb_typeof(p_lineas) is distinct from 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'items_requeridos' using errcode = '22023';
  end if;
  select b.name into v_origen from public.branches b where b.id = v_t.origin_branch_id;

  for v_l in select * from jsonb_array_elements(p_lineas) loop
    v_item_id := public.fn_traslado_int_entero(v_l->>'item_id');
    v_rec := public.fn_traslado_int_numero(v_l->>'recibido');
    v_dec := nullif(btrim(coalesce(v_l->>'decision', '')), '');
    v_mot := nullif(left(btrim(coalesce(v_l->>'motivo', '')), 300), '');
    if v_item_id is null or v_item_id = any(v_vistos) then
      raise exception 'renglon_invalido' using errcode = '22023';
    end if;
    v_vistos := v_vistos || v_item_id;

    select ti.*, p.name as producto, coalesce(p.track_serial, false) as track_serial
      into v_it
      from public.transfer_items ti join public.products p on p.id = ti.product_id
     where ti.id = v_item_id and ti.inventory_transfer_id = p_id
     for update of ti;
    if not found then
      raise exception 'renglon_invalido' using errcode = '22023', detail = v_item_id::text;
    end if;

    v_pend := v_it.quantity - coalesce(v_it.received_qty, 0) - v_it.missing_qty - v_it.returned_qty;
    if v_rec is null or v_rec < 0 or v_rec > v_pend then
      raise exception 'recibido_invalido' using errcode = '22023',
        detail = jsonb_build_object('item_id', v_item_id, 'pendiente', v_pend, 'recibido', v_l->>'recibido')::text;
    end if;
    v_dif := v_pend - v_rec;
    if v_dif > 0 and coalesce(v_dec, '') not in ('faltante', 'en_camino') then
      raise exception 'decision_requerida' using errcode = '22023', detail = v_item_id::text;
    end if;
    if v_dif > 0 and v_dec = 'faltante' and v_mot is null then
      raise exception 'motivo_requerido' using errcode = '22023', detail = v_item_id::text;
    end if;
    if v_dif = 0 then
      v_dec := null;
    end if;

    -- Seriales: los que siguen en tránsito del renglón.
    v_rec_ser := null;
    v_falt_ser := null;
    if coalesce(cardinality(v_it.serial_ids), 0) > 0 then
      if v_rec <> trunc(v_rec) then
        raise exception 'cantidad_invalida' using errcode = '22023', detail = 'seriales: unidades enteras';
      end if;
      select coalesce(array_agg(s.id order by s.id), array[]::integer[]) into v_pend_ser
        from public.serial_numbers s
       where s.id = any(v_it.serial_ids) and s.organization_id = p_org and s.status = 'in_transit';
      if jsonb_typeof(v_l->'seriales') = 'array' then
        select coalesce(array_agg(distinct public.fn_traslado_int_entero(x)), array[]::integer[]) into v_rec_ser
          from jsonb_array_elements_text(v_l->'seriales') x;
        if array_position(v_rec_ser, null) is not null or not (v_rec_ser <@ v_pend_ser)
           or cardinality(v_rec_ser) <> v_rec then
          raise exception 'seriales_no_cuadran' using errcode = '22023', detail = v_item_id::text;
        end if;
      elsif v_rec = cardinality(v_pend_ser) then
        v_rec_ser := v_pend_ser;
      elsif v_rec = 0 then
        v_rec_ser := array[]::integer[];
      else
        raise exception 'seriales_requeridos' using errcode = '22023',
          detail = jsonb_build_object('item_id', v_item_id, 'product_id', v_it.product_id, 'producto', v_it.producto)::text;
      end if;
      if v_dec = 'faltante' then
        select coalesce(array_agg(x order by x), array[]::integer[]) into v_falt_ser
          from unnest(v_pend_ser) x where not (x = any(v_rec_ser));
        if cardinality(v_falt_ser) <> v_dif then
          raise exception 'seriales_no_cuadran' using errcode = '22023', detail = v_item_id::text;
        end if;
      end if;
    end if;

    -- Costo con el que salió (los renglones anteriores a B3 no lo guardaban).
    v_costo := coalesce(v_it.unit_cost, public.fn_costo_unitario_producto(v_it.product_id, v_t.origin_branch_id, 0), 0);
    v_nota := 'Traslado ' || coalesce(v_t.code, 'TR-' || p_id) || ' desde ' || coalesce(v_origen, '');

    if v_rec > 0 then
      v_op := '{}'::jsonb;
      if coalesce(cardinality(v_rec_ser), 0) > 0 then
        v_op := jsonb_build_object('seriales', to_jsonb(v_rec_ser));
      end if;
      perform public.fn_inv_int_mover(p_org, v_t.dest_branch_id, v_it.product_id, v_it.lot_id, 'in', v_rec, v_costo,
                                      'transfer_in', p_id::text, v_nota, auth.uid(), v_op);
      v_valor_entrada := v_valor_entrada + v_rec * v_costo;
    end if;

    if v_dec = 'faltante' then
      -- Faltante en el transporte: entra al destino con su costo y sale como
      -- merma (loss) al mismo costo. El kardex del destino muestra la baja y el
      -- asiento de la merma lo hace fn_auto_journal_stock_movement.
      v_op := '{}'::jsonb;
      if coalesce(cardinality(v_falt_ser), 0) > 0 then
        v_op := jsonb_build_object('seriales', to_jsonb(v_falt_ser));
      end if;
      perform public.fn_inv_int_mover(p_org, v_t.dest_branch_id, v_it.product_id, v_it.lot_id, 'in', v_dif, v_costo,
                                      'transfer_in', p_id::text, v_nota, auth.uid(), v_op);
      v_op := jsonb_build_object('costo_fijo', true, 'permitir_negativo', true, 'fefo', false);
      if coalesce(cardinality(v_falt_ser), 0) > 0 then
        v_op := v_op || jsonb_build_object('seriales', to_jsonb(v_falt_ser), 'estado_serial', 'damaged');
      end if;
      perform public.fn_inv_int_mover(p_org, v_t.dest_branch_id, v_it.product_id, v_it.lot_id, 'out', v_dif, v_costo,
                                      'loss', 'traslado:' || p_id,
                                      'Faltante en el transporte · ' || coalesce(v_t.code, 'TR-' || p_id) || ' · ' || v_mot,
                                      auth.uid(), v_op);
      v_valor_entrada := v_valor_entrada + v_dif * v_costo;
      v_valor_faltante := v_valor_faltante + v_dif * v_costo;
      v_faltantes := v_faltantes + v_dif;
    elsif v_dec = 'en_camino' then
      v_en_camino := v_en_camino + v_dif;
    end if;

    update public.transfer_items
       set received_qty = coalesce(received_qty, 0) + v_rec,
           missing_qty = missing_qty + case when v_dec = 'faltante' then v_dif else 0 end,
           difference_reason = case when v_dec = 'faltante' then v_mot else difference_reason end,
           status = case when coalesce(received_qty, 0) + v_rec + missing_qty
                              + case when v_dec = 'faltante' then v_dif else 0 end + returned_qty >= quantity
                         then 'received' else 'in_transit' end,
           updated_at = now()
     where id = v_item_id;

    v_unidades := v_unidades + v_rec;
    v_detalle := v_detalle || jsonb_build_object('item_id', v_item_id, 'recibido', v_rec, 'diferencia', v_dif,
                                                 'decision', v_dec, 'motivo', v_mot);
  end loop;

  if v_unidades = 0 and v_faltantes = 0 then
    raise exception 'nada_que_recibir' using errcode = '22023';
  end if;

  select not exists (
    select 1 from public.transfer_items ti
     where ti.inventory_transfer_id = p_id
       and coalesce(ti.received_qty, 0) + ti.missing_qty + ti.returned_qty < ti.quantity
  ) into v_completo;

  update public.inventory_transfers
     set status = case when v_completo then 'received' else 'in_transit' end,
         received_at = case when v_completo then now() else received_at end,
         received_by = case when v_completo then auth.uid() else received_by end,
         updated_at = now()
   where id = p_id;

  v_resultado := jsonb_build_object('id', p_id, 'code', v_t.code,
                                    'status', case when v_completo then 'received' else 'in_transit' end,
                                    'unidades', v_unidades, 'faltantes', v_faltantes, 'en_camino', v_en_camino,
                                    'valor_faltante', round(v_valor_faltante, 2), 'repetido', false);

  insert into public.inventory_transfer_events (organization_id, transfer_id, tipo, clave, detalle)
  values (p_org, p_id, 'recibido', v_clave,
          jsonb_build_object('lineas', v_detalle, 'unidades', v_unidades, 'faltantes', v_faltantes,
                             'en_camino', v_en_camino, 'valor', round(v_valor_entrada, 2),
                             'valor_faltante', round(v_valor_faltante, 2), 'resultado', v_resultado))
  returning id into v_evento;

  perform public.fn_traslado_int_asiento(p_org, p_id, v_t.code, v_t.origin_branch_id, v_t.dest_branch_id,
                                         v_valor_entrada, p_id || ':' || v_evento);

  return v_resultado;
end;
$$;

-- ─── Cancelar (solo pendientes: no mueve stock) ────────────────────────────

create or replace function public.fn_traslado_cancelar(p_org integer, p_id integer, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_t record;
  v_motivo text := nullif(left(btrim(coalesce(p_motivo, '')), 300), '');
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['trasladar']);
  select * into v_t from public.inventory_transfers t where t.id = p_id and t.organization_id = p_org for update;
  if not found then
    raise exception 'traslado_no_encontrado' using errcode = 'P0002';
  end if;
  if v_t.status = 'cancelled' then
    return jsonb_build_object('id', v_t.id, 'code', v_t.code, 'status', v_t.status, 'ya_cancelado', true);
  end if;
  if v_t.status <> 'pending' then
    raise exception 'estado_invalido' using errcode = '22023', detail = v_t.status;
  end if;
  perform public.fn_traslado_int_sucursal(p_org, v_t.origin_branch_id);

  update public.inventory_transfers
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = v_motivo, updated_at = now()
   where id = p_id;
  insert into public.inventory_transfer_events (organization_id, transfer_id, tipo, detalle)
  values (p_org, p_id, 'cancelado', jsonb_build_object('motivo', v_motivo));

  return jsonb_build_object('id', p_id, 'code', v_t.code, 'status', 'cancelled', 'ya_cancelado', false);
end;
$$;

-- ─── Devolver al origen (lo que sigue en tránsito) ─────────────────────────

create or replace function public.fn_traslado_devolver(p_org integer, p_id integer, p_motivo text default null, p_clave text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_t record;
  v_it record;
  v_clave text := nullif(btrim(coalesce(p_clave, '')), '');
  v_motivo text := nullif(left(btrim(coalesce(p_motivo, '')), 300), '');
  v_prev jsonb;
  v_pend numeric;
  v_ser integer[];
  v_op jsonb;
  v_unidades numeric := 0;
  v_recibido numeric;
  v_estado text;
  v_resultado jsonb;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['trasladar']);
  select * into v_t from public.inventory_transfers t where t.id = p_id and t.organization_id = p_org for update;
  if not found then
    raise exception 'traslado_no_encontrado' using errcode = 'P0002';
  end if;
  if v_clave is not null then
    select e.detalle into v_prev from public.inventory_transfer_events e
     where e.transfer_id = p_id and e.tipo = 'devuelto' and e.clave = v_clave;
    if found then
      return coalesce(v_prev->'resultado', '{}'::jsonb) || jsonb_build_object('repetido', true);
    end if;
  end if;
  if v_t.status <> 'in_transit' then
    raise exception 'estado_invalido' using errcode = '22023', detail = v_t.status;
  end if;
  perform public.fn_traslado_int_sucursal(p_org, v_t.origin_branch_id);

  for v_it in
    select ti.* from public.transfer_items ti where ti.inventory_transfer_id = p_id order by ti.id for update
  loop
    v_pend := v_it.quantity - coalesce(v_it.received_qty, 0) - v_it.missing_qty - v_it.returned_qty;
    continue when v_pend <= 0;
    v_op := '{}'::jsonb;
    if coalesce(cardinality(v_it.serial_ids), 0) > 0 then
      select coalesce(array_agg(s.id order by s.id), array[]::integer[]) into v_ser
        from public.serial_numbers s
       where s.id = any(v_it.serial_ids) and s.organization_id = p_org and s.status = 'in_transit';
      if cardinality(v_ser) <> v_pend then
        raise exception 'seriales_no_cuadran' using errcode = '22023', detail = v_it.id::text;
      end if;
      v_op := jsonb_build_object('seriales', to_jsonb(v_ser));
    end if;
    perform public.fn_inv_int_mover(p_org, v_t.origin_branch_id, v_it.product_id, v_it.lot_id, 'in', v_pend,
                                    coalesce(v_it.unit_cost, public.fn_costo_unitario_producto(v_it.product_id, v_t.origin_branch_id, 0), 0),
                                    'transfer_in', p_id::text,
                                    'Devuelto al origen · ' || coalesce(v_t.code, 'TR-' || p_id)
                                      || coalesce(' · ' || v_motivo, ''),
                                    auth.uid(), v_op);
    update public.transfer_items
       set returned_qty = returned_qty + v_pend, status = 'received', updated_at = now()
     where id = v_it.id;
    v_unidades := v_unidades + v_pend;
  end loop;

  if v_unidades = 0 then
    raise exception 'nada_que_devolver' using errcode = '22023';
  end if;

  select coalesce(sum(coalesce(ti.received_qty, 0) + ti.missing_qty), 0) into v_recibido
    from public.transfer_items ti where ti.inventory_transfer_id = p_id;
  v_estado := case when v_recibido = 0 then 'cancelled' else 'received' end;

  update public.inventory_transfers
     set status = v_estado,
         cancelled_at = case when v_estado = 'cancelled' then now() else cancelled_at end,
         cancelled_by = case when v_estado = 'cancelled' then auth.uid() else cancelled_by end,
         cancel_reason = case when v_estado = 'cancelled' then coalesce(v_motivo, 'Devuelto al origen') else cancel_reason end,
         received_at = case when v_estado = 'received' then now() else received_at end,
         received_by = case when v_estado = 'received' then auth.uid() else received_by end,
         updated_at = now()
   where id = p_id;

  v_resultado := jsonb_build_object('id', p_id, 'code', v_t.code, 'status', v_estado, 'unidades', v_unidades, 'repetido', false);
  insert into public.inventory_transfer_events (organization_id, transfer_id, tipo, clave, detalle)
  values (p_org, p_id, 'devuelto', v_clave,
          jsonb_build_object('unidades', v_unidades, 'motivo', v_motivo, 'resultado', v_resultado));
  return v_resultado;
end;
$$;

-- ─── Permisos de ejecución ─────────────────────────────────────────────────

revoke all on function public.fn_traslado_int_entero(text) from public, anon;
revoke all on function public.fn_traslado_int_numero(text) from public, anon;
revoke all on function public.fn_traslado_int_sucursal(integer, integer) from public, anon, authenticated;
revoke all on function public.fn_traslado_int_disponible(integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.fn_traslado_int_asiento(integer, integer, text, integer, integer, numeric, text) from public, anon, authenticated;

revoke all on function public.fn_traslado_guardar(integer, jsonb, text) from public, anon;
revoke all on function public.fn_traslado_despachar(integer, integer, jsonb, text) from public, anon;
revoke all on function public.fn_traslado_recibir(integer, integer, jsonb, text) from public, anon;
revoke all on function public.fn_traslado_cancelar(integer, integer, text) from public, anon;
revoke all on function public.fn_traslado_devolver(integer, integer, text, text) from public, anon;

grant execute on function public.fn_traslado_guardar(integer, jsonb, text) to authenticated;
grant execute on function public.fn_traslado_despachar(integer, integer, jsonb, text) to authenticated;
grant execute on function public.fn_traslado_recibir(integer, integer, jsonb, text) to authenticated;
grant execute on function public.fn_traslado_cancelar(integer, integer, text) to authenticated;
grant execute on function public.fn_traslado_devolver(integer, integer, text, text) to authenticated;
