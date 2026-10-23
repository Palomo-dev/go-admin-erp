-- Vuelve las dos funciones al cuerpo de 20261023094446, sin pp_elim.
-- No toca asientos ni el lote ya revertido de la org 338.

create or replace function public.fn_auto_journal_stock_movement()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_amount numeric;
  v_unit_cost numeric;
  v_description text;
  v_product_name text;
  v_debit_account text;
  v_credit_account text;
  v_debito_base text;
  v_credito_base text;
  v_evento text;
  v_fallo text;
  v_fact_key text;
begin
  -- Compras (las contabiliza la factura) y traslados no son ajustes.
  -- La apertura sí se contabiliza: inventario contra patrimonio, no contra costos.
  if new.source in ('purchase', 'purchase_order', 'purchase_invoice', 'purchase_void',
                    'transfer', 'transfer_out', 'transfer_in') then
    return new;
  end if;

  -- Los movimientos de un documento de ajuste de ganancia o pérdida los
  -- contabiliza el documento. El ajuste masivo usa source_id 'masivo:…',
  -- que no entra en este salto.
  if new.source = 'adjustment' and new.source_id ~ '^[0-9]{1,9}$' and exists (
    select 1
      from public.inventory_adjustments ia
     where ia.id = new.source_id::integer
       and ia.organization_id = new.organization_id
       and ia.type in ('gain', 'loss')
  ) then
    return new;
  end if;

  if new.direction not in ('out', 'in') then
    return new;
  end if;

  v_unit_cost := coalesce(new.unit_cost, 0);
  if v_unit_cost = 0 then
    select sl.avg_cost
      into v_unit_cost
      from public.stock_levels sl
     where sl.product_id = new.product_id
       and sl.branch_id = new.branch_id
     limit 1;
  end if;

  v_amount := abs(new.qty) * coalesce(v_unit_cost, 0);
  if v_amount <= 0 then
    return new;
  end if;

  v_fact_key := 'stock_movement:' || new.id::text;

  -- Un segundo paso del mismo movimiento no crea otro asiento.
  if exists (
    select 1
      from public.journal_entries je
     where je.organization_id = new.organization_id
       and (
         je.fact_key = v_fact_key
         or (je.source = 'stock_movements' and je.source_id = new.id::text)
       )
  ) then
    return new;
  end if;

  select c.debito, c.credito, c.evento
    into v_debito_base, v_credito_base, v_evento
    from public.fn_cuentas_movimiento_stock(new.organization_id, new.source, new.direction) c;

  if v_debito_base is null or v_credito_base is null then
    perform public.fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.created_at, now()),
      'stock_movements', new.id::text, v_fact_key, v_debito_base, v_credito_base, v_amount,
      'no_rule', 'Sin cuentas para el movimiento ' || coalesce(new.source, '') || ' ' || coalesce(new.direction, ''));
    return new;
  end if;

  select r.cuenta, r.fallo
    into v_debit_account, v_fallo
    from public.fn_cuenta_configurada_de_sede(
      new.organization_id, new.branch_id, 'stock_movements', 'debito', v_debito_base
    ) r;
  if v_fallo is not null then
    perform public.fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.created_at, now()),
      'stock_movements', new.id::text, v_fact_key, v_debit_account, v_credito_base, v_amount,
      'cuenta_no_configurada', v_fallo);
    return new;
  end if;

  select r.cuenta, r.fallo
    into v_credit_account, v_fallo
    from public.fn_cuenta_configurada_de_sede(
      new.organization_id, new.branch_id, 'stock_movements', 'credito', v_credito_base
    ) r;
  if v_fallo is not null then
    perform public.fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.created_at, now()),
      'stock_movements', new.id::text, v_fact_key, v_debit_account, v_credit_account, v_amount,
      'cuenta_no_configurada', v_fallo);
    return new;
  end if;

  select p.name
    into v_product_name
    from public.products p
   where p.id = new.product_id
   limit 1;

  v_description := case v_evento
    when 'opening' then 'Apertura de inventario - '
    when 'sale' then 'Costo de venta - '
    when 'return' then 'Devolución de inventario - '
    when 'loss' then 'Ajuste de inventario (pérdida) - '
    when 'purchase' then 'Compra de inventario - '
    else 'Ajuste de inventario (ganancia) - '
  end || coalesce(v_product_name, 'Prod:' || new.product_id);

  begin
    perform public.fn_create_journal_entry(
      new.organization_id,
      new.branch_id,
      coalesce(new.created_at, now()),
      v_description,
      'stock_movements',
      new.id::text,
      v_debit_account,
      v_credit_account,
      v_amount,
      null::text,
      0,
      null::uuid,
      false,
      v_fact_key
    );
  exception
    when unique_violation then
      return new;
  end;

  return new;
end;
$fn$;

create or replace function public.fn_productos_ajuste_masivo_stock(
  p_organization_id integer,
  p_product_ids integer[],
  p_branch_id integer,
  p_modo text,
  p_cantidad numeric,
  p_motivo text default null,
  p_expandir boolean default true,
  p_tipo text default 'ajuste'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid uuid := auth.uid();
  v_ids integer[];
  v_prod record;
  v_actual numeric;
  v_objetivo numeric;
  v_costo numeric;
  v_delta numeric;
  v_quien text;
  v_motivo text := left(nullif(btrim(coalesce(p_motivo, '')), ''), 500);
  v_nota text;
  v_tipo text := coalesce(nullif(btrim(p_tipo), ''), 'ajuste');
  v_source text;
  v_source_id text;
  v_ajustados integer := 0;
  v_sin_cambio integer := 0;
  v_sin_rastreo integer := 0;
  v_entradas integer := 0;
  v_salidas integer := 0;
  v_sin_costo integer := 0;
  v_unidades_entrada numeric := 0;
  v_unidades_salida numeric := 0;
begin
  perform public.fn_productos_exigir_permiso(
    p_organization_id,
    array['inventory.adjust', 'inventory_management']
  );

  if p_modo is null or p_modo not in ('set', 'add') then
    raise exception 'modo_invalido' using errcode = '22023';
  end if;
  if v_tipo not in ('ajuste', 'apertura') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if p_cantidad is null then
    raise exception 'cantidad_requerida' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_product_ids), 0) = 0 then
    raise exception 'sin_productos' using errcode = '22023';
  end if;
  if cardinality(p_product_ids) > 500 then
    raise exception 'demasiados_productos' using errcode = '22023', detail = '500';
  end if;
  if not exists (
    select 1 from public.branches b
     where b.id = p_branch_id and b.organization_id = p_organization_id
  ) then
    raise exception 'sucursal_invalida' using errcode = '22023';
  end if;

  v_source := case when v_tipo = 'apertura' then 'initial' else 'adjustment' end;
  v_source_id := 'masivo:' || gen_random_uuid()::text;

  v_ids := case
    when coalesce(p_expandir, true)
      then public.fn_productos_int_expandir_variantes(p_organization_id, p_product_ids)
    else p_product_ids
  end;

  select coalesce(
           nullif(btrim(coalesce(pf.first_name, '') || ' ' || coalesce(pf.last_name, '')), ''),
           pf.email
         )
    into v_quien
    from public.profiles pf
   where pf.id = v_uid;
  v_nota := case when v_tipo = 'apertura' then 'Apertura masiva · ' else 'Ajuste masivo · ' end
            || coalesce(v_quien, case when v_uid is null then 'sistema' else v_uid::text end)
            || coalesce(' · ' || v_motivo, '');

  for v_prod in
    select p.id, p.track_stock
      from public.products p
     where p.id = any(v_ids)
       and p.organization_id = p_organization_id
       and coalesce(p.status, 'active') <> 'deleted'
     order by p.id
  loop
    if not v_prod.track_stock then
      v_sin_rastreo := v_sin_rastreo + 1;
      continue;
    end if;

    v_actual := null;
    select sl.qty_on_hand
      into v_actual
      from public.stock_levels sl
     where sl.product_id = v_prod.id
       and sl.branch_id = p_branch_id
       and sl.lot_id is null
     order by sl.id
     limit 1
       for update;
    v_actual := coalesce(v_actual, 0);
    v_objetivo := greatest(0, case when p_modo = 'set' then p_cantidad else v_actual + p_cantidad end);

    if v_objetivo = v_actual then
      v_sin_cambio := v_sin_cambio + 1;
      continue;
    end if;

    v_costo := coalesce(public.fn_costo_unitario_producto(v_prod.id, p_branch_id, 0), 0);
    v_delta := public.fn_producto_int_ajustar_stock(
      p_organization_id, v_prod.id, p_branch_id, v_objetivo, v_costo, v_nota,
      v_source, v_source_id
    );

    v_ajustados := v_ajustados + 1;
    if v_delta > 0 then
      v_entradas := v_entradas + 1;
      v_unidades_entrada := v_unidades_entrada + v_delta;
    else
      v_salidas := v_salidas + 1;
      v_unidades_salida := v_unidades_salida - v_delta;
    end if;
    if v_costo <= 0 then
      v_sin_costo := v_sin_costo + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'productos', cardinality(v_ids),
    'ajustados', v_ajustados,
    'sin_cambio', v_sin_cambio,
    'sin_rastreo', v_sin_rastreo,
    'entradas', v_entradas,
    'salidas', v_salidas,
    'unidades_entrada', v_unidades_entrada,
    'unidades_salida', v_unidades_salida,
    'sin_costo', v_sin_costo
  );
end;
$fn$;
