-- Inventario B6a · Variantes: orden, activar/desactivar, eliminar sin uso,
-- completar el catálogo desde las variantes y usar los sugeridos (org 0).
--
-- Plan: docs/implementacion/INVENTARIO-PLAN.md §5.7 (B6a). Mismas reglas que
-- 20260929160200_inv_b6a_3_variantes_escritura.sql.

set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Orden, estado y borrado
-- ---------------------------------------------------------------------------

-- p_tipo NULL: ordena los tipos; si no, los valores de ese tipo. Los ids dados
-- quedan 0..n-1 y el resto detrás, conservando su orden relativo.
create or replace function public.fn_variantes_reordenar(p_org integer, p_tipo integer, p_ids integer[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['editar_catalogo']);
  perform pg_advisory_xact_lock(hashtext('variant_catalog'), p_org);
  if p_tipo is null then
    if exists (select 1 from unnest(coalesce(p_ids, '{}')) i
                where not exists (select 1 from public.variant_types t where t.id = i and t.organization_id = p_org)) then
      raise exception 'tipo_no_encontrado' using errcode = 'P0002';
    end if;
    with orden as (
      select t.id, row_number() over (
               order by coalesce(array_position(p_ids, t.id), 2147483647), t.display_order, t.id) - 1 as pos
        from public.variant_types t where t.organization_id = p_org)
    update public.variant_types t set display_order = o.pos from orden o
     where o.id = t.id and t.display_order is distinct from o.pos;
  else
    perform public.fn_variantes_int_tipo(p_org, p_tipo);
    if exists (select 1 from unnest(coalesce(p_ids, '{}')) i
                where not exists (select 1 from public.variant_values v where v.id = i and v.variant_type_id = p_tipo)) then
      raise exception 'valor_no_encontrado' using errcode = 'P0002';
    end if;
    with orden as (
      select v.id, row_number() over (
               order by coalesce(array_position(p_ids, v.id), 2147483647), v.display_order, v.id) - 1 as pos
        from public.variant_values v where v.variant_type_id = p_tipo)
    update public.variant_values v set display_order = o.pos from orden o
     where o.id = v.id and v.display_order is distinct from o.pos;
  end if;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Cambios en lote: p_cambios {"activo": bool} para tipos y valores,
-- {"estilo": "texto|color|imagen"} solo para tipos.
create or replace function public.fn_variantes_cambiar(p_org integer, p_tipos integer[], p_valores integer[], p_cambios jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer := 0;
  v_m integer := 0;
  v_activo boolean := (p_cambios ->> 'activo')::boolean;
  v_estilo text := nullif(p_cambios ->> 'estilo', '');
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['editar_catalogo']);
  if v_activo is null and v_estilo is null then
    raise exception 'sin_cambios' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_tipos), 0) > 0 then
    if exists (select 1 from unnest(p_tipos) i
                where not exists (select 1 from public.variant_types t where t.id = i and t.organization_id = p_org)) then
      raise exception 'tipo_no_encontrado' using errcode = 'P0002';
    end if;
    update public.variant_types
       set is_active = coalesce(v_activo, is_active), display_style = coalesce(v_estilo, display_style)
     where organization_id = p_org and id = any (p_tipos);
    get diagnostics v_n = row_count;
  end if;
  if coalesce(cardinality(p_valores), 0) > 0 and v_activo is not null then
    if exists (select 1 from unnest(p_valores) i
                where not exists (select 1 from public.variant_values v join public.variant_types t on t.id = v.variant_type_id
                                   where v.id = i and t.organization_id = p_org)) then
      raise exception 'valor_no_encontrado' using errcode = 'P0002';
    end if;
    update public.variant_values set is_active = v_activo where id = any (p_valores);
    get diagnostics v_m = row_count;
  end if;
  return v_n + v_m;
end;
$$;

-- Elimina tipos o valores SIN USO: ninguna variante (ni borrada) los tiene en
-- `variant_data` y ninguna relación por id. Si no, 23503 `en_uso` sin borrar nada.
create or replace function public.fn_variantes_eliminar(p_org integer, p_tipos integer[], p_valores integer[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer := 0;
  v_m integer := 0;
  v_id integer;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['eliminar']);
  perform pg_advisory_xact_lock(hashtext('variant_catalog'), p_org);
  foreach v_id in array coalesce(p_tipos, '{}') loop
    perform public.fn_variantes_int_tipo(p_org, v_id);
    if cardinality(public.fn_variantes_int_claves_de(p_org, v_id)) > 0
       or exists (select 1 from public.product_variant_relations r where r.variant_type_id = v_id) then
      raise exception 'en_uso' using errcode = '23503', hint = v_id::text,
        detail = 'El tipo lo usan variantes: desactívalo o fusiónalo.';
    end if;
  end loop;
  foreach v_id in array coalesce(p_valores, '{}') loop
    if not exists (select 1 from public.variant_values v join public.variant_types t on t.id = v.variant_type_id
                    where v.id = v_id and t.organization_id = p_org) then
      raise exception 'valor_no_encontrado' using errcode = 'P0002';
    end if;
    if cardinality(public.fn_variantes_int_valores_de(p_org, (select variant_type_id from public.variant_values where id = v_id), v_id)) > 0
       or exists (select 1 from public.product_variant_relations r where r.variant_value_id = v_id) then
      raise exception 'en_uso' using errcode = '23503', hint = v_id::text,
        detail = 'El valor lo usan variantes: desactívalo o fusiónalo.';
    end if;
  end loop;
  if coalesce(cardinality(p_valores), 0) > 0 then
    delete from public.variant_values where id = any (p_valores);
    get diagnostics v_m = row_count;
  end if;
  if coalesce(cardinality(p_tipos), 0) > 0 then
    delete from public.variant_types where organization_id = p_org and id = any (p_tipos);
    get diagnostics v_n = row_count;
  end if;
  return v_n + v_m;
end;
$$;

-- ---------------------------------------------------------------------------
-- Completar el catálogo
-- ---------------------------------------------------------------------------

-- Agrega al catálogo los atributos que ya usan las variantes y no están (con
-- `fn_producto_int_asegurar_atributos`, la misma función del guardado del
-- producto). Devuelve cuántos tipos y valores se crearon.
create or replace function public.fn_variantes_completar_catalogo(p_org integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tipos_antes integer;
  v_valores_antes integer;
  v_par record;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['editar_catalogo']);
  perform pg_advisory_xact_lock(hashtext('variant_catalog'), p_org);
  select count(*) into v_tipos_antes from public.variant_types where organization_id = p_org;
  select count(*) into v_valores_antes from public.variant_values v join public.variant_types t on t.id = v.variant_type_id where t.organization_id = p_org;
  for v_par in select distinct btrim(f.clave) as clave, f.valor from public.fn_variantes_int_filas(p_org, false) f loop
    perform public.fn_producto_int_asegurar_atributos(p_org, jsonb_build_object(v_par.clave, v_par.valor));
  end loop;
  return jsonb_build_object(
    'tipos', (select count(*) from public.variant_types where organization_id = p_org) - v_tipos_antes,
    'valores', (select count(*) from public.variant_values v join public.variant_types t on t.id = v.variant_type_id where t.organization_id = p_org) - v_valores_antes);
end;
$$;

-- Copia a la organización tipos del catálogo global sugerido (org 0) con sus
-- valores; si ya existe uno igual sin mayúsculas, solo agrega los valores que falten.
create or replace function public.fn_variantes_usar_sugeridos(p_org integer, p_tipos integer[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_g record;
  v_n integer := 0;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['editar_catalogo']);
  if p_org = 0 then
    raise exception 'org_global' using errcode = '42501';
  end if;
  for v_g in select g.id, g.name from public.variant_types g
              where g.organization_id = 0 and (p_tipos is null or g.id = any (p_tipos)) order by g.id loop
    perform public.fn_producto_int_asegurar_atributos(p_org, jsonb_build_object(v_g.name, gv.value))
       from public.variant_values gv where gv.variant_type_id = v_g.id;
    v_n := v_n + 1;
  end loop;
  -- Los valores copiados conservan el orden del catálogo global.
  update public.variant_values v
     set display_order = gv.display_order
    from public.variant_types t, public.variant_types g, public.variant_values gv
   where t.id = v.variant_type_id and t.organization_id = p_org
     and g.organization_id = 0 and (p_tipos is null or g.id = any (p_tipos))
     and lower(btrim(g.name)) = lower(btrim(t.name))
     and gv.variant_type_id = g.id and lower(btrim(gv.value)) = lower(btrim(v.value))
     and v.display_order is distinct from gv.display_order;
  return v_n;
end;
$$;

-- Permisos de ejecución
revoke all on function public.fn_variantes_reordenar(integer, integer, integer[]) from public, anon;
revoke all on function public.fn_variantes_cambiar(integer, integer[], integer[], jsonb) from public, anon;
revoke all on function public.fn_variantes_eliminar(integer, integer[], integer[]) from public, anon;
revoke all on function public.fn_variantes_completar_catalogo(integer) from public, anon;
revoke all on function public.fn_variantes_usar_sugeridos(integer, integer[]) from public, anon;
grant execute on function public.fn_variantes_reordenar(integer, integer, integer[]) to authenticated;
grant execute on function public.fn_variantes_cambiar(integer, integer[], integer[], jsonb) to authenticated;
grant execute on function public.fn_variantes_eliminar(integer, integer[], integer[]) to authenticated;
grant execute on function public.fn_variantes_completar_catalogo(integer) to authenticated;
grant execute on function public.fn_variantes_usar_sugeridos(integer, integer[]) to authenticated;

-- `crear_tipo_variante` escribía en la org 0 sin comprobar pertenencia. Ya no
-- tenía EXECUTE para authenticated (revocado antes); se asegura aquí también
-- para public y anon, por si una recreación lo reabre.
revoke all on function public.crear_tipo_variante(text, integer, text[]) from public, anon, authenticated;
