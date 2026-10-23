-- Sobrante real: débito al auxiliar de la sede bajo 1435, crédito 4295.
-- 4250 queda fuera de todo flujo de inventario. La carga inicial y el
-- motivo initial_setup debitan el mismo auxiliar y acreditan 3105.
-- Un conteo del mismo mes se corrige revirtiendo su asiento, sin ingreso.
--
-- Aplicada en tres partes, sin publicar: sobrante_auxiliares (20261023170750),
-- sobrante_parches_asiento (20261023170952) y sobrante_conteo_del_mes
-- (20261023171013). Los parches ejecutan el cuerpo vivo de las funciones.

create table if not exists public.sobrante_funcion_respaldo (
  firma text primary key,
  definicion text not null,
  migracion text not null,
  creado_en timestamptz not null default now()
);

revoke all on public.sobrante_funcion_respaldo from public, anon, authenticated;

insert into public.sobrante_funcion_respaldo (firma, definicion, migracion)
select p.oid::regprocedure::text, pg_get_functiondef(p.oid), '20261023190000'
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'fn_auto_journal_inventory_adjustment',
    'fn_auto_journal_stock_movement',
    'fn_cuentas_movimiento_stock',
    'fn_carga_inicial_cuentas',
    'fn_carga_inicial_publicar',
    'fn_carga_inicial_borradores',
    'fn_create_default_accounting_rules'
  )
on conflict (firma) do nothing;

alter table public.configuracion_contable
  drop constraint if exists configuracion_contable_clave_chk;

alter table public.configuracion_contable
  add constraint configuracion_contable_clave_chk check (clave in (
    'caja', 'bancos', 'clientes', 'proveedores',
    'ventas_productos', 'ventas_servicios', 'devoluciones', 'descuentos',
    'costo_ventas', 'inventario',
    'iva_generado', 'iva_descontable', 'retefuente', 'reteiva', 'reteica',
    'propinas', 'comisiones', 'anticipos',
    'nomina', 'nomina_por_pagar', 'nomina_aportes',
    'faltante_inventario', 'gastos_extraordinarios', 'consumo_interno',
    'manifiesto_por_pagar', 'manifiesto_transporte',
    'saldo_inicial', 'impuesto_consumo', 'redondeo', 'compra_servicio',
    'ingresos_diversos'
  ));

-- Auxiliar de la sede bajo 1435. 1405-01 equivale a 14350501 si ese auxiliar
-- ya existe. Si 1435 sigue siendo de movimiento, se usa 1435: crear el hijo
-- apagaría la cuenta que hoy recibe el resto del inventario.
create or replace function public.fn_inventario_auxiliar_1435(p_org integer, p_branch integer)
returns text
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_sub text;
  v_sufijo text;
  v_ok text;
begin
  if p_org is null then
    return null;
  end if;

  if p_branch is not null then
    select m.sub_account_code into v_sub
    from public.branch_account_mappings m
    where m.organization_id = p_org
      and m.branch_id = p_branch
      and m.base_account_code = '1435'
      and m.sub_account_code like '1435%'
    limit 1;
  end if;

  if v_sub is not null and exists (
    select 1 from public.chart_of_accounts c
    where c.organization_id = p_org
      and c.account_code = v_sub
      and coalesce(c.is_active, true)
      and c.es_movimiento is distinct from false
  ) then
    return v_sub;
  end if;

  if p_branch is not null then
    select m.sub_account_code into v_sub
    from public.branch_account_mappings m
    where m.organization_id = p_org
      and m.branch_id = p_branch
      and m.base_account_code = '1405'
      and m.sub_account_code ~ '^1405-[0-9]{1,2}$'
    limit 1;
    if v_sub is not null then
      v_sufijo := lpad(substring(v_sub from '[0-9]+$'), 2, '0');
      v_ok := '143505' || v_sufijo;
      if exists (
        select 1 from public.chart_of_accounts c
        where c.organization_id = p_org
          and c.account_code = v_ok
          and coalesce(c.is_active, true)
          and c.es_movimiento is distinct from false
      ) then
        return v_ok;
      end if;
    end if;
  end if;

  if exists (
    select 1 from public.chart_of_accounts c
    where c.organization_id = p_org
      and c.account_code = '1435'
      and coalesce(c.is_active, true)
      and c.es_movimiento is distinct from false
  ) then
    return '1435';
  end if;

  select c.account_code into v_ok
  from public.chart_of_accounts c
  where c.organization_id = p_org
    and c.account_code like '1435%'
    and c.account_code <> '1435'
    and coalesce(c.is_active, true)
    and c.es_movimiento is distinct from false
  order by length(c.account_code), c.account_code
  limit 1;
  if v_ok is not null and left(v_ok, 4) = '1435' then
    return v_ok;
  end if;
  return null;
end;
$fn$;

-- Lee la configuración sin exigir sesión. 4250 nunca se devuelve.
create or replace function public.fn_cuenta_configurada(
  p_org integer,
  p_branch integer,
  p_clave text,
  p_defecto text
) returns text
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_base text;
  v_ok text;
begin
  if p_org is null then
    return null;
  end if;

  select cc.account_code into v_base
  from public.configuracion_contable cc
  where cc.organization_id = p_org
    and cc.clave = p_clave
    and (cc.branch_id = p_branch or cc.branch_id is null)
  order by case when cc.branch_id = p_branch then 0 else 1 end, cc.id
  limit 1;

  v_ok := public.fn_carga_inicial_cuenta(p_org, p_branch, coalesce(nullif(btrim(v_base), ''), p_defecto));
  if v_ok is null or left(v_ok, 4) = '4250' then
    v_ok := public.fn_carga_inicial_cuenta(p_org, p_branch, p_defecto);
  end if;
  if v_ok is null or left(v_ok, 4) = '4250' then
    if left(coalesce(p_defecto, ''), 4) = '4250' then
      return null;
    end if;
    return p_defecto;
  end if;
  return v_ok;
end;
$fn$;

create or replace function public.fn_carga_inicial_cuentas(
  p_org integer,
  p_branch integer,
  out debito text,
  out credito text
)
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_base text;
begin
  select cc.account_code into v_base
  from public.configuracion_contable cc
  where cc.organization_id = p_org
    and cc.clave = 'inventario'
    and cc.account_code like '1435%'
    and (cc.branch_id = p_branch or cc.branch_id is null)
  order by case when cc.branch_id = p_branch then 0 else 1 end, cc.id
  limit 1;

  if v_base is not null then
    debito := public.fn_carga_inicial_cuenta(p_org, p_branch, v_base);
  end if;
  if debito is null or left(debito, 4) <> '1435' then
    debito := public.fn_inventario_auxiliar_1435(p_org, p_branch);
  end if;
  if debito is null or left(debito, 4) <> '1435' then
    debito := null;
  end if;

  credito := public.fn_cuenta_configurada(p_org, p_branch, 'saldo_inicial', '3105');
  if credito is null or left(credito, 4) = '4250' then
    credito := public.fn_carga_inicial_cuenta(p_org, p_branch, '3105');
  end if;
end;
$fn$;

-- La carga ya hecha y la que se publique exigen débito bajo 1435.
do $patch$
declare
  v_def text;
  v_viejo text := 'left(v_debito, 1) <> ''1''';
  v_nuevo text := 'left(v_debito, 4) <> ''1435''';
begin
  v_def := pg_get_functiondef('public.fn_carga_inicial_publicar()'::regprocedure);
  if position(v_nuevo in v_def) = 0 then
    if position(v_viejo in v_def) = 0 then
      raise exception 'no se encontro el ancla de fn_carga_inicial_publicar';
    end if;
    execute replace(v_def, v_viejo, v_nuevo);
  end if;
end
$patch$;

do $patch$
declare
  v_def text;
  v_viejo text := 'left(v_cuenta_d, 1) <> ''1''';
  v_nuevo text := 'left(v_cuenta_d, 4) <> ''1435''';
begin
  v_def := pg_get_functiondef('public.fn_carga_inicial_borradores()'::regprocedure);
  if position(v_nuevo in v_def) = 0 then
    if position(v_viejo in v_def) = 0 then
      raise exception 'no se encontro el ancla de fn_carga_inicial_borradores';
    end if;
    execute replace(v_def, v_viejo, v_nuevo);
  end if;
end
$patch$;

-- Un sobrante que todavía pasa por el movimiento no acredita 4250.
do $patch$
declare
  v_def text := pg_get_functiondef('public.fn_cuentas_movimiento_stock(integer,text,text)'::regprocedure);
begin
  if position('credito := ''4250''' in v_def) > 0 then
    execute replace(v_def, 'credito := ''4250''', 'credito := ''4295''');
  end if;
end
$patch$;

-- Ganancia del documento: auxiliar 1435 / 4295. Saldo inicial: / 3105.
-- La corrección de conteo no arma ingreso. La compra sin orden, si llegara
-- a postearse, sigue acreditando proveedores.
do $patch$
declare
  v_def text := pg_get_functiondef('public.fn_auto_journal_inventory_adjustment()'::regprocedure);
  v_viejo text := $old$  if v_event_type = 'gain' then
    v_debit_account := v_credit_account;
    if v_razon in ('initial_setup', 'saldo_inicial') then
      v_credit_account := coalesce(
        public.fn_cuenta_por_clave(new.organization_id, new.branch_id, 'saldo_inicial'),
        '3105'
      );
    elsif v_razon in ('compra_sin_orden', 'compra sin orden') then
      v_credit_account := coalesce(
        public.fn_cuenta_por_clave(new.organization_id, new.branch_id, 'proveedores'),
        '2205'
      );
    else
      if v_razon in ('physical_count', 'audit', 'production_input', 'produccion_propia', 'produccion', 'sobrante') then
        v_credit_account := '4250';
      else
        v_credit_account := coalesce(v_rule.credit_account_code, '4250');
      end if;
      if left(coalesce(v_credit_account, ''), 1) = '6' then
        v_credit_account := coalesce(
          public.fn_primera_cuenta_detalle(new.organization_id, array['4250', '4295', '4210']),
          '4250'
        );
      end if;
    end if;
  else$old$;
  v_nuevo text := $new$  if v_razon = 'correccion_conteo' then
    return new;
  end if;

  if v_event_type = 'gain' then
    v_debit_account := public.fn_inventario_auxiliar_1435(new.organization_id, new.branch_id);
    if v_razon in ('initial_setup', 'saldo_inicial') then
      v_credit_account := public.fn_cuenta_configurada(new.organization_id, new.branch_id, 'saldo_inicial', '3105');
    elsif v_razon in ('compra_sin_orden', 'compra sin orden') then
      v_credit_account := coalesce(
        public.fn_cuenta_por_clave(new.organization_id, new.branch_id, 'proveedores'),
        '2205'
      );
    else
      v_credit_account := public.fn_cuenta_configurada(new.organization_id, new.branch_id, 'ingresos_diversos', '4295');
    end if;
    if left(coalesce(v_credit_account, ''), 4) = '4250'
       or v_debit_account is null
       or left(v_debit_account, 4) <> '1435' then
      perform public.fn_log_journal_failure(
        new.organization_id, new.branch_id, coalesce(new.posted_at, now()),
        'inventory_adjustment', new.id::text, 'inventory_adjustment:' || new.id::text,
        v_debit_account, v_credit_account, v_amount,
        'sobrante_cuenta', 'El sobrante debita el auxiliar de 1435 y no acredita 4250');
      return new;
    end if;
  else$new$;
begin
  if position('correccion_conteo' in v_def) = 0 then
    if position(v_viejo in v_def) = 0 then
      raise exception 'no se encontro el ancla de fn_auto_journal_inventory_adjustment';
    end if;
    execute replace(v_def, v_viejo, v_nuevo);
  end if;
end
$patch$;

-- Entradas de stock que aún acrediten 4250, o debiten 1405 contra saldo
-- inicial o diversos, pasan al auxiliar de 1435. El resto del inventario
-- (venta, compra, faltante) no se toca aquí.
do $patch$
declare
  v_def text := pg_get_functiondef('public.fn_auto_journal_stock_movement()'::regprocedure);
  v_viejo text := $old$        'entrada_clase_6', 'Una entrada que no es devolución no acredita la clase 6');
      return new;
    end if;
  end if;

  begin$old$;
  v_nuevo text := $new$        'entrada_clase_6', 'Una entrada que no es devolución no acredita la clase 6');
      return new;
    end if;
  end if;

  if left(coalesce(v_credit_account, ''), 4) = '4250' then
    v_credit_account := public.fn_cuenta_configurada(new.organization_id, new.branch_id, 'ingresos_diversos', '4295');
    if left(coalesce(v_credit_account, ''), 4) = '4250' then
      v_credit_account := '4295';
    end if;
  end if;
  if left(coalesce(v_debit_account, ''), 4) = '4250' then
    v_debit_account := public.fn_cuenta_configurada(new.organization_id, new.branch_id, 'ingresos_diversos', '4295');
  end if;
  if left(coalesce(v_debit_account, ''), 4) = '1405'
     and (left(coalesce(v_credit_account, ''), 4) in ('4295', '3105') or v_evento = 'opening') then
    v_debit_account := public.fn_inventario_auxiliar_1435(new.organization_id, new.branch_id);
  end if;
  if left(coalesce(v_credit_account, ''), 4) = '1405' and v_evento = 'opening' then
    v_credit_account := public.fn_inventario_auxiliar_1435(new.organization_id, new.branch_id);
  end if;

  begin$new$;
begin
  if position('array[''4250'', ''4295'', ''4210'']' in v_def) > 0 then
    v_def := replace(v_def, 'array[''4250'', ''4295'', ''4210'']', 'array[''4295'', ''4210'']');
  end if;
  if position('fn_inventario_auxiliar_1435' in v_def) = 0 then
    if position(v_viejo in v_def) = 0 then
      raise exception 'no se encontro el ancla de fn_auto_journal_stock_movement';
    end if;
    v_def := replace(v_def, v_viejo, v_nuevo);
  end if;
  execute v_def;
end
$patch$;

do $patch$
declare
  v_def text := pg_get_functiondef('public.fn_create_default_accounting_rules(integer,text)'::regprocedure);
  v_viejo text := $old$'inventory', 'gain', v_inv, '4250'$old$;
  v_nuevo text := $new$'inventory', 'gain', v_inv, '4295'$new$;
begin
  if position(v_viejo in v_def) > 0 then
    execute replace(v_def, v_viejo, v_nuevo);
  end if;
end
$patch$;

create or replace function public.fn_conteo_del_mes(
  p_org integer,
  p_branch integer,
  p_product integer
) returns jsonb
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_tz text;
  v_desde timestamptz;
  v_hasta timestamptz;
  v_aj record;
  v_otros integer;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['ajustar']);
  if p_branch is null or p_product is null then
    return jsonb_build_object('encontrado', false);
  end if;

  select coalesce(nullif(btrim(o.timezone), ''), 'America/Bogota') into v_tz
  from public.organizations o
  where o.id = p_org;
  v_desde := date_trunc('month', now() at time zone v_tz) at time zone v_tz;
  v_hasta := (date_trunc('month', now() at time zone v_tz) + interval '1 month') at time zone v_tz;

  select ia.id, ia.code, coalesce(sum(ai.difference), 0) as diferencia
    into v_aj
  from public.inventory_adjustments ia
  join public.adjustment_items ai
    on ai.inventory_adjustment_id = ia.id
   and ai.product_id = p_product
   and coalesce(ai.difference, 0) <> 0
  where ia.organization_id = p_org
    and ia.branch_id = p_branch
    and ia.status = 'posted'
    and coalesce(ia.posted_at, ia.counted_at, ia.created_at) >= v_desde
    and coalesce(ia.posted_at, ia.counted_at, ia.created_at) < v_hasta
    and (
      ia.mode = 'conteo'
      or lower(btrim(coalesce(ia.reason, ''))) in ('physical_count', 'audit')
      or coalesce(ai.difference, 0) < 0
    )
    and exists (
      select 1 from public.journal_entries je
      where je.organization_id = ia.organization_id
        and je.source = 'inventory_adjustment'
        and je.source_id = ia.id::text
        and je.posted is true
        and not exists (
          select 1 from public.journal_entries rev
          where rev.organization_id = ia.organization_id
            and rev.fact_key = 'reversal:' || je.id::text
        )
    )
  group by ia.id, ia.code, coalesce(ia.posted_at, ia.counted_at, ia.created_at)
  order by coalesce(ia.posted_at, ia.counted_at, ia.created_at) desc, ia.id desc
  limit 1;

  if v_aj.id is null then
    return jsonb_build_object('encontrado', false);
  end if;

  select count(*) into v_otros
  from public.adjustment_items ai
  where ai.inventory_adjustment_id = v_aj.id
    and coalesce(ai.difference, 0) <> 0
    and ai.product_id <> p_product;

  return jsonb_build_object(
    'encontrado', true,
    'ajuste_id', v_aj.id,
    'codigo', v_aj.code,
    'diferencia', v_aj.diferencia,
    'varios', v_otros > 0
  );
end;
$fn$;

create or replace function public.fn_corregir_conteo(
  p_org integer,
  p_branch integer,
  p_product integer,
  p_nota text default null
) returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_tz text;
  v_desde timestamptz;
  v_hasta timestamptz;
  v_id integer;
  v_code text;
  v_item record;
  v_je record;
  v_otros integer;
  v_dir text;
  v_qty numeric;
  v_costo numeric;
  v_reverso integer := 0;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['ajustar']);
  if p_branch is null or p_product is null then
    return jsonb_build_object('corregido', false, 'motivo', 'faltan_datos');
  end if;

  select coalesce(nullif(btrim(o.timezone), ''), 'America/Bogota') into v_tz
  from public.organizations o
  where o.id = p_org;
  v_desde := date_trunc('month', now() at time zone v_tz) at time zone v_tz;
  v_hasta := (date_trunc('month', now() at time zone v_tz) + interval '1 month') at time zone v_tz;

  select ia.id, ia.code
    into v_id, v_code
  from public.inventory_adjustments ia
  where ia.organization_id = p_org
    and ia.branch_id = p_branch
    and ia.status = 'posted'
    and coalesce(ia.posted_at, ia.counted_at, ia.created_at) >= v_desde
    and coalesce(ia.posted_at, ia.counted_at, ia.created_at) < v_hasta
    and exists (
      select 1 from public.adjustment_items ai
      where ai.inventory_adjustment_id = ia.id
        and ai.product_id = p_product
        and coalesce(ai.difference, 0) <> 0
    )
    and (
      ia.mode = 'conteo'
      or lower(btrim(coalesce(ia.reason, ''))) in ('physical_count', 'audit')
      or exists (
        select 1 from public.adjustment_items ai
        where ai.inventory_adjustment_id = ia.id
          and ai.product_id = p_product
          and coalesce(ai.difference, 0) < 0
      )
    )
    and exists (
      select 1 from public.journal_entries je
      where je.organization_id = ia.organization_id
        and je.source = 'inventory_adjustment'
        and je.source_id = ia.id::text
        and je.posted is true
        and not exists (
          select 1 from public.journal_entries rev
          where rev.organization_id = ia.organization_id
            and rev.fact_key = 'reversal:' || je.id::text
        )
    )
  order by coalesce(ia.posted_at, ia.counted_at, ia.created_at) desc, ia.id desc
  limit 1
  for update;

  if v_id is null then
    return jsonb_build_object('corregido', false, 'motivo', 'sin_conteo');
  end if;

  select count(*) into v_otros
  from public.adjustment_items ai
  where ai.inventory_adjustment_id = v_id
    and coalesce(ai.difference, 0) <> 0
    and ai.product_id <> p_product;

  if v_otros > 0 then
    return jsonb_build_object('corregido', false, 'motivo', 'varios', 'ajuste_id', v_id, 'codigo', v_code);
  end if;

  for v_item in
    select ai.lot_id, ai.difference, ai.applied_cost, ai.unit_cost
    from public.adjustment_items ai
    where ai.inventory_adjustment_id = v_id
      and ai.product_id = p_product
      and coalesce(ai.difference, 0) <> 0
  loop
    if v_item.difference > 0 then
      v_dir := 'out';
      v_qty := v_item.difference;
      v_costo := null;
    else
      v_dir := 'in';
      v_qty := abs(v_item.difference);
      v_costo := coalesce(nullif(v_item.applied_cost, 0), nullif(v_item.unit_cost, 0));
      if v_costo is null then
        select pc.cost into v_costo
        from public.product_costs pc
        where pc.product_id = p_product
          and (pc.effective_to is null or pc.effective_to > now())
        order by pc.effective_from desc
        limit 1;
      end if;
      if v_costo is null then
        v_costo := 0;
      end if;
    end if;

    perform public.fn_stock_registrar_movimiento(
      p_org, p_branch, p_product, v_item.lot_id, v_dir, v_qty, v_costo,
      'correccion_conteo',
      left(coalesce(nullif(btrim(p_nota), ''), 'Corrección del conteo ' || coalesce(v_code, v_id::text)), 1000)
    );
  end loop;

  for v_je in
    select je.id
    from public.journal_entries je
    where je.organization_id = p_org
      and je.source = 'inventory_adjustment'
      and je.source_id = v_id::text
      and je.posted is true
      and not exists (
        select 1 from public.journal_entries rev
        where rev.organization_id = p_org
          and rev.fact_key = 'reversal:' || je.id::text
      )
  loop
    perform public.fn_revertir_asiento(v_je.id, 'correccion_conteo', 'conteo:' || v_id::text);
    v_reverso := v_je.id;
  end loop;

  return jsonb_build_object(
    'corregido', true,
    'ajuste_id', v_id,
    'codigo', v_code,
    'asiento', v_reverso
  );
end;
$fn$;

revoke all on function public.fn_inventario_auxiliar_1435(integer, integer) from public, anon, authenticated;
revoke all on function public.fn_cuenta_configurada(integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.fn_carga_inicial_cuentas(integer, integer) from public, anon, authenticated;
revoke all on function public.fn_conteo_del_mes(integer, integer, integer) from public, anon;
revoke all on function public.fn_corregir_conteo(integer, integer, integer, text) from public, anon;

grant execute on function public.fn_inventario_auxiliar_1435(integer, integer) to service_role;
grant execute on function public.fn_cuenta_configurada(integer, integer, text, text) to service_role;
grant execute on function public.fn_conteo_del_mes(integer, integer, integer) to authenticated, service_role;
grant execute on function public.fn_corregir_conteo(integer, integer, integer, text) to authenticated, service_role;

comment on function public.fn_inventario_auxiliar_1435(integer, integer) is
  'Auxiliar de inventario de la sede bajo 1435. Nunca devuelve 1405.';
comment on function public.fn_corregir_conteo(integer, integer, integer, text) is
  'Anula el conteo o el faltante del mes de un solo producto y revierte su asiento, sin ingreso.';
