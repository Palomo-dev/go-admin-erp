-- Cuentas automáticas (2 de 2): mostrar la cuenta que usará el asiento, sin duplicar el motor.
--
-- fn_cuentas_efectivas responde, por línea, producto o categoría: código, nombre, origen y estado.
-- Solo lee. El motor no cambia: fn_armar_asiento_documento, fn_auto_journal_sale y
-- fn_auto_journal_purchase siguen igual. supabase/tests/contador/cuentas_automaticas.sql compara
-- esta respuesta contra el asiento real.
--
-- Por qué no se llama directo a fn_cuenta_movimiento_o_detalle ni a fn_cuenta_configurada_de_sede:
-- las dos pueden crear cuentas (fn_puc_cuenta_para_asiento, fn_asegurar_auxiliar_1435). Una consulta
-- de pantalla no puede dejar rastro en el plan de cuentas. fn_cuenta_lectura_asiento repite solo la
-- parte que lee.
--
-- Lo que el motor hace hoy y esta respuesta refleja, sin corregirlo:
--   * Sin cuenta propia, la venta toma la regla. La clave de configuración solo se consulta si el
--     código de la regla es uno de los que reconoce fn_clave_cuenta_configurable.
--   * Un producto tipo servicio no se distingue: el rol es 'ingreso', sin mirar product_type.
--   * El asiento va por líneas si alguna línea tiene cuenta propia, y entero si ninguna la tiene.

-- La cuenta que recibirá el movimiento, sin crear nada.
-- p_por_lineas true sigue a fn_cuenta_movimiento_o_detalle; false, a fn_cuenta_configurada_de_sede.
create or replace function public.fn_cuenta_lectura_asiento(
  p_organization_id integer,
  p_branch_id integer,
  p_cuenta text,
  p_por_lineas boolean
)
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v text := nullif(btrim(p_cuenta), '');
  v_sub text;
  v_base text;
begin
  if v is null then
    return null;
  end if;

  if not p_por_lineas then
    if p_branch_id is not null then
      select m.sub_account_code into v_sub
        from public.branch_account_mappings m
        join public.chart_of_accounts c
          on c.organization_id = m.organization_id
         and c.account_code = m.sub_account_code
         and c.es_movimiento is distinct from false
       where m.organization_id = p_organization_id
         and m.branch_id = p_branch_id
         and m.base_account_code = v
       limit 1;
      if v_sub is not null then
        v := v_sub;
      end if;
    end if;
    if v in ('1405', '1435') or v like '1405%' or v ~ '^143501[0-9]{2}$' or v ~ '^143505' then
      v_sub := public.fn_inventario_auxiliar_1435(p_organization_id, p_branch_id);
      if v_sub is not null then
        v := v_sub;
      end if;
    end if;
    return v;
  end if;

  if public.fn_validar_cuenta_movimiento(p_organization_id, v) is null then
    return v;
  end if;

  v_base := public.fn_puc_codigo_normalizado(v);
  if v_base = '1405' or v like '1405%' then
    v_sub := public.fn_inventario_auxiliar_1435(p_organization_id, p_branch_id);
    if v_sub is not null and public.fn_validar_cuenta_movimiento(p_organization_id, v_sub) is null then
      return v_sub;
    end if;
  end if;

  select c.account_code into v_sub
    from public.chart_of_accounts c
   where c.organization_id = p_organization_id
     and c.account_code like v_base || '%'
     and c.account_code <> v_base
     and coalesce(c.is_active, true)
     and c.es_movimiento is distinct from false
     and not public.fn_es_cuenta_de_titulo(p_organization_id, c.account_code)
   order by length(c.account_code), c.account_code
   limit 1;
  return coalesce(v_sub, v);
end;
$function$;

-- Cuenta por defecto de un rol, cuando ni la línea ni el catálogo traen una.
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

    if p_rol in ('inventario', 'costo') and p_documento <> 'catalogo' and not p_por_lineas then
      -- fn_auto_journal_purchase: el débito de inventario o de la clase 6 va al auxiliar de la sede.
      v_base := public.fn_cuenta_lectura_asiento(p_organization_id, p_branch_id, v_base, true);
      v_aux := public.fn_inventario_auxiliar_1435(p_organization_id, p_branch_id);
      if v_aux is not null and (v_base is null or v_base like '1405%' or v_base like '1435%' or left(v_base, 1) = '6') then
        v_mapeo := exists (
          select 1 from public.branch_account_mappings m
           where m.organization_id = p_organization_id
             and m.branch_id = p_branch_id
             and m.sub_account_code = v_aux
        );
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

-- Una consulta. p_por_lineas lo decide quien conoce el documento completo.
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
  end if;

  v_invalida := public.fn_validar_cuenta_movimiento(p_organization_id, coalesce(v_elegida, v_cuenta));
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

  return jsonb_build_object(
    'rol', p_rol,
    'cuenta', v_cuenta,
    'nombre', v_nombre,
    'origen', v_origen,
    'estado', v_estado,
    'clave_contable', v_clave,
    'configurada', coalesce(v_elegida, v_cuenta),
    'fallo', v_invalida,
    'asentable', v_cuenta is not null and public.fn_validar_cuenta_movimiento(p_organization_id, v_cuenta) is null,
    'categoria_id', v_categoria_id,
    'categoria_nombre', v_categoria_nombre,
    'categoria_origen', v_categoria_origen
  );
end;
$function$;

-- RPC de pantalla. Cada consulta: {clave, product_id, category_id, cuenta_contable, rol}.
-- p_documento: venta, compra, documento_soporte, nota_credito o catalogo (exige rol por consulta).
create or replace function public.fn_cuentas_efectivas(
  p_organization_id integer,
  p_branch_id integer,
  p_documento text,
  p_consultas jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_branch integer := p_branch_id;
  v_consulta jsonb;
  v_rol text;
  v_producto integer;
  v_track boolean;
  v_por_lineas boolean := false;
  v_roles text[] := array[]::text[];
  v_i integer := 0;
  v_salida jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);
  if not (
    public.fn_tiene_permiso(p_organization_id, 'finance.view')
    or public.fn_tiene_permiso(p_organization_id, 'finance.create')
    or public.fn_tiene_permiso(p_organization_id, 'inventory.view')
    or public.fn_tiene_permiso(p_organization_id, 'inventory.edit')
    or public.fn_tiene_permiso(p_organization_id, 'inventory.create')
    or public.fn_tiene_permiso(p_organization_id, 'product_management')
    or public.fn_tiene_permiso(p_organization_id, 'inventory_management')
  ) then
    raise exception 'SIN_PERMISO: ver las cuentas contables' using errcode = '42501';
  end if;
  if p_documento is null or p_documento not in ('venta', 'compra', 'documento_soporte', 'nota_credito', 'catalogo') then
    raise exception 'DOCUMENTO_INVALIDO' using errcode = '22023';
  end if;
  if p_consultas is null or jsonb_typeof(p_consultas) <> 'array' or jsonb_array_length(p_consultas) > 500 then
    raise exception 'CONSULTAS_INVALIDAS' using errcode = '22023';
  end if;

  -- La misma sede que usará el asiento (fn_create_journal_entry): una ajena o vacía no se usa.
  if v_branch is null or v_branch = 0 or not exists (
    select 1 from public.branches b where b.id = v_branch and b.organization_id = p_organization_id
  ) then
    select b.id into v_branch
      from public.branches b
     where b.organization_id = p_organization_id and b.is_main = true and b.is_active = true
     limit 1;
    if v_branch is null then
      select min(b.id) into v_branch from public.branches b where b.organization_id = p_organization_id;
    end if;
  end if;

  for v_consulta in select e from jsonb_array_elements(p_consultas) e loop
    v_producto := nullif(v_consulta->>'product_id', '')::integer;
    if p_documento = 'catalogo' then
      v_rol := v_consulta->>'rol';
      if v_rol is null or v_rol not in ('ingreso', 'costo', 'inventario', 'devolucion') then
        raise exception 'ROL_INVALIDO' using errcode = '22023';
      end if;
    elsif p_documento = 'venta' then
      v_rol := 'ingreso';
    elsif p_documento = 'nota_credito' then
      v_rol := 'devolucion';
    else
      select coalesce(p.track_stock, false) into v_track
        from public.products p
       where p.id = v_producto and p.organization_id = p_organization_id;
      v_rol := case when coalesce(v_track, false) then 'inventario' else 'costo' end;
    end if;
    v_roles := v_roles || v_rol;
    -- fn_documento_tiene_cuenta_propia: una línea con cuenta manda el documento entero por líneas.
    if p_documento <> 'catalogo' and public.fn_cuenta_catalogo_linea(
      p_organization_id, v_producto, v_rol, coalesce(v_consulta->>'cuenta_contable', '')
    ) is not null then
      v_por_lineas := true;
    end if;
  end loop;

  for v_consulta in select e from jsonb_array_elements(p_consultas) e loop
    v_i := v_i + 1;
    v_salida := v_salida || jsonb_build_array(
      jsonb_build_object('clave', v_consulta->'clave')
      || public.fn_cuenta_efectiva_resolver(
           p_organization_id,
           v_branch,
           p_documento,
           v_roles[v_i],
           nullif(v_consulta->>'product_id', '')::integer,
           nullif(v_consulta->>'category_id', '')::integer,
           v_consulta->>'cuenta_contable',
           v_por_lineas
         )
    );
  end loop;
  return v_salida;
end;
$function$;

-- Decisión 3 del Contador: en una línea manual de compra, la cuenta usada antes con ese proveedor.
-- Es una sugerencia: esta función no escribe nada y quien la acepta es la persona.
-- Mira las últimas 10 compras confirmadas con líneas manuales con cuenta. Empate: la más reciente.
-- Fuera de la sugerencia:
--   * Organizaciones de transporte (type_id 6).
--   * Compras pagadas por pasarela y proveedores que son una pasarela (fn_metodo_es_pasarela).
--   * Cuentas de comisiones, manifiesto y compra de servicio: tienen su propio camino.
create or replace function public.fn_cuenta_sugerida_proveedor(
  p_organization_id integer,
  p_supplier_id integer
)
returns table (cuenta text, nombre text, veces integer, compras integer, ultima timestamptz)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);
  if not (
    public.fn_tiene_permiso(p_organization_id, 'finance.view')
    or public.fn_tiene_permiso(p_organization_id, 'finance.create')
  ) then
    raise exception 'SIN_PERMISO: ver las cuentas contables' using errcode = '42501';
  end if;

  if exists (select 1 from public.organizations o where o.id = p_organization_id and o.type_id = 6) then
    return;
  end if;
  if not exists (
    select 1 from public.suppliers s
     where s.id = p_supplier_id
       and s.organization_id = p_organization_id
       and not public.fn_metodo_es_pasarela(s.name)
       and not public.fn_metodo_es_pasarela(s.trade_name)
  ) then
    return;
  end if;

  return query
  with recientes as (
    select ip.id, coalesce(ip.issue_date, ip.created_at) as fecha
      from public.invoice_purchase ip
     where ip.organization_id = p_organization_id
       and ip.supplier_id = p_supplier_id
       and ip.status in ('received', 'partial', 'paid')
       and not public.fn_metodo_es_pasarela(ip.payment_method)
       and exists (
         select 1 from public.invoice_items ii
          where ii.invoice_purchase_id = ip.id
            and ii.product_id is null
            and nullif(btrim(ii.cuenta_contable), '') is not null
       )
     order by coalesce(ip.issue_date, ip.created_at) desc, ip.id
     limit 10
  ),
  usadas as (
    select distinct r.id, r.fecha, btrim(ii.cuenta_contable) as codigo
      from recientes r
      join public.invoice_items ii on ii.invoice_purchase_id = r.id
     where ii.product_id is null
       and nullif(btrim(ii.cuenta_contable), '') is not null
  ),
  conteo as (
    select u.codigo, count(*)::integer as veces, max(u.fecha) as ultima
      from usadas u
     where public.fn_validar_cuenta_movimiento(p_organization_id, u.codigo) is null
       and not exists (
         select 1 from public.configuracion_contable k
          where k.organization_id = p_organization_id
            and k.clave in ('comisiones', 'manifiesto_por_pagar', 'manifiesto_transporte', 'compra_servicio')
            and k.account_code = u.codigo
       )
     group by u.codigo
  )
  select c.codigo, a.name, c.veces, (select count(*)::integer from recientes), c.ultima
    from conteo c
    join public.chart_of_accounts a
      on a.organization_id = p_organization_id and a.account_code = c.codigo
   order by c.veces desc, c.ultima desc, c.codigo
   limit 1;
end;
$function$;

-- Cambia la cuenta de un solo rol. Lee y bloquea la fila, y deja que fn_cuentas_catalogo_guardar
-- valide y guarde: las otras tres cuentas no se pierden aunque dos personas guarden a la vez.
create or replace function public.fn_cuenta_catalogo_fijar(
  p_organization_id integer,
  p_tipo text,
  p_id integer,
  p_rol text,
  p_cuenta text
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ingreso text;
  v_costo text;
  v_inventario text;
  v_devolucion text;
begin
  if auth.uid() is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);
  if p_rol is null or p_rol not in ('ingreso', 'costo', 'inventario', 'devolucion') then
    raise exception 'ROL_INVALIDO' using errcode = '22023';
  end if;
  if p_tipo = 'producto' then
    select p.cuenta_ingreso, p.cuenta_costo, p.cuenta_inventario, p.cuenta_devolucion
      into v_ingreso, v_costo, v_inventario, v_devolucion
      from public.products p
     where p.id = p_id and p.organization_id = p_organization_id
       for update;
  elsif p_tipo = 'categoria' then
    select c.cuenta_ingreso, c.cuenta_costo, c.cuenta_inventario, c.cuenta_devolucion
      into v_ingreso, v_costo, v_inventario, v_devolucion
      from public.categories c
     where c.id = p_id and c.organization_id = p_organization_id
       for update;
  else
    raise exception 'TIPO_INVALIDO' using errcode = '22023';
  end if;
  if not found then
    raise exception 'NO_ENCONTRADO' using errcode = 'P0002';
  end if;

  perform public.fn_cuentas_catalogo_guardar(
    p_organization_id, p_tipo, p_id,
    case when p_rol = 'ingreso' then p_cuenta else v_ingreso end,
    case when p_rol = 'costo' then p_cuenta else v_costo end,
    case when p_rol = 'inventario' then p_cuenta else v_inventario end,
    case when p_rol = 'devolucion' then p_cuenta else v_devolucion end
  );
end;
$function$;

-- «Ver cuentas contables»: preferencia de cada persona, guardada en su perfil.
-- Sin definer: la protege profiles_update_own. El interruptor solo cambia lo que se ve.
create or replace function public.fn_preferencia_ver_cuentas()
returns boolean
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(
    (select (p.metadata->>'ver_cuentas_contables')::boolean from public.profiles p where p.id = auth.uid()),
    false
  );
$function$;

create or replace function public.fn_preferencia_ver_cuentas_guardar(p_valor boolean)
returns boolean
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  update public.profiles
     set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('ver_cuentas_contables', coalesce(p_valor, false))
   where id = auth.uid();
  if not found then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  return coalesce(p_valor, false);
end;
$function$;

revoke all on function public.fn_cuenta_lectura_asiento(integer, integer, text, boolean) from public, anon, authenticated;
revoke all on function public.fn_cuenta_efectiva_defecto(integer, integer, text, text, boolean) from public, anon, authenticated;
revoke all on function public.fn_cuenta_efectiva_resolver(integer, integer, text, text, integer, integer, text, boolean) from public, anon, authenticated;
grant execute on function public.fn_cuenta_lectura_asiento(integer, integer, text, boolean) to service_role;
grant execute on function public.fn_cuenta_efectiva_defecto(integer, integer, text, text, boolean) to service_role;
grant execute on function public.fn_cuenta_efectiva_resolver(integer, integer, text, text, integer, integer, text, boolean) to service_role;

revoke all on function public.fn_cuentas_efectivas(integer, integer, text, jsonb) from public, anon;
revoke all on function public.fn_cuenta_sugerida_proveedor(integer, integer) from public, anon;
revoke all on function public.fn_cuenta_catalogo_fijar(integer, text, integer, text, text) from public, anon;
revoke all on function public.fn_preferencia_ver_cuentas() from public, anon;
revoke all on function public.fn_preferencia_ver_cuentas_guardar(boolean) from public, anon;
grant execute on function public.fn_cuentas_efectivas(integer, integer, text, jsonb) to authenticated, service_role;
grant execute on function public.fn_cuenta_sugerida_proveedor(integer, integer) to authenticated, service_role;
grant execute on function public.fn_cuenta_catalogo_fijar(integer, text, integer, text, text) to authenticated, service_role;
grant execute on function public.fn_preferencia_ver_cuentas() to authenticated, service_role;
grant execute on function public.fn_preferencia_ver_cuentas_guardar(boolean) to authenticated, service_role;
