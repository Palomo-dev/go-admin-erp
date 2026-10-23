-- Carga inicial de inventario: un asiento por lote o importación
-- (Dr inventario de la sede / Cr saldo inicial, por defecto 3105).
-- El disparador de stock deja de contabilizar source = 'initial' movimiento
-- a movimiento. Una cola y un disparador diferido arman el asiento al cerrar
-- la transacción. El histórico se carga en borrador con la migración siguiente.
-- La org 149 no entra en ese borrador. Una organización de prueba se reconoce
-- por una palabra suelta en el nombre (test, prueba, e2e, sandbox, demo).

create table if not exists public.carga_inicial_funcion_respaldo (
  firma text primary key,
  definicion text not null,
  migracion text not null
);

insert into public.carga_inicial_funcion_respaldo (firma, definicion, migracion)
select p.oid::regprocedure::text, pg_get_functiondef(p.oid), '20261023180000'
from pg_proc p
where p.oid in (
  'public.fn_auto_journal_stock_movement()'::regprocedure,
  'public.fn_auto_journal_inventory_adjustment()'::regprocedure,
  'public.fn_inventario_int_config(integer)'::regprocedure,
  'public.fn_inventario_config_guardar(integer, jsonb)'::regprocedure,
  'public.fn_importar_productos_lote(integer, integer, text, jsonb, jsonb)'::regprocedure
)
on conflict (firma) do nothing;

create table if not exists public.carga_inicial_pendiente (
  movement_id integer primary key,
  organization_id integer not null,
  txid bigint not null
);

create table if not exists public.carga_inicial_cubierta (
  movement_id integer primary key,
  organization_id integer not null,
  journal_entry_id integer,
  borrador boolean not null default false
);

create table if not exists public.carga_inicial_aviso (
  id bigint generated always as identity primary key,
  organization_id integer,
  clase text not null,
  journal_entry_id integer,
  monto numeric,
  detalle jsonb,
  nota text,
  -- historico: el backfill. operacion: una carga nueva. Reejecutar el backfill
  -- solo borra las filas historicas.
  origen text not null default 'operacion',
  created_at timestamptz not null default now()
);

alter table public.carga_inicial_pendiente enable row level security;
alter table public.carga_inicial_cubierta enable row level security;
alter table public.carga_inicial_aviso enable row level security;
alter table public.carga_inicial_funcion_respaldo enable row level security;

revoke all on public.carga_inicial_pendiente from public, anon, authenticated;
revoke all on public.carga_inicial_cubierta from public, anon, authenticated;
revoke all on public.carga_inicial_aviso from public, anon, authenticated;
revoke all on public.carga_inicial_funcion_respaldo from public, anon, authenticated;

-- Cuenta de movimiento: auxiliar de la sede, si existe; si no, la cuenta; si es
-- de título, el primer detalle. Sin comprobar acceso: la llama el disparador.
create or replace function public.fn_carga_inicial_cuenta(
  p_org integer,
  p_branch integer,
  p_codigo text
) returns text
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_cuenta text := nullif(btrim(p_codigo), '');
  v_sub text;
  v_ok text;
begin
  if v_cuenta is null or p_org is null then
    return null;
  end if;

  if p_branch is not null then
    select m.sub_account_code into v_sub
    from public.branch_account_mappings m
    where m.organization_id = p_org
      and m.branch_id = p_branch
      and m.base_account_code = v_cuenta
    limit 1;
  end if;

  v_ok := coalesce(v_sub, v_cuenta);
  if exists (
    select 1 from public.chart_of_accounts c
    where c.organization_id = p_org
      and c.account_code = v_ok
      and coalesce(c.is_active, true)
      and c.es_movimiento is distinct from false
  ) then
    return v_ok;
  end if;

  select c.account_code into v_ok
  from public.chart_of_accounts c
  where c.organization_id = p_org
    and c.account_code like v_cuenta || '%'
    and c.account_code <> v_cuenta
    and coalesce(c.is_active, true)
    and c.es_movimiento is distinct from false
  order by length(c.account_code), c.account_code
  limit 1;
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
  v_type integer;
begin
  select cc.account_code into v_base
  from public.configuracion_contable cc
  where cc.organization_id = p_org
    and cc.clave = 'inventario'
    and (cc.branch_id = p_branch or cc.branch_id is null)
  order by case when cc.branch_id = p_branch then 0 else 1 end, cc.id
  limit 1;

  select o.type_id into v_type from public.organizations o where o.id = p_org;
  if v_base is null or left(v_base, 1) <> '1' then
    v_base := case when v_type = 1 then '1405' else '1435' end;
  end if;
  debito := public.fn_carga_inicial_cuenta(p_org, p_branch, v_base);
  if debito is null or left(debito, 1) <> '1' then
    debito := public.fn_carga_inicial_cuenta(
      p_org, p_branch, case when v_type = 1 then '1405' else '1435' end
    );
  end if;

  v_base := null;
  select cc.account_code into v_base
  from public.configuracion_contable cc
  where cc.organization_id = p_org
    and cc.clave = 'saldo_inicial'
    and (cc.branch_id = p_branch or cc.branch_id is null)
  order by case when cc.branch_id = p_branch then 0 else 1 end, cc.id
  limit 1;
  credito := public.fn_carga_inicial_cuenta(p_org, p_branch, coalesce(nullif(btrim(v_base), ''), '3105'));
  if credito is null or left(credito, 4) = '4250' then
    credito := public.fn_carga_inicial_cuenta(p_org, p_branch, '3105');
  end if;
end;
$fn$;

-- Un asiento por (organización, sede, lote). El lote es source_id, si no la nota
-- compartida por la importación, si no el propio movimiento.
create or replace function public.fn_carga_inicial_publicar()
returns void
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_ids integer[];
  g record;
  v_debito text;
  v_credito text;
  v_entry integer;
  v_fact text;
  v_memo text := 'Carga inicial de inventario';
begin
  select coalesce(array_agg(movement_id), '{}'::integer[])
    into v_ids
  from public.carga_inicial_pendiente
  where txid = txid_current();

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return;
  end if;

  insert into public.carga_inicial_aviso (organization_id, clase, monto, detalle, nota)
  select sm.organization_id, 'sin_costo', 0,
         jsonb_build_object('movimientos', count(*)),
         'sin_costo'
  from public.stock_movements sm
  where sm.id = any (v_ids)
    and (coalesce(sm.unit_cost, 0) <= 0 or coalesce(sm.qty, 0) = 0 or sm.direction is distinct from 'in')
  group by sm.organization_id;

  for g in
    select sm.organization_id,
           sm.branch_id,
           coalesce(nullif(btrim(sm.source_id), ''), nullif(btrim(sm.note), ''), 'mov:' || sm.id::text) as lote_key,
           sum(round(abs(sm.qty) * sm.unit_cost, 0)) as monto,
           min(sm.id) as primero,
           min(sm.created_at) as fecha,
           array_agg(sm.id) as ids
    from public.stock_movements sm
    where sm.id = any (v_ids)
      and sm.direction = 'in'
      and coalesce(sm.unit_cost, 0) > 0
      and sm.qty is not null
      and sm.branch_id is not null
      and not exists (
        select 1 from public.carga_inicial_cubierta c
        where c.movement_id = sm.id and c.journal_entry_id is not null
      )
    group by sm.organization_id, sm.branch_id,
             coalesce(nullif(btrim(sm.source_id), ''), nullif(btrim(sm.note), ''), 'mov:' || sm.id::text)
  loop
    if g.monto is null or g.monto <= 0 then
      continue;
    end if;

    select c.debito, c.credito into v_debito, v_credito
    from public.fn_carga_inicial_cuentas(g.organization_id, g.branch_id) c;

    v_fact := 'carga_inicial:' || g.organization_id::text || ':' || g.branch_id::text || ':' || g.primero::text;

    if v_debito is null or v_credito is null or left(v_credito, 4) = '4250' or left(v_debito, 1) <> '1' then
      insert into public.carga_inicial_aviso (organization_id, clase, monto, detalle, nota)
      values (
        g.organization_id, 'sin_cuenta', g.monto,
        jsonb_build_object('debito', v_debito, 'credito', v_credito, 'branch_id', g.branch_id, 'fact_key', v_fact),
        'sin_cuenta'
      );
      continue;
    end if;

    begin
      v_entry := public.fn_create_journal_entry(
        g.organization_id,
        g.branch_id,
        coalesce(g.fecha, now()),
        v_memo,
        'stock_movements',
        g.primero::text,
        v_debito,
        v_credito,
        g.monto,
        null::text,
        0,
        null::uuid,
        false,
        v_fact
      );
    exception
      when unique_violation then
        select je.id into v_entry
        from public.journal_entries je
        where je.organization_id = g.organization_id and je.fact_key = v_fact;
      when others then
        insert into public.carga_inicial_aviso (organization_id, clase, monto, detalle, nota)
        values (
          g.organization_id, 'error_asiento', g.monto,
          jsonb_build_object('fact_key', v_fact, 'detalle', sqlerrm),
          'error_asiento'
        );
        continue;
    end;

    if v_entry is not null then
      insert into public.carga_inicial_cubierta (movement_id, organization_id, journal_entry_id, borrador)
      select i, g.organization_id, v_entry, false
      from unnest(g.ids) as i
      on conflict (movement_id) do update
        set journal_entry_id = excluded.journal_entry_id,
            borrador = false;
    end if;
  end loop;

  insert into public.carga_inicial_cubierta (movement_id, organization_id, journal_entry_id, borrador)
  select sm.id, sm.organization_id, null, false
  from public.stock_movements sm
  where sm.id = any (v_ids)
    and (coalesce(sm.unit_cost, 0) <= 0 or coalesce(sm.qty, 0) = 0 or sm.direction is distinct from 'in')
  on conflict (movement_id) do nothing;

  delete from public.carga_inicial_pendiente
  where movement_id = any (v_ids);
end;
$fn$;

create or replace function public.fn_carga_inicial_cerrar()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
begin
  perform public.fn_carga_inicial_publicar();
  return null;
end;
$fn$;

drop trigger if exists trg_carga_inicial_cerrar on public.stock_movements;
create constraint trigger trg_carga_inicial_cerrar
  after insert on public.stock_movements
  deferrable initially deferred
  for each row
  when (new.source = 'initial')
  execute function public.fn_carga_inicial_cerrar();

-- La apertura sale del asiento por movimiento. La primera lista (compras y
-- traslados) no cambia: 'initial' no entra ahí.
do $patch$
declare
  v_def text := pg_get_functiondef('public.fn_auto_journal_stock_movement()'::regprocedure);
  v_viejo text := $old$  if new.source in ('purchase', 'purchase_order', 'purchase_invoice', 'purchase_void',
                    'transfer', 'transfer_out', 'transfer_in') then
    return new;
  end if;$old$;
  v_nuevo text;
begin
  v_nuevo := v_viejo || $add$

  -- carga_inicial: un asiento por lote al cierre de la transacción, no uno por producto.
  if new.source = 'initial' then
    insert into public.carga_inicial_pendiente (movement_id, organization_id, txid)
    values (new.id, new.organization_id, txid_current())
    on conflict (movement_id) do nothing;
    return new;
  end if;$add$;
  if position('carga_inicial_pendiente' in v_def) = 0 then
    if position(v_viejo in v_def) = 0 then
      raise exception 'no se encontro el ancla de fn_auto_journal_stock_movement';
    end if;
    execute replace(v_def, v_viejo, v_nuevo);
  end if;
end
$patch$;

-- Conteo, auditoría y producción acreditan recuperaciones. El saldo inicial
-- sigue en 3105. La compra sin orden, si llegara a postearse, acredita proveedores.
do $patch$
declare
  v_def text := pg_get_functiondef('public.fn_auto_journal_inventory_adjustment()'::regprocedure);
  v_viejo text := 'if v_razon in (''physical_count'', ''audit'') then';
  v_nuevo text := 'if v_razon in (''physical_count'', ''audit'', ''production_input'', ''produccion_propia'', ''produccion'', ''sobrante'') then';
begin
  if position('produccion_propia' in v_def) = 0 then
    if position(v_viejo in v_def) = 0 then
      raise exception 'no se encontro el ancla de fn_auto_journal_inventory_adjustment';
    end if;
    execute replace(v_def, v_viejo, v_nuevo);
  end if;
end
$patch$;

-- La puesta en marcha marca el lote con motivo saldo_inicial: aunque el
-- producto ya exista, el stock de esa importación es carga inicial.
do $patch$
declare
  v_def text := pg_get_functiondef('public.fn_importar_productos_lote(integer, integer, text, jsonb, jsonb)'::regprocedure);
  v_viejo text := $old$'source', case when v_accion = 'creado' then 'initial' else 'adjustment' end,
                'note', case when v_accion = 'creado' then 'Stock inicial (importación ' || v_origen || ')'
                             else 'Entrada por importación ' || v_origen end,$old$;
  v_nuevo text := $new$'source', case when v_accion = 'creado' or coalesce(p_opciones->>'motivo', '') = 'saldo_inicial' then 'initial' else 'adjustment' end,
                'note', case when v_accion = 'creado' or coalesce(p_opciones->>'motivo', '') = 'saldo_inicial' then 'Stock inicial (importación ' || v_origen || ')'
                             else 'Entrada por importación ' || v_origen end,$new$;
begin
  if position('p_opciones->>''motivo''' in v_def) = 0 then
    if position(v_viejo in v_def) = 0 then
      raise exception 'no se encontro el ancla de fn_importar_productos_lote';
    end if;
    execute replace(v_def, v_viejo, v_nuevo);
  end if;
end
$patch$;

-- Umbral del ajuste. El bloqueo de vender sin stock conserva el valor guardado;
-- si no hay valor, sigue en false.
create or replace function public.fn_inventario_int_config(p_org integer)
returns jsonb
language sql
stable
security definer
set search_path to public, pg_temp
as $fn$
  select jsonb_build_object(
           'bloquear_venta_sin_stock', false,
           'monto_confirmacion_ajuste', 5000000
         )
         || coalesce((select os.settings from public.organization_settings os
                       where os.organization_id = p_org and os.key = 'inventario'), '{}'::jsonb);
$fn$;

create or replace function public.fn_inventario_config_guardar(p_org integer, p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_limpia jsonb := '{}'::jsonb;
  v_monto numeric;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['configurar']);
  if p_config ? 'bloquear_venta_sin_stock' then
    if jsonb_typeof(p_config->'bloquear_venta_sin_stock') <> 'boolean' then
      raise exception 'config_invalida' using errcode = '22023', detail = 'bloquear_venta_sin_stock';
    end if;
    v_limpia := v_limpia || jsonb_build_object('bloquear_venta_sin_stock', p_config->'bloquear_venta_sin_stock');
  end if;
  if p_config ? 'monto_confirmacion_ajuste' then
    if jsonb_typeof(p_config->'monto_confirmacion_ajuste') = 'null' then
      v_limpia := v_limpia || jsonb_build_object('monto_confirmacion_ajuste', null);
    elsif jsonb_typeof(p_config->'monto_confirmacion_ajuste') <> 'number' then
      raise exception 'config_invalida' using errcode = '22023', detail = 'monto_confirmacion_ajuste';
    else
      v_monto := (p_config->>'monto_confirmacion_ajuste')::numeric;
      if v_monto < 0 then
        raise exception 'config_invalida' using errcode = '22023', detail = 'monto_confirmacion_ajuste';
      end if;
      v_limpia := v_limpia || jsonb_build_object('monto_confirmacion_ajuste', v_monto);
    end if;
  end if;

  insert into public.organization_settings (organization_id, key, settings)
  values (p_org, 'inventario', v_limpia)
  on conflict (organization_id, key)
  do update set settings = public.organization_settings.settings || excluded.settings, updated_at = now();

  return public.fn_inventario_int_config(p_org);
end;
$fn$;

-- Borradores del histórico. Una fila por organización, sin publicar.
-- Reejecutar reemplaza las líneas del mismo fact_key si sigue en borrador.
create or replace function public.fn_carga_inicial_borradores()
returns integer
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_org integer;
  v_branch integer;
  v_tz text;
  v_fecha timestamptz;
  v_key text;
  v_entry integer;
  v_posted boolean;
  v_memo text := 'Carga inicial de inventario';
  v_debito numeric;
  v_credito numeric;
  v_total numeric;
  v_cuenta_d text;
  v_cuenta_c text;
  v_n integer := 0;
  v_prueba text := '(^|[^[:alpha:]])(test|prueba|e2e|sandbox|demo)([^[:alpha:]]|$)';
  br record;
begin
  perform set_config('statement_timeout', '300000', true);

  delete from public.carga_inicial_aviso
  where origen = 'historico';

  insert into public.carga_inicial_aviso (organization_id, clase, monto, detalle, nota, origen)
  select o.id, 'excluida_prueba',
         coalesce(sum(round(abs(sm.qty) * sm.unit_cost, 0)) filter (where coalesce(sm.unit_cost, 0) > 0), 0),
         jsonb_build_object(
           'movimientos', count(sm.id),
           'sin_costo', count(sm.id) filter (where coalesce(sm.unit_cost, 0) <= 0)
         ),
         'excluida_prueba', 'historico'
  from public.organizations o
  join public.stock_movements sm
    on sm.organization_id = o.id and sm.source = 'initial'
  where o.id <> 149
    and o.name ~* v_prueba
  group by o.id;

  insert into public.carga_inicial_aviso (organization_id, clase, monto, detalle, nota, origen)
  select 149, 'excluida_prueba',
         coalesce(sum(round(abs(sm.qty) * sm.unit_cost, 0)) filter (where coalesce(sm.unit_cost, 0) > 0), 0),
         jsonb_build_object('movimientos', count(*)),
         'excluida', 'historico'
  from public.stock_movements sm
  where sm.organization_id = 149
    and sm.source = 'initial'
  having count(*) > 0;

  for v_org in
    select distinct sm.organization_id
    from public.stock_movements sm
    join public.organizations o on o.id = sm.organization_id
    where sm.source = 'initial'
      and sm.organization_id <> 149
      and o.name !~* v_prueba
    order by 1
  loop
    insert into public.carga_inicial_aviso (organization_id, clase, monto, detalle, nota, origen)
    select v_org, 'sin_costo', 0,
           jsonb_build_object('movimientos', count(*)),
           'sin_costo', 'historico'
    from public.stock_movements sm
    where sm.organization_id = v_org
      and sm.source = 'initial'
      and coalesce(sm.unit_cost, 0) <= 0
    having count(*) > 0;

    select b.id into v_branch
    from public.branches b
    where b.organization_id = v_org
    order by b.is_main desc nulls last, b.is_active desc nulls last, b.id
    limit 1;

    if v_branch is null then
      insert into public.carga_inicial_aviso (organization_id, clase, monto, nota, origen)
      values (v_org, 'sin_sucursal', 0, 'sin_sucursal', 'historico');
      continue;
    end if;

    v_key := 'carga_inicial_borrador:' || v_org::text;
    v_entry := null;
    v_posted := null;
    select je.id, je.posted into v_entry, v_posted
    from public.journal_entries je
    where je.organization_id = v_org and je.fact_key = v_key;

    if v_posted is true then
      insert into public.carga_inicial_aviso (organization_id, clase, journal_entry_id, nota, origen)
      values (v_org, 'ya_publicado', v_entry, 'ya_publicado', 'historico');
      continue;
    end if;

    if v_entry is not null then
      delete from public.journal_lines where journal_entry_id = v_entry;
      delete from public.carga_inicial_cubierta where journal_entry_id = v_entry;
    end if;

    if not exists (
      select 1
      from public.stock_movements sm
      where sm.organization_id = v_org
        and sm.source = 'initial'
        and sm.direction = 'in'
        and coalesce(sm.unit_cost, 0) > 0
        and sm.branch_id is not null
        and not exists (
          select 1 from public.carga_inicial_cubierta c
          where c.movement_id = sm.id and c.borrador is false and c.journal_entry_id is not null
        )
    ) then
      if v_entry is not null then
        delete from public.journal_entries where id = v_entry and posted is false;
      end if;
      continue;
    end if;

    select coalesce(nullif(btrim(o.timezone), ''), 'America/Bogota')
      into v_tz
    from public.organizations o
    where o.id = v_org;
    begin
      v_fecha := (date_trunc('month', now() at time zone v_tz)) at time zone v_tz;
    exception when others then
      v_fecha := (date_trunc('month', now() at time zone 'America/Bogota')) at time zone 'America/Bogota';
    end;

    if v_entry is null then
      insert into public.journal_entries (
        organization_id, branch_id, entry_date, memo, source, source_id, posted, fact_key
      ) values (
        v_org, v_branch, v_fecha, v_memo, 'manual', v_org::text, false, v_key
      )
      returning id into v_entry;
    else
      update public.journal_entries
         set entry_date = v_fecha,
             memo = v_memo,
             branch_id = v_branch,
             posted = false,
             updated_at = now()
       where id = v_entry
         and posted is false;
    end if;

    v_total := 0;
    for br in
      select sm.branch_id,
             sum(round(abs(sm.qty) * sm.unit_cost, 0)) as monto
      from public.stock_movements sm
      where sm.organization_id = v_org
        and sm.source = 'initial'
        and sm.direction = 'in'
        and coalesce(sm.unit_cost, 0) > 0
        and sm.branch_id is not null
        and not exists (
          select 1 from public.carga_inicial_cubierta c
          where c.movement_id = sm.id and c.borrador is false and c.journal_entry_id is not null
        )
      group by sm.branch_id
    loop
      select c.debito, c.credito into v_cuenta_d, v_cuenta_c
      from public.fn_carga_inicial_cuentas(v_org, br.branch_id) c;

      if v_cuenta_d is null or v_cuenta_c is null or left(v_cuenta_c, 4) = '4250' or left(v_cuenta_d, 1) <> '1' then
        insert into public.carga_inicial_aviso (organization_id, clase, monto, detalle, nota, origen)
        values (
          v_org, 'sin_cuenta', br.monto,
          jsonb_build_object('branch_id', br.branch_id, 'debito', v_cuenta_d, 'credito', v_cuenta_c),
          'sin_cuenta', 'historico'
        );
        continue;
      end if;

      insert into public.journal_lines (
        journal_entry_id, account_code, description, debit, credit,
        organization_id, debit_base, credit_base
      ) values (
        v_entry, v_cuenta_d, v_memo, br.monto, 0, v_org, br.monto, 0
      );
      insert into public.journal_lines (
        journal_entry_id, account_code, description, debit, credit,
        organization_id, debit_base, credit_base
      ) values (
        v_entry, v_cuenta_c, v_memo, 0, br.monto, v_org, 0, br.monto
      );
      v_total := v_total + br.monto;

      insert into public.carga_inicial_cubierta (movement_id, organization_id, journal_entry_id, borrador)
      select sm.id, v_org, v_entry, true
      from public.stock_movements sm
      where sm.organization_id = v_org
        and sm.branch_id = br.branch_id
        and sm.source = 'initial'
        and sm.direction = 'in'
        and coalesce(sm.unit_cost, 0) > 0
        and not exists (
          select 1 from public.carga_inicial_cubierta c
          where c.movement_id = sm.id and c.borrador is false and c.journal_entry_id is not null
        )
      on conflict (movement_id) do update
        set journal_entry_id = excluded.journal_entry_id,
            borrador = true;
    end loop;

    select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
      into v_debito, v_credito
    from public.journal_lines
    where journal_entry_id = v_entry;

    if v_debito = 0 or v_debito <> v_credito or v_debito <> round(v_debito, 0) then
      delete from public.carga_inicial_cubierta where journal_entry_id = v_entry;
      delete from public.journal_lines where journal_entry_id = v_entry;
      delete from public.journal_entries where id = v_entry and posted is false;
      insert into public.carga_inicial_aviso (organization_id, clase, monto, detalle, nota, origen)
      values (v_org, 'descuadrado', v_debito, jsonb_build_object('credito', v_credito), 'descuadrado', 'historico');
      continue;
    end if;

    insert into public.carga_inicial_aviso (organization_id, clase, journal_entry_id, monto, nota, origen)
    values (v_org, 'borrador', v_entry, v_debito, 'borrador', 'historico');
    v_n := v_n + 1;
  end loop;

  if exists (
    select 1
    from public.journal_entries je
    join public.organizations o on o.id = je.organization_id
    where je.fact_key like 'carga_inicial_borrador:%'
      and (
        je.posted
        or je.organization_id = 149
        or o.name ~* v_prueba
        or exists (
          select 1 from public.journal_lines jl
          where jl.journal_entry_id = je.id
            and jl.account_code like '4250%'
        )
        or exists (
          select 1
          from (
            select sum(debit) as d, sum(credit) as c
            from public.journal_lines jl
            where jl.journal_entry_id = je.id
          ) s
          where s.d is distinct from s.c or s.d is distinct from round(s.d, 0)
        )
      )
  ) then
    raise exception 'carga_inicial_borrador_invalido';
  end if;

  return v_n;
end;
$fn$;

revoke all on function public.fn_carga_inicial_cuenta(integer, integer, text) from public, anon, authenticated;
revoke all on function public.fn_carga_inicial_cuentas(integer, integer) from public, anon, authenticated;
revoke all on function public.fn_carga_inicial_publicar() from public, anon, authenticated;
revoke all on function public.fn_carga_inicial_cerrar() from public, anon, authenticated;
revoke all on function public.fn_carga_inicial_borradores() from public, anon, authenticated;
revoke all on function public.fn_inventario_int_config(integer) from public, anon, authenticated;
revoke all on function public.fn_inventario_config_guardar(integer, jsonb) from public, anon;

grant execute on function public.fn_inventario_int_config(integer) to service_role;
grant execute on function public.fn_inventario_config_guardar(integer, jsonb) to authenticated, service_role;

comment on function public.fn_carga_inicial_publicar() is
  'Arma un asiento publicado por lote de carga inicial: debito inventario de la sede, credito saldo inicial (3105 por defecto).';
comment on function public.fn_carga_inicial_borradores() is
  'Borrador por organizacion de las cargas initial sin asiento. Excluye la org 149 y las marcadas de prueba. No publica.';
