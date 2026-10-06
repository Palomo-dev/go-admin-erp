-- ⚠️ SIN APLICAR (2026-10-06). Editor del sitio › «Guardar y publicar» de los sitios sin
-- borrador V2 (Figma A/05n: «Retirar handleSave en N llamadas»).
--
-- ⚠️ No se pudo verificar el esquema ni correr el ensayo: el MCP de Supabase respondió
-- «FGA Authentication Error. Unauthorized» el 2026-10-06. Antes de aplicar, verificar por
-- MCP las columnas que usa (website_pages: id, organization_id, branch_id, slug, title,
-- show_in_header, show_in_footer, header_order, footer_order, is_published, meta_title,
-- meta_description, og_image_url, parent_page_id, linked_category_id, menu_icon,
-- menu_badge, page_settings, updated_at; website_page_sections: id, page_id,
-- organization_id, section_variant, content, settings, is_visible, sort_order,
-- updated_at; website_settings: id, organization_id, branch_id, created_at, updated_at)
-- y correr el ensayo del final.
--
-- Ensayo 2026-10-06 (integrador, execute_sql, do/raise que se deshace solo): columnas de
-- website_pages (19) y website_page_sections (10) verificadas por MCP; el bloque del final
-- con una página y los ajustes principales de una organización de prueba dio
-- «ENSAYO_OK ajustes_id=<uuid>» (meta_title y primary_color escritos y devueltos). Después
-- se comprobó que la función no existe y que la página y los ajustes siguen como estaban.
--
-- Qué hace (aditivo: solo crea una función):
-- fn_editor_guardar_legacy(p_org, p_page_id, p_branch, p_lote) escribe en UNA transacción
-- lo que antes el navegador mandaba en N llamadas: cambios de secciones, orden, cambios
-- de la página, ajustes del ámbito (principal o sede; crea la fila de la sede desde la
-- principal si no existe) y cambios de menú de otras páginas. Exige website.sites.edit
-- y website.sites.publish (en legacy guardar es publicar). Toda fila se filtra por la
-- organización recibida, que la ruta toma de la sesión (withOrg).
--
-- Lo llama POST /api/sitio-web/editor/guardar (src/lib/website/editorLegacy.server.ts).
-- Mientras no esté aplicada, esa ruta escribe con el cliente de la sesión, no atómico.

create or replace function public.fn_editor_guardar_legacy(
  p_org integer,
  p_page_id uuid,
  p_branch integer,
  p_lote jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prohibidos constant text[] := array[
    'id', 'organization_id', 'branch_id', 'created_at', 'updated_at',
    'is_published', 'published_at', 'custom_code', 'custom_css', 'custom_scripts'
  ];
  v_campos_pagina constant text[] := array[
    'title', 'slug', 'show_in_header', 'show_in_footer', 'header_order', 'footer_order',
    'is_published', 'meta_title', 'meta_description', 'og_image_url', 'parent_page_id',
    'linked_category_id', 'menu_icon', 'menu_badge', 'page_settings'
  ];
  v_campos_menu constant text[] := array[
    'parent_page_id', 'linked_category_id', 'menu_icon', 'menu_badge',
    'header_order', 'footer_order', 'show_in_header', 'show_in_footer'
  ];
  v_pagina public.website_pages%rowtype;
  v_seccion public.website_page_sections%rowtype;
  v_item jsonb;
  v_cambios jsonb;
  v_clave text;
  v_indice integer := 0;
  v_ajustes jsonb;
  v_fila_id text;  -- texto: no se asume el tipo de website_settings.id
  v_sets text;
  v_cols text;
  v_salida jsonb := null;
begin
  perform public.fn_website_exigir_permiso(p_org, 'website.sites.edit');
  perform public.fn_website_exigir_permiso(p_org, 'website.sites.publish');

  if p_lote is null or jsonb_typeof(p_lote) <> 'object' then
    raise exception 'peticion_invalida' using errcode = '22023';
  end if;

  select * into v_pagina from public.website_pages
   where id = p_page_id and organization_id = p_org
   for update;
  if not found then
    raise exception 'pagina_no_encontrada' using errcode = 'P0002';
  end if;

  -- 1. Secciones (solo de esta página y esta organización).
  for v_item in select * from jsonb_array_elements(coalesce(p_lote->'secciones', '[]'::jsonb)) loop
    v_cambios := v_item->'cambios';
    for v_clave in select jsonb_object_keys(v_cambios) loop
      if not (v_clave = any (array['section_variant', 'content', 'settings', 'is_visible'])) then
        raise exception 'campo_no_permitido: %', v_clave using errcode = '22023';
      end if;
    end loop;
    select * into v_seccion from public.website_page_sections
     where id = (v_item->>'id')::uuid and page_id = p_page_id and organization_id = p_org
     for update;
    if not found then
      raise exception 'seccion_no_encontrada' using errcode = 'P0002';
    end if;
    v_seccion := jsonb_populate_record(v_seccion, v_cambios);
    update public.website_page_sections
       set section_variant = v_seccion.section_variant,
           content = v_seccion.content,
           settings = v_seccion.settings,
           is_visible = v_seccion.is_visible,
           updated_at = now()
     where id = v_seccion.id;
  end loop;

  -- 2. Orden.
  for v_clave in select jsonb_array_elements_text(coalesce(p_lote->'orden', '[]'::jsonb)) loop
    update public.website_page_sections
       set sort_order = v_indice, updated_at = now()
     where id = v_clave::uuid and page_id = p_page_id and organization_id = p_org;
    v_indice := v_indice + 1;
  end loop;

  -- 3. Página.
  v_cambios := coalesce(p_lote->'pagina', '{}'::jsonb);
  if v_cambios <> '{}'::jsonb then
    for v_clave in select jsonb_object_keys(v_cambios) loop
      if not (v_clave = any (v_campos_pagina)) then
        raise exception 'campo_no_permitido: %', v_clave using errcode = '22023';
      end if;
    end loop;
    if v_cambios ? 'slug' and (v_cambios->>'slug') is distinct from v_pagina.slug and exists (
      select 1 from public.website_pages
       where organization_id = p_org and slug = v_cambios->>'slug' and id <> p_page_id
         and branch_id is not distinct from v_pagina.branch_id
    ) then
      raise exception 'slug_duplicado' using errcode = '23505';
    end if;
    v_pagina := jsonb_populate_record(v_pagina, v_cambios);
    update public.website_pages
       set title = v_pagina.title, slug = v_pagina.slug,
           show_in_header = v_pagina.show_in_header, show_in_footer = v_pagina.show_in_footer,
           header_order = v_pagina.header_order, footer_order = v_pagina.footer_order,
           is_published = v_pagina.is_published, meta_title = v_pagina.meta_title,
           meta_description = v_pagina.meta_description, og_image_url = v_pagina.og_image_url,
           parent_page_id = v_pagina.parent_page_id, linked_category_id = v_pagina.linked_category_id,
           menu_icon = v_pagina.menu_icon, menu_badge = v_pagina.menu_badge,
           page_settings = v_pagina.page_settings, updated_at = now()
     where id = p_page_id;
  end if;

  -- 4. Ajustes del ámbito: solo columnas reales y fuera de la lista prohibida.
  v_ajustes := coalesce(p_lote->'ajustes', '{}'::jsonb);
  if v_ajustes <> '{}'::jsonb then
    for v_clave in select jsonb_object_keys(v_ajustes) loop
      if v_clave = any (v_prohibidos) or not exists (
        select 1 from pg_attribute
         where attrelid = 'public.website_settings'::regclass and attname = v_clave
           and attnum > 0 and not attisdropped
      ) then
        raise exception 'ajuste_no_permitido: %', v_clave using errcode = '22023';
      end if;
    end loop;

    select id::text into v_fila_id from public.website_settings
     where organization_id = p_org and branch_id is not distinct from p_branch
     for update;

    if v_fila_id is null then
      if p_branch is null then
        raise exception 'sin_ajustes' using errcode = 'P0002';
      end if;
      -- Fila nueva de la sede: la principal como base + los cambios (como updateSettings).
      select string_agg(format('%I', attname), ', ' order by attnum) into v_cols
        from pg_attribute
       where attrelid = 'public.website_settings'::regclass and attnum > 0 and not attisdropped
         and attname not in ('id', 'created_at', 'updated_at');
      execute format(
        'insert into public.website_settings (%1$s) select %1$s from jsonb_populate_record(null::public.website_settings, $1) returning to_jsonb(website_settings.*)',
        v_cols
      ) into v_salida
      using coalesce(
        (select to_jsonb(g) - 'id' - 'created_at' - 'updated_at' from public.website_settings g
          where g.organization_id = p_org and g.branch_id is null),
        '{}'::jsonb
      ) || v_ajustes || jsonb_build_object('organization_id', p_org, 'branch_id', p_branch);
    else
      select string_agg(format('%1$I = (jsonb_populate_record(null::public.website_settings, $1)).%1$I', k), ', ')
        into v_sets
        from jsonb_object_keys(v_ajustes) as k;
      execute format(
        'update public.website_settings w set %s, updated_at = now() where w.id::text = $2 and w.organization_id = $3 returning to_jsonb(w.*)',
        v_sets
      ) into v_salida
      using v_ajustes, v_fila_id, p_org;
    end if;
  end if;

  -- 5. Menú de otras páginas de la organización.
  for v_item in select * from jsonb_array_elements(coalesce(p_lote->'menus', '[]'::jsonb)) loop
    v_cambios := v_item->'cambios';
    for v_clave in select jsonb_object_keys(v_cambios) loop
      if not (v_clave = any (v_campos_menu)) then
        raise exception 'campo_no_permitido: %', v_clave using errcode = '22023';
      end if;
    end loop;
    select * into v_pagina from public.website_pages
     where id = (v_item->>'id')::uuid and organization_id = p_org
     for update;
    if not found then
      raise exception 'pagina_no_encontrada' using errcode = 'P0002';
    end if;
    v_pagina := jsonb_populate_record(v_pagina, v_cambios);
    update public.website_pages
       set parent_page_id = v_pagina.parent_page_id, linked_category_id = v_pagina.linked_category_id,
           menu_icon = v_pagina.menu_icon, menu_badge = v_pagina.menu_badge,
           header_order = v_pagina.header_order, footer_order = v_pagina.footer_order,
           show_in_header = v_pagina.show_in_header, show_in_footer = v_pagina.show_in_footer,
           updated_at = now()
     where id = v_pagina.id;
  end loop;

  return jsonb_build_object('ajustes', v_salida);
end;
$$;

revoke all on function public.fn_editor_guardar_legacy(integer, uuid, integer, jsonb) from public, anon;
grant execute on function public.fn_editor_guardar_legacy(integer, uuid, integer, jsonb) to authenticated, service_role;

comment on function public.fn_editor_guardar_legacy(integer, uuid, integer, jsonb) is
  'Guardar y publicar del editor en sitios sin borrador V2: secciones, orden, página, ajustes del ámbito y menús en una transacción. Exige website.sites.edit y website.sites.publish.';

-- ─── Ensayo (correr con execute_sql ANTES de aplicar; se deshace solo) ─────────────────
-- Reemplazar :org y :pagina por una organización y una página reales de prueba (sin
-- nombres de clientes en ningún archivo). Con service role auth.uid() es NULL y
-- fn_website_exigir_permiso deja pasar; el ensayo prueba el SQL dinámico y los tipos.
--
-- do $$
-- declare r jsonb;
-- begin
--   <cuerpo de create or replace function de arriba>;
--   r := public.fn_editor_guardar_legacy(:org, ':pagina'::uuid, null,
--     jsonb_build_object('secciones', '[]'::jsonb, 'orden', '[]'::jsonb,
--       'pagina', jsonb_build_object('meta_title', 'Ensayo'),
--       'ajustes', jsonb_build_object('primary_color', '#123456'),
--       'menus', '[]'::jsonb));
--   if r->'ajustes'->>'primary_color' <> '#123456' then
--     raise exception 'ENSAYO_FALLO %', r;
--   end if;
--   raise exception 'ENSAYO_OK %', r->'ajustes'->>'id';
-- end $$;
