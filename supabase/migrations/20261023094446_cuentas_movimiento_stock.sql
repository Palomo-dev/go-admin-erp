-- Cuentas por tipo de movimiento de stock y reversión del lote de la org 338.
--
-- El disparador trataba toda entrada que no fuera compra o traslado como ajuste
-- y cruzaba las cuentas de inventory/adjusted (débito 6105, crédito 1405):
-- la entrada quedaba Dr 1405 / Cr 6105. La clase 6 de la org 338 queda en
-- crédito por exactamente ese lote.
--
-- Vista previa (org 338, asientos 46031–47318, publicados, sin tercero,
-- 22 de octubre de 2026): 1288 asientos, suma 37989896190.
-- No se recontabilizan: hay costos sin confirmar (mínimo 37475, mediana 271600,
-- máximo 1874962, 23 costos de 1000000 o más).
-- El mismo patrón queda solo documentado en otras organizaciones
-- (137: 1958 / 1445700000; 144: 76 / 4355624.74; 326: 53 / 53000;
-- 132: 22 / 3272341.76; 129: 9 / 232200; 115: 4 / 1102000; 140: 3 / 17000;
-- 199: 2 / 74873.94; 134: 2 / 194999.95; 143: 1 / 22500000; 145: 1 / 30000;
-- 331: 1 / 18500). Esta migración no las revierte.
--
-- Una devolución de venta sí puede acreditar 6135. Una entrada que no es
-- devolución no acredita la clase 6.

create unique index if not exists uq_journal_entries_fact_key
  on public.journal_entries (organization_id, fact_key)
  where fact_key is not null;

alter table public.accounting_rules drop constraint accounting_rules_event_type_check;
alter table public.accounting_rules add constraint accounting_rules_event_type_check
  check (event_type = any (array[
    'created', 'paid', 'voided', 'partial_paid', 'confirmed', 'cancelled', 'refunded',
    'adjusted', 'no_show', 'received', 'completed', 'delivered', 'returned', 'resolved',
    'closed', 'delivered_cod', 'paid_credit', 'reversed', 'created_credit', 'renewed',
    'renewed_credit', 'received_cash', 'gain', 'loss', 'accrued',
    'opening', 'sale', 'return', 'purchase'
  ]));

create or replace function public.fn_cuentas_movimiento_stock(
  p_organization_id integer,
  p_source text,
  p_direction text,
  out debito text,
  out credito text,
  out evento text
)
returns record
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_inv text;
  v_tmp text;
begin
  select ar.credit_account_code
    into v_inv
    from public.accounting_rules ar
   where ar.organization_id = p_organization_id
     and ar.source_type = 'inventory'
     and ar.event_type = 'adjusted'
     and ar.is_active
   order by ar.priority
   limit 1;
  v_inv := coalesce(nullif(btrim(v_inv), ''), '1405');

  evento := case
    when p_source = 'initial' then 'opening'
    when p_source in ('sale', 'web_sale', 'mesa_sale', 'invoice_sale', 'web_order', 'folio_item', 'room_consumption') then 'sale'
    when p_source in ('return', 'credit_note', 'invoice_void', 'web_refund', 'credit_note_void', 'folio_item_reversal') then 'return'
    when p_source in ('purchase', 'purchase_order', 'purchase_invoice') then 'purchase'
    when p_source = 'loss' or p_direction = 'out' then 'loss'
    else 'gain'
  end;

  select ar.debit_account_code, ar.credit_account_code
    into debito, credito
    from public.accounting_rules ar
   where ar.organization_id = p_organization_id
     and ar.source_type = 'inventory'
     and ar.event_type = evento
     and ar.is_active
   order by ar.priority
   limit 1;

  if debito is null or credito is null then
    if evento = 'opening' then
      debito := v_inv;
      credito := '3105';
    elsif evento = 'sale' then
      debito := '6135';
      credito := v_inv;
    elsif evento = 'return' then
      debito := v_inv;
      credito := '6135';
    elsif evento = 'purchase' then
      debito := v_inv;
      credito := '2205';
    elsif evento = 'loss' then
      debito := '5150';
      credito := v_inv;
    else
      debito := v_inv;
      credito := '4250';
    end if;
  end if;

  -- La regla guarda el par de la entrada. La salida de apertura, compra o
  -- devolución usa el mismo par al revés.
  if p_direction = 'out' and evento in ('return', 'opening', 'purchase') then
    v_tmp := debito;
    debito := credito;
    credito := v_tmp;
  end if;

  -- Una entrada que no es devolución no acredita costos (clase 6).
  if p_direction = 'in' and evento is distinct from 'return' and left(credito, 1) = '6' then
    debito := v_inv;
    credito := '4250';
  end if;
end;
$fn$;

revoke all on function public.fn_cuentas_movimiento_stock(integer, text, text) from public, anon, authenticated;
grant execute on function public.fn_cuentas_movimiento_stock(integer, text, text) to postgres, service_role;

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

revoke all on function public.fn_auto_journal_stock_movement() from public, anon, authenticated;
grant execute on function public.fn_auto_journal_stock_movement() to postgres, service_role;

insert into public.accounting_rules (
  organization_id, name, description, source_type, event_type,
  debit_account_code, credit_account_code, is_active, priority
)
select o.id,
       s.nombre,
       'semilla-cuentas-movimiento-stock',
       'inventory',
       s.event_type,
       s.debito,
       s.credito,
       true,
       0
  from public.organizations o
  cross join lateral (
    select coalesce(
             (
               select ar.credit_account_code
                 from public.accounting_rules ar
                where ar.organization_id = o.id
                  and ar.source_type = 'inventory'
                  and ar.event_type = 'adjusted'
                  and ar.is_active
                order by ar.priority
                limit 1
             ),
             '1405'
           ) as inv,
           case
             when exists (
               select 1 from public.chart_of_accounts c
                where c.organization_id = o.id and c.account_code = '2205'
             ) then '2205'
             when exists (
               select 1 from public.chart_of_accounts c
                where c.organization_id = o.id and c.account_code = '1110'
             ) then '1110'
             else '2205'
           end as compra
  ) base
  cross join lateral (
    values
      ('Apertura de inventario'::text, 'opening'::text, base.inv, '3105'::text),
      ('Costo de venta'::text, 'sale'::text, '6135'::text, base.inv),
      ('Devolución de venta'::text, 'return'::text, base.inv, '6135'::text),
      ('Ajuste de inventario a favor'::text, 'gain'::text, base.inv, '4250'::text),
      ('Ajuste de inventario en contra'::text, 'loss'::text, '5150'::text, base.inv),
      ('Compra de inventario'::text, 'purchase'::text, base.inv, base.compra)
  ) as s(nombre, event_type, debito, credito)
on conflict on constraint accounting_rules_unique do nothing;

create or replace function public.fn_alerta_saldo_credito_clase6(p_organization_id integer)
returns table (
  account_code text,
  debitos numeric,
  creditos numeric,
  saldo_credito numeric
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
#variable_conflict use_column
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  return query
  select jl.account_code,
         sum(jl.debit),
         sum(jl.credit),
         sum(jl.credit - jl.debit)
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
   where je.organization_id = p_organization_id
     and jl.organization_id = p_organization_id
     and je.posted
     and left(jl.account_code, 1) = '6'
   group by jl.account_code
  having sum(jl.credit - jl.debit) > 0
   order by jl.account_code;
end;
$fn$;

revoke all on function public.fn_alerta_saldo_credito_clase6(integer) from public, anon;
grant execute on function public.fn_alerta_saldo_credito_clase6(integer) to authenticated, service_role;

create or replace function public.fn_producto_int_ajustar_stock(
  p_org integer,
  p_product_id integer,
  p_branch_id integer,
  p_qty numeric,
  p_unit_cost numeric,
  p_nota text,
  p_source text,
  p_source_id text
)
returns numeric
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_sl public.stock_levels;
  v_delta numeric;
  v_source text := coalesce(nullif(btrim(p_source), ''), 'adjustment');
begin
  if p_qty is null then
    return 0;
  end if;
  if p_qty < 0 then
    raise exception 'cantidad_negativa' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.branches
     where id = p_branch_id and organization_id = p_org
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
    abs(v_delta),
    coalesce(p_unit_cost, 0),
    v_source,
    p_source_id,
    p_nota,
    auth.uid(),
    jsonb_build_object(
      'recalcular_costo', false,
      'costo_fijo', true,
      'fefo', false,
      'permitir_negativo', true,
      'forzar', true
    )
  );
  return v_delta;
end;
$fn$;

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
begin
  return public.fn_producto_int_ajustar_stock(
    p_org, p_product_id, p_branch_id, p_qty, p_unit_cost, p_nota, 'adjustment', null::text
  );
end;
$fn$;

revoke all on function public.fn_producto_int_ajustar_stock(integer, integer, integer, numeric, numeric, text, text, text) from public, anon, authenticated;
grant execute on function public.fn_producto_int_ajustar_stock(integer, integer, integer, numeric, numeric, text, text, text) to postgres, service_role;
revoke all on function public.fn_producto_int_ajustar_stock(integer, integer, integer, numeric, numeric, text) from public, anon, authenticated;
grant execute on function public.fn_producto_int_ajustar_stock(integer, integer, integer, numeric, numeric, text) to postgres, service_role;

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

drop function if exists public.fn_productos_ajuste_masivo_stock(integer, integer[], integer, text, numeric, text, boolean);

revoke all on function public.fn_productos_ajuste_masivo_stock(integer, integer[], integer, text, numeric, text, boolean, text) from public, anon;
grant execute on function public.fn_productos_ajuste_masivo_stock(integer, integer[], integer, text, numeric, text, boolean, text) to authenticated, service_role;

-- La semilla ya está. Si el mapa de la org 338 no es el esperado, no se revierte nada.
do $chk$
declare
  v_inv text;
  v_debito text;
  v_credito text;
  v_evento text;
begin
  select ar.credit_account_code
    into v_inv
    from public.accounting_rules ar
   where ar.organization_id = 338
     and ar.source_type = 'inventory'
     and ar.event_type = 'adjusted'
     and ar.is_active
   order by ar.priority
   limit 1;
  v_inv := coalesce(v_inv, '1405');

  select c.debito, c.credito, c.evento
    into v_debito, v_credito, v_evento
    from public.fn_cuentas_movimiento_stock(338, 'initial', 'in') c;
  if v_evento is distinct from 'opening'
     or v_debito is distinct from v_inv
     or v_credito is distinct from '3105'
     or left(v_debito, 2) is distinct from '14' then
    raise exception 'apertura_incorrecta % / % / %', v_debito, v_credito, v_evento;
  end if;

  select c.debito, c.credito, c.evento
    into v_debito, v_credito, v_evento
    from public.fn_cuentas_movimiento_stock(338, 'adjustment', 'in') c;
  if v_debito is distinct from v_inv
     or v_credito is distinct from '4250'
     or left(v_credito, 1) = '6' then
    raise exception 'ajuste_entrada_incorrecto % / %', v_debito, v_credito;
  end if;

  select c.debito, c.credito, c.evento
    into v_debito, v_credito, v_evento
    from public.fn_cuentas_movimiento_stock(338, 'adjustment', 'out') c;
  if v_debito is distinct from '5150' or v_credito is distinct from v_inv then
    raise exception 'ajuste_salida_incorrecto % / %', v_debito, v_credito;
  end if;

  select c.debito, c.credito, c.evento
    into v_debito, v_credito, v_evento
    from public.fn_cuentas_movimiento_stock(338, 'sale', 'out') c;
  if v_debito is distinct from '6135' or v_credito is distinct from v_inv or v_evento is distinct from 'sale' then
    raise exception 'venta_incorrecta % / %', v_debito, v_credito;
  end if;

  select c.debito, c.credito, c.evento
    into v_debito, v_credito, v_evento
    from public.fn_cuentas_movimiento_stock(338, 'return', 'in') c;
  if v_debito is distinct from v_inv or v_credito is distinct from '6135' or v_evento is distinct from 'return' then
    raise exception 'devolucion_incorrecta % / %', v_debito, v_credito;
  end if;
end;
$chk$;

-- Contra-asientos del lote. No se borran filas. Los originales siguen publicados.
do $rev$
declare
  v_pendientes integer;
  v_suma numeric;
  v_ya integer;
  v_clase6 numeric;
  v_originales integer;
  r record;
begin
  perform set_config('statement_timeout', '300000', true);

  select count(*), coalesce(sum(x.importe), 0)
    into v_pendientes, v_suma
    from (
      select je.id, sum(jl.debit) as importe
        from public.journal_entries je
        join public.journal_lines jl on jl.journal_entry_id = je.id
       where je.organization_id = 338
         and je.id between 46031 and 47318
         and je.posted
         and je.source = 'stock_movements'
         and je.memo like 'Entrada Ajuste%'
         and je.fact_key is null
         and not exists (
           select 1
             from public.journal_entries rev
            where rev.organization_id = 338
              and rev.fact_key = 'reversal:' || je.id::text
         )
       group by je.id
    ) x;

  select count(*)
    into v_ya
    from public.journal_entries rev
   where rev.organization_id = 338
     and rev.source = 'reversal'
     and rev.memo like '%| carga-masiva-stock-338-20261022 |%';

  if v_pendientes = 0 and v_ya = 1288 then
    select round(coalesce(sum(jl.credit - jl.debit), 0), 2)
      into v_clase6
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.journal_entry_id
     where je.organization_id = 338
       and je.posted
       and left(jl.account_code, 1) = '6';
    if v_clase6 <> 0 then
      raise exception 'lote_ya_revertido_pero_clase6 %', v_clase6;
    end if;
    return;
  end if;

  if v_pendientes <> 1288 or v_suma is distinct from 37989896190::numeric then
    raise exception 'vista_previa_distinta pendientes=% suma=% ya=%', v_pendientes, v_suma, v_ya;
  end if;

  for r in
    select je.id, je.entry_date
      from public.journal_entries je
     where je.organization_id = 338
       and je.id between 46031 and 47318
       and je.posted
       and je.source = 'stock_movements'
       and je.memo like 'Entrada Ajuste%'
       and je.fact_key is null
       and not exists (
         select 1
           from public.journal_entries rev
          where rev.organization_id = 338
            and rev.fact_key = 'reversal:' || je.id::text
       )
     order by je.id
       for update
  loop
    perform public.fn_revertir_asiento_en_fecha(
      r.id,
      'manual',
      'carga-masiva-stock-338-20261022',
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
  if v_clase6 <> 0 then
    raise exception 'clase6_distinta %', v_clase6;
  end if;

  select count(*)
    into v_originales
    from public.journal_entries je
   where je.organization_id = 338
     and je.id between 46031 and 47318
     and je.posted;
  if v_originales <> 1288 then
    raise exception 'originales_alterados %', v_originales;
  end if;

  if (
    select count(*)
      from public.journal_entries rev
     where rev.organization_id = 338
       and rev.memo like '%| carga-masiva-stock-338-20261022 |%'
  ) <> 1288 then
    raise exception 'contra_asientos_incompletos';
  end if;
end;
$rev$;
