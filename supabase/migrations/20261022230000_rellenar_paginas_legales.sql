-- Coloca textos legales ya generados en un documento de sitio.
-- No compone el HTML: lo recibe. No toca una página con 80 o más caracteres
-- de texto. Idempotente. El backfill la llama; el ERP usa el módulo TypeScript.
create or replace function public.fn_rellenar_paginas_legales(doc jsonb, entradas jsonb)
returns jsonb
language plpgsql
volatile
set search_path to public, pg_temp
as $$
declare
  paginas jsonb := coalesce(doc->'paginas', '[]'::jsonb);
  menus jsonb := coalesce(doc->'menus', '[]'::jsonb);
  menu_ids jsonb := coalesce(doc#>'{shell,footer,menuIds}', '[]'::jsonb);
  e jsonb;
  i int;
  j int;
  k int;
  p jsonb;
  sec jsonb;
  contenido jsonb;
  plano text;
  chars int;
  encontrado boolean;
  pagina_id text;
  seccion_id text;
  slugs jsonb;
  items jsonb;
  item jsonb;
  apuntan jsonb;
  menu jsonb;
  menu_idx int;
  priv_id text;
  trat_id text;
  etiqueta text;
  nuevo_id text;
begin
  if jsonb_typeof(entradas) <> 'array' then
    return doc;
  end if;

  for e in select value from jsonb_array_elements(entradas) loop
    slugs := e->'slugs';
    encontrado := false;
    for i in 0 .. jsonb_array_length(paginas) - 1 loop
      p := paginas->i;
      if not (slugs ? (p->>'slug')) then
        continue;
      end if;
      encontrado := true;
      chars := 0;
      for j in 0 .. jsonb_array_length(coalesce(p->'secciones', '[]'::jsonb)) - 1 loop
        sec := p->'secciones'->j;
        if sec->>'tipo' = 'text_block' then
          plano := btrim(regexp_replace(regexp_replace(coalesce(sec#>>'{contenido,body}', sec#>>'{contenido,content}', ''), '<[^>]+>', ' ', 'g'), '\s+', ' ', 'g'));
          chars := chars + char_length(plano);
        end if;
      end loop;
      if chars >= 80 then
        continue;
      end if;
      seccion_id := null;
      for j in 0 .. jsonb_array_length(coalesce(p->'secciones', '[]'::jsonb)) - 1 loop
        if p->'secciones'->j->>'tipo' = 'text_block' then
          seccion_id := (p->'secciones'->j->>'id');
          contenido := coalesce(p->'secciones'->j->'contenido', '{}'::jsonb) - 'content';
          contenido := contenido || jsonb_build_object('title', coalesce(contenido->>'title', e->>'titulo'), 'body', e->>'body', 'legal', e->'legal');
          p := jsonb_set(p, array['secciones', j::text, 'contenido'], contenido);
          exit;
        end if;
      end loop;
      if seccion_id is null then
        p := jsonb_set(
          p,
          '{secciones}',
          coalesce(p->'secciones', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
            'id', gen_random_uuid()::text,
            'tipo', 'text_block',
            'variante', 'left',
            'version', 1,
            'contenido', jsonb_build_object('title', e->>'titulo', 'body', e->>'body', 'legal', e->'legal'),
            'diseno', '{}'::jsonb,
            'visibilidad', jsonb_build_object('movil', true, 'escritorio', true)
          ))
        );
      end if;
      paginas := jsonb_set(paginas, array[i::text], p);
    end loop;

    if not encontrado then
      pagina_id := gen_random_uuid()::text;
      paginas := paginas || jsonb_build_array(jsonb_build_object(
        'id', pagina_id,
        'slug', e->>'slug',
        'tipo', 'legal',
        'titulo', e->>'titulo',
        'publicada', true,
        'secciones', jsonb_build_array(jsonb_build_object(
          'id', gen_random_uuid()::text,
          'tipo', 'text_block',
          'variante', 'left',
          'version', 1,
          'contenido', jsonb_build_object('title', e->>'titulo', 'body', e->>'body', 'legal', e->'legal'),
          'diseno', '{}'::jsonb,
          'visibilidad', jsonb_build_object('movil', true, 'escritorio', true)
        ))
      ));
    end if;
  end loop;

  priv_id := null;
  trat_id := null;
  for i in 0 .. jsonb_array_length(paginas) - 1 loop
    if paginas->i->>'slug' in ('privacidad', 'politica-de-privacidad', 'politica-privacidad') then
      priv_id := paginas->i->>'id';
    elsif paginas->i->>'slug' in ('tratamiento-de-datos', 'politica-tratamiento-datos', 'politica-de-tratamiento-de-datos') then
      trat_id := paginas->i->>'id';
    end if;
  end loop;

  menu_idx := null;
  for i in 0 .. jsonb_array_length(menus) - 1 loop
    if lower(btrim(menus->i->>'nombre')) in ('legales', 'legal') and menu_ids ? (menus->i->>'id') then
      menu_idx := i;
      exit;
    end if;
  end loop;

  if menu_idx is null then
    items := '[]'::jsonb;
    for e in select value from jsonb_array_elements(entradas) loop
      pagina_id := null;
      for i in 0 .. jsonb_array_length(paginas) - 1 loop
        if (e->'slugs') ? (paginas->i->>'slug') then
          pagina_id := paginas->i->>'id';
          exit;
        end if;
      end loop;
      if pagina_id is null then
        continue;
      end if;
      etiqueta := case when e->>'clave' = 'tratamiento' then 'Tratamiento de datos' else paginas->i->>'titulo' end;
      items := items || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'etiqueta', etiqueta, 'tipo', 'page', 'paginaId', pagina_id));
    end loop;
    if jsonb_array_length(items) > 0 then
      nuevo_id := gen_random_uuid()::text;
      menus := menus || jsonb_build_array(jsonb_build_object('id', nuevo_id, 'nombre', 'Legales', 'items', items));
      menu_ids := menu_ids || jsonb_build_array(nuevo_id);
    end if;
  else
    menu := menus->menu_idx;
    items := coalesce(menu->'items', '[]'::jsonb);
    apuntan := '[]'::jsonb;
    for k in 0 .. jsonb_array_length(items) - 1 loop
      item := items->k;
      if item->>'tipo' = 'page'
         and lower(btrim(item->>'etiqueta')) = 'tratamiento de datos'
         and item->>'paginaId' = priv_id
         and trat_id is not null then
        item := jsonb_set(item, '{paginaId}', to_jsonb(trat_id));
        item := jsonb_set(item, '{etiqueta}', '"Tratamiento de datos"'::jsonb);
      end if;
      items := jsonb_set(items, array[k::text], item);
      if item->>'tipo' = 'page' then
        apuntan := apuntan || jsonb_build_array(item->>'paginaId');
      end if;
    end loop;
    for e in select value from jsonb_array_elements(entradas) loop
      pagina_id := null;
      for i in 0 .. jsonb_array_length(paginas) - 1 loop
        if (e->'slugs') ? (paginas->i->>'slug') then
          pagina_id := paginas->i->>'id';
          exit;
        end if;
      end loop;
      if pagina_id is null or apuntan ? pagina_id then
        continue;
      end if;
      etiqueta := case when e->>'clave' = 'tratamiento' then 'Tratamiento de datos' else coalesce((select pag->>'titulo' from jsonb_array_elements(paginas) pag where pag->>'id' = pagina_id limit 1), e->>'titulo') end;
      items := items || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'etiqueta', etiqueta, 'tipo', 'page', 'paginaId', pagina_id));
      apuntan := apuntan || jsonb_build_array(pagina_id);
    end loop;
    -- Quita un segundo enlace a la misma página (el alias y el título largo).
    declare
      vistos jsonb := '[]'::jsonb;
      limpios jsonb := '[]'::jsonb;
    begin
      for k in 0 .. jsonb_array_length(items) - 1 loop
        item := items->k;
        if item->>'tipo' = 'page' and vistos ? (item->>'paginaId') then
          continue;
        end if;
        if item->>'tipo' = 'page' then
          vistos := vistos || jsonb_build_array(item->>'paginaId');
        end if;
        limpios := limpios || jsonb_build_array(item);
      end loop;
      items := limpios;
    end;
    menu := jsonb_set(menu, '{items}', items);
    menus := jsonb_set(menus, array[menu_idx::text], menu);
  end if;

  doc := jsonb_set(doc, '{paginas}', paginas);
  doc := jsonb_set(doc, '{menus}', menus);
  doc := jsonb_set(doc, '{shell,footer,menuIds}', menu_ids);
  return doc;
end;
$$;

comment on function public.fn_rellenar_paginas_legales(jsonb, jsonb) is
  'Coloca textos legales recibidos en un documento de sitio. No pisa páginas con 80 o más caracteres.';
