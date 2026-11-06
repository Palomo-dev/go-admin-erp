-- Cuentas automáticas: la compra muestra el auxiliar que el motor va a usar, aunque aún no exista.
--
-- Corrige 20261107151000_cuenta_efectiva. Al probarla sobre las 33 organizaciones se vio que la
-- pantalla decía una cuenta y la primera compra usaría otra:
--   * fn_auto_journal_purchase toma el auxiliar de fn_asegurar_auxiliar_1435, que solo acepta un
--     mapeo 143501xx. 26 organizaciones tienen 1435 > 14350501 y 3 no tienen mapeo de 1435: en las 29
--     la primera compra crea 143501xx y cambia el mapeo de la sede.
--   * fn_inventario_auxiliar_1435, que usaba la lectura, sí acepta 14350501.
-- fn_auxiliar_1435_previsto calcula lo mismo que fn_asegurar_auxiliar_1435 sin crear nada. Es una
-- corrección de lectura: el motor no cambia, ni los asientos, ni el plan de cuentas.

-- La lectura de fn_asegurar_auxiliar_1435: el auxiliar de la sede, o el que crearía.
create or replace function public.fn_auxiliar_1435_previsto(p_org integer, p_branch integer)
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_codigo text;
  v_sufijo text;
  v_rn integer;
begin
  if p_org is null or p_branch is null then
    return null;
  end if;
  if not exists (
    select 1 from public.branches b
     where b.id = p_branch and b.organization_id = p_org
  ) then
    return null;
  end if;

  select m.sub_account_code into v_codigo
    from public.branch_account_mappings m
   where m.organization_id = p_org
     and m.branch_id = p_branch
     and m.base_account_code in ('1435', '1405')
     and m.sub_account_code ~ '^143501[0-9]{2}$'
     and exists (
       select 1 from public.chart_of_accounts c
        where c.organization_id = p_org and c.account_code = m.sub_account_code
     )
   order by case when m.base_account_code = '1435' then 0 else 1 end
   limit 1;
  if v_codigo is not null then
    return v_codigo;
  end if;

  select o.rn into v_rn
    from (
      select b.id, row_number() over (order by b.is_main desc nulls last, b.id) as rn
        from public.branches b
       where b.organization_id = p_org
    ) o
   where o.id = p_branch;

  select lpad(n::text, 2, '0') into v_sufijo
    from generate_series(1, 99) as n
   where not exists (
     select 1
       from public.branch_account_mappings m
      where m.organization_id = p_org
        and m.branch_id <> p_branch
        and m.sub_account_code = '143501' || lpad(n::text, 2, '0')
   )
   order by case when n = coalesce(v_rn, 1) then 0 else 1 end, n
   limit 1;
  if v_sufijo is null then
    return null;
  end if;
  return '143501' || v_sufijo;
end;
$function$;

create or replace function public.fn_cuenta_efectiva_defecto(
  p_organization_id integer,
  p_branch_id integer,
  p_documento text,
  p_rol text,
  p_por_lineas boolean,
  out cuenta text,
  out origen text,
  out clave text,
  out fallo text
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_base text;
  v_source text;
  v_lado text;
  v_clave_rol text;
  v_clave_efectiva text;
  v_config text;
  v_config_sede integer;
  v_aux text;
  v_mapeo boolean := false;
begin
  origen := 'ninguno';

  if p_rol = 'ingreso' then
    select r.credit_account_code into v_base from public.fn_regla_devengo_venta(p_organization_id) r;
    v_source := 'invoice_sales';
    v_lado := 'credito';
    v_clave_rol := 'ventas_productos';
  elsif p_rol = 'devolucion' then
    -- Igual que fn_nc_asiento_devolucion: primero la clave y después la regla.
    select nullif(btrim(c.account_code), ''), c.branch_id into v_config, v_config_sede
      from public.configuracion_contable c
     where c.organization_id = p_organization_id
       and c.clave = 'devoluciones'
       and (c.branch_id = p_branch_id or c.branch_id is null)
     order by c.branch_id nulls last
     limit 1;
    select r.debit_account_code into v_base
      from public.accounting_rules r
     where r.organization_id = p_organization_id
       and r.source_type = 'sale_credit_note'
       and r.event_type = 'created'
       and r.is_active
     order by r.priority
     limit 1;
    v_base := coalesce(v_config, v_base);
    v_source := 'invoice_sales';
    v_lado := 'debito';
    v_clave_rol := 'devoluciones';
  elsif p_rol = 'costo' and p_documento = 'catalogo' then
    -- Costo de lo vendido: fn_auto_journal_stock_movement, evento de venta.
    select s.debito into v_base from public.fn_cuentas_movimiento_stock(p_organization_id, 'sale', 'out') s;
    v_source := 'stock_movements';
    v_lado := 'debito';
    v_clave_rol := 'costo_ventas';
  else
    select r.debit_account_code into v_base from public.fn_regla_devengo_compra(p_organization_id) r;
    v_source := 'invoice_purchase';
    v_lado := 'debito';
    v_clave_rol := 'inventario';
  end if;

  v_clave_efectiva := coalesce(public.fn_clave_cuenta_configurable(v_source, v_lado, v_base), v_clave_rol);
  clave := v_clave_efectiva;

  if v_base is null then
    fallo := 'No hay regla contable activa para este documento';
    return;
  end if;

  select r.cuenta, r.fallo into cuenta, fallo
    from public.fn_resolver_cuenta_configurada(p_organization_id, p_branch_id, v_source, v_lado, v_base) r;

  if fallo is null then
    -- Lo que dice la fila de configuración que se aplicó, si hubo una.
    if v_config is null and public.fn_clave_cuenta_configurable(v_source, v_lado, v_base) is not null then
      select c.account_code, c.branch_id into v_config, v_config_sede
        from public.configuracion_contable c
       where c.organization_id = p_organization_id
         and c.clave = v_clave_efectiva
         and (c.branch_id = p_branch_id or c.branch_id is null)
       order by c.branch_id nulls last
       limit 1;
    end if;

    if v_source = 'invoice_purchase' and not p_por_lineas then
      -- fn_auto_journal_purchase: el débito de inventario o de la clase 6 va al auxiliar de la sede.
      v_base := public.fn_cuenta_lectura_asiento(p_organization_id, p_branch_id, v_base, true);
      v_aux := public.fn_auxiliar_1435_previsto(p_organization_id, p_branch_id);
      if v_aux is not null and (v_base is null or v_base like '1405%' or v_base like '1435%' or left(v_base, 1) = '6') then
        v_mapeo := true;
        cuenta := v_aux;
      else
        cuenta := v_base;
      end if;
    else
      v_aux := cuenta;
      cuenta := public.fn_cuenta_lectura_asiento(p_organization_id, p_branch_id, cuenta, p_por_lineas);
      v_mapeo := cuenta is distinct from v_aux and p_branch_id is not null and exists (
        select 1 from public.branch_account_mappings m
         where m.organization_id = p_organization_id
           and m.branch_id = p_branch_id
           and m.sub_account_code = cuenta
      );
      -- Por líneas, el motor crea lo que falte (fn_puc_cuenta_para_asiento) y asienta en el auxiliar nuevo.
      if p_por_lineas and not exists (
        select 1 from public.chart_of_accounts c
         where c.organization_id = p_organization_id and c.account_code = cuenta
      ) then
        cuenta := case
          when length(public.fn_puc_codigo_normalizado(cuenta)) = 4 then cuenta || '0501'
          when length(public.fn_puc_codigo_normalizado(cuenta)) > 2 then cuenta || '01'
          else cuenta
        end;
      end if;
    end if;
  end if;

  origen := case
    when v_config is not null and v_config_sede is not null then 'sede'
    when v_mapeo then 'sede'
    when v_config is not null then 'empresa'
    -- La cuenta no es de ninguna regla: fn_regla_devengo_* ya la cambió por la configuración o el sector.
    when not exists (
      select 1 from public.accounting_rules r
       where r.organization_id = p_organization_id
         and cuenta in (r.debit_account_code, r.credit_account_code)
    ) and exists (
      select 1 from public.configuracion_contable c
       where c.organization_id = p_organization_id
         and c.branch_id is null
         and c.clave = v_clave_rol
         and c.account_code = cuenta
    ) then 'empresa'
    when not exists (
      select 1 from public.accounting_rules r
       where r.organization_id = p_organization_id
         and cuenta in (r.debit_account_code, r.credit_account_code)
    ) and exists (
      select 1
        from public.organizations o
        cross join lateral public.fn_propuesta_configuracion_sector(o.type_id) s
       where o.id = p_organization_id
         and s.clave = v_clave_rol
         and s.account_code = cuenta
    ) then 'sector'
    else 'regla'
  end;
end;
$function$;

create or replace function public.fn_cuenta_efectiva_resolver(
  p_organization_id integer,
  p_branch_id integer,
  p_documento text,
  p_rol text,
  p_product_id integer,
  p_category_id integer,
  p_cuenta_linea text,
  p_por_lineas boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_linea text := nullif(btrim(p_cuenta_linea), '');
  v_producto record;
  v_categoria_id integer;
  v_categoria_nombre text;
  v_propia text;
  v_cat record;
  v_elegida text;
  v_cuenta text;
  v_origen text;
  v_estado text;
  v_clave text;
  v_fallo text;
  v_invalida text;
  v_nombre text;
  v_categoria_origen text;
  v_prevista boolean := false;
begin
  select p.id, p.category_id, p.cuenta_ingreso, p.cuenta_costo, p.cuenta_inventario, p.cuenta_devolucion
    into v_producto
    from public.products p
   where p.id = p_product_id and p.organization_id = p_organization_id;
  if v_producto.id is not null then
    v_categoria_id := v_producto.category_id;
    v_propia := public.fn_cuenta_de_rol(p_rol, v_producto.cuenta_ingreso, v_producto.cuenta_costo,
                                        v_producto.cuenta_inventario, v_producto.cuenta_devolucion);
  else
    v_categoria_id := p_category_id;
  end if;

  select c.id, c.name into v_categoria_id, v_categoria_nombre
    from public.categories c
   where c.id = v_categoria_id and c.organization_id = p_organization_id;

  select h.cuenta, h.category_id into v_cat
    from public.fn_cuenta_categoria_heredada(p_organization_id, v_categoria_id, p_rol) h;

  v_elegida := coalesce(v_linea, v_propia, v_cat.cuenta);
  if v_producto.id is not null then
    -- La misma función que usa el motor. El origen de arriba solo explica de dónde salió.
    v_elegida := public.fn_cuenta_catalogo_linea(p_organization_id, v_producto.id, p_rol, v_linea);
  end if;

  if v_elegida is not null then
    v_origen := case
      when v_linea is not null then 'linea'
      when v_propia is not null then 'producto'
      else 'categoria'
    end;
    v_estado := case when v_origen = 'categoria' then 'categoria' else 'propia' end;
    if v_origen = 'categoria' then
      select c.name into v_categoria_origen
        from public.categories c
       where c.id = v_cat.category_id and c.organization_id = p_organization_id;
    end if;
    v_cuenta := public.fn_cuenta_lectura_asiento(p_organization_id, p_branch_id, v_elegida, true);
  else
    select d.cuenta, d.origen, d.clave, d.fallo into v_cuenta, v_origen, v_clave, v_fallo
      from public.fn_cuenta_efectiva_defecto(p_organization_id, p_branch_id, p_documento, p_rol, p_por_lineas) d;
    v_estado := 'automatica';
    -- La crea el motor al confirmar. Sin esto, una cuenta que aún no existe se vería como un error.
    v_prevista := v_cuenta is not null
      and not exists (
        select 1 from public.chart_of_accounts c
         where c.organization_id = p_organization_id and c.account_code = v_cuenta
      )
      and (p_por_lineas or (p_rol in ('inventario', 'costo') and v_cuenta ~ '^143501[0-9]{2}$'));
  end if;

  if not v_prevista then
    v_invalida := public.fn_validar_cuenta_movimiento(p_organization_id, coalesce(v_elegida, v_cuenta));
  end if;
  if v_fallo is not null and v_invalida is null then
    v_invalida := v_fallo;
  end if;
  if v_cuenta is null then
    v_estado := 'sin_cuenta';
    v_invalida := coalesce(v_fallo, 'Elige una cuenta de movimiento');
  elsif v_invalida is not null then
    v_estado := case
      when exists (
        select 1 from public.chart_of_accounts c
         where c.organization_id = p_organization_id and c.account_code = coalesce(v_elegida, v_cuenta)
      ) then 'titulo'
      else 'sin_cuenta'
    end;
  end if;

  select c.name into v_nombre
    from public.chart_of_accounts c
   where c.organization_id = p_organization_id and c.account_code = v_cuenta;
  if v_prevista and v_cuenta ~ '^143501[0-9]{2}$' then
    select 'Inventario ' || coalesce(nullif(btrim(left(b.name, 70)), ''), v_cuenta) into v_nombre
      from public.branches b
     where b.id = p_branch_id and b.organization_id = p_organization_id;
  end if;

  return jsonb_build_object(
    'rol', p_rol,
    'cuenta', v_cuenta,
    'nombre', v_nombre,
    'origen', v_origen,
    'estado', v_estado,
    'clave_contable', v_clave,
    'configurada', coalesce(v_elegida, v_cuenta),
    'fallo', v_invalida,
    'asentable', v_prevista or (v_cuenta is not null and public.fn_validar_cuenta_movimiento(p_organization_id, v_cuenta) is null),
    'prevista', v_prevista,
    'categoria_id', v_categoria_id,
    'categoria_nombre', v_categoria_nombre,
    'categoria_origen', v_categoria_origen
  );
end;
$function$;

revoke all on function public.fn_auxiliar_1435_previsto(integer, integer) from public, anon, authenticated;
grant execute on function public.fn_auxiliar_1435_previsto(integer, integer) to service_role;
