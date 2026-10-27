-- (B) Configuración de impuestos (mapeo del contador) y subcategorías de Tesorería «Impuestos». APLICADA en prod
-- (execute_sql, autorizada por Juan). Solo configuración: NO toca asientos, saldos ni movimientos; NO toca organizations.
-- Excluye la org 2 (prueba).
--  1. tax_account_mapping: ICA_0.966 23170501→23680501; RETE_4 23650501→23652501; RETE_11 23650502→23651501;
--     IVA_0 (exento) queda SIN cuenta: se borran sus filas (account_code es NOT NULL), así no genera línea en $0.
--     Plantilla nueva «Comisiones 11 %» (RETE_11_COMISION) → 23652001 en las orgs que mapean RETE_11.
--  2. Auxiliares que falten se crean con fn_puc_asegurar_cuenta (jerarquía PUC del padre; clase 2 = crédito).
--  3. Tesorería: bajo «Impuestos» 8 subcategorías con cuenta; «Impuestos» queda con cuenta (51159501) y la cuenta
--     pasa a ser obligatoria en «Impuestos» y sus subcategorías (fn_categorias_tesoreria_guardar). Las orgs nuevas
--     las reciben desde fn_sembrar_categorias_tesoreria.
-- Bitácora para el rollback: public.bitacora_impuestos_20261027.
-- Rollback: supabase/rollbacks/20261027210000_impuestos_mapeo_y_tesoreria_rollback.sql

create table if not exists public.bitacora_impuestos_20261027 (
  id bigserial primary key,
  objeto text not null,
  organization_id integer,
  clave text,
  valor_anterior text,
  valor_nuevo text,
  creado timestamptz not null default now()
);
alter table public.bitacora_impuestos_20261027 enable row level security;
revoke all on public.bitacora_impuestos_20261027 from anon, authenticated;

-- Subcategorías de Tesorería «Impuestos» con cuenta (crea las auxiliares que falten). Idempotente.
create or replace function public.fn_tesoreria_sembrar_impuestos(p_org integer)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
  v_padre bigint;
  v_cta text;
  v_n integer := 0;
  v_antes boolean;
begin
  perform public.fn_assert_acceso_org(p_org);
  select id into v_padre from public.categorias_tesoreria
   where organization_id = p_org and clave = 'impuestos' limit 1;
  if v_padre is null then
    return 0;
  end if;
  perform set_config('app.sembrar_categorias', '1', true);
  for r in select * from (values
      ('imp_iva',        'IVA',                       '24080501', 'IVA por pagar',                         10),
      ('imp_inc',        'INC',                       '24950501', 'Impuesto nacional al consumo',          20),
      ('imp_retefuente', 'Retención en la fuente',    '23652501', 'Retención servicios',                   30),
      ('imp_reteiva',    'ReteIVA',                   '23670501', 'ReteIVA por pagar',                     40),
      ('imp_reteica',    'ReteICA',                   '23680501', 'ReteICA por pagar',                     50),
      ('imp_ica',        'ICA propio',                '24120501', 'Industria y comercio por pagar',        60),
      ('imp_renta',      'Renta',                     '24040501', 'Impuesto de renta por pagar',           70),
      ('imp_gasto',      'Impuestos que son gasto',   '51159501', 'Otros impuestos (gasto)',               80)
    ) v(clave, nombre, cuenta, nombre_cuenta, orden) loop
    v_antes := exists (select 1 from public.chart_of_accounts where organization_id = p_org and account_code = r.cuenta);
    v_cta := public.fn_puc_asegurar_cuenta(p_org, r.cuenta, r.nombre_cuenta, true);
    if v_cta is not null and not v_antes then
      insert into public.bitacora_impuestos_20261027 (objeto, organization_id, clave, valor_nuevo)
      values ('cuenta_nueva', p_org, r.cuenta, r.nombre_cuenta);
    end if;
    continue when v_cta is null;
    continue when exists (select 1 from public.categorias_tesoreria
                           where organization_id = p_org and clave = r.clave);
    insert into public.categorias_tesoreria
      (organization_id, clave, tipo, nombre, icono, cuenta_sugerida, padre_id, orden, activa, es_predefinida)
    values (p_org, r.clave, 'egreso', r.nombre, 'landmark', r.cuenta, v_padre, r.orden, true, true);
    insert into public.bitacora_impuestos_20261027 (objeto, organization_id, clave, valor_nuevo)
    values ('subcategoria_nueva', p_org, r.clave, r.cuenta);
    v_n := v_n + 1;
  end loop;

  -- «Impuestos» queda con cuenta: la de impuestos que son gasto.
  if exists (select 1 from public.chart_of_accounts where organization_id = p_org and account_code = '51159501') then
    insert into public.bitacora_impuestos_20261027 (objeto, organization_id, clave, valor_anterior, valor_nuevo)
    select 'categoria_cuenta', p_org, 'impuestos', c.cuenta_sugerida, '51159501'
      from public.categorias_tesoreria c
     where c.id = v_padre and c.cuenta_sugerida is distinct from '51159501' and c.cuenta_sugerida is null;
    update public.categorias_tesoreria set cuenta_sugerida = '51159501'
     where id = v_padre and cuenta_sugerida is null;
  end if;
  perform set_config('app.sembrar_categorias', '', true);
  return v_n;
end;
$function$;
revoke all on function public.fn_tesoreria_sembrar_impuestos(integer) from public, anon;
grant execute on function public.fn_tesoreria_sembrar_impuestos(integer) to authenticated, service_role;

-- Cuenta obligatoria en «Impuestos» y sus subcategorías (fuera de la siembra).
create or replace function public.fn_categorias_tesoreria_guardar()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org integer;
  v_tipo text;
  v_siguiente bigint;
  v_visto integer := 0;
begin
  if tg_op = 'DELETE' then
    if old.es_predefinida then
      raise exception 'categoria_invalida' using errcode = '22023';
    end if;
    return old;
  end if;

  new.nombre := btrim(new.nombre);
  new.icono := coalesce(nullif(btrim(new.icono), ''), 'circle');
  new.cuenta_sugerida := nullif(btrim(new.cuenta_sugerida), '');
  new.clave := nullif(btrim(new.clave), '');

  if new.nombre is null or new.nombre = '' or new.tipo not in ('ingreso', 'egreso') then
    raise exception 'categoria_invalida' using errcode = '22023';
  end if;

  if tg_op = 'INSERT'
     and new.es_predefinida
     and current_setting('app.sembrar_categorias', true) is distinct from '1' then
    new.es_predefinida := false;
    new.clave := null;
  end if;

  if tg_op = 'UPDATE' and old.es_predefinida then
    new.tipo := old.tipo;
    new.clave := old.clave;
    new.es_predefinida := true;
    new.organization_id := old.organization_id;
  end if;

  if not new.es_predefinida then
    new.clave := null;
  end if;

  if tg_op = 'UPDATE' and new.tipo is distinct from old.tipo then
    if exists (select 1 from public.categorias_tesoreria where padre_id = new.id) then
      raise exception 'categoria_invalida' using errcode = '22023';
    end if;
  end if;

  if new.padre_id is not null then
    if new.padre_id = new.id then
      raise exception 'categoria_invalida' using errcode = '22023';
    end if;
    select organization_id, tipo, padre_id
      into v_org, v_tipo, v_siguiente
      from public.categorias_tesoreria
     where id = new.padre_id;
    if not found or v_org is distinct from new.organization_id or v_tipo is distinct from new.tipo then
      raise exception 'categoria_invalida' using errcode = '22023';
    end if;
    while v_siguiente is not null and v_visto < 20 loop
      if v_siguiente = new.id then
        raise exception 'categoria_invalida' using errcode = '22023';
      end if;
      select padre_id into v_siguiente
        from public.categorias_tesoreria
       where id = v_siguiente;
      v_visto := v_visto + 1;
    end loop;
  end if;

  -- (20261027210000) La cuenta es obligatoria en «Impuestos» y en sus subcategorías.
  if new.cuenta_sugerida is null
     and current_setting('app.sembrar_categorias', true) is distinct from '1'
     and (new.clave = 'impuestos' or new.clave like 'imp\_%' or exists (
       select 1 from public.categorias_tesoreria p where p.id = new.padre_id and p.clave = 'impuestos'))
  then
    raise exception 'cuenta_obligatoria: la categoría de impuestos necesita una cuenta contable' using errcode = '22023';
  end if;

  if new.cuenta_sugerida is not null and not exists (
    select 1
      from public.chart_of_accounts c
     where c.organization_id = new.organization_id
       and c.account_code = new.cuenta_sugerida
       and c.is_active is distinct from false
       and c.es_movimiento is distinct from false
  ) then
    raise exception 'cuenta_no_es_de_movimiento' using errcode = '22023';
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

-- Orgs nuevas: la siembra de categorías llama a la de impuestos al final.
do $do$
declare
  v_def text := pg_get_functiondef('public.fn_sembrar_categorias_tesoreria'::regproc);
begin
  if position('fn_tesoreria_sembrar_impuestos' in v_def) = 0 then
    v_def := replace(v_def,
      E'  get diagnostics v_insertadas = row_count;\n',
      E'  get diagnostics v_insertadas = row_count;\n  perform public.fn_tesoreria_sembrar_impuestos(p_org);\n');
    if position('fn_tesoreria_sembrar_impuestos' in v_def) = 0 then
      raise exception 'no se pudo enganchar fn_tesoreria_sembrar_impuestos en fn_sembrar_categorias_tesoreria';
    end if;
    execute v_def;
  end if;
end;
$do$;

-- Datos: mapeo de impuestos y Tesorería (excepto org 2).
do $do$
declare
  r record;
  v_tpl integer;
  v_cta text;
  v_nuevo text;
begin
  -- Plantilla nueva «Comisiones 11 %».
  select id into v_tpl from public.tax_templates where code = 'RETE_11_COMISION';
  if v_tpl is null then
    insert into public.tax_templates (country, code, name, rate, description, kind, valid_from)
    values ('COL', 'RETE_11_COMISION', 'Comisiones 11 %', 11, 'Retención en la fuente por comisiones', 'withholding',
            '2017-01-01T00:00:00+00:00')
    returning id into v_tpl;
    insert into public.bitacora_impuestos_20261027 (objeto, organization_id, clave, valor_nuevo)
    values ('plantilla_nueva', 0, 'RETE_11_COMISION', v_tpl::text);
  end if;

  -- Auxiliares de las plantillas y repunte.
  for r in
    select m.id, m.organization_id, m.account_code, tt.code
      from public.tax_account_mapping m
      join public.tax_templates tt on tt.id = m.tax_template_id
     where m.organization_id <> 2
       and (tt.code, m.account_code) in (('ICA_0.966', '23170501'), ('RETE_4', '23650501'), ('RETE_11', '23650502'))
  loop
    v_nuevo := case r.code when 'ICA_0.966' then '23680501' when 'RETE_4' then '23652501' else '23651501' end;
    if not exists (select 1 from public.chart_of_accounts where organization_id = r.organization_id and account_code = v_nuevo) then
      v_cta := public.fn_puc_asegurar_cuenta(r.organization_id, v_nuevo,
        case v_nuevo when '23680501' then 'ReteICA por pagar' when '23652501' then 'Retención servicios'
                     else 'Retención honorarios' end, true);
      if v_cta is null then
        raise exception 'no se pudo crear % en la org %', v_nuevo, r.organization_id;
      end if;
      insert into public.bitacora_impuestos_20261027 (objeto, organization_id, clave, valor_nuevo)
      values ('cuenta_nueva', r.organization_id, v_nuevo, 'mapeo');
    end if;
    update public.tax_account_mapping set account_code = v_nuevo, updated_at = now() where id = r.id;
    insert into public.bitacora_impuestos_20261027 (objeto, organization_id, clave, valor_anterior, valor_nuevo)
    values ('mapeo_repunte', r.organization_id, r.id::text, r.account_code, v_nuevo);
  end loop;

  -- IVA_0 (exento): sin cuenta.
  for r in
    select m.* from public.tax_account_mapping m
      join public.tax_templates tt on tt.id = m.tax_template_id
     where m.organization_id <> 2 and tt.code = 'IVA_0'
  loop
    insert into public.bitacora_impuestos_20261027 (objeto, organization_id, clave, valor_anterior)
    values ('mapeo_borrado', r.organization_id, r.id::text, row_to_json(r)::text);
    delete from public.tax_account_mapping where id = r.id;
  end loop;

  -- RETE_11_COMISION → 23652001 donde se mapea RETE_11.
  for r in
    select distinct m.organization_id
      from public.tax_account_mapping m
      join public.tax_templates tt on tt.id = m.tax_template_id and tt.code = 'RETE_11'
     where m.organization_id <> 2
       and not exists (select 1 from public.tax_account_mapping x
                        where x.organization_id = m.organization_id and x.tax_template_id = v_tpl)
  loop
    if not exists (select 1 from public.chart_of_accounts where organization_id = r.organization_id and account_code = '23652001') then
      v_cta := public.fn_puc_asegurar_cuenta(r.organization_id, '23652001', 'Retención comisiones', true);
      if v_cta is null then
        raise exception 'no se pudo crear 23652001 en la org %', r.organization_id;
      end if;
      insert into public.bitacora_impuestos_20261027 (objeto, organization_id, clave, valor_nuevo)
      values ('cuenta_nueva', r.organization_id, '23652001', 'mapeo');
    end if;
    insert into public.tax_account_mapping (organization_id, tax_template_id, account_code, account_type, is_active)
    values (r.organization_id, v_tpl, '23652001', 'tax_payable', true)
    returning id::text into v_cta;
    insert into public.bitacora_impuestos_20261027 (objeto, organization_id, clave, valor_nuevo)
    values ('mapeo_nuevo', r.organization_id, v_cta, '23652001');
  end loop;

  -- Tesorería.
  for r in select distinct organization_id from public.categorias_tesoreria
            where clave = 'impuestos' and organization_id <> 2 loop
    perform public.fn_tesoreria_sembrar_impuestos(r.organization_id);
  end loop;
end;
$do$;
