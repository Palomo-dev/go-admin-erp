-- Rollback de 20261023094446_cuentas_movimiento_stock.sql
--
-- Revierte el efecto contable y el esquema. No borra asientos.
--
-- 1. Los 1288 contra-asientos del lote carga-masiva-stock-338-20261022 se
--    revierten con fn_revertir_asiento_en_fecha (lote
--    deshace-carga-masiva-stock-338-20261022), en la fecha original. Eso
--    devuelve el crédito de la clase 6 de la org 338 a 37989896190. El
--    periodo del 22 de octubre de 2026 tiene que estar abierto.
--    Si se quiere conservar la limpieza y deshacer solo el esquema, no
--    ejecutar el bloque «deshacer lote».
-- 2. El disparador vuelve a la versión anterior (la entrada de ajuste
--    acredita la cuenta de costo). La apertura deja de contabilizarse.
-- 3. Se borran las reglas con descripción semilla-cuentas-movimiento-stock
--    y se restaura el check de event_type. Si después se crearon reglas
--    propias de opening, sale, return o purchase, hay que quitarlas antes:
--    el bloque lo exige y aborta.
-- 4. El índice uq_journal_entries_fact_key es anterior a esta migración
--    (20260923000000). No se elimina.
--
-- Las otras organizaciones no se revirtieron; aquí no hay nada que deshacer
-- de ellas. Los costos del lote no se recontabilizaron.

-- ── deshacer lote ───────────────────────────────────────────────────────────
do $deshace$
declare
  v_n integer;
  v_clase6 numeric;
  r record;
begin
  perform set_config('statement_timeout', '300000', true);

  select count(*)
    into v_n
    from public.journal_entries rev
   where rev.organization_id = 338
     and rev.source = 'reversal'
     and rev.memo like '%| carga-masiva-stock-338-20261022 |%'
     and not exists (
       select 1
         from public.journal_entries otro
        where otro.organization_id = 338
          and otro.fact_key = 'reversal:' || rev.id::text
     );

  if v_n = 0 then
    return;
  end if;
  if v_n <> 1288 then
    raise exception 'contra_asientos_distintos %', v_n;
  end if;

  for r in
    select rev.id, rev.entry_date
      from public.journal_entries rev
     where rev.organization_id = 338
       and rev.source = 'reversal'
       and rev.memo like '%| carga-masiva-stock-338-20261022 |%'
       and not exists (
         select 1
           from public.journal_entries otro
          where otro.organization_id = 338
            and otro.fact_key = 'reversal:' || rev.id::text
       )
     order by rev.id
       for update
  loop
    perform public.fn_revertir_asiento_en_fecha(
      r.id,
      'manual',
      'deshace-carga-masiva-stock-338-20261022',
      r.entry_date,
      null::uuid
    );
  end loop;

  select round(coalesce(sum(jl.credit - jl.debit), 0), 2)
    into v_clase6
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
   where je.organization_id = 338
     and je.posted
     and left(jl.account_code, 1) = '6';
  if v_clase6 is distinct from 37989896190::numeric then
    raise exception 'clase6_no_restaurada %', v_clase6;
  end if;
end;
$deshace$;

-- ── disparador anterior ─────────────────────────────────────────────────────
create or replace function public.fn_auto_journal_stock_movement()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_rule record;
  v_amount numeric;
  v_unit_cost numeric;
  v_description text;
  v_product_name text;
  v_existing_entry integer;
  v_debit_account text;
  v_credit_account text;
  v_fallo text;
begin
  if new.source in ('initial', 'purchase', 'purchase_order', 'purchase_invoice', 'purchase_void',
                    'transfer', 'transfer_out', 'transfer_in') then
    return new;
  end if;

  if new.source = 'adjustment' and new.source_id ~ '^[0-9]{1,9}$' and exists (
    select 1 from public.inventory_adjustments ia
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
    select sl.avg_cost into v_unit_cost
      from public.stock_levels sl
     where sl.product_id = new.product_id
       and sl.branch_id = new.branch_id
     limit 1;
  end if;

  v_amount := abs(new.qty) * coalesce(v_unit_cost, 0);
  if v_amount <= 0 then
    return new;
  end if;

  select je.id into v_existing_entry
    from public.journal_entries je
   where je.source = 'stock_movements'
     and je.source_id = new.id::text
     and je.organization_id = new.organization_id
   limit 1;

  if v_existing_entry is not null then
    return new;
  end if;

  select * into v_rule
    from public.accounting_rules
   where organization_id = new.organization_id
     and source_type = 'inventory'
     and event_type = 'adjusted'
     and is_active = true
   order by priority
   limit 1;

  if v_rule is null then
    perform public.fn_log_journal_failure(
      (to_jsonb(new)->>'organization_id')::integer, null, now(), tg_table_name, to_jsonb(new)->>'id',
      null, null, null, null, 'no_rule',
      'Sin regla contable activa para ' || tg_table_name || ' (' || tg_op || ')');
    return new;
  end if;

  select r.cuenta, r.fallo into v_debit_account, v_fallo
    from public.fn_cuenta_configurada_de_sede(
      new.organization_id, new.branch_id, 'stock_movements', 'debito', v_rule.debit_account_code
    ) r;
  if v_fallo is not null then
    perform public.fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.created_at, now()),
      'stock_movements', new.id::text, null, v_debit_account, v_rule.credit_account_code, v_amount,
      'cuenta_no_configurada', v_fallo);
    return new;
  end if;

  select r.cuenta, r.fallo into v_credit_account, v_fallo
    from public.fn_cuenta_configurada_de_sede(
      new.organization_id, new.branch_id, 'stock_movements', 'credito', v_rule.credit_account_code
    ) r;
  if v_fallo is not null then
    perform public.fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.created_at, now()),
      'stock_movements', new.id::text, null, v_debit_account, v_credit_account, v_amount,
      'cuenta_no_configurada', v_fallo);
    return new;
  end if;

  select name into v_product_name from public.products where id = new.product_id limit 1;

  if new.direction = 'out' then
    v_description := 'Salida Inventario - ' || coalesce(v_product_name, 'Prod:' || new.product_id) || ' - ' || coalesce(new.source, '');
    perform public.fn_create_journal_entry(
      new.organization_id, new.branch_id, coalesce(new.created_at, now()),
      v_description, 'stock_movements', new.id::text,
      v_debit_account, v_credit_account, v_amount
    );
  else
    v_description := 'Entrada Ajuste - ' || coalesce(v_product_name, 'Prod:' || new.product_id);
    perform public.fn_create_journal_entry(
      new.organization_id, new.branch_id, coalesce(new.created_at, now()),
      v_description, 'stock_movements', new.id::text,
      v_credit_account, v_debit_account, v_amount
    );
  end if;

  return new;
end;
$fn$;

revoke all on function public.fn_auto_journal_stock_movement() from public, anon, authenticated;
grant execute on function public.fn_auto_journal_stock_movement() to service_role;

drop function if exists public.fn_cuentas_movimiento_stock(integer, text, text);
drop function if exists public.fn_alerta_saldo_credito_clase6(integer);

-- ── ajuste de stock: vuelve la firma de 6 argumentos ────────────────────────
create or replace function public.fn_producto_int_ajustar_stock(
  p_org integer,
  p_product_id integer,
  p_branch_id integer,
  p_qty numeric,
  p_unit_cost numeric,
  p_nota text
)
returns numeric
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_sl public.stock_levels;
  v_delta numeric;
begin
  if p_qty is null then
    return 0;
  end if;
  if p_qty < 0 then
    raise exception 'cantidad_negativa' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.branches where id = p_branch_id and organization_id = p_org
  ) then
    raise exception 'sucursal_invalida' using errcode = '22023';
  end if;
  v_sl := public.fn_inv_int_fila(p_product_id, p_branch_id, null, coalesce(p_unit_cost, 0));
  v_delta := p_qty - coalesce(v_sl.qty_on_hand, 0);
  if v_delta = 0 then
    return 0;
  end if;
  perform public.fn_inv_int_mover(
    p_org, p_branch_id, p_product_id, null,
    case when v_delta > 0 then 'in' else 'out' end,
    abs(v_delta), coalesce(p_unit_cost, 0),
    'adjustment', null, p_nota, auth.uid(),
    jsonb_build_object(
      'recalcular_costo', false, 'costo_fijo', true, 'fefo', false,
      'permitir_negativo', true, 'forzar', true
    )
  );
  return v_delta;
end;
$fn$;

drop function if exists public.fn_producto_int_ajustar_stock(integer, integer, integer, numeric, numeric, text, text, text);
revoke all on function public.fn_producto_int_ajustar_stock(integer, integer, integer, numeric, numeric, text) from public, anon, authenticated;
grant execute on function public.fn_producto_int_ajustar_stock(integer, integer, integer, numeric, numeric, text) to service_role;

-- ── ajuste masivo: vuelve la firma de 7 argumentos ──────────────────────────
create or replace function public.fn_productos_ajuste_masivo_stock(
  p_organization_id integer,
  p_product_ids integer[],
  p_branch_id integer,
  p_modo text,
  p_cantidad numeric,
  p_motivo text default null,
  p_expandir boolean default true
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
    p_organization_id, array['inventory.adjust', 'inventory_management']
  );

  if p_modo is null or p_modo not in ('set', 'add') then
    raise exception 'modo_invalido' using errcode = '22023';
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
  v_nota := 'Ajuste masivo · '
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
    select sl.qty_on_hand into v_actual
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
      p_organization_id, v_prod.id, p_branch_id, v_objetivo, v_costo, v_nota
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

drop function if exists public.fn_productos_ajuste_masivo_stock(integer, integer[], integer, text, numeric, text, boolean, text);
revoke all on function public.fn_productos_ajuste_masivo_stock(integer, integer[], integer, text, numeric, text, boolean) from public, anon;
grant execute on function public.fn_productos_ajuste_masivo_stock(integer, integer[], integer, text, numeric, text, boolean) to authenticated, service_role;

-- ── reglas sembradas y check anterior ───────────────────────────────────────
delete from public.accounting_rules
 where description = 'semilla-cuentas-movimiento-stock'
   and source_type = 'inventory'
   and event_type in ('opening', 'sale', 'return', 'purchase', 'gain', 'loss');

do $check$
begin
  if exists (
    select 1
      from public.accounting_rules
     where event_type in ('opening', 'sale', 'return', 'purchase')
  ) then
    raise exception 'quedan reglas opening, sale, return o purchase; no se restaura el check';
  end if;
end;
$check$;

alter table public.accounting_rules drop constraint accounting_rules_event_type_check;
alter table public.accounting_rules add constraint accounting_rules_event_type_check
  check (event_type = any (array[
    'created', 'paid', 'voided', 'partial_paid', 'confirmed', 'cancelled', 'refunded',
    'adjusted', 'no_show', 'received', 'completed', 'delivered', 'returned', 'resolved',
    'closed', 'delivered_cod', 'paid_credit', 'reversed', 'created_credit', 'renewed',
    'renewed_credit', 'received_cash', 'gain', 'loss', 'accrued'
  ]));
