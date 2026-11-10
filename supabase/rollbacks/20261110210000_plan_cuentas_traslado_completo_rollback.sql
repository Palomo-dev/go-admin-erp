-- Reversión de 20261110210000_plan_cuentas_traslado_completo.sql.
--
-- Devuelve fn_puc_linea_solo_movimiento al rechazo simple de hoy, fn_plan_crear_cuenta_hija a la
-- versión de 20261110190000 y borra plan_cuentas_sucesoras. Las cuentas y asientos creados se
-- quedan: son filas normales del plan y del diario.

create or replace function public.fn_puc_linea_solo_movimiento()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org integer;
  v_mov boolean;
begin
  v_org := new.organization_id;
  if v_org is null then
    select organization_id into v_org
    from public.journal_entries
    where id = new.journal_entry_id;
  end if;
  if v_org is null then
    return new;
  end if;

  select es_movimiento into v_mov
  from public.chart_of_accounts
  where organization_id = v_org
    and account_code = new.account_code;

  -- Sin fila en el plan, o con es_movimiento null: no es un rechazo nuevo.
  if v_mov is false then
    raise exception 'cuenta_no_es_de_movimiento: la cuenta % es de título y no recibe asientos', new.account_code;
  end if;
  return new;
end;
$function$;

create or replace function public.fn_plan_crear_cuenta_hija(
  p_organization_id integer,
  p_parent_code text,
  p_name text,
  p_account_code text default null,
  p_trasladar_saldo boolean default false,
  p_nota text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_padre public.chart_of_accounts%rowtype;
  v_codigo_padre text := nullif(btrim(p_parent_code), '');
  v_nombre text := nullif(btrim(p_name), '');
  v_codigo text := nullif(btrim(p_account_code), '');
  v_nota text := nullif(btrim(p_nota), '');
  v_libre text;
  v_naturaleza text;
  v_era_movimiento boolean;
  v_saldo numeric := 0;
  v_sede integer;
  v_principal integer;
  v_fila record;
  v_lineas jsonb;
  v_entry integer;
  v_asientos integer[] := '{}';
  v_memo text;
  v_n integer;
  v_referencias integer := 0;
  v_largo integer;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.fn_tiene_permiso(p_organization_id, 'finance.create') then
    raise exception 'SIN_PERMISO: crear cuentas requiere el permiso finance.create' using errcode = '42501';
  end if;

  -- Una sola alta por organización a la vez: el siguiente código libre no se repite.
  perform pg_advisory_xact_lock(81405002, p_organization_id);

  -- Debajo de un grupo (2), una cuenta (4), una subcuenta (6), un auxiliar (8) o un
  -- subauxiliar (10, 12…). La hija mide dos dígitos más. Debajo de una clase no: los
  -- grupos del PUC son fijos.
  if v_codigo_padre is null or v_codigo_padre !~ '^[1-9][0-9]+$'
     or not (length(v_codigo_padre) in (2, 4, 6) or (length(v_codigo_padre) >= 8 and length(v_codigo_padre) % 2 = 0)) then
    raise exception 'PADRE_INVALIDO: % no admite cuentas debajo', coalesce(v_codigo_padre, '') using errcode = '22023';
  end if;
  v_largo := length(v_codigo_padre) + 2;

  select * into v_padre
    from public.chart_of_accounts c
   where c.organization_id = p_organization_id
     and c.account_code = v_codigo_padre
     for update;
  if not found or v_padre.is_active is false then
    raise exception 'PADRE_INVALIDO: la cuenta % no existe o está inactiva', v_codigo_padre using errcode = '22023';
  end if;

  if v_nombre is null then
    raise exception 'NOMBRE_REQUERIDO' using errcode = '22023';
  end if;
  if length(v_nombre) > 200 then
    raise exception 'NOMBRE_LARGO' using errcode = '22023';
  end if;

  select v_codigo_padre || lpad(i::text, 2, '0') into v_libre
    from generate_series(1, 99) as i
   where not exists (
     select 1 from public.chart_of_accounts c
      where c.organization_id = p_organization_id
        and c.account_code = v_codigo_padre || lpad(i::text, 2, '0')
   )
   -- Cuentas y subcuentas del PUC van de 5 en 5 (05, 10, 15…); auxiliares y
   -- subauxiliares, de 1 en 1. Si los múltiplos de 5 se agotan, cualquier libre.
   order by case when v_largo in (4, 6) and i % 5 <> 0 then 1 else 0 end, i
   limit 1;

  if v_codigo is null then
    v_codigo := v_libre;
  end if;
  if v_codigo is null then
    raise exception 'SIN_CODIGO_LIBRE: la cuenta % no tiene códigos libres', v_codigo_padre using errcode = '22023';
  end if;
  if v_codigo !~ '^[0-9]+$' or length(v_codigo) <> v_largo
     or left(v_codigo, length(v_codigo_padre)) <> v_codigo_padre or right(v_codigo, 2) = '00' then
    raise exception 'CODIGO_INVALIDO: son % dígitos, empieza por % y no termina en 00', v_largo, v_codigo_padre using errcode = '22023';
  end if;
  if exists (
    select 1 from public.chart_of_accounts c
     where c.organization_id = p_organization_id and c.account_code = v_codigo
  ) then
    raise exception 'CODIGO_OCUPADO: %', coalesce(v_libre, '') using errcode = '23505';
  end if;

  -- La naturaleza no llega del cliente: se hereda del padre.
  v_naturaleza := coalesce(
    v_padre.naturaleza,
    case when left(v_codigo, 1) in ('1', '5', '6', '7', '8') then 'debito' else 'credito' end
  );

  v_era_movimiento := v_padre.es_movimiento is true;

  if v_era_movimiento then
    select round(coalesce(sum(coalesce(l.debit, 0) - coalesce(l.credit, 0)), 0), 2) into v_saldo
      from public.journal_lines l
      join public.journal_entries e on e.id = l.journal_entry_id
     where e.organization_id = p_organization_id
       and e.posted is true
       and l.account_code = v_codigo_padre;

    if abs(v_saldo) >= 0.01 and not coalesce(p_trasladar_saldo, false) then
      raise exception 'PADRE_CON_SALDO: %', v_saldo using errcode = '22023';
    end if;
  end if;

  -- Sin padre al insertar: así la subcuenta sigue siendo de movimiento mientras
  -- se traslada su saldo. El padre se enlaza al final.
  insert into public.chart_of_accounts (
    organization_id, account_code, name, type, parent_code, is_active,
    naturaleza, es_movimiento,
    requiere_tercero, requiere_centro_costo, centro_costo_modo,
    presentacion_niif, concepto_exogena, created_by
  ) values (
    p_organization_id, v_codigo, v_nombre, v_padre.type, null, true,
    v_naturaleza, true,
    v_padre.requiere_tercero, v_padre.requiere_centro_costo, v_padre.centro_costo_modo,
    v_padre.presentacion_niif, v_padre.concepto_exogena, v_uid
  );

  if v_era_movimiento and abs(v_saldo) >= 0.01 then
    select b.id into v_principal
      from public.branches b
     where b.organization_id = p_organization_id
     order by b.is_main desc nulls last, b.id
     limit 1;

    v_memo := 'Reclasificación de saldo de ' || v_codigo_padre || ' a ' || v_codigo
      || coalesce('. ' || v_nota, '');

    -- Un asiento por sede. Cada línea conserva tercero y centro de costo.
    for v_sede in
      select distinct coalesce(b.id, v_principal)
        from public.journal_lines l
        join public.journal_entries e on e.id = l.journal_entry_id
        left join public.branches b on b.id = e.branch_id and b.organization_id = p_organization_id
       where e.organization_id = p_organization_id
         and e.posted is true
         and l.account_code = v_codigo_padre
    loop
      v_lineas := '[]'::jsonb;
      for v_fila in
        select l.cost_center_id, l.tercero_nit, l.tercero_nombre,
               round(sum(coalesce(l.debit, 0) - coalesce(l.credit, 0)), 2) as neto
          from public.journal_lines l
          join public.journal_entries e on e.id = l.journal_entry_id
          left join public.branches b on b.id = e.branch_id and b.organization_id = p_organization_id
         where e.organization_id = p_organization_id
           and e.posted is true
           and l.account_code = v_codigo_padre
           and coalesce(b.id, v_principal) = v_sede
         group by l.cost_center_id, l.tercero_nit, l.tercero_nombre
        having abs(round(sum(coalesce(l.debit, 0) - coalesce(l.credit, 0)), 2)) >= 0.01
      loop
        v_lineas := v_lineas || jsonb_build_array(
          jsonb_build_object(
            'account_code', v_codigo,
            'description', 'Traslado de ' || v_codigo_padre,
            'debit', greatest(v_fila.neto, 0),
            'credit', greatest(-v_fila.neto, 0),
            'cost_center_id', v_fila.cost_center_id,
            'tercero_nit', v_fila.tercero_nit,
            'tercero_nombre', v_fila.tercero_nombre
          ),
          jsonb_build_object(
            'account_code', v_codigo_padre,
            'description', 'Traslado a ' || v_codigo,
            'debit', greatest(-v_fila.neto, 0),
            'credit', greatest(v_fila.neto, 0),
            'cost_center_id', v_fila.cost_center_id,
            'tercero_nit', v_fila.tercero_nit,
            'tercero_nombre', v_fila.tercero_nombre
          )
        );
      end loop;

      if jsonb_array_length(v_lineas) >= 2 then
        -- Directo, no por fn_asiento_manual_crear: esa función rechaza la subcuenta en
        -- cuanto existe un auxiliar activo, y este asiento necesita las dos cuentas.
        -- La publicación sí pasa por fn_asiento_manual_publicar: periodo, tercero y consecutivo.
        insert into public.journal_entries (
          organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by, fact_key
        ) values (
          p_organization_id, v_sede, now(), v_memo, 'manual', null, false, v_uid,
          'manual:plan:' || v_codigo || ':' || v_sede
        ) returning id into v_entry;

        insert into public.journal_lines (
          journal_entry_id, account_code, description, debit, credit, organization_id,
          exchange_rate, debit_base, credit_base, cost_center_id, tercero_nit, tercero_nombre
        )
        select v_entry, l->>'account_code', l->>'description',
               (l->>'debit')::numeric, (l->>'credit')::numeric, p_organization_id,
               1, (l->>'debit')::numeric, (l->>'credit')::numeric,
               nullif(l->>'cost_center_id', '')::uuid,
               nullif(btrim(l->>'tercero_nit'), ''),
               nullif(btrim(l->>'tercero_nombre'), '')
          from jsonb_array_elements(v_lineas) l;

        perform public.fn_asiento_manual_publicar(v_entry);
        v_asientos := v_asientos || v_entry;
      end if;
    end loop;
  end if;

  -- Si era de movimiento, lo que apuntaba al padre pasa a la cuenta nueva.
  -- Solo mira hacia adelante: no toca ningún asiento ya publicado.
  -- configuracion_contable la mueve trg_chart_cuenta_titulo_configurada.
  if v_era_movimiento then
    update public.bank_accounts set account_code = v_codigo
     where organization_id = p_organization_id and account_code = v_codigo_padre;
    get diagnostics v_n = row_count; v_referencias := v_referencias + v_n;

    update public.accounting_rules
       set debit_account_code = case when debit_account_code = v_codigo_padre then v_codigo else debit_account_code end,
           credit_account_code = case when credit_account_code = v_codigo_padre then v_codigo else credit_account_code end,
           tax_account_code = case when tax_account_code = v_codigo_padre then v_codigo else tax_account_code end,
           discount_account_code = case when discount_account_code = v_codigo_padre then v_codigo else discount_account_code end
     where organization_id = p_organization_id
       and v_codigo_padre in (debit_account_code, credit_account_code, tax_account_code, discount_account_code);
    get diagnostics v_n = row_count; v_referencias := v_referencias + v_n;

    update public.branch_account_mappings
       set legacy_code = coalesce(legacy_code, sub_account_code), sub_account_code = v_codigo
     where organization_id = p_organization_id and sub_account_code = v_codigo_padre;
    get diagnostics v_n = row_count; v_referencias := v_referencias + v_n;

    update public.tax_account_mapping set account_code = v_codigo
     where organization_id = p_organization_id and account_code = v_codigo_padre;
    get diagnostics v_n = row_count; v_referencias := v_referencias + v_n;

    update public.categorias_tesoreria set cuenta_sugerida = v_codigo
     where organization_id = p_organization_id and cuenta_sugerida = v_codigo_padre;
    get diagnostics v_n = row_count; v_referencias := v_referencias + v_n;

    update public.categories
       set cuenta_ingreso = case when cuenta_ingreso = v_codigo_padre then v_codigo else cuenta_ingreso end,
           cuenta_costo = case when cuenta_costo = v_codigo_padre then v_codigo else cuenta_costo end,
           cuenta_inventario = case when cuenta_inventario = v_codigo_padre then v_codigo else cuenta_inventario end,
           cuenta_devolucion = case when cuenta_devolucion = v_codigo_padre then v_codigo else cuenta_devolucion end
     where organization_id = p_organization_id
       and v_codigo_padre in (cuenta_ingreso, cuenta_costo, cuenta_inventario, cuenta_devolucion);
    get diagnostics v_n = row_count; v_referencias := v_referencias + v_n;

    update public.products
       set cuenta_ingreso = case when cuenta_ingreso = v_codigo_padre then v_codigo else cuenta_ingreso end,
           cuenta_costo = case when cuenta_costo = v_codigo_padre then v_codigo else cuenta_costo end,
           cuenta_inventario = case when cuenta_inventario = v_codigo_padre then v_codigo else cuenta_inventario end,
           cuenta_devolucion = case when cuenta_devolucion = v_codigo_padre then v_codigo else cuenta_devolucion end
     where organization_id = p_organization_id
       and v_codigo_padre in (cuenta_ingreso, cuenta_costo, cuenta_inventario, cuenta_devolucion);
    get diagnostics v_n = row_count; v_referencias := v_referencias + v_n;
  end if;

  update public.chart_of_accounts
     set parent_code = v_codigo_padre, updated_at = now()
   where organization_id = p_organization_id and account_code = v_codigo;

  if v_era_movimiento then
    update public.chart_of_accounts
       set es_movimiento = false, updated_at = now()
     where organization_id = p_organization_id and account_code = v_codigo_padre;
  end if;

  return jsonb_build_object(
    'account_code', v_codigo,
    'parent_code', v_codigo_padre,
    'padre_paso_a_titulo', v_era_movimiento,
    'saldo_trasladado', case when v_era_movimiento then v_saldo else 0 end,
    'asientos', to_jsonb(v_asientos),
    'referencias_actualizadas', v_referencias
  );
end;
$function$;

revoke execute on function public.fn_plan_crear_cuenta_hija(integer, text, text, text, boolean, text) from public, anon;
grant execute on function public.fn_plan_crear_cuenta_hija(integer, text, text, text, boolean, text) to authenticated, service_role;

drop table if exists public.plan_cuentas_sucesoras;
