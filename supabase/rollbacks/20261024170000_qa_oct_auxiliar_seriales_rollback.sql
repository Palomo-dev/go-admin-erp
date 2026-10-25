-- Revierte 20261024170000_qa_oct_auxiliar_seriales.sql.
-- Devuelve las líneas, los mapeos y los seriales a la foto qa_oct_*,
-- borra los auxiliares 143501 que esta migración creó y restaura las funciones.
-- Correr una sola vez, con la misma conexión que pueda escribir asientos
-- (app.contabilidad_mantenimiento = on).

do $rollback$
declare
  v_prev text;
begin
  if to_regclass('public.qa_oct_linea_cuenta_anterior') is null then
    return;
  end if;

  v_prev := current_setting('app.contabilidad_mantenimiento', true);
  perform set_config('app.contabilidad_mantenimiento', 'on', true);

  update public.journal_lines jl
     set account_code = q.account_code
    from public.qa_oct_linea_cuenta_anterior q
   where jl.id = q.journal_line_id
     and jl.account_code is distinct from q.account_code;

  update public.branch_account_mappings m
     set sub_account_code = q.sub_account_code
    from public.qa_oct_mapeo_cuenta_anterior q
   where m.id = q.id
     and m.sub_account_code is distinct from q.sub_account_code;

  delete from public.branch_account_mappings m
   where m.base_account_code in ('1405', '1435')
     and not exists (
       select 1 from public.qa_oct_mapeo_cuenta_anterior q where q.id = m.id
     );

  delete from public.chart_of_accounts c
   where c.account_code ~ '^143501[0-9]{2}$'
     and not exists (
       select 1 from public.qa_oct_cuenta_previa p
       where p.organization_id = c.organization_id and p.account_code = c.account_code
     )
     and not exists (
       select 1
       from public.journal_lines jl
       join public.journal_entries je on je.id = jl.journal_entry_id
       where je.organization_id = c.organization_id
         and jl.account_code = c.account_code
     );

  delete from public.chart_of_accounts c
   where c.account_code = '143501'
     and not exists (
       select 1 from public.qa_oct_cuenta_previa p
       where p.organization_id = c.organization_id and p.account_code = c.account_code
     )
     and not exists (
       select 1 from public.chart_of_accounts h
       where h.organization_id = c.organization_id and h.parent_code = '143501'
     );

  delete from public.chart_of_accounts c
   where c.account_code = '240810'
     and not exists (
       select 1 from public.qa_oct_cuenta_previa p
       where p.organization_id = c.organization_id and p.account_code = '240810'
     )
     and not exists (
       select 1
       from public.journal_lines jl
       join public.journal_entries je on je.id = jl.journal_entry_id
       where je.organization_id = c.organization_id
         and jl.account_code = '240810'
     );

  update public.chart_of_accounts c
     set es_movimiento = q.es_movimiento
    from public.qa_oct_cuenta_movimiento_anterior q
   where c.organization_id = q.organization_id
     and c.account_code = q.account_code
     and c.es_movimiento is distinct from q.es_movimiento;

  update public.invoice_items ii
     set serial_ids = q.serial_ids,
         serial_numbers = q.serial_numbers
    from public.qa_oct_factura_serial_anterior q
   where ii.id = q.invoice_item_id;

  perform set_config('app.contabilidad_mantenimiento', coalesce(v_prev, ''), true);
end;
$rollback$;

drop trigger if exists trg_factura_linea_copiar_serial on public.invoice_items;
drop function if exists public.fn_factura_linea_copiar_serial();

drop trigger if exists trg_sede_auxiliar_1435 on public.branches;
drop function if exists public.fn_sede_auxiliar_1435();

drop function if exists public.fn_saldos_cuentas(integer, timestamptz, timestamptz, uuid);
drop function if exists public.fn_puc_cuentas_con_lineas(integer);

-- Devuelve el resolvedor de sede, la carga inicial, la compra, los seriales y el tercero.
do $parche$
declare
  v_oid oid;
  v_def text;
  v_nuevo text;
  v_viejo text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_cuenta_configurada_de_sede';
  if v_oid is not null then
    v_def := pg_get_functiondef(v_oid);
    v_nuevo := $n$  if v_sub is not null then
    cuenta := v_sub;
  end if;

  if cuenta is not null
     and p_branch_id is not null
     and cuenta !~ '^143501[0-9]{2}$'
     and (
       cuenta in ('1405', '1435')
       or cuenta like '1405%'
       or cuenta ~ '^143505'
     ) then
    v_sub := public.fn_asegurar_auxiliar_1435(p_organization_id, p_branch_id);
    if v_sub is not null then
      cuenta := v_sub;
    end if;
  end if;
end;$n$;
    v_viejo := $v$  if v_sub is not null then
    cuenta := v_sub;
  end if;
end;$v$;
    if position(v_nuevo in v_def) > 0 then
      execute replace(v_def, v_nuevo, v_viejo);
    end if;
  end if;
end;
$parche$;

do $parche$
declare
  v_oid oid;
  v_def text;
  v_nuevo text := $n$  if debito is null or debito !~ '^143501[0-9]{2}$' then
    debito := public.fn_inventario_auxiliar_1435(p_org, p_branch);
  end if;
  if debito is null or left(debito, 4) <> '1435' then
    debito := null;
  end if;$n$;
  v_viejo text := $v$  if debito is null or left(debito, 4) <> '1435' then
    debito := public.fn_inventario_auxiliar_1435(p_org, p_branch);
  end if;
  if debito is null or left(debito, 4) <> '1435' then
    debito := null;
  end if;$v$;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_carga_inicial_cuentas';
  if v_oid is null then
    return;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if position(v_nuevo in v_def) > 0 then
    v_def := replace(v_def, v_nuevo, v_viejo);
    v_def := replace(v_def, 'VOLATILE SECURITY DEFINER', 'STABLE SECURITY DEFINER');
    execute v_def;
  end if;
end;
$parche$;

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

-- La compra, los seriales y el tercero vuelven al texto anterior.
do $parche$
declare
  v_oid oid;
  v_def text;
  v_marcado text := $m$  v_credito := public.fn_cuenta_movimiento_o_detalle(
    new.organization_id, new.branch_id, v_rule.credit_account_code
  );

  v_aux := public.fn_asegurar_auxiliar_1435(new.organization_id, new.branch_id);$m$;
  v_resto text;
  v_inicio integer;
  v_fin integer;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_auto_journal_purchase';
  if v_oid is not null then
    v_def := pg_get_functiondef(v_oid);
    if position('v_aux := public.fn_asegurar_auxiliar_1435' in v_def) > 0 then
      v_def := replace(
        v_def,
        $a$  v_debito text;
  v_credito text;
  v_aux text;
  v_impuesto text;
begin$a$,
        $b$  v_debito text;
  v_credito text;
begin$b$
      );
      v_inicio := position(v_marcado in v_def);
      v_fin := position('if public.fn_documento_tiene_cuenta_propia(new.organization_id, new.id, ''compra'') then' in v_def);
      if v_inicio = 0 or v_fin = 0 or v_fin < v_inicio then
        raise exception 'qa_oct rollback: no se pudo quitar el auxiliar de la compra';
      end if;
      v_resto := substring(v_def from v_fin);
      v_def := substring(v_def from 1 for v_inicio - 1)
        || $c$  v_credito := public.fn_cuenta_movimiento_o_detalle(
    new.organization_id, new.branch_id, v_rule.credit_account_code
  );

  $c$
        || v_resto;
      v_def := replace(v_def, 'p_tax_account := v_impuesto', 'p_tax_account := v_rule.tax_account_code');
      execute v_def;
    end if;
  end if;

  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_producto_generar_seriales';
  if v_oid is not null then
    v_def := pg_get_functiondef(v_oid);
    if position('SER-{SEQ}' in v_def) > 0 then
      v_def := replace(v_def,
        $n$    v_patron := nullif(btrim(coalesce(v_p.serial_pattern, '')), '');
    if v_patron is null then
      v_patron := case
        when nullif(btrim(coalesce(v_p.sku, '')), '') is null then 'SER-{SEQ}'
        else regexp_replace(upper(btrim(v_p.sku)), '[^A-Z0-9]+', '-', 'g') || '-{SEQ}'
      end;
      update public.products
         set serial_pattern = v_patron
       where id = p_product_id
         and organization_id = p_organization_id
         and nullif(btrim(coalesce(serial_pattern, '')), '') is null;
    end if;$n$,
        $v$    v_patron := nullif(btrim(coalesce(v_p.serial_pattern, '')), '');
    if v_patron is null then
      raise exception 'patron_requerido' using errcode = '22023';
    end if;$v$);
      execute v_def;
    end if;
  end if;

  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_bloqueo_tercero_documento';
  if v_oid is not null then
    v_def := pg_get_functiondef(v_oid);
    if position('or nullif(btrim(v_nombre), '''') is not null' in v_def) > 0 then
      v_def := replace(v_def,
        $n$  select t.nit, t.nombre into v_nit, v_nombre from public.fn_tercero_de_documento(v_tipo, p_id) t;
  if v_nit is not null or nullif(btrim(v_nombre), '') is not null then
    return null;
  end if;$n$,
        $v$  select t.nit into v_nit from public.fn_tercero_de_documento(v_tipo, p_id) t;
  if v_nit is not null then
    return null;
  end if;$v$);
      execute v_def;
    end if;
  end if;

  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_armar_asiento_documento';
  if v_oid is not null then
    v_def := pg_get_functiondef(v_oid);
    if position('and nullif(btrim(v_nombre), '''') is null then' in v_def) > 0 then
      execute replace(
        v_def,
        'and v_nit is null and nullif(btrim(v_nombre), '''') is null then',
        'and v_nit is null then'
      );
    end if;
  end if;

  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_asiento_manual_crear';
  if v_oid is not null then
    v_def := pg_get_functiondef(v_oid);
    if position('exige el nombre del tercero' in v_def) > 0 then
      v_def := replace(v_def,
        $n$    if coalesce(v_exige.requiere_tercero, false) and v_nit is null and nullif(btrim(v_linea->>'tercero_nombre'), '') is null then
      raise exception 'TERCERO_REQUERIDO: la cuenta % exige el nombre del tercero', v_cuenta$n$,
        $v$    if coalesce(v_exige.requiere_tercero, false) and v_nit is null then
      raise exception 'TERCERO_REQUERIDO: la cuenta % exige el NIT o la cédula del tercero', v_cuenta$v$);
      execute v_def;
    end if;
  end if;
end;
$parche$;

drop function if exists public.fn_asegurar_auxiliar_1435(integer, integer);

drop table if exists public.qa_oct_factura_serial_anterior;
drop table if exists public.qa_oct_cuenta_previa;
drop table if exists public.qa_oct_cuenta_movimiento_anterior;
drop table if exists public.qa_oct_mapeo_cuenta_anterior;
drop table if exists public.qa_oct_linea_cuenta_anterior;
