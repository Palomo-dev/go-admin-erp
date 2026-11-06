-- Hallazgo 2 de la auditoría del Contador (2026-11-06): categorías de impuestos.
--
-- Medido antes de aplicar: 33 categorías «Impuestos» sin cuenta y 0 subcategorías imp_*. De las 8 cuentas aprobadas,
-- 24080501, 23652501, 23670501 y 23680501 existen en las 33 empresas; 24950501 en 3; 24120501, 24040501 y 51159501
-- en ninguna.
--
-- Qué cambia:
--   1. «Impuestos» es un padre organizador: no lleva cuenta y no se puede elegir en un movimiento.
--   2. Las subcategorías requieren cuenta válida. Las de pasivo solo aceptan clase 2: pagar un impuesto cancela el
--      pasivo y no vuelve a causar el gasto.
--   3. La siembra ya no crea cuentas: fn_puc_asegurar_cuenta quedaba por fuera del plan de la empresa. Si la cuenta no
--      existe, la subcategoría nace sin cuenta y se exige al usarla.
--   4. GMF pasa a colgar de «Impuestos» (Figma 2334:134283). Conserva su cuenta.
--
-- tax_account_mapping no se toca: los mapeos aprobados en 20261027210000 siguen iguales.
-- Sin movimientos con estas categorías al aplicar: 0 en cash_movements y 0 en bank_transactions.
-- Rollback: supabase/rollbacks/20261107101000_tesoreria_impuestos_padre_y_subcategorias_rollback.sql

create or replace function public.fn_categoria_impuesto_rol(p_clave text, p_clave_padre text)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select case
    when p_clave = 'impuestos' then 'agrupa'
    when p_clave in ('imp_iva', 'imp_inc', 'imp_retefuente', 'imp_reteiva', 'imp_reteica', 'imp_ica', 'imp_renta') then 'pasivo'
    when p_clave in ('imp_gasto', 'gmf') then 'gasto'
    when p_clave_padre = 'impuestos' then 'subcategoria'
  end;
$function$;

revoke all on function public.fn_categoria_impuesto_rol(text, text) from public, anon;
grant execute on function public.fn_categoria_impuesto_rol(text, text) to authenticated, service_role;

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
  v_clave_padre text;
  v_rol text;
  v_sembrando boolean := current_setting('app.sembrar_categorias', true) is not distinct from '1';
  v_cuenta_cambia boolean;
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

  if tg_op = 'INSERT' and new.es_predefinida and not v_sembrando then
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
    select organization_id, tipo, padre_id, clave
      into v_org, v_tipo, v_siguiente, v_clave_padre
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

  v_rol := public.fn_categoria_impuesto_rol(new.clave, v_clave_padre);
  v_cuenta_cambia := tg_op = 'INSERT' or new.cuenta_sugerida is distinct from old.cuenta_sugerida;

  -- El padre organiza: ni sugiere cuenta ni recibe movimientos.
  if v_rol = 'agrupa' and new.cuenta_sugerida is not null then
    raise exception 'padre_no_imputable: «Impuestos» agrupa y no lleva cuenta' using errcode = '22023';
  end if;

  -- Subcategoría: una alta manual lleva cuenta y una cuenta puesta no se quita. La sembrada sin cuenta puede quedar
  -- así (activarla o renombrarla sigue funcionando): se exige al usarla, en fn_validar_datos_tesoreria.
  if new.cuenta_sugerida is null
     and not v_sembrando
     and (v_rol in ('pasivo', 'subcategoria') or new.clave = 'imp_gasto')
     and (tg_op = 'INSERT' or old.cuenta_sugerida is not null or new.padre_id is distinct from old.padre_id)
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

  if v_rol is not null and new.cuenta_sugerida is not null and v_cuenta_cambia then
    if public.fn_es_cuenta_de_titulo(new.organization_id, new.cuenta_sugerida) then
      raise exception 'cuenta_no_es_de_movimiento' using errcode = '22023';
    end if;
    if v_rol = 'pasivo' and left(new.cuenta_sugerida, 1) <> '2' then
      raise exception 'impuesto_cancela_pasivo: pagar este impuesto cancela un pasivo de la clase 2' using errcode = '22023';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

create or replace function public.fn_sembrar_categorias_tesoreria(p_org integer)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_insertadas integer := 0;
begin
  perform public.fn_assert_acceso_org(p_org);
  perform set_config('app.sembrar_categorias', '1', true);

  insert into public.categorias_tesoreria (
    organization_id, clave, tipo, nombre, icono, cuenta_sugerida, orden, activa, es_predefinida
  )
  select
    p_org,
    v.clave,
    v.tipo,
    v.nombre,
    v.icono,
    case
      when v.cuenta is not null
       and c.account_code is not null
       and c.is_active is distinct from false
       and c.es_movimiento is distinct from false
      then r.cuenta
      else null
    end,
    v.orden,
    true,
    true
  from (
    values
      ('ventas_productos', 'ingreso', 'Ventas de productos', 'shopping-bag', '4135', 10),
      ('servicios', 'ingreso', 'Servicios', 'wrench', '4155', 20),
      ('arriendos_recibidos', 'ingreso', 'Arriendos recibidos', 'home', '4220', 30),
      ('intereses_recibidos', 'ingreso', 'Intereses', 'percent', '421005', 40),
      ('comisiones_recibidas', 'ingreso', 'Comisiones recibidas', 'badge-percent', '4225', 50),
      ('reintegros', 'ingreso', 'Reintegros y recuperaciones', 'rotate-ccw', '4250', 60),
      ('aportes_socios', 'ingreso', 'Aportes de socios', 'users', '3105', 70),
      ('prestamos_recibidos', 'ingreso', 'Préstamos recibidos', 'landmark', '2105', 80),
      ('anticipos_clientes', 'ingreso', 'Anticipos de clientes', 'wallet', '2805', 90),
      ('cobro_cartera', 'ingreso', 'Cobro de cartera', 'receipt', '1305', 100),
      ('devolucion_proveedores', 'ingreso', 'Devolución de proveedores', 'undo-2', '22050501', 110),
      ('otros_ingresos', 'ingreso', 'Otros ingresos', 'circle-plus', '4295', 120),
      ('proveedores', 'egreso', 'Proveedores y compras', 'truck', '22050501', 10),
      ('nomina', 'egreso', 'Nómina', 'users', '5105', 20),
      ('seguridad_social', 'egreso', 'Seguridad social y parafiscales', 'shield', '5105', 30),
      ('arriendo', 'egreso', 'Arriendo', 'home', '5120', 40),
      ('energia', 'egreso', 'Energía', 'zap', '513530', 50),
      ('agua', 'egreso', 'Agua', 'droplet', '513525', 60),
      ('gas', 'egreso', 'Gas', 'flame', '513555', 65),
      ('internet', 'egreso', 'Internet y telefonía', 'wifi', '513535', 70),
      ('transporte', 'egreso', 'Transporte y fletes', 'truck', '513550', 80),
      ('publicidad', 'egreso', 'Publicidad', 'megaphone', '523560', 90),
      ('mantenimiento', 'egreso', 'Mantenimiento', 'wrench', '5145', 100),
      ('papeleria', 'egreso', 'Papelería', 'file-text', '519530', 110),
      ('aseo', 'egreso', 'Aseo y cafetería', 'coffee', '519525', 120),
      ('honorarios', 'egreso', 'Honorarios', 'briefcase', '5110', 130),
      ('seguros', 'egreso', 'Seguros', 'shield-check', '5130', 140),
      -- Padre organizador: sin cuenta (20261107101000).
      ('impuestos', 'egreso', 'Impuestos', 'landmark', null, 150),
      ('impuestos_declarados', 'egreso', 'Pago de impuestos declarados', 'landmark', '2408', 155),
      ('comisiones_bancarias', 'egreso', 'Comisiones bancarias', 'landmark', '530515', 160),
      ('gmf', 'egreso', 'GMF 4x1000', 'banknote', '511595', 170),
      ('intereses_pagados', 'egreso', 'Intereses', 'percent', '530520', 180),
      ('software', 'egreso', 'Software y suscripciones', 'monitor', '513595', 190),
      ('combustible', 'egreso', 'Combustible', 'fuel', '519545', 200),
      ('viaticos', 'egreso', 'Viáticos', 'plane', '5155', 210),
      ('domicilios', 'egreso', 'Domicilios', 'bike', '523550', 220),
      ('pago_prestamos', 'egreso', 'Pago de préstamos', 'landmark', '2105', 230),
      ('retiros_socios', 'egreso', 'Retiros de socios', 'log-out', '3105', 240),
      ('devoluciones_clientes', 'egreso', 'Devoluciones a clientes', 'undo-2', '4175', 250),
      ('otros_gastos', 'egreso', 'Otros gastos', 'circle-minus', '5195', 260)
  ) as v(clave, tipo, nombre, icono, cuenta, orden)
  -- 4295 -> 42959501 (ingreso genérico), 2408 -> 24080501, 530515 -> 53051501.
  cross join lateral (select public.fn_cuenta_auxiliar_de_titulo(p_org, null, v.cuenta) as cuenta) r
  left join public.chart_of_accounts c
    on c.organization_id = p_org
   and c.account_code = r.cuenta
  where not exists (
    select 1 from public.categorias_tesoreria ya
     where ya.organization_id = p_org and ya.clave = v.clave
  )
  and not exists (
    select 1 from public.categorias_tesoreria ya
     where ya.organization_id = p_org
       and ya.tipo = v.tipo
       and lower(ya.nombre) = lower(v.nombre)
  )
  on conflict (organization_id, clave) where clave is not null do nothing;

  get diagnostics v_insertadas = row_count;
  begin
    perform public.fn_tesoreria_sembrar_impuestos(p_org);
  exception when others then
    raise warning 'fn_tesoreria_sembrar_impuestos(%) falló: %', p_org, sqlerrm;
  end;
  perform set_config('app.sembrar_categorias', '', true);
  return v_insertadas;
end;
$function$;

-- Subcategorías bajo «Impuestos». Idempotente. Nunca crea cuentas: la que no esté en el plan de la empresa, o no sea
-- de movimiento, deja la subcategoría sin cuenta. Los códigos son los aprobados en 20261027210000.
create or replace function public.fn_tesoreria_sembrar_impuestos(p_org integer)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
  v_padre bigint;
  v_cuenta text;
  v_insertada integer;
  v_n integer := 0;
begin
  perform public.fn_assert_acceso_org(p_org);
  select id into v_padre
    from public.categorias_tesoreria
   where organization_id = p_org and clave = 'impuestos'
   limit 1;
  if v_padre is null then
    return 0;
  end if;

  perform set_config('app.sembrar_categorias', '1', true);
  for r in
    select * from (values
      ('imp_iva',        'Pago de IVA',                    '24080501', 10),
      ('imp_inc',        'Pago de INC',                    '24950501', 20),
      ('imp_retefuente', 'Pago de retención en la fuente', '23652501', 30),
      ('imp_reteiva',    'Pago de ReteIVA',                '23670501', 40),
      ('imp_reteica',    'Pago de ReteICA',                '23680501', 50),
      ('imp_ica',        'Pago de ICA propio',             '24120501', 60),
      ('imp_renta',      'Pago de renta',                  '24040501', 70),
      ('imp_gasto',      'Impuestos que son gasto',        '51159501', 80)
    ) as v(clave, nombre, cuenta, orden)
  loop
    v_cuenta := case when public.fn_cuenta_fallo_en_regla(p_org, r.cuenta) is null then r.cuenta end;

    if exists (
      select 1 from public.categorias_tesoreria
       where organization_id = p_org and clave = r.clave
    ) then
      -- La cuenta apareció después: se completa. Nunca se cambia una cuenta ya elegida.
      if v_cuenta is not null then
        update public.categorias_tesoreria
           set cuenta_sugerida = v_cuenta
         where organization_id = p_org and clave = r.clave and cuenta_sugerida is null;
      end if;
      continue;
    end if;

    insert into public.categorias_tesoreria
      (organization_id, clave, tipo, nombre, icono, cuenta_sugerida, padre_id, orden, activa, es_predefinida)
    values
      (p_org, r.clave, 'egreso', r.nombre, 'landmark', v_cuenta, v_padre, r.orden, true, true)
    on conflict do nothing;

    get diagnostics v_insertada = row_count;
    if v_insertada > 0 then
      insert into public.bitacora_impuestos_20261027 (objeto, organization_id, clave, valor_nuevo)
      values ('subcategoria_nueva', p_org, r.clave, v_cuenta);
      v_n := v_n + 1;
    end if;
  end loop;

  insert into public.bitacora_impuestos_20261027 (objeto, organization_id, clave, valor_anterior, valor_nuevo)
  select 'categoria_padre', p_org, 'gmf', null, v_padre::text
    from public.categorias_tesoreria c
   where c.organization_id = p_org and c.clave = 'gmf' and c.padre_id is null;

  update public.categorias_tesoreria
     set padre_id = v_padre
   where organization_id = p_org and clave = 'gmf' and padre_id is null;

  perform set_config('app.sembrar_categorias', '', true);
  return v_n;
end;
$function$;

create or replace function public.fn_validar_datos_tesoreria()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tipo text;
  v_cat_org integer;
  v_cat_tipo text;
  v_cat_activa boolean;
  v_cat_clave text;
  v_cat_padre bigint;
  v_clave_padre text;
  v_rol text;
  v_exige_centro boolean;
  v_exige_tercero boolean;
begin
  new.cuenta_contable := nullif(btrim(new.cuenta_contable), '');
  new.tercero_nit := nullif(btrim(new.tercero_nit), '');
  new.tercero_nombre := nullif(btrim(new.tercero_nombre), '');
  new.soporte_path := nullif(btrim(new.soporte_path), '');

  if new.categoria_id is null
     and new.cuenta_contable is null
     and new.centro_costo_id is null
     and new.tercero_nit is null
     and new.tercero_nombre is null
     and new.soporte_path is null then
    return new;
  end if;

  if tg_table_name = 'cash_movements' then
    v_tipo := case
      when new.type in ('in', 'deposit', 'income') then 'ingreso'
      when new.type in ('out', 'withdrawal', 'expense') then 'egreso'
      else null
    end;
  else
    v_tipo := case
      when new.transaction_type in ('deposit', 'interest') then 'ingreso'
      when new.transaction_type in ('withdrawal', 'fee') then 'egreso'
      when coalesce(new.amount, 0) < 0 then 'egreso'
      else 'ingreso'
    end;
  end if;

  if new.categoria_id is not null then
    select organization_id, tipo, activa, clave, padre_id
      into v_cat_org, v_cat_tipo, v_cat_activa, v_cat_clave, v_cat_padre
      from public.categorias_tesoreria
     where id = new.categoria_id;
    if not found
       or v_cat_org is distinct from new.organization_id
       or v_cat_activa is distinct from true
       or v_cat_tipo is distinct from v_tipo then
      raise exception 'categoria_invalida' using errcode = '22023';
    end if;

    -- Impuestos (20261107101000). Solo al crear o al cambiar categoría o cuenta: lo ya registrado no se vuelve a juzgar.
    if tg_op = 'INSERT'
       or new.categoria_id is distinct from old.categoria_id
       or new.cuenta_contable is distinct from old.cuenta_contable then
      if v_cat_padre is not null then
        select clave into v_clave_padre
          from public.categorias_tesoreria
         where id = v_cat_padre;
      end if;
      v_rol := public.fn_categoria_impuesto_rol(v_cat_clave, v_clave_padre);

      if v_rol = 'agrupa' then
        raise exception 'categoria_no_imputable: «Impuestos» agrupa; elige una subcategoría' using errcode = '22023';
      end if;
      -- Sin cuenta, el movimiento caería en el asiento genérico de gasto.
      if new.cuenta_contable is null
         and (v_rol in ('pasivo', 'subcategoria') or v_cat_clave = 'imp_gasto') then
        raise exception 'categoria_requiere_cuenta: esta categoría de impuestos necesita una cuenta' using errcode = '22023';
      end if;
      if v_rol = 'pasivo' and left(new.cuenta_contable, 1) <> '2' then
        raise exception 'impuesto_cancela_pasivo: pagar este impuesto cancela un pasivo de la clase 2' using errcode = '22023';
      end if;
    end if;
  end if;

  if new.cuenta_contable is not null then
    if not exists (
      select 1
        from public.chart_of_accounts c
       where c.organization_id = new.organization_id
         and c.account_code = new.cuenta_contable
         and c.is_active is distinct from false
         and c.es_movimiento is distinct from false
    ) or public.fn_es_cuenta_de_titulo(new.organization_id, new.cuenta_contable) then
      raise exception 'cuenta_no_es_de_movimiento' using errcode = '22023';
    end if;

    select coalesce(c.requiere_centro_costo, false), coalesce(c.requiere_tercero, false)
      into v_exige_centro, v_exige_tercero
      from public.chart_of_accounts c
     where c.organization_id = new.organization_id
       and c.account_code = new.cuenta_contable;

    if v_exige_centro and new.centro_costo_id is null then
      new.centro_costo_id := public.fn_centro_defecto(new.organization_id, new.branch_id);
      if new.centro_costo_id is null then
        raise warning 'centro_costo_omitido: movimiento de tesorería sin centro activo';
      end if;
    end if;
    if v_exige_tercero and new.tercero_nit is null then
      raise exception 'tercero_requerido' using errcode = '22023';
    end if;
  end if;

  if new.centro_costo_id is not null and not exists (
    select 1
      from public.cost_centers cc
     where cc.id = new.centro_costo_id
       and cc.organization_id = new.organization_id
       and cc.is_active is distinct from false
  ) then
    raise exception 'centro_costo_invalido' using errcode = '22023';
  end if;

  if new.soporte_path is not null and new.soporte_path !~ (
    '^' || new.organization_id::text || '/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.(pdf|jpe?g|png|webp)$'
  ) then
    raise exception 'soporte_invalido' using errcode = '22023';
  end if;

  return new;
end;
$function$;

-- Alta de empresa: tr_zzz_categorias_tesoreria corre antes que trg_zzzz_configuracion_contable, donde nacen varios
-- auxiliares de pasivo. Al final del alta se repite la siembra para que esas subcategorías queden con su cuenta.
create or replace function public.trg_fn_tesoreria_impuestos_org_nueva()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  begin
    perform public.fn_tesoreria_sembrar_impuestos(new.id);
  exception when others then
    raise warning 'fn_tesoreria_sembrar_impuestos(%) falló al final del alta: %', new.id, sqlerrm;
  end;
  return new;
end;
$function$;

revoke all on function public.trg_fn_tesoreria_impuestos_org_nueva() from public, anon, authenticated;

drop trigger if exists trg_zzzzz_tesoreria_impuestos on public.organizations;
create trigger trg_zzzzz_tesoreria_impuestos
  after insert on public.organizations
  for each row execute function public.trg_fn_tesoreria_impuestos_org_nueva();

-- Empresas existentes: solo añade subcategorías y ubica GMF. Idempotente. El padre ya está sin cuenta en las 33.
do $do$
declare
  v_org integer;
begin
  for v_org in
    select distinct c.organization_id
      from public.categorias_tesoreria c
     where c.clave = 'impuestos'
     order by 1
  loop
    perform public.fn_tesoreria_sembrar_impuestos(v_org);
  end loop;
end;
$do$;
