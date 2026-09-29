-- Inventario B6a · Unidades y conversiones: RPC de la pantalla «Unidades y
-- conversiones» (Figma `593:333686`): resumen con uso y avisos, alta/edición/
-- baja de unidades propias (con su unidad DIAN para la factura electrónica),
-- alta/edición/baja de conversiones de la organización o de un producto (con
-- la inversa en la misma transacción; no se borra una conversión que una
-- receta activa necesita) y `fn_unidad_convertir` para la interfaz.
--
-- Usa la regla única `fn_unidad_factor` de 20260929161100. El código de una
-- unidad propia lleva hasta 3 caracteres: `unit_conversions.from_unit_code` y
-- `to_unit_code` son character(3). (Aplicada en dos pasos: el segundo,
-- `…_ajuste`, bajó el máximo de 4 a 3.) Todas las públicas
-- son SECURITY DEFINER con `fn_inventario_exigir_permiso` (ver,
-- editar_catalogo o eliminar; valida antes la pertenencia) y sin EXECUTE
-- para anon/public.

set local lock_timeout = '5s';

-- Ingredientes de las recetas activas de la organización con sus unidades y el
-- factor que usaría el resolutor (misma regla: unidad de la línea, o la del
-- producto, o UN).
create or replace function public.fn_unidades_int_ingredientes(p_org integer)
returns table (recipe_id integer, ingredient_product_id integer, unidad_receta text, unidad_ingrediente text, sin_unidad boolean, factor numeric)
language sql
stable
set search_path = public, pg_temp
as $$
  select r.id, ri.ingredient_product_id,
         upper(btrim(coalesce(nullif(btrim(ri.unit_code), ''), p.unit_code, 'UN'))),
         upper(btrim(coalesce(p.unit_code, 'UN'))),
         p.unit_code is null,
         public.fn_unidad_factor(p_org,
           upper(btrim(coalesce(nullif(btrim(ri.unit_code), ''), p.unit_code, 'UN'))),
           upper(btrim(coalesce(p.unit_code, 'UN'))),
           ri.ingredient_product_id)
    from public.product_recipes r
    join public.recipe_ingredients ri on ri.recipe_id = r.id
    join public.products p on p.id = ri.ingredient_product_id
   where r.organization_id = p_org and r.is_active;
$$;
revoke all on function public.fn_unidades_int_ingredientes(integer) from public, anon, authenticated;

create or replace function public.fn_unidades_resumen(p_org integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_out jsonb;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['ver']);

  with u as (
    select upper(btrim(x.code)) as c, x.name, x.unit_type, x.organization_id, x.is_active, x.dian_unit_measure_id
      from public.units x
     where x.organization_id is null or x.organization_id = p_org
  ),
  prod as (
    select upper(btrim(p.unit_code)) as c, count(*) as n
      from public.products p
     where p.organization_id = p_org and p.status is distinct from 'deleted' and p.unit_code is not null
     group by 1
  ),
  conv as (
    select uc.id, upper(btrim(uc.from_unit_code)) as de, upper(btrim(uc.to_unit_code)) as a, uc.factor,
           uc.organization_id, uc.product_id
      from public.unit_conversions uc
     where (uc.organization_id is null or uc.organization_id = p_org)
  ),
  ing as (
    select * from public.fn_unidades_int_ingredientes(p_org)
  ),
  uso_conv as (
    select c.id, count(i.*) as n
      from conv c
      join ing i on i.unidad_receta <> i.unidad_ingrediente
               and ((c.de = i.unidad_receta and c.a = i.unidad_ingrediente) or (c.a = i.unidad_receta and c.de = i.unidad_ingrediente))
               and (c.product_id is null or c.product_id = i.ingredient_product_id)
     group by c.id
  )
  select jsonb_build_object(
    'unidades', coalesce((
      select jsonb_agg(jsonb_build_object(
               'codigo', u.c,
               'nombre', u.name,
               'tipo', u.unit_type,
               'ambito', case when u.organization_id is null then 'sistema' else 'organizacion' end,
               'activo', u.is_active,
               'dian_id', u.dian_unit_measure_id,
               'dian_codigo', d.code,
               'dian_nombre', d.name,
               'productos', coalesce(pr.n, 0),
               'recetas', (select count(*) from ing i where i.unidad_receta = u.c or i.unidad_ingrediente = u.c),
               'conversiones', (select count(*) from conv c where c.de = u.c or c.a = u.c))
             order by (u.organization_id is null) desc, u.c)
        from u
        left join public.dian_unit_measures d on d.id = u.dian_unit_measure_id
        left join prod pr on pr.c = u.c), '[]'::jsonb),
    'conversiones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id,
               'de', c.de,
               'a', c.a,
               'factor', c.factor,
               'nombre_de', ud.name,
               'nombre_a', ua.name,
               'tipo_de', ud.unit_type,
               'tipo_a', ua.unit_type,
               'ambito', case when c.product_id is not null then 'producto' when c.organization_id is null then 'sistema' else 'organizacion' end,
               'producto', case when c.product_id is not null then (
                   select jsonb_build_object('id', p.id, 'nombre', p.name, 'sku', p.sku) from public.products p where p.id = c.product_id) end,
               'inversa_id', (select i2.id from conv i2
                               where i2.de = c.a and i2.a = c.de
                                 and i2.organization_id is not distinct from c.organization_id
                                 and i2.product_id is not distinct from c.product_id
                               order by i2.id limit 1),
               'recetas', coalesce(uc.n, 0),
               'revisar', c.product_id is null and ud.unit_type = 'count' and ua.unit_type = 'count'
                          and not (c.de in ('PR') or c.a in ('PR')) )
             order by case when c.product_id is not null then 2 when c.organization_id is null then 0 else 1 end, c.de, c.a, c.id)
        from conv c
        left join u ud on ud.c = c.de
        left join u ua on ua.c = c.a
        left join uso_conv uc on uc.id = c.id), '[]'::jsonb),
    'kpis', jsonb_build_object(
      'unidades_en_uso', (select count(*) from u where exists (select 1 from prod pr where pr.c = u.c)
                                                    or exists (select 1 from ing i where i.unidad_receta = u.c or i.unidad_ingrediente = u.c)),
      'unidades_disponibles', (select count(*) from u where u.is_active),
      'productos_sin_unidad', (select count(*) from public.products p
                                where p.organization_id = p_org and p.status is distinct from 'deleted' and p.unit_code is null),
      'unidades_sin_conversion', coalesce((select jsonb_agg(u.c order by u.c) from u
                                            where not exists (select 1 from conv c where c.de = u.c or c.a = u.c)), '[]'::jsonb),
      'recetas_mezcladas', (select count(distinct i.recipe_id) from ing i where i.unidad_receta <> i.unidad_ingrediente),
      'recetas_mezcladas_sin_conversion', (select count(distinct i.recipe_id) from ing i where i.factor is null),
      'ingredientes_sin_conversion', (select count(*) from ing i where i.factor is null),
      'conversiones_usadas', (select count(*) from uso_conv),
      'conversiones_revisar', (select count(*) from conv c join u ud on ud.c = c.de join u ua on ua.c = c.a
                                where c.product_id is null and ud.unit_type = 'count' and ua.unit_type = 'count'
                                  and c.de <> 'PR' and c.a <> 'PR')),
    'dian', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'codigo', d.code, 'nombre', d.name) order by d.id)
                        from public.dian_unit_measures d), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;

-- Crea (p_codigo NULL) o edita una unidad PROPIA. p_datos: codigo, nombre, tipo, dian_id, activo.
create or replace function public.fn_unidad_guardar(p_org integer, p_codigo text, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_codigo text := upper(btrim(coalesce(case when p_codigo is null then p_datos ->> 'codigo' else p_codigo end, '')));
  v_nombre text := btrim(regexp_replace(coalesce(p_datos ->> 'nombre', ''), '\s+', ' ', 'g'));
  v_tipo text := nullif(p_datos ->> 'tipo', '');
  v_dian integer := nullif(p_datos ->> 'dian_id', '')::integer;
  v_u public.units;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['editar_catalogo']);
  if v_nombre = '' then
    raise exception 'nombre_requerido' using errcode = '23502';
  end if;
  if length(v_nombre) > 40 then
    raise exception 'nombre_largo' using errcode = '22001';
  end if;
  if v_tipo is null or v_tipo not in ('weight', 'volume', 'count', 'length', 'area') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if v_dian is not null and not exists (select 1 from public.dian_unit_measures where id = v_dian) then
    raise exception 'dian_invalida' using errcode = '22023';
  end if;

  if p_codigo is null then
    if v_codigo !~ '^[A-Z0-9]{1,3}$' then
      raise exception 'codigo_invalido' using errcode = '22023', detail = 'De 1 a 3 letras o números (así cabe en las conversiones).';
    end if;
    if exists (select 1 from public.units where upper(btrim(code)) = v_codigo) then
      raise exception 'codigo_en_uso' using errcode = '23505', detail = 'Ese código ya existe (del sistema o de otra organización).';
    end if;
    insert into public.units (code, name, unit_type, conversion_factor, organization_id, dian_unit_measure_id, is_active)
    values (v_codigo, v_nombre, v_tipo, 1, p_org, v_dian, coalesce((p_datos ->> 'activo')::boolean, true));
    return jsonb_build_object('codigo', v_codigo);
  end if;

  select * into v_u from public.units where upper(btrim(code)) = v_codigo for update;
  if v_u.code is null or (v_u.organization_id is not null and v_u.organization_id <> p_org) then
    raise exception 'unidad_no_encontrada' using errcode = 'P0002';
  end if;
  if v_u.organization_id is null then
    raise exception 'unidad_del_sistema' using errcode = '42501', detail = 'Las unidades del sistema son de solo lectura.';
  end if;
  if v_u.unit_type is distinct from v_tipo and exists (
       select 1 from public.unit_conversions uc
        join public.units o on upper(btrim(o.code)) = case when upper(btrim(uc.from_unit_code)) = v_codigo
                                                           then upper(btrim(uc.to_unit_code)) else upper(btrim(uc.from_unit_code)) end
        where (upper(btrim(uc.from_unit_code)) = v_codigo or upper(btrim(uc.to_unit_code)) = v_codigo)
          and uc.product_id is null and o.unit_type is distinct from v_tipo) then
    raise exception 'tipo_con_conversiones' using errcode = '23514',
      detail = 'Tiene conversiones con unidades de otro tipo: cámbialas o elimínalas primero.';
  end if;
  update public.units
     set name = v_nombre, unit_type = v_tipo, dian_unit_measure_id = v_dian,
         is_active = coalesce((p_datos ->> 'activo')::boolean, is_active), updated_at = now()
   where code = v_u.code;
  return jsonb_build_object('codigo', v_codigo);
end;
$$;

-- Elimina unidades PROPIAS sin uso (productos, recetas, consumos de producción,
-- precio por unidad de referencia). Sus conversiones de la organización se van con ella.
create or replace function public.fn_unidades_eliminar(p_org integer, p_codigos text[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c text;
  v_u public.units;
  v_n integer := 0;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['eliminar']);
  foreach v_c in array coalesce(p_codigos, '{}') loop
    select * into v_u from public.units where upper(btrim(code)) = upper(btrim(v_c)) for update;
    if v_u.code is null or (v_u.organization_id is not null and v_u.organization_id <> p_org) then
      raise exception 'unidad_no_encontrada' using errcode = 'P0002';
    end if;
    if v_u.organization_id is null then
      raise exception 'unidad_del_sistema' using errcode = '42501';
    end if;
    if exists (select 1 from public.products p where p.unit_code = v_u.code or p.price_ref_unit_code = v_u.code)
       or exists (select 1 from public.recipe_ingredients ri where ri.unit_code = v_u.code)
       or exists (select 1 from public.product_recipes r where r.yield_unit_code = v_u.code)
       or exists (select 1 from public.production_order_consumptions c where c.unit_code = v_u.code) then
      raise exception 'en_uso' using errcode = '23503', hint = btrim(v_u.code),
        detail = 'La unidad la usan productos, recetas o producciones.';
    end if;
    delete from public.unit_conversions
     where organization_id = p_org and (from_unit_code = v_u.code or to_unit_code = v_u.code);
    delete from public.units where code = v_u.code;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Crea (p_id NULL) o edita el factor de una conversión de la organización o de
-- un producto. p_datos: de, a, factor, producto_id (NULL = toda la
-- organización), inversa (crea o actualiza también la inversa, 1 / factor).
create or replace function public.fn_conversion_guardar(p_org integer, p_id integer, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c public.unit_conversions;
  v_de text;
  v_a text;
  v_factor numeric := nullif(p_datos ->> 'factor', '')::numeric;
  v_producto integer;
  v_inversa boolean := coalesce((p_datos ->> 'inversa')::boolean, false);
  v_id integer;
  v_inv integer;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['editar_catalogo']);
  if v_factor is null or v_factor <= 0 then
    raise exception 'factor_invalido' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtext('unit_conversions'), p_org);

  if p_id is not null then
    select * into v_c from public.unit_conversions where id = p_id for update;
    if v_c.id is null or (v_c.organization_id is not null and v_c.organization_id <> p_org) then
      raise exception 'conversion_no_encontrada' using errcode = 'P0002';
    end if;
    if v_c.organization_id is null then
      raise exception 'conversion_del_sistema' using errcode = '42501', detail = 'Las conversiones del sistema son de solo lectura.';
    end if;
    v_de := upper(btrim(v_c.from_unit_code));
    v_a := upper(btrim(v_c.to_unit_code));
    v_producto := v_c.product_id;
    update public.unit_conversions set factor = v_factor where id = p_id;
    v_id := p_id;
  else
    v_de := upper(btrim(coalesce(p_datos ->> 'de', '')));
    v_a := upper(btrim(coalesce(p_datos ->> 'a', '')));
    v_producto := nullif(p_datos ->> 'producto_id', '')::integer;
    if v_producto is not null and not exists (select 1 from public.products where id = v_producto and organization_id = p_org) then
      raise exception 'producto_ajeno' using errcode = '42501';
    end if;
    select id into v_id from public.unit_conversions
     where organization_id = p_org and product_id is not distinct from v_producto
       and upper(btrim(from_unit_code)) = v_de and upper(btrim(to_unit_code)) = v_a;
    if v_id is not null then
      raise exception 'conversion_repetida' using errcode = '23505', hint = v_id::text,
        detail = 'Ya existe esa conversión con el mismo alcance: edita su factor.';
    end if;
    insert into public.unit_conversions (from_unit_code, to_unit_code, factor, organization_id, product_id)
    values (v_de, v_a, v_factor, p_org, v_producto)
    returning id into v_id;
  end if;

  if v_inversa then
    select id into v_inv from public.unit_conversions
     where organization_id = p_org and product_id is not distinct from v_producto
       and upper(btrim(from_unit_code)) = v_a and upper(btrim(to_unit_code)) = v_de
     for update;
    if v_inv is null then
      insert into public.unit_conversions (from_unit_code, to_unit_code, factor, organization_id, product_id)
      values (v_a, v_de, 1 / v_factor, p_org, v_producto)
      returning id into v_inv;
    else
      update public.unit_conversions set factor = 1 / v_factor where id = v_inv;
    end if;
  end if;
  return jsonb_build_object('id', v_id, 'inversa_id', v_inv);
end;
$$;

-- Elimina conversiones de la organización o de productos (no las del sistema).
-- Si con eso alguna línea de una receta activa se queda sin conversión, no
-- borra nada: 23503 `conversion_en_uso` con el número de líneas en `hint`.
create or replace function public.fn_conversiones_eliminar(p_org integer, p_ids integer[], p_con_inversa boolean default false)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids integer[];
  v_antes integer;
  v_despues integer;
  v_n integer;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['eliminar']);
  perform pg_advisory_xact_lock(hashtext('unit_conversions'), p_org);
  select array_agg(distinct x) into v_ids from unnest(coalesce(p_ids, '{}')) x where x is not null;
  if v_ids is null then
    return 0;
  end if;
  if exists (select 1 from unnest(v_ids) i
              where not exists (select 1 from public.unit_conversions uc where uc.id = i and uc.organization_id = p_org)) then
    if exists (select 1 from public.unit_conversions uc where uc.id = any (v_ids) and uc.organization_id is null) then
      raise exception 'conversion_del_sistema' using errcode = '42501';
    end if;
    raise exception 'conversion_no_encontrada' using errcode = 'P0002';
  end if;
  if p_con_inversa then
    v_ids := v_ids || coalesce((
      select array_agg(inv.id)
        from public.unit_conversions c
        join public.unit_conversions inv
          on inv.organization_id = c.organization_id
         and inv.product_id is not distinct from c.product_id
         and upper(btrim(inv.from_unit_code)) = upper(btrim(c.to_unit_code))
         and upper(btrim(inv.to_unit_code)) = upper(btrim(c.from_unit_code))
       where c.id = any (v_ids)), '{}');
  end if;
  select count(*) into v_antes from public.fn_unidades_int_ingredientes(p_org) where factor is null;
  delete from public.unit_conversions where id = any (v_ids) and organization_id = p_org;
  get diagnostics v_n = row_count;
  select count(*) into v_despues from public.fn_unidades_int_ingredientes(p_org) where factor is null;
  if v_despues > v_antes then
    raise exception 'conversion_en_uso' using errcode = '23503', hint = (v_despues - v_antes)::text,
      detail = 'Una receta activa la necesita para convertir su consumo.';
  end if;
  return v_n;
end;
$$;

-- Convierte una cantidad con la regla única (NULL si no hay conversión).
create or replace function public.fn_unidad_convertir(p_org integer, p_cantidad numeric, p_de text, p_a text, p_producto integer default null)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_assert_acceso_org(p_org);
  if p_producto is not null and not exists (select 1 from public.products where id = p_producto and organization_id = p_org) then
    raise exception 'producto_ajeno' using errcode = '42501';
  end if;
  return p_cantidad * public.fn_unidad_factor(p_org, p_de, p_a, p_producto);
end;
$$;

revoke all on function public.fn_unidades_resumen(integer) from public, anon;
revoke all on function public.fn_unidad_guardar(integer, text, jsonb) from public, anon;
revoke all on function public.fn_unidades_eliminar(integer, text[]) from public, anon;
revoke all on function public.fn_conversion_guardar(integer, integer, jsonb) from public, anon;
revoke all on function public.fn_conversiones_eliminar(integer, integer[], boolean) from public, anon;
revoke all on function public.fn_unidad_convertir(integer, numeric, text, text, integer) from public, anon;
grant execute on function public.fn_unidades_resumen(integer) to authenticated;
grant execute on function public.fn_unidad_guardar(integer, text, jsonb) to authenticated;
grant execute on function public.fn_unidades_eliminar(integer, text[]) to authenticated;
grant execute on function public.fn_conversion_guardar(integer, integer, jsonb) to authenticated;
grant execute on function public.fn_conversiones_eliminar(integer, integer[], boolean) to authenticated;
grant execute on function public.fn_unidad_convertir(integer, numeric, text, text, integer) to authenticated;
