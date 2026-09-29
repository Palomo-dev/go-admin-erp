-- Inventario B2 · 2/3 — Guardar, aplicar y descartar un ajuste (una RPC por acción)
-- docs/implementacion/INVENTARIO-PLAN.md §3.2 y §5.3; contrato ParamsAjusteAplicar en
-- src/lib/inventario/nucleo/tipos.ts.
--
-- Sustituye a adjustmentService.applyAdjustment (navegador, N llamadas sin
-- transacción: entradas por RPC, salidas con INSERT/UPDATE directos, seriales uno
-- a uno tragándose los errores, reaplicar duplicaba).
--
--   fn_ajuste_guardar(org, ajuste jsonb)            → crea o reemplaza un BORRADOR
--   fn_ajuste_aplicar(org, ajuste_id, clave)        → documento + movimientos + asiento, atómico e idempotente
--   fn_ajuste_descartar(org, ajuste_id, motivo)     → el borrador queda 'cancelled' con motivo (no se borra)
--
-- Reglas:
--   * SECURITY DEFINER, fn_assert_acceso_org + fn_inventario_exigir_permiso(org, ['ajustar']).
--   * El stock se mueve SOLO con fn_inv_int_mover (bloqueo de la fila, promedio
--     ponderado, seriales). Origen 'adjustment', source_id = id del ajuste: el
--     kardex enlaza al ajuste (fn_inv_documentos) y el movimiento no asienta (P4).
--   * Aplicar congela «sistema al contar»: la existencia de la fila al aplicar. En
--     un conteo la diferencia se recalcula contra ella y la respuesta avisa qué
--     renglones cambiaron desde que se guardó el borrador.
--   * P5: una salida que deje la fila en negativo falla con stock_insuficiente
--     (la primitiva, permitir_negativo = false).
--   * Entrada sin costo: costo del renglón → promedio de la fila → costo vigente
--     del producto. Si no hay ninguno, costo_requerido con la lista de productos.
--   * Seriales: salida → los elegidos pasan a 'damaged' (Figma: «pasa a Dañado»);
--     entrada → se crean (o se reingresan si estaban dañados, devueltos o en RMA).
--     Un producto con seriales exige tantos seriales como unidades.
--   * Un solo asiento por ajuste (P4): fn_auto_journal_inventory_adjustment se
--     reescribe para valorar con los movimientos reales (Σ ± qty × costo), no con
--     «promedio de los costos × suma de cantidades», y sin el respaldo que tomaba
--     el costo de cualquier producto de la sucursal. Un conteo con sobrantes y
--     faltantes asienta el neto (ganancia o pérdida).

-- ── Guardar borrador ────────────────────────────────────────────────────────
create or replace function public.fn_ajuste_guardar(p_org integer, p_ajuste jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id integer := case when (p_ajuste->>'id') ~ '^[0-9]{1,9}$' then (p_ajuste->>'id')::integer end;
  v_branch integer := case when (p_ajuste->>'branch_id') ~ '^[0-9]{1,9}$' then (p_ajuste->>'branch_id')::integer end;
  v_modo text := coalesce(nullif(btrim(p_ajuste->>'mode'), ''), 'conteo');
  v_razon text := nullif(btrim(p_ajuste->>'reason'), '');
  v_nota text := nullif(btrim(p_ajuste->>'notes'), '');
  v_items jsonb := coalesce(p_ajuste->'items', '[]'::jsonb);
  v_contado timestamptz;
  v_estado text;
  v_item jsonb;
  v_prod record;
  v_lote integer;
  v_qty numeric;
  v_costo numeric;
  v_seriales text[];
  v_n_seriales integer;
  v_sis numeric;
  v_prom numeric;
  v_dif numeric;
  v_neto numeric := 0;
  v_vistos text[] := array[]::text[];
  v_clave text;
  v_code text;
begin
  perform public.fn_assert_acceso_org(p_org);
  perform public.fn_inventario_exigir_permiso(p_org, array['ajustar']);

  if v_modo not in ('entrada', 'salida', 'conteo') then
    raise exception 'modo_invalido' using errcode = '22023';
  end if;
  if v_razon is null or length(v_razon) > 60 then
    raise exception 'razon_requerida' using errcode = '22023';
  end if;
  if v_nota is not null and length(v_nota) > 1000 then
    raise exception 'nota_muy_larga' using errcode = '22023';
  end if;
  if v_branch is null or not exists (select 1 from public.branches b where b.id = v_branch and b.organization_id = p_org) then
    raise exception 'SUCURSAL_NO_ES_DE_LA_ORG' using errcode = '42501';
  end if;
  if jsonb_typeof(v_items) is distinct from 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'sin_renglones' using errcode = '22023';
  end if;
  if jsonb_array_length(v_items) > 500 then
    raise exception 'demasiados_renglones' using errcode = '22023', detail = 'máximo 500';
  end if;
  begin
    v_contado := coalesce(nullif(btrim(p_ajuste->>'counted_at'), '')::timestamptz, now());
  exception when others then
    raise exception 'fecha_invalida' using errcode = '22023';
  end;
  if v_contado > now() + interval '5 minutes' then
    raise exception 'fecha_futura' using errcode = '22023';
  end if;

  if v_id is not null then
    select ia.status into v_estado from public.inventory_adjustments ia
     where ia.id = v_id and ia.organization_id = p_org
       for update;
    if not found then
      raise exception 'ajuste_no_encontrado' using errcode = 'P0002';
    end if;
    if v_estado <> 'draft' then
      raise exception 'ajuste_cerrado' using errcode = '55000';
    end if;
    update public.inventory_adjustments
       set branch_id = v_branch, mode = v_modo, reason = v_razon, notes = v_nota,
           counted_at = v_contado, updated_at = now()
     where id = v_id;
    delete from public.adjustment_items where inventory_adjustment_id = v_id;
  else
    insert into public.inventory_adjustments (organization_id, branch_id, type, reason, status, created_by, notes, mode, counted_at)
    values (p_org, v_branch, case when v_modo = 'salida' then 'loss' else 'gain' end, v_razon, 'draft', auth.uid(),
            v_nota, v_modo, v_contado)
    returning id into v_id;
  end if;

  for v_item in select * from jsonb_array_elements(v_items) loop
    select p.id, p.name, p.track_stock, p.track_serial into v_prod
      from public.products p
     where p.id = case when (v_item->>'product_id') ~ '^[0-9]{1,9}$' then (v_item->>'product_id')::integer end
       and p.organization_id = p_org;
    if v_prod.id is null then
      raise exception 'PRODUCTO_NO_ES_DE_LA_ORG' using errcode = '42501';
    end if;
    if v_prod.track_stock is not true then
      raise exception 'producto_sin_control_stock' using errcode = '22023', detail = v_prod.id::text;
    end if;

    v_lote := case when (v_item->>'lot_id') ~ '^[0-9]{1,9}$' then (v_item->>'lot_id')::integer end;
    if v_lote is not null and not exists (
      select 1 from public.lots l where l.id = v_lote and l.product_id = v_prod.id and l.organization_id = p_org
    ) then
      raise exception 'lote_invalido' using errcode = '22023', detail = v_lote::text;
    end if;

    v_clave := v_prod.id::text || ':' || coalesce(v_lote::text, '-');
    if v_clave = any(v_vistos) then
      raise exception 'renglon_repetido' using errcode = '22023', detail = v_clave;
    end if;
    v_vistos := v_vistos || v_clave;

    begin
      v_qty := round((v_item->>'quantity')::numeric, 3);
    exception when others then
      raise exception 'cantidad_invalida' using errcode = '22023', detail = v_prod.id::text;
    end;
    if v_qty is null or v_qty < 0 or (v_modo <> 'conteo' and v_qty = 0) or v_qty > 999999999 then
      raise exception 'cantidad_invalida' using errcode = '22023', detail = v_prod.id::text;
    end if;

    v_costo := case when (v_item->>'unit_cost') ~ '^[0-9]{1,12}(\.[0-9]+)?$' then round((v_item->>'unit_cost')::numeric, 2) end;
    if v_costo is not null and v_costo <= 0 then
      v_costo := null;
    end if;

    select count(*), array_agg(distinct s) into v_n_seriales, v_seriales
      from (select nullif(btrim(x), '') as s
              from jsonb_array_elements_text(case when jsonb_typeof(v_item->'serial_numbers') = 'array'
                                                  then v_item->'serial_numbers' else '[]'::jsonb end) x) q
     where s is not null;
    if coalesce(array_length(v_seriales, 1), 0) <> v_n_seriales then
      raise exception 'serial_repetido' using errcode = '22023', detail = v_prod.id::text;
    end if;
    if v_modo <> 'conteo' and v_n_seriales > 0 and v_n_seriales <> v_qty then
      raise exception 'seriales_no_cuadran' using errcode = '22023',
        detail = jsonb_build_object('product_id', v_prod.id, 'cantidad', v_qty, 'seriales', v_n_seriales)::text;
    end if;

    select sl.qty_on_hand, sl.avg_cost into v_sis, v_prom
      from public.stock_levels sl
     where sl.product_id = v_prod.id and sl.branch_id = v_branch and sl.lot_id is not distinct from v_lote
     order by sl.id limit 1;
    v_sis := coalesce(v_sis, 0);
    v_dif := case v_modo when 'conteo' then v_qty - v_sis when 'entrada' then v_qty else -v_qty end;

    insert into public.adjustment_items (inventory_adjustment_id, product_id, lot_id, quantity, unit_cost,
                                         serial_numbers, system_qty, difference, applied_cost)
    values (v_id, v_prod.id, v_lote, v_qty, v_costo, case when v_n_seriales > 0 then v_seriales end,
            v_sis, v_dif, coalesce(v_costo, nullif(v_prom, 0)));
    v_neto := v_neto + v_dif * coalesce(v_costo, v_prom, 0);
  end loop;

  update public.inventory_adjustments
     set type = case when v_modo = 'entrada' then 'gain' when v_modo = 'salida' then 'loss'
                     when v_neto < 0 then 'loss' else 'gain' end
   where id = v_id
  returning code into v_code;

  return jsonb_build_object('id', v_id, 'code', v_code);
end;
$$;

-- ── Aplicar (idempotente) ───────────────────────────────────────────────────
create or replace function public.fn_ajuste_aplicar(p_org integer, p_ajuste_id integer, p_clave_idempotencia text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_aj record;
  v_it record;
  v_sl record;
  v_sis numeric;
  v_prom numeric;
  v_dif numeric;
  v_costo numeric;
  v_costo_mov numeric;
  v_res jsonb;
  v_opc jsonb;
  v_movs jsonb := '[]'::jsonb;
  v_recalc jsonb := '[]'::jsonb;
  v_sin_costo jsonb := '[]'::jsonb;
  v_ids integer[];
  v_serial text;
  v_st record;
  v_sid integer;
  v_n integer;
  v_neto numeric := 0;
  v_nota text;
  v_user uuid := auth.uid();
begin
  perform public.fn_assert_acceso_org(p_org);
  perform public.fn_inventario_exigir_permiso(p_org, array['ajustar']);

  select * into v_aj from public.inventory_adjustments ia
   where ia.id = p_ajuste_id and ia.organization_id = p_org
     for update;
  if not found then
    raise exception 'ajuste_no_encontrado' using errcode = 'P0002';
  end if;

  -- Idempotencia: el bloqueo del documento serializa; el segundo intento ve 'posted'.
  if v_aj.status = 'posted' then
    return jsonb_build_object('ok', true, 'ya_aplicado', true, 'id', v_aj.id, 'code', v_aj.code,
      'movimientos', (select count(*) from public.stock_movements sm
                       where sm.organization_id = p_org and sm.source = 'adjustment' and sm.source_id = v_aj.id::text),
      'recalculados', '[]'::jsonb, 'valor_neto', null);
  end if;
  if v_aj.status <> 'draft' then
    raise exception 'ajuste_descartado' using errcode = '55000';
  end if;
  if not exists (select 1 from public.adjustment_items ai where ai.inventory_adjustment_id = v_aj.id) then
    raise exception 'sin_renglones' using errcode = '22023';
  end if;

  v_nota := v_aj.code || ' · ' || v_aj.reason;

  -- Orden fijo (producto, lote) para que dos ajustes simultáneos no se bloqueen en cruz.
  for v_it in
    select ai.*, p.name as product_name, p.track_serial
      from public.adjustment_items ai
      join public.products p on p.id = ai.product_id
     where ai.inventory_adjustment_id = v_aj.id
     order by ai.product_id, ai.lot_id nulls first, ai.id
  loop
    select sl.id, sl.qty_on_hand, sl.avg_cost into v_sl
      from public.stock_levels sl
     where sl.product_id = v_it.product_id and sl.branch_id = v_aj.branch_id
       and sl.lot_id is not distinct from v_it.lot_id
     order by sl.id limit 1
       for update;
    v_sis := coalesce(v_sl.qty_on_hand, 0);
    v_prom := coalesce(v_sl.avg_cost, 0);
    v_dif := case v_aj.mode
      when 'entrada' then v_it.quantity
      when 'salida' then -v_it.quantity
      else round(v_it.quantity - v_sis, 3)
    end;

    if coalesce(v_aj.mode, 'conteo') = 'conteo' and v_it.system_qty is not null and v_it.system_qty <> v_sis then
      v_recalc := v_recalc || jsonb_build_object('product_id', v_it.product_id, 'lot_id', v_it.lot_id,
        'nombre', v_it.product_name, 'sistema_al_guardar', v_it.system_qty, 'sistema_al_aplicar', v_sis,
        'diferencia', v_dif);
    end if;

    v_ids := null;
    v_costo_mov := null;
    if v_dif <> 0 then
      -- Seriales: tantos como unidades.
      if coalesce(array_length(v_it.serial_numbers, 1), 0) > 0 or v_it.track_serial then
        if coalesce(array_length(v_it.serial_numbers, 1), 0) <> abs(v_dif) then
          raise exception 'seriales_no_cuadran' using errcode = '22023',
            detail = jsonb_build_object('product_id', v_it.product_id, 'cantidad', abs(v_dif),
                                        'seriales', coalesce(array_length(v_it.serial_numbers, 1), 0))::text;
        end if;
        if v_dif > 0 then
          foreach v_serial in array v_it.serial_numbers loop
            select s.id, s.product_id, s.status into v_st
              from public.serial_numbers s
             where s.organization_id = p_org and s.serial = v_serial
               for update;
            if v_st.id is not null then
              if v_st.product_id <> v_it.product_id
                 or v_st.status in ('in_stock', 'reserved', 'sold', 'in_transit', 'warranty_claim') then
                raise exception 'serial_no_disponible' using errcode = '22023', detail = v_serial;
              end if;
              v_sid := v_st.id;
            else
              begin
                insert into public.serial_numbers (product_id, serial, status, organization_id, branch_id,
                                                   current_branch_id, lot_id, received_date, notes, updated_by)
                values (v_it.product_id, v_serial, 'in_stock', p_org, v_aj.branch_id, v_aj.branch_id, v_it.lot_id,
                        now(), v_nota, v_user)
                returning id into v_sid;
              exception when unique_violation then
                raise exception 'serial_repetido' using errcode = '22023', detail = v_serial;
              end;
            end if;
            v_ids := array_append(v_ids, v_sid);
          end loop;
        else
          select array_agg(s.id), count(*) into v_ids, v_n
            from public.serial_numbers s
           where s.organization_id = p_org and s.product_id = v_it.product_id
             and s.serial = any(v_it.serial_numbers);
          if v_n <> array_length(v_it.serial_numbers, 1) then
            raise exception 'serial_no_disponible' using errcode = '22023';
          end if;
        end if;
      end if;

      if v_dif > 0 then
        v_costo := coalesce(nullif(v_it.unit_cost, 0), nullif(v_prom, 0),
                            nullif(public.fn_costo_unitario_producto(v_it.product_id, v_aj.branch_id, null), 0));
        if v_costo is null then
          v_sin_costo := v_sin_costo || jsonb_build_object('product_id', v_it.product_id, 'nombre', v_it.product_name);
          continue;
        end if;
        v_opc := jsonb_build_object('fefo', false);
        if v_ids is not null then
          v_opc := v_opc || jsonb_build_object('seriales', to_jsonb(v_ids));
        end if;
        v_res := public.fn_inv_int_mover(p_org, v_aj.branch_id, v_it.product_id, v_it.lot_id, 'in', v_dif, v_costo,
                                         'adjustment', v_aj.id::text, v_nota, v_user, v_opc);
      else
        v_opc := jsonb_build_object('fefo', false, 'permitir_negativo', false);
        if v_ids is not null then
          v_opc := v_opc || jsonb_build_object('seriales', to_jsonb(v_ids), 'estado_serial', 'damaged');
        end if;
        v_res := public.fn_inv_int_mover(p_org, v_aj.branch_id, v_it.product_id, v_it.lot_id, 'out', -v_dif, null,
                                         'adjustment', v_aj.id::text, v_nota, v_user, v_opc);
      end if;

      if coalesce((v_res->>'omitido')::boolean, false) then
        raise exception 'producto_sin_control_stock' using errcode = '22023', detail = v_it.product_id::text;
      end if;
      v_costo_mov := (v_res->'movimientos'->0->>'unit_cost')::numeric;
      v_movs := v_movs || (v_res->'movimientos');
    else
      v_costo_mov := coalesce(nullif(v_prom, 0), v_it.unit_cost);
    end if;

    update public.adjustment_items
       set system_qty = v_sis, difference = v_dif, applied_cost = v_costo_mov, updated_at = now()
     where id = v_it.id;
    v_neto := v_neto + v_dif * coalesce(v_costo_mov, 0);
  end loop;

  if jsonb_array_length(v_sin_costo) > 0 then
    raise exception 'costo_requerido' using errcode = '22023', detail = v_sin_costo::text;
  end if;

  -- Pasa a 'posted' al final: el asiento único (fn_auto_journal_inventory_adjustment)
  -- lee los movimientos que acaban de escribirse.
  update public.inventory_adjustments
     set status = 'posted', posted_at = now(), posted_by = v_user,
         apply_key = left(nullif(btrim(p_clave_idempotencia), ''), 100),
         type = case when mode = 'entrada' then 'gain' when mode = 'salida' then 'loss'
                     when v_neto < 0 then 'loss' else 'gain' end,
         updated_at = now()
   where id = v_aj.id;

  return jsonb_build_object('ok', true, 'ya_aplicado', false, 'id', v_aj.id, 'code', v_aj.code,
    'movimientos', jsonb_array_length(v_movs), 'detalle_movimientos', v_movs,
    'recalculados', v_recalc, 'valor_neto', round(v_neto, 2));
end;
$$;

-- ── Descartar borrador (con motivo; no se borra) ────────────────────────────
create or replace function public.fn_ajuste_descartar(p_org integer, p_ajuste_id integer, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_estado text;
  v_motivo text := nullif(btrim(p_motivo), '');
begin
  perform public.fn_assert_acceso_org(p_org);
  perform public.fn_inventario_exigir_permiso(p_org, array['ajustar']);
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'motivo_requerido' using errcode = '22023';
  end if;
  if length(v_motivo) > 500 then
    raise exception 'motivo_muy_largo' using errcode = '22023';
  end if;

  select ia.status into v_estado from public.inventory_adjustments ia
   where ia.id = p_ajuste_id and ia.organization_id = p_org
     for update;
  if not found then
    raise exception 'ajuste_no_encontrado' using errcode = 'P0002';
  end if;
  if v_estado = 'cancelled' then
    return jsonb_build_object('ok', true, 'ya_descartado', true, 'id', p_ajuste_id);
  end if;
  if v_estado <> 'draft' then
    raise exception 'ajuste_aplicado' using errcode = '55000';
  end if;

  update public.inventory_adjustments
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = v_motivo,
         updated_at = now()
   where id = p_ajuste_id;
  return jsonb_build_object('ok', true, 'ya_descartado', false, 'id', p_ajuste_id);
end;
$$;

-- ── Asiento único del documento (P4) ────────────────────────────────────────
do $$
declare
  v_def text := pg_get_functiondef('public.fn_auto_journal_inventory_adjustment()'::regprocedure);
begin
  if position('B2 (2026-09-29)' in v_def) = 0 then
    insert into private.respaldo_funciones (migracion, firma, definicion, md5)
    values ('20260929130100_inv_b2_2', 'fn_auto_journal_inventory_adjustment()', v_def, md5(v_def))
    on conflict (migracion, firma) do nothing;
  end if;
end $$;

create or replace function public.fn_auto_journal_inventory_adjustment()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
-- B2 (2026-09-29): un solo asiento por ajuste, valorado con los movimientos reales.
declare
  v_rule record;
  v_neto numeric;
  v_amount numeric;
  v_event_type text;
  v_existing_entry integer;
  v_debit_account text;
  v_credit_account text;
  v_description text;
begin
  if new.status is distinct from 'posted' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  -- Σ (+ entradas − salidas) × costo del movimiento; sin costo, el promedio de su fila.
  select coalesce(sum(case when sm.direction = 'in' then 1 else -1 end * abs(sm.qty)
                      * coalesce(nullif(sm.unit_cost, 0),
                                 (select sl.avg_cost from stock_levels sl
                                   where sl.product_id = sm.product_id and sl.branch_id = sm.branch_id
                                     and sl.lot_id is not distinct from sm.lot_id
                                   order by sl.id limit 1), 0)), 0)
    into v_neto
    from stock_movements sm
   where sm.source = 'adjustment'
     and sm.source_id = new.id::text
     and sm.organization_id = new.organization_id;

  v_amount := round(abs(v_neto), 2);
  if v_amount <= 0 then
    return new;
  end if;
  v_event_type := case when v_neto > 0 then 'gain' else 'loss' end;

  select je.id into v_existing_entry
    from journal_entries je
   where je.source = 'inventory_adjustment'
     and je.source_id = new.id::text
     and je.organization_id = new.organization_id
   limit 1;
  if v_existing_entry is not null then
    return new;
  end if;

  select * into v_rule
    from accounting_rules
   where organization_id = new.organization_id
     and source_type = 'inventory_adjustment'
     and event_type = v_event_type
     and is_active = true
   order by priority
   limit 1;

  if v_rule is null then /* registro-sin-regla */
    perform fn_log_journal_failure(new.organization_id, null, now(), tg_table_name, new.id::text, null, null, null, null,
      'no_rule', 'Sin regla contable activa para ' || tg_table_name || ' (' || tg_op || ')');
    return new;
  end if;

  -- Inventario (1405) tiene subcuenta por sucursal; si no, la cuenta base.
  select sub_account_code into v_debit_account
    from branch_account_mappings
   where organization_id = new.organization_id and branch_id = new.branch_id
     and base_account_code = v_rule.debit_account_code
   limit 1;
  select sub_account_code into v_credit_account
    from branch_account_mappings
   where organization_id = new.organization_id and branch_id = new.branch_id
     and base_account_code = v_rule.credit_account_code
   limit 1;
  v_debit_account := coalesce(v_debit_account, v_rule.debit_account_code);
  v_credit_account := coalesce(v_credit_account, v_rule.credit_account_code);

  v_description := 'Ajuste de inventario ' || coalesce(new.code, new.id::text) || ' - '
                   || coalesce(new.reason, 'N/A') || coalesce(' - ' || nullif(new.notes, ''), '');

  perform fn_create_journal_entry(
    new.organization_id, new.branch_id, coalesce(new.posted_at, new.updated_at, now()),
    v_description, 'inventory_adjustment', new.id::text,
    v_debit_account, v_credit_account, v_amount
  );
  return new;
end;
$$;

revoke all on function public.fn_auto_journal_inventory_adjustment() from public, anon, authenticated;

-- ── Permisos de ejecución ───────────────────────────────────────────────────
revoke all on function public.fn_ajuste_guardar(integer, jsonb) from public, anon;
revoke all on function public.fn_ajuste_aplicar(integer, integer, text) from public, anon;
revoke all on function public.fn_ajuste_descartar(integer, integer, text) from public, anon;
grant execute on function public.fn_ajuste_guardar(integer, jsonb) to authenticated, service_role;
grant execute on function public.fn_ajuste_aplicar(integer, integer, text) to authenticated, service_role;
grant execute on function public.fn_ajuste_descartar(integer, integer, text) to authenticated, service_role;

comment on function public.fn_ajuste_guardar(integer, jsonb) is
  'B2: crea o reemplaza un borrador de ajuste (conteo, entrada o salida). No mueve stock. Permiso ajustar.';
comment on function public.fn_ajuste_aplicar(integer, integer, text) is
  'B2: aplica un borrador en una transacción: movimientos por fn_inv_int_mover, sistema al contar congelado, asiento único. Idempotente. Permiso ajustar.';
comment on function public.fn_ajuste_descartar(integer, integer, text) is
  'B2: descarta un borrador con motivo (estado cancelled; no se borra). Permiso ajustar.';
