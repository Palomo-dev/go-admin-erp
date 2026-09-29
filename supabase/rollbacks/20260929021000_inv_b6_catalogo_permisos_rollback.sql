-- Reversión de 20260929021000_inv_b6_catalogo_permisos.sql.
--
-- Devuelve `mover_categorias`, `eliminar_categoria`, `etiquetas_producto_eliminar`
-- y `etiquetas_producto_fusionar` a la versión que solo comprobaba la
-- pertenencia (cuerpos idénticos salvo esa línea), y retira el disparador de
-- nombres únicos y `fn_etiqueta_guardar`. No toca datos: las etiquetas creadas
-- mientras rigió el disparador se quedan como están.

drop trigger if exists trg_product_tags_nombre_unico on public.product_tags;
drop function if exists public.fn_product_tags_nombre_unico();
drop function if exists public.fn_etiqueta_guardar(integer, integer, text, text);

create or replace function public.mover_categorias(p_org integer, p_ids integer[], p_padre integer)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ids integer[];
  v_encontradas integer;
  v_orden_base integer;
  v_movidas integer;
begin
  perform public.fn_assert_acceso_org(p_org);

  select array_agg(distinct x) into v_ids from unnest(coalesce(p_ids, '{}')) as x where x is not null;
  if v_ids is null or cardinality(v_ids) = 0 then
    return 0;
  end if;

  -- Todas las categorías deben ser de la organización. Se bloquean para que
  -- dos movimientos simultáneos no se crucen.
  perform 1 from public.categories c where c.id = any (v_ids) and c.organization_id = p_org for update;
  select count(*) into v_encontradas from public.categories c where c.id = any (v_ids) and c.organization_id = p_org;
  if v_encontradas <> cardinality(v_ids) then
    raise exception 'Alguna categoría no existe o es de otra organización'
      using errcode = '42501', hint = 'CATEGORIA_NO_ENCONTRADA';
  end if;

  if p_padre is not null then
    if p_padre = any (v_ids) then
      raise exception 'No puedes mover una categoría dentro de sí misma'
        using errcode = '23514', hint = 'CATEGORIA_CICLO';
    end if;

    if not exists (select 1 from public.categories c where c.id = p_padre and c.organization_id = p_org) then
      raise exception 'La categoría padre no existe o es de otra organización'
        using errcode = '23514', hint = 'CATEGORIA_PADRE_INVALIDA';
    end if;

    -- El nuevo padre no puede ser descendiente de ninguna de las que se mueven.
    if exists (
      with recursive ancestros as (
        select c.id, c.parent_id, 1 as profundidad from public.categories c where c.id = p_padre
        union all
        select c.id, c.parent_id, a.profundidad + 1
        from public.categories c join ancestros a on c.id = a.parent_id
        where a.profundidad < 100
      )
      select 1 from ancestros where id = any (v_ids)
    ) then
      raise exception 'No puedes mover una categoría dentro de una de sus subcategorías'
        using errcode = '23514', hint = 'CATEGORIA_CICLO';
    end if;
  end if;

  -- Al final de las nuevas hermanas, conservando el orden relativo que traían.
  select coalesce(max(c.display_order), 0) into v_orden_base
  from public.categories c
  where c.organization_id = p_org
    and c.parent_id is not distinct from p_padre
    and not (c.id = any (v_ids));

  with ordenadas as (
    select c.id, row_number() over (order by c.display_order nulls last, c.rank, c.name) as n
    from public.categories c
    where c.id = any (v_ids)
  )
  update public.categories c
  set parent_id = p_padre,
      display_order = v_orden_base + o.n,
      rank = v_orden_base + o.n,
      updated_at = now()
  from ordenadas o
  where c.id = o.id;

  get diagnostics v_movidas = row_count;
  return v_movidas;
end;
$function$;

create or replace function public.eliminar_categoria(p_org integer, p_id integer, p_destino integer default null::integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_padre integer;
  v_productos integer;
  v_movidos integer := 0;
  v_subcategorias integer := 0;
begin
  perform public.fn_assert_acceso_org(p_org);

  select c.parent_id into v_padre
  from public.categories c
  where c.id = p_id and c.organization_id = p_org
  for update;

  if not found then
    raise exception 'La categoría no existe o es de otra organización'
      using errcode = '42501', hint = 'CATEGORIA_NO_ENCONTRADA';
  end if;

  select count(*) into v_productos
  from public.products p
  where p.organization_id = p_org
    and p.category_id = p_id
    and coalesce(p.status, '') <> 'deleted';

  if v_productos > 0 then
    if p_destino is null then
      raise exception 'La categoría tiene % productos: elige a qué categoría pasan antes de eliminarla', v_productos
        using errcode = 'P0001', hint = 'CATEGORIA_CON_PRODUCTOS';
    end if;
    if p_destino = p_id or not exists (
      select 1 from public.categories c where c.id = p_destino and c.organization_id = p_org
    ) then
      raise exception 'La categoría de destino no es válida'
        using errcode = '23514', hint = 'CATEGORIA_DESTINO_INVALIDO';
    end if;
  end if;

  if p_destino is not null and p_destino <> p_id and exists (
    select 1 from public.categories c where c.id = p_destino and c.organization_id = p_org
  ) then
    update public.products p
    set category_id = p_destino, updated_at = now()
    where p.organization_id = p_org and p.category_id = p_id;
    get diagnostics v_movidos = row_count;
  end if;

  -- Las subcategorías suben un nivel (al padre de la eliminada, o a la raíz).
  update public.categories c
  set parent_id = v_padre, updated_at = now()
  where c.organization_id = p_org and c.parent_id = p_id;
  get diagnostics v_subcategorias = row_count;

  delete from public.categories c where c.id = p_id and c.organization_id = p_org;

  return jsonb_build_object('productos_movidos', v_movidos, 'subcategorias_movidas', v_subcategorias);
end;
$function$;

create or replace function public.etiquetas_producto_eliminar(p_org integer, p_ids integer[])
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ids integer[];
  v_n integer;
begin
  perform public.fn_assert_acceso_org(p_org);

  select array_agg(t.id) into v_ids
  from public.product_tags t
  where t.organization_id = p_org and t.id = any(coalesce(p_ids, '{}'));

  if v_ids is null then
    return 0;
  end if;

  if exists (
    select 1 from public.category_rules cr
    where cr.organization_id = p_org
      and cr.field = 'tag'
      and (cr.value = any(v_ids::text[]) or coalesce(cr.value_array, '{}') && v_ids::text[])
  ) then
    raise exception 'etiqueta_en_reglas: hay reglas de categoría que usan alguna de estas etiquetas' using errcode = 'P0001';
  end if;

  update public.products p
  set tag_id = null, updated_at = now()
  where p.organization_id = p_org and p.tag_id = any(v_ids);

  delete from public.product_tags t
  where t.organization_id = p_org and t.id = any(v_ids);
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

create or replace function public.etiquetas_producto_fusionar(p_org integer, p_destino integer, p_origenes integer[])
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_origenes integer[];
  v_productos integer := 0;
  v_n integer;
begin
  perform public.fn_assert_acceso_org(p_org);

  if not exists (select 1 from public.product_tags t where t.id = p_destino and t.organization_id = p_org) then
    raise exception 'etiqueta_destino_invalida' using errcode = '22023';
  end if;

  select array_agg(t.id) into v_origenes
  from public.product_tags t
  where t.organization_id = p_org
    and t.id = any(coalesce(p_origenes, '{}'))
    and t.id <> p_destino;

  if v_origenes is null then
    return 0;
  end if;

  insert into public.product_tag_relations (product_id, tag_id)
  select distinct r.product_id, p_destino
  from public.product_tag_relations r
  where r.tag_id = any(v_origenes)
  on conflict (product_id, tag_id) do nothing;
  get diagnostics v_n = row_count;
  v_productos := v_productos + v_n;

  update public.products p
  set tag_id = p_destino, updated_at = now()
  where p.organization_id = p_org and p.tag_id = any(v_origenes);
  get diagnostics v_n = row_count;
  v_productos := v_productos + v_n;

  update public.category_rules cr
  set value = case when cr.value = any(v_origenes::text[]) then p_destino::text else cr.value end,
      value_array = (
        select coalesce(array_agg(distinct case when v = any(v_origenes::text[]) then p_destino::text else v end), '{}')
        from unnest(coalesce(cr.value_array, '{}')) as v
      ),
      updated_at = now()
  where cr.organization_id = p_org
    and cr.field = 'tag'
    and (cr.value = any(v_origenes::text[]) or coalesce(cr.value_array, '{}') && v_origenes::text[]);

  delete from public.product_tags t
  where t.organization_id = p_org and t.id = any(v_origenes);

  return v_productos;
end;
$function$;


revoke all on function public.mover_categorias(integer, integer[], integer) from public, anon;
revoke all on function public.eliminar_categoria(integer, integer, integer) from public, anon;
revoke all on function public.etiquetas_producto_eliminar(integer, integer[]) from public, anon;
revoke all on function public.etiquetas_producto_fusionar(integer, integer, integer[]) from public, anon;
grant execute on function public.mover_categorias(integer, integer[], integer) to authenticated, service_role;
grant execute on function public.eliminar_categoria(integer, integer, integer) to authenticated, service_role;
grant execute on function public.etiquetas_producto_eliminar(integer, integer[]) to authenticated, service_role;
grant execute on function public.etiquetas_producto_fusionar(integer, integer, integer[]) to authenticated, service_role;
