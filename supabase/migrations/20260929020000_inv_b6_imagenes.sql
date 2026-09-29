-- Inventario B6b · Imágenes: biblioteca paginada en el servidor y escrituras por RPC.
--
-- Plan: docs/implementacion/INVENTARIO-PLAN.md §5.7 (B6b) y Figma `596:345914`.
-- Hasta hoy `ImagenesPage` leía TODAS las `product_images` de la organización
-- desde el navegador (220.180 filas en la base), las mezclaba con la
-- biblioteca con ids falsos (`id + 100000`), contaba el uso con una consulta
-- por imagen, y «Hacer pública» fallaba siempre: el disparador
-- `trigger_update_image_url` asigna `NEW.image_url`, una columna que
-- `shared_images` no tiene (42703).
--
-- Qué hace:
-- 1. `shared_images`: `alt_text` y `created_by` (NULL-ables), índice por
--    organización; `product_images(storage_path)` para contar el uso de una
--    imagen de la biblioteca que un producto tomó por ruta y no por id.
-- 2. Retira el disparador roto (el rollback lo repone tal cual).
-- 3. RPC (SECURITY DEFINER, `fn_assert_acceso_org`, permiso con
--    `fn_productos_exigir_permiso`, sin anon):
--    lectura  → fn_imagenes_resumen, fn_imagenes_listado, fn_imagen_detalle
--    escritura → fn_imagen_registrar (crear), fn_imagen_actualizar y
--                fn_imagenes_visibilidad (editar), fn_imagen_asignar_productos
--                (editar), fn_imagenes_eliminar (eliminar; reasigna la principal
--                de cada producto afectado y devuelve las rutas a borrar del
--                storage).

alter table public.shared_images add column if not exists alt_text text;
alter table public.shared_images add column if not exists created_by uuid default auth.uid();

create index if not exists idx_shared_images_org_creada
  on public.shared_images (organization_id, created_at desc, id desc);
create index if not exists idx_product_images_storage_path
  on public.product_images (storage_path);

drop trigger if exists trigger_update_image_url on public.shared_images;

-- ── Uso de una imagen de la biblioteca ────────────────────────────────────
-- Filas de `product_images` de productos (no eliminados) de la organización
-- que usan la imagen: por `shared_image_id` o por la misma ruta.

create or replace function public.fn_imagen_int_usos(p_org integer, p_id integer, p_ruta text)
returns table (product_image_id integer, product_id integer, is_primary boolean, display_order integer)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select pi.id, pi.product_id, coalesce(pi.is_primary, false), pi.display_order
  from public.product_images pi
  join public.products p on p.id = pi.product_id
  where p.organization_id = p_org
    and coalesce(p.status, 'active') <> 'deleted'
    and (pi.shared_image_id = p_id or pi.storage_path = p_ruta);
$$;

revoke all on function public.fn_imagen_int_usos(integer, integer, text) from public, anon, authenticated;
grant execute on function public.fn_imagen_int_usos(integer, integer, text) to service_role;

-- ── Resumen (KPI y contadores de las pestañas) ─────────────────────────────

create or replace function public.fn_imagenes_resumen(p_org integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_biblioteca integer;
  v_publicas integer;
  v_sin_usar integer;
  v_de_productos integer;
  v_sin_imagen integer;
begin
  perform public.fn_assert_acceso_org(p_org);

  select count(*)::integer, count(*) filter (where s.is_public)::integer
    into v_biblioteca, v_publicas
  from public.shared_images s
  where s.organization_id = p_org;

  select count(*)::integer into v_sin_usar
  from public.shared_images s
  where s.organization_id = p_org
    and not exists (select 1 from public.fn_imagen_int_usos(p_org, s.id, s.storage_path));

  select count(*)::integer into v_de_productos
  from public.product_images pi
  join public.products p on p.id = pi.product_id
  where p.organization_id = p_org
    and coalesce(p.status, 'active') <> 'deleted'
    and pi.shared_image_id is null;

  -- Productos del catálogo (los que se listan: sin variantes hijas) sin ninguna imagen.
  select count(*)::integer into v_sin_imagen
  from public.products p
  where p.organization_id = p_org
    and coalesce(p.status, 'active') <> 'deleted'
    and p.parent_product_id is null
    and not exists (select 1 from public.product_images pi where pi.product_id = p.id);

  return jsonb_build_object(
    'biblioteca', v_biblioteca,
    'de_productos', v_de_productos,
    'total', v_biblioteca + v_de_productos,
    'sin_usar', v_sin_usar,
    'publicas', v_publicas,
    'productos_sin_imagen', v_sin_imagen
  );
end;
$$;

-- ── Listado paginado ───────────────────────────────────────────────────────
-- p_origen: 'biblioteca' (shared_images) o 'productos' (product_images que no
-- salen de la biblioteca). Filtros: búsqueda (nombre de archivo, texto
-- alternativo o producto), uso (en_uso | sin_usar), visibilidad (publicas |
-- privadas), formato (jpg_png | webp), tamaño (pequena < 200 KB, mediana
-- hasta 1 MB, grande > 1 MB) y producto. Orden: recientes | nombre | tamano | uso.

create or replace function public.fn_imagenes_listado(
  p_org integer,
  p_origen text default 'biblioteca',
  p_busqueda text default null,
  p_uso text default null,
  p_visibilidad text default null,
  p_formato text default null,
  p_tamano text default null,
  p_producto_id integer default null,
  p_orden text default 'recientes',
  p_offset integer default 0,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_q text := nullif(btrim(coalesce(p_busqueda, '')), '');
  v_patron text;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_filas jsonb;
begin
  perform public.fn_assert_acceso_org(p_org);
  if v_q is not null then
    v_patron := '%' || replace(replace(replace(lower(v_q), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  if coalesce(p_origen, 'biblioteca') = 'productos' then
    with base as (
      select pi.id, pi.storage_path, pi.alt_text, coalesce(pi.is_primary, false) as is_primary,
             pi.created_at, p.id as product_id, p.uuid as product_uuid, p.name as product_name, p.sku as product_sku
      from public.product_images pi
      join public.products p on p.id = pi.product_id
      where p.organization_id = p_org
        and coalesce(p.status, 'active') <> 'deleted'
        and pi.shared_image_id is null
        and (p_producto_id is null or p.id = p_producto_id)
        and (v_patron is null
             or lower(pi.storage_path) like v_patron escape '\'
             or lower(coalesce(pi.alt_text, '')) like v_patron escape '\'
             or lower(p.name) like v_patron escape '\'
             or lower(coalesce(p.sku, '')) like v_patron escape '\')
        and (p_formato is null
             or (p_formato = 'webp' and lower(pi.storage_path) like '%.webp')
             or (p_formato = 'jpg_png' and lower(pi.storage_path) ~ '\.(jpe?g|png)$'))
    )
    select (select count(*)::integer from base),
           coalesce((
             select jsonb_agg(to_jsonb(x) - 'rn' order by x.rn)
             from (
               select b.*, row_number() over (
                 order by
                   case when p_orden = 'nombre' then lower(b.product_name) end asc nulls last,
                   b.created_at desc nulls last,
                   b.id desc
               ) as rn
               from base b
             ) x
             where x.rn > v_offset and x.rn <= v_offset + v_limit
           ), '[]'::jsonb)
      into v_total, v_filas;
    return jsonb_build_object('total', v_total, 'filas', v_filas);
  end if;

  with base as (
    select s.id, s.storage_path, s.file_name, s.file_size, s.mime_type, s.dimensions, coalesce(s.is_public, false) as is_public,
           s.alt_text, s.created_at,
           (select count(distinct u.product_id)::integer from public.fn_imagen_int_usos(p_org, s.id, s.storage_path) u) as productos
    from public.shared_images s
    where s.organization_id = p_org
      and (v_patron is null
           or lower(s.file_name) like v_patron escape '\'
           or lower(coalesce(s.alt_text, '')) like v_patron escape '\'
           or exists (
             select 1
             from public.fn_imagen_int_usos(p_org, s.id, s.storage_path) u
             join public.products p on p.id = u.product_id
             where lower(p.name) like v_patron escape '\' or lower(coalesce(p.sku, '')) like v_patron escape '\'
           ))
      and (p_visibilidad is null
           or (p_visibilidad = 'publicas' and coalesce(s.is_public, false))
           or (p_visibilidad = 'privadas' and not coalesce(s.is_public, false)))
      and (p_formato is null
           or (p_formato = 'webp' and s.mime_type = 'image/webp')
           or (p_formato = 'jpg_png' and s.mime_type in ('image/jpeg', 'image/jpg', 'image/png')))
      and (p_tamano is null
           or (p_tamano = 'pequena' and s.file_size < 204800)
           or (p_tamano = 'mediana' and s.file_size between 204800 and 1048576)
           or (p_tamano = 'grande' and s.file_size > 1048576))
      and (p_producto_id is null
           or exists (select 1 from public.fn_imagen_int_usos(p_org, s.id, s.storage_path) u where u.product_id = p_producto_id))
  ),
  filtrada as (
    select * from base b
    where p_uso is null
       or (p_uso = 'en_uso' and b.productos > 0)
       or (p_uso = 'sin_usar' and b.productos = 0)
  )
  select (select count(*)::integer from filtrada),
         coalesce((
           select jsonb_agg(to_jsonb(x) - 'rn' order by x.rn)
           from (
             select f.*, row_number() over (
               order by
                 case when p_orden = 'nombre' then lower(f.file_name) end asc nulls last,
                 case when p_orden = 'tamano' then f.file_size end desc nulls last,
                 case when p_orden = 'uso' then f.productos end desc nulls last,
                 f.created_at desc nulls last,
                 f.id desc
             ) as rn
             from filtrada f
           ) x
           where x.rn > v_offset and x.rn <= v_offset + v_limit
         ), '[]'::jsonb)
    into v_total, v_filas;

  return jsonb_build_object('total', v_total, 'filas', v_filas);
end;
$$;

-- ── Detalle («Ver y editar datos» y «Usada en») ────────────────────────────

create or replace function public.fn_imagen_detalle(p_org integer, p_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_img public.shared_images%rowtype;
  v_autor text;
  v_usos jsonb;
  v_total integer;
  v_principal integer;
begin
  perform public.fn_assert_acceso_org(p_org);

  select * into v_img from public.shared_images s where s.id = p_id and s.organization_id = p_org;
  if not found then
    raise exception 'La imagen no existe o es de otra organización'
      using errcode = 'P0002', hint = 'IMAGEN_NO_ENCONTRADA';
  end if;

  select nullif(btrim(concat_ws(' ', pr.first_name, pr.last_name)), '')
    into v_autor
  from public.profiles pr
  where pr.id = v_img.created_by;

  select count(distinct u.product_id)::integer,
         count(distinct u.product_id) filter (where u.is_primary)::integer
    into v_total, v_principal
  from public.fn_imagen_int_usos(p_org, v_img.id, v_img.storage_path) u;

  select coalesce(jsonb_agg(jsonb_build_object(
           'product_image_id', x.product_image_id,
           'product_id', x.product_id,
           'product_uuid', x.uuid,
           'nombre', x.name,
           'sku', x.sku,
           'principal', x.is_primary
         ) order by x.is_primary desc, x.name), '[]'::jsonb)
    into v_usos
  from (
    select distinct on (u.product_id) u.product_image_id, u.product_id, u.is_primary, p.uuid, p.name, p.sku
    from public.fn_imagen_int_usos(p_org, v_img.id, v_img.storage_path) u
    join public.products p on p.id = u.product_id
    order by u.product_id, u.is_primary desc
    limit 50
  ) x;

  return jsonb_build_object(
    'id', v_img.id,
    'storage_path', v_img.storage_path,
    'file_name', v_img.file_name,
    'file_size', v_img.file_size,
    'mime_type', v_img.mime_type,
    'dimensions', v_img.dimensions,
    'is_public', coalesce(v_img.is_public, false),
    'alt_text', v_img.alt_text,
    'created_at', v_img.created_at,
    'autor', v_autor,
    'productos', coalesce(v_total, 0),
    'principal_de', coalesce(v_principal, 0),
    'usada_en', v_usos
  );
end;
$$;

-- ── Registrar una subida ───────────────────────────────────────────────────
-- El archivo ya está en el storage (el navegador lo sube con su sesión); aquí
-- se valida y se crea la fila. Rutas admitidas: `{org}/…` (organization_images)
-- o `products/{org}/…` (lo que deja «Generar con IA» en product-images).

create or replace function public.fn_imagen_registrar(
  p_org integer,
  p_storage_path text,
  p_file_name text,
  p_file_size integer,
  p_mime_type text,
  p_dimensions jsonb default null,
  p_alt_text text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_nombre text := left(btrim(coalesce(p_file_name, '')), 200);
  v_id integer;
begin
  perform public.fn_productos_exigir_permiso(p_org, array['inventory.create', 'product_management', 'inventory_management']);

  if p_storage_path is null
     or not (starts_with(p_storage_path, p_org::text || '/') or starts_with(p_storage_path, 'products/' || p_org::text || '/'))
     or position('..' in p_storage_path) > 0 then
    raise exception 'Ruta de imagen no válida para esta organización'
      using errcode = '22023', hint = 'IMAGEN_RUTA_INVALIDA';
  end if;
  if coalesce(p_mime_type, '') not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'Formato no admitido: usa JPG, PNG o WEBP'
      using errcode = '22023', hint = 'IMAGEN_FORMATO';
  end if;
  if coalesce(p_file_size, 0) <= 0 or p_file_size > 5242880 then
    raise exception 'La imagen supera los 5 MB'
      using errcode = '22023', hint = 'IMAGEN_TAMANO';
  end if;
  if v_nombre = '' then
    v_nombre := regexp_replace(p_storage_path, '^.*/', '');
  end if;

  insert into public.shared_images (organization_id, storage_path, file_name, file_size, mime_type, dimensions, is_public, tags, alt_text, created_by)
  values (p_org, p_storage_path, v_nombre, p_file_size, p_mime_type, p_dimensions, false, '{}', nullif(btrim(coalesce(p_alt_text, '')), ''), auth.uid())
  returning id into v_id;

  return public.fn_imagen_detalle(p_org, v_id);
end;
$$;

-- ── Editar datos y visibilidad ─────────────────────────────────────────────

create or replace function public.fn_imagen_actualizar(
  p_org integer,
  p_id integer,
  p_file_name text,
  p_alt_text text,
  p_is_public boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_nombre text := left(btrim(coalesce(p_file_name, '')), 200);
begin
  perform public.fn_productos_exigir_permiso(p_org, array['inventory.edit', 'product_management', 'inventory_management']);
  if v_nombre = '' then
    raise exception 'El nombre de la imagen es obligatorio'
      using errcode = '23502', hint = 'IMAGEN_NOMBRE';
  end if;

  update public.shared_images s
  set file_name = v_nombre,
      alt_text = nullif(btrim(coalesce(p_alt_text, '')), ''),
      is_public = coalesce(p_is_public, s.is_public),
      updated_at = now()
  where s.id = p_id and s.organization_id = p_org;
  if not found then
    raise exception 'La imagen no existe o es de otra organización'
      using errcode = 'P0002', hint = 'IMAGEN_NO_ENCONTRADA';
  end if;

  -- El texto alternativo acompaña a la foto en los productos que la usan desde la biblioteca.
  update public.product_images pi
  set alt_text = nullif(btrim(coalesce(p_alt_text, '')), ''), updated_at = now()
  from public.products p
  where p.id = pi.product_id and p.organization_id = p_org and pi.shared_image_id = p_id;

  return public.fn_imagen_detalle(p_org, p_id);
end;
$$;

create or replace function public.fn_imagenes_visibilidad(p_org integer, p_ids integer[], p_publica boolean)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_n integer;
begin
  perform public.fn_productos_exigir_permiso(p_org, array['inventory.edit', 'product_management', 'inventory_management']);
  update public.shared_images s
  set is_public = coalesce(p_publica, false), updated_at = now()
  where s.organization_id = p_org and s.id = any(coalesce(p_ids, '{}'));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ── Asignar a productos ────────────────────────────────────────────────────
-- Crea `product_images` con `shared_image_id` al final de la galería de cada
-- producto. Si el producto no tenía principal, o se pide «principal», queda
-- como principal. Un producto que ya la tiene no se duplica.

create or replace function public.fn_imagen_asignar_productos(
  p_org integer,
  p_id integer,
  p_productos integer[],
  p_principal boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_img public.shared_images%rowtype;
  v_producto integer;
  v_orden integer;
  v_tiene_principal boolean;
  v_asignados integer := 0;
  v_ya integer := 0;
  v_ajenos integer := 0;
begin
  perform public.fn_productos_exigir_permiso(p_org, array['inventory.edit', 'product_management', 'inventory_management']);

  select * into v_img from public.shared_images s where s.id = p_id and s.organization_id = p_org;
  if not found then
    raise exception 'La imagen no existe o es de otra organización'
      using errcode = 'P0002', hint = 'IMAGEN_NO_ENCONTRADA';
  end if;

  foreach v_producto in array (select array(select distinct unnest(coalesce(p_productos, '{}'))))
  loop
    -- Bloquea el producto: la galería se numera sin choques con otra asignación simultánea.
    perform 1 from public.products p
    where p.id = v_producto and p.organization_id = p_org and coalesce(p.status, 'active') <> 'deleted'
    for update;
    if not found then
      v_ajenos := v_ajenos + 1;
      continue;
    end if;

    if exists (
      select 1 from public.product_images pi
      where pi.product_id = v_producto and (pi.shared_image_id = p_id or pi.storage_path = v_img.storage_path)
    ) then
      v_ya := v_ya + 1;
      continue;
    end if;

    select coalesce(max(pi.display_order) + 1, 0), coalesce(bool_or(pi.is_primary), false)
      into v_orden, v_tiene_principal
    from public.product_images pi
    where pi.product_id = v_producto;

    if coalesce(p_principal, false) then
      update public.product_images pi set is_primary = false, updated_at = now()
      where pi.product_id = v_producto and pi.is_primary;
    end if;

    insert into public.product_images (product_id, storage_path, display_order, is_primary, alt_text, shared_image_id)
    values (v_producto, v_img.storage_path, v_orden, coalesce(p_principal, false) or not v_tiene_principal, v_img.alt_text, p_id);

    update public.products p set updated_at = now() where p.id = v_producto;
    v_asignados := v_asignados + 1;
  end loop;

  return jsonb_build_object('asignados', v_asignados, 'ya_la_tenian', v_ya, 'no_encontrados', v_ajenos);
end;
$$;

-- ── Eliminar ───────────────────────────────────────────────────────────────
-- Quita la imagen de los productos que la usan (y les deja como principal la
-- siguiente de su galería), borra la fila y devuelve las rutas que ya nadie
-- usa para que el navegador las borre del storage.

create or replace function public.fn_imagenes_eliminar(p_org integer, p_ids integer[])
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_img record;
  v_afectados integer[] := '{}';
  v_quitadas integer := 0;
  v_n integer;
  v_eliminadas integer := 0;
  v_rutas text[] := '{}';
  v_producto integer;
begin
  perform public.fn_productos_exigir_permiso(p_org, array['inventory.delete', 'product_management', 'inventory_management']);

  for v_img in
    select s.id, s.storage_path
    from public.shared_images s
    where s.organization_id = p_org and s.id = any(coalesce(p_ids, '{}'))
    for update
  loop
    with borradas as (
      delete from public.product_images pi
      using public.products p
      where p.id = pi.product_id
        and p.organization_id = p_org
        and (pi.shared_image_id = v_img.id or pi.storage_path = v_img.storage_path)
      returning pi.product_id
    )
    select coalesce(array_agg(distinct b.product_id), '{}'), count(*)::integer
      into v_afectados, v_n
    from borradas b;
    v_quitadas := v_quitadas + v_n;

    -- Productos que se quedaron sin principal: la siguiente de su galería.
    foreach v_producto in array v_afectados loop
      if not exists (select 1 from public.product_images pi where pi.product_id = v_producto and pi.is_primary) then
        update public.product_images pi set is_primary = true, updated_at = now()
        where pi.id = (
          select x.id from public.product_images x
          where x.product_id = v_producto
          order by x.display_order, x.id
          limit 1
        );
      end if;
      update public.products p set updated_at = now() where p.id = v_producto;
    end loop;

    delete from public.shared_images s where s.id = v_img.id;
    v_eliminadas := v_eliminadas + 1;

    if not exists (select 1 from public.product_images pi where pi.storage_path = v_img.storage_path)
       and not exists (select 1 from public.shared_images s where s.storage_path = v_img.storage_path) then
      v_rutas := v_rutas || v_img.storage_path;
    end if;
  end loop;

  return jsonb_build_object('eliminadas', v_eliminadas, 'quitadas_de_productos', v_quitadas, 'rutas', to_jsonb(v_rutas));
end;
$$;

-- ── Permisos de ejecución ──────────────────────────────────────────────────

revoke all on function public.fn_imagenes_resumen(integer) from public, anon;
revoke all on function public.fn_imagenes_listado(integer, text, text, text, text, text, text, integer, text, integer, integer) from public, anon;
revoke all on function public.fn_imagen_detalle(integer, integer) from public, anon;
revoke all on function public.fn_imagen_registrar(integer, text, text, integer, text, jsonb, text) from public, anon;
revoke all on function public.fn_imagen_actualizar(integer, integer, text, text, boolean) from public, anon;
revoke all on function public.fn_imagenes_visibilidad(integer, integer[], boolean) from public, anon;
revoke all on function public.fn_imagen_asignar_productos(integer, integer, integer[], boolean) from public, anon;
revoke all on function public.fn_imagenes_eliminar(integer, integer[]) from public, anon;

grant execute on function public.fn_imagenes_resumen(integer) to authenticated, service_role;
grant execute on function public.fn_imagenes_listado(integer, text, text, text, text, text, text, integer, text, integer, integer) to authenticated, service_role;
grant execute on function public.fn_imagen_detalle(integer, integer) to authenticated, service_role;
grant execute on function public.fn_imagen_registrar(integer, text, text, integer, text, jsonb, text) to authenticated, service_role;
grant execute on function public.fn_imagen_actualizar(integer, integer, text, text, boolean) to authenticated, service_role;
grant execute on function public.fn_imagenes_visibilidad(integer, integer[], boolean) to authenticated, service_role;
grant execute on function public.fn_imagen_asignar_productos(integer, integer, integer[], boolean) to authenticated, service_role;
grant execute on function public.fn_imagenes_eliminar(integer, integer[]) to authenticated, service_role;
