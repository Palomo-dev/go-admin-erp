-- Categorías: árbol sin ciclos y RPC del rediseño (listado, mover, eliminar,
-- conexiones).
--
-- Contexto (AUDITORIA-CATALOGO-PRODUCCION.md §2 y
-- AUDITORIA-CONTROLES-PROVEEDORES-CATEGORIAS.md §B, §E.2):
--
--   * Ciclos posibles. El selector de padre del formulario solo excluía la
--     propia categoría y el arrastre solo validaba las filas visibles de la
--     página. Nada en la BD impedía que A fuera hija de B y B hija de A, ni que
--     el padre fuera de otra organización. Hoy hay 0 ciclos y 0 padres de otra
--     organización (comprobado el 2026-09-23), así que el disparador se puede
--     crear sin limpiar nada.
--   * Conteos en el navegador. El árbol descargaba una fila por producto de la
--     organización solo para contar por categoría, e ignoraba los productos
--     asignados por regla (`product_category_relations`).
--   * Eliminar dejaba los productos sin categoría en silencio
--     (`products.category_id` es ON DELETE SET NULL) y mandaba las
--     subcategorías a la raíz en dos llamadas sueltas desde el navegador.
--
-- Qué añade (todo aditivo, sin columnas nuevas):
--   1. `fn_categories_sin_ciclos` + disparador BEFORE INSERT/UPDATE OF
--      parent_id: el padre existe, es de la misma organización, no es la
--      propia categoría ni una de sus descendientes. Cubre todas las vías
--      (formulario, alta rápida, importador, asistente, RPC).
--   2. `categorias_listado(p_org)`: categorías con conteos (principal, por
--      regla, subcategorías) y el resumen de los KPI, en una llamada.
--   3. `mover_categorias(p_org, p_ids, p_padre)`: mueve una o varias en una
--      transacción, las pone al final de sus nuevas hermanas y rechaza ciclos
--      con un mensaje legible.
--   4. `eliminar_categoria(p_org, p_id, p_destino)`: bloquea si tiene
--      productos y no se indica a qué categoría pasan; si se indica, los mueve,
--      sube las subcategorías al padre de la eliminada y borra, todo junto.
--   5. `categoria_conexiones(p_org, p_id)`: los conteos de «Cómo se conecta».
--
-- Todas son SECURITY DEFINER con `fn_assert_acceso_org` y sin EXECUTE para
-- anon ni public.

-- ─── 1. Árbol sin ciclos ─────────────────────────────────────────────────────

create or replace function public.fn_categories_sin_ciclos()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_org_padre integer;
  v_ciclo boolean;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Una categoría no puede ser su propia categoría padre'
      using errcode = '23514', hint = 'CATEGORIA_CICLO';
  end if;

  select c.organization_id into v_org_padre
  from public.categories c
  where c.id = new.parent_id;

  if not found then
    raise exception 'La categoría padre no existe'
      using errcode = '23503', hint = 'CATEGORIA_PADRE_INVALIDA';
  end if;

  if v_org_padre <> new.organization_id then
    raise exception 'La categoría padre es de otra organización'
      using errcode = '23514', hint = 'CATEGORIA_PADRE_INVALIDA';
  end if;

  -- Solo al actualizar puede haber descendientes: se sube desde el nuevo
  -- padre y, si aparece la propia categoría, el movimiento cerraría un ciclo.
  if tg_op = 'UPDATE' then
    with recursive ancestros as (
      select c.id, c.parent_id, 1 as profundidad
      from public.categories c
      where c.id = new.parent_id
      union all
      select c.id, c.parent_id, a.profundidad + 1
      from public.categories c
      join ancestros a on c.id = a.parent_id
      where a.profundidad < 100
    )
    select exists (select 1 from ancestros where id = new.id) into v_ciclo;

    if v_ciclo then
      raise exception 'No puedes mover una categoría dentro de una de sus subcategorías'
        using errcode = '23514', hint = 'CATEGORIA_CICLO';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_categories_sin_ciclos on public.categories;
create trigger trg_categories_sin_ciclos
  before insert or update of parent_id on public.categories
  for each row execute function public.fn_categories_sin_ciclos();

-- ─── 2. Listado con conteos ──────────────────────────────────────────────────

create or replace function public.categorias_listado(p_org integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_resultado jsonb;
begin
  perform public.fn_assert_acceso_org(p_org);

  with principales as (
    -- Productos visibles en el catálogo: sin borrar y sin contar variantes.
    select p.category_id, count(*)::integer as n
    from public.products p
    where p.organization_id = p_org
      and p.category_id is not null
      and p.parent_product_id is null
      and coalesce(p.status, '') <> 'deleted'
    group by p.category_id
  ),
  por_regla as (
    select r.category_id, count(distinct r.product_id)::integer as n
    from public.product_category_relations r
    join public.products p on p.id = r.product_id
    where r.organization_id = p_org
      and r.assigned_by_rule
      and coalesce(p.status, '') <> 'deleted'
      and p.category_id is distinct from r.category_id
    group by r.category_id
  ),
  hijas as (
    select c.parent_id, count(*)::integer as n
    from public.categories c
    where c.organization_id = p_org and c.parent_id is not null
    group by c.parent_id
  )
  select jsonb_build_object(
    'categorias', coalesce((
      select jsonb_agg(
        to_jsonb(c)
        || jsonb_build_object(
          'productos', coalesce(pr.n, 0),
          'productos_regla', coalesce(rg.n, 0),
          'hijas', coalesce(h.n, 0)
        )
        order by c.display_order nulls last, c.rank, c.name
      )
      from public.categories c
      left join principales pr on pr.category_id = c.id
      left join por_regla rg on rg.category_id = c.id
      left join hijas h on h.parent_id = c.id
      where c.organization_id = p_org
    ), '[]'::jsonb),
    'resumen', (
      select jsonb_build_object(
        'productos_total', count(*),
        'productos_sin_categoria', count(*) filter (where p.category_id is null)
      )
      from public.products p
      where p.organization_id = p_org
        and p.parent_product_id is null
        and coalesce(p.status, '') <> 'deleted'
    )
  ) into v_resultado;

  return v_resultado;
end;
$$;

-- ─── 3. Mover una o varias categorías ────────────────────────────────────────

create or replace function public.mover_categorias(p_org integer, p_ids integer[], p_padre integer)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
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
$$;

-- ─── 4. Eliminar con sus productos resueltos ─────────────────────────────────

create or replace function public.eliminar_categoria(p_org integer, p_id integer, p_destino integer default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
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
$$;

-- ─── 5. «Cómo se conecta» ────────────────────────────────────────────────────

create or replace function public.categoria_conexiones(p_org integer, p_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_padre integer;
  v_resultado jsonb;
begin
  perform public.fn_assert_acceso_org(p_org);

  select c.parent_id into v_padre from public.categories c where c.id = p_id and c.organization_id = p_org;
  if not found then
    raise exception 'La categoría no existe o es de otra organización'
      using errcode = '42501', hint = 'CATEGORIA_NO_ENCONTRADA';
  end if;

  select jsonb_build_object(
    'productos', (
      select count(*) from public.products p
      where p.organization_id = p_org and p.category_id = p_id
        and p.parent_product_id is null and coalesce(p.status, '') <> 'deleted'
    ),
    'por_regla', (
      select count(distinct r.product_id) from public.product_category_relations r
      where r.organization_id = p_org and r.category_id = p_id and r.assigned_by_rule
    ),
    'adicionales', (
      select count(distinct r.product_id) from public.product_category_relations r
      where r.organization_id = p_org and r.category_id = p_id and not r.assigned_by_rule
    ),
    'reglas', (
      select count(*) from public.category_rules cr
      where cr.organization_id = p_org and cr.category_id = p_id
    ),
    'promociones', (
      select count(distinct pr.promotion_id) from public.promotion_rules pr
      join public.promotions pm on pm.id = pr.promotion_id
      where pm.organization_id = p_org and pr.category_id = p_id
    ),
    'paginas_web', (
      select count(*) from public.website_pages wp
      where wp.organization_id = p_org and wp.linked_category_id = p_id
    ),
    'menus_web', (
      select count(*) from public.website_menu_items wm
      where wm.organization_id = p_org and wm.category_id = p_id
    ),
    'favorita', exists (
      select 1 from public.category_favorites f
      where f.organization_id = p_org and f.category_id = p_id
    ),
    'posicion', (
      select x.n from (
        select c.id, row_number() over (order by c.display_order nulls last, c.rank, c.name) as n
        from public.categories c
        where c.organization_id = p_org and c.parent_id is not distinct from v_padre
      ) x where x.id = p_id
    ),
    'hermanas', (
      select count(*) from public.categories c
      where c.organization_id = p_org and c.parent_id is not distinct from v_padre
    )
  ) into v_resultado;

  return v_resultado;
end;
$$;

-- ─── Permisos ────────────────────────────────────────────────────────────────

revoke all on function public.categorias_listado(integer) from public, anon;
revoke all on function public.mover_categorias(integer, integer[], integer) from public, anon;
revoke all on function public.eliminar_categoria(integer, integer, integer) from public, anon;
revoke all on function public.categoria_conexiones(integer, integer) from public, anon;
revoke all on function public.fn_categories_sin_ciclos() from public, anon;

grant execute on function public.categorias_listado(integer) to authenticated, service_role;
grant execute on function public.mover_categorias(integer, integer[], integer) to authenticated, service_role;
grant execute on function public.eliminar_categoria(integer, integer, integer) to authenticated, service_role;
grant execute on function public.categoria_conexiones(integer, integer) to authenticated, service_role;
