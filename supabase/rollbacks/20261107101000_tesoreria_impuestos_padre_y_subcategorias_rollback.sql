-- Rollback de 20261107101000_tesoreria_impuestos_padre_y_subcategorias.sql.
-- Restaura las cuatro funciones como estaban (pg_get_functiondef de producción, 2026-11-06), devuelve GMF a la raíz y
-- borra las subcategorías que sembró esta migración si ningún movimiento las usa; las que tengan movimientos se
-- desactivan. No toca asientos, saldos, movimientos ni tax_account_mapping.
-- Antes de aplicarlo: una subcategoría creada a mano bajo «Impuestos» conserva su padre.

drop trigger if exists trg_zzzzz_tesoreria_impuestos on public.organizations;
drop function if exists public.trg_fn_tesoreria_impuestos_org_nueva();

-- Datos primero: el disparador vigente protege las predefinidas.
alter table public.categorias_tesoreria disable trigger trg_categorias_tesoreria_guardar;

update public.categorias_tesoreria c
   set padre_id = null
  from public.bitacora_impuestos_20261027 b
 where b.objeto = 'categoria_padre'
   and c.organization_id = b.organization_id
   and c.clave = 'gmf';

update public.categorias_tesoreria c
   set activa = false
  from public.bitacora_impuestos_20261027 b
 where b.objeto = 'subcategoria_nueva'
   and c.organization_id = b.organization_id
   and c.clave = b.clave
   and (exists (select 1 from public.cash_movements m where m.categoria_id = c.id)
     or exists (select 1 from public.bank_transactions t where t.categoria_id = c.id));

delete from public.categorias_tesoreria c
 using public.bitacora_impuestos_20261027 b
 where b.objeto = 'subcategoria_nueva'
   and c.organization_id = b.organization_id
   and c.clave = b.clave
   and not exists (select 1 from public.cash_movements m where m.categoria_id = c.id)
   and not exists (select 1 from public.bank_transactions t where t.categoria_id = c.id);

alter table public.categorias_tesoreria enable trigger trg_categorias_tesoreria_guardar;

delete from public.bitacora_impuestos_20261027
 where objeto in ('subcategoria_nueva', 'categoria_padre');

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
      when c.account_code is not null
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
      ('impuestos', 'egreso', 'Impuestos', 'landmark', '5115', 150),
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
    select organization_id, tipo, activa
      into v_cat_org, v_cat_tipo, v_cat_activa
      from public.categorias_tesoreria
     where id = new.categoria_id;
    if not found
       or v_cat_org is distinct from new.organization_id
       or v_cat_activa is distinct from true
       or v_cat_tipo is distinct from v_tipo then
      raise exception 'categoria_invalida' using errcode = '22023';
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

drop function if exists public.fn_categoria_impuesto_rol(text, text);
