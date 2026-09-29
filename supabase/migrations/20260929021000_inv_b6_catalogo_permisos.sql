-- Inventario B6b · Permisos en el servidor para categorías y etiquetas de producto,
-- y nombres de etiqueta únicos sin distinguir mayúsculas.
--
-- Plan: docs/implementacion/INVENTARIO-PLAN.md §5.7 (B6b).
--
-- Hasta hoy `mover_categorias`, `eliminar_categoria`, `etiquetas_producto_eliminar`
-- y `etiquetas_producto_fusionar` solo comprobaban la pertenencia
-- (`fn_assert_acceso_org`): cualquier miembro activo, aunque fuera un cajero,
-- movía o borraba categorías y fusionaba etiquetas. Ahora exigen el mismo
-- permiso de catálogo que el producto (`fn_productos_exigir_permiso`: dueño,
-- `inventory.edit`/`inventory.delete`, `product_management` o
-- `inventory_management`), que ya incluye la comprobación de pertenencia.
-- Los cuerpos son los vigentes, sin más cambio que esa primera línea.
--
-- Etiquetas: el UNIQUE `(organization_id, name)` distingue mayúsculas, así que
-- «Oferta» y «oferta» convivían (hoy hay 4 grupos, 10 filas). No se crea un
-- índice único sobre `lower(name)` porque fallaría con esos datos y fusionarlos
-- es decisión de cada organización (la pantalla los marca como «Nombres
-- repetidos» con «Fusionar»). Un disparador impide crear NUEVOS repetidos:
-- responde 23505 como el UNIQUE, que es lo que ya entienden el alta desde el
-- producto (`DialogoNuevaEtiqueta`) y la importación.
-- `fn_etiqueta_guardar` crea o renombra una etiqueta con permiso en el servidor.

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
  perform public.fn_productos_exigir_permiso(p_org, array['inventory.edit', 'product_management', 'inventory_management']);

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
  perform public.fn_productos_exigir_permiso(p_org, array['inventory.delete', 'product_management', 'inventory_management']);

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
  perform public.fn_productos_exigir_permiso(p_org, array['inventory.delete', 'product_management', 'inventory_management']);

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
  perform public.fn_productos_exigir_permiso(p_org, array['inventory.edit', 'product_management', 'inventory_management']);

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

-- ── Nombre de etiqueta único sin distinguir mayúsculas (hacia adelante) ─────

create or replace function public.fn_product_tags_nombre_unico()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- Un repetido que ya existía puede cambiar de color sin chocar consigo mismo.
  if tg_op = 'UPDATE' and lower(new.name) = lower(old.name) and new.organization_id = old.organization_id then
    return new;
  end if;
  if exists (
    select 1 from public.product_tags t
    where t.organization_id = new.organization_id
      and lower(t.name) = lower(new.name)
      and t.id is distinct from new.id
  ) then
    raise exception 'Ya existe una etiqueta con ese nombre'
      using errcode = '23505', hint = 'ETIQUETA_REPETIDA';
  end if;
  return new;
end;
$function$;

revoke all on function public.fn_product_tags_nombre_unico() from public, anon, authenticated;

drop trigger if exists trg_product_tags_nombre_unico on public.product_tags;
create trigger trg_product_tags_nombre_unico
  before insert or update of name, organization_id on public.product_tags
  for each row execute function public.fn_product_tags_nombre_unico();

-- ── Crear o renombrar una etiqueta ─────────────────────────────────────────

create or replace function public.fn_etiqueta_guardar(p_org integer, p_id integer, p_nombre text, p_color text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_nombre text := left(btrim(coalesce(p_nombre, '')), 60);
  v_color text := coalesce(nullif(btrim(coalesce(p_color, '')), ''), '#3B82F6');
  v_fila public.product_tags%rowtype;
begin
  if p_id is null then
    perform public.fn_productos_exigir_permiso(p_org, array['inventory.create', 'product_management', 'inventory_management']);
  else
    perform public.fn_productos_exigir_permiso(p_org, array['inventory.edit', 'product_management', 'inventory_management']);
  end if;

  if v_nombre = '' then
    raise exception 'El nombre de la etiqueta es obligatorio'
      using errcode = '23502', hint = 'ETIQUETA_NOMBRE';
  end if;
  if v_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Color no válido'
      using errcode = '22023', hint = 'ETIQUETA_COLOR';
  end if;

  if p_id is null then
    insert into public.product_tags (organization_id, name, color)
    values (p_org, v_nombre, v_color)
    returning * into v_fila;
  else
    update public.product_tags t
    set name = v_nombre, color = v_color
    where t.id = p_id and t.organization_id = p_org
    returning * into v_fila;
    if not found then
      raise exception 'La etiqueta no existe o es de otra organización'
        using errcode = 'P0002', hint = 'ETIQUETA_NO_ENCONTRADA';
    end if;
  end if;

  return jsonb_build_object('id', v_fila.id, 'name', v_fila.name, 'color', v_fila.color, 'created_at', v_fila.created_at);
end;
$function$;

revoke all on function public.mover_categorias(integer, integer[], integer) from public, anon;
revoke all on function public.eliminar_categoria(integer, integer, integer) from public, anon;
revoke all on function public.etiquetas_producto_eliminar(integer, integer[]) from public, anon;
revoke all on function public.etiquetas_producto_fusionar(integer, integer, integer[]) from public, anon;
revoke all on function public.fn_etiqueta_guardar(integer, integer, text, text) from public, anon;

grant execute on function public.mover_categorias(integer, integer[], integer) to authenticated, service_role;
grant execute on function public.eliminar_categoria(integer, integer, integer) to authenticated, service_role;
grant execute on function public.etiquetas_producto_eliminar(integer, integer[]) to authenticated, service_role;
grant execute on function public.etiquetas_producto_fusionar(integer, integer, integer[]) to authenticated, service_role;
grant execute on function public.fn_etiqueta_guardar(integer, integer, text, text) to authenticated, service_role;
