-- Reversión de 20261125230000_contacto_v2_plantillas_y_restantes.sql.
--
-- 1. Datos: lee `website_contacto_v2_respaldo` (filas con migracion = '20261125230000' y
--    resultado = 'aplicada') y devuelve cada página Contacto a sus 3 secciones viejas exactas, SOLO si
--    sigue tal como la dejó la migración; si el dueño ya la editó, no se toca y se avisa con NOTICE.
--    - Legacy: borra las 5 filas y vuelve a insertar las 3 viejas con sus ids, orden y fechas.
--    - V2 publicado (org 338): las revisiones son inmutables; se publica una revisión NUEVA desde lo
--      publicado vigente con la página Contacto de antes, se devuelve el borrador (version+1) si su
--      página Contacto sigue igual y se encola la invalidación de la caché de la tienda.
--    - V2 solo borrador (org 383): se devuelve el borrador (version+1) si sigue igual.
--    Ojo: revertir la 338 le devuelve el contacto viejo que trajo «Plantilla completa».
-- 2. `create_default_pages` vuelve al cuerpo de 20261006125630 (md5 ae8933c838fa9bd9c9b9331097fbaa15).
-- 3. Borra las filas de respaldo de esta migración que se revirtieron. La columna `migracion` se
--    queda (aditiva; la usa la reversión de 20261125050000).

do $$
declare
  c_nota constant text := 'Reversión de Contacto v2 (migración 2026-11-25, sitios restantes)';
  b          public.website_contacto_v2_respaldo%rowtype;
  v_state    public.website_site_states%rowtype;
  v_draft    public.website_site_drafts%rowtype;
  v_pub      public.website_site_revisions%rowtype;
  v_actual   jsonb;
  v_idx      integer;
  v_idx_d    integer;
  v_version  integer;
  v_numero   integer;
  v_revision uuid;
begin
  if to_regclass('public.website_contacto_v2_respaldo') is null then
    raise notice 'reversion: no hay tabla de respaldo; nada que revertir';
    return;
  end if;

  for b in select * from public.website_contacto_v2_respaldo
            where migracion = '20261125230000' and resultado = 'aplicada' order by id desc loop
    if b.modelo = 'legacy' then
      perform 1 from public.website_pages where id = b.page_id::uuid for update;
      select coalesce(jsonb_agg(to_jsonb(s) order by s.sort_order, s.created_at, s.id), '[]') into v_actual
        from public.website_page_sections s where s.page_id = b.page_id::uuid;
      if v_actual is distinct from b.secciones_nuevas then
        raise notice 'org %: la página Contacto legacy cambió después de la migración; no se revierte', b.organization_id;
        continue;
      end if;
      delete from public.website_page_sections where page_id = b.page_id::uuid;
      insert into public.website_page_sections
      select * from jsonb_populate_recordset(null::public.website_page_sections, b.secciones_viejas);
      delete from public.website_contacto_v2_respaldo where id = b.id;
      raise notice 'org %: legacy revertida', b.organization_id;
      continue;
    end if;

    select * into v_state from public.website_site_states where id = b.site_state_id for update;
    select * into v_draft from public.website_site_drafts where site_state_id = b.site_state_id for update;
    v_idx := null; v_idx_d := null; v_version := v_draft.version; v_pub := null;
    select (o - 1)::integer into v_idx_d
      from jsonb_array_elements(v_draft.document->'paginas') with ordinality as t(p, o)
     where p->>'id' = b.page_id;

    if b.revision_id is not null then
      select * into v_pub from public.website_site_revisions where id = v_state.published_revision_id;
      select (o - 1)::integer into v_idx
        from jsonb_array_elements(v_pub.document->'paginas') with ordinality as t(p, o)
       where p->>'id' = b.page_id;
      if v_idx is null or v_pub.document->'paginas'->v_idx->'secciones' is distinct from b.secciones_nuevas then
        raise notice 'org %: la página Contacto publicada cambió después de la migración; no se revierte', b.organization_id;
        continue;
      end if;
    end if;

    if v_idx_d is not null and v_draft.document->'paginas'->v_idx_d->'secciones' = b.secciones_nuevas then
      update public.website_site_drafts
         set document = jsonb_set(document, array['paginas', v_idx_d::text, 'secciones'], b.secciones_viejas, false),
             version = v_draft.version + 1
       where site_state_id = b.site_state_id and version = v_draft.version;
      v_version := v_draft.version + 1;
    elsif b.revision_id is null then
      raise notice 'org %: el borrador tiene otra página Contacto; no se revierte', b.organization_id;
      continue;
    else
      raise notice 'org %: el borrador tiene otra página Contacto; solo se revierte lo publicado', b.organization_id;
    end if;

    if b.revision_id is not null then
      select coalesce(max(r.revision_number), 0) + 1 into v_numero
        from public.website_site_revisions r where r.site_state_id = b.site_state_id;
      insert into public.website_site_revisions (
        site_state_id, organization_id, revision_number, schema_version, document,
        source_draft_version, note, published_by)
      values (
        b.site_state_id, b.organization_id, v_numero, v_pub.schema_version,
        jsonb_set(v_pub.document, array['paginas', v_idx::text, 'secciones'], b.secciones_viejas, false),
        v_version, c_nota, null)
      returning id into v_revision;
      update public.website_site_states set published_revision_id = v_revision where id = b.site_state_id;
      update public.website_site_drafts set base_revision_id = v_revision where site_state_id = b.site_state_id;
      insert into public.website_publication_outbox (organization_id, site_state_id, revision_id)
      values (b.organization_id, b.site_state_id, v_revision);
    end if;
    delete from public.website_contacto_v2_respaldo where id = b.id;
    raise notice 'org %: V2 revertida', b.organization_id;
  end loop;

  delete from public.website_contacto_v2_respaldo where migracion = '20261125230000' and resultado = 'saltada';
end
$$;

-- Cuerpo anterior de create_default_pages (20261006125630), sin cambios.
create or replace function public.create_default_pages(p_org_id integer, p_type_id integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_preset jsonb;
  v_page jsonb;
  v_section jsonb;
  v_page_id uuid;
  v_sort_order integer;
BEGIN
  perform public.fn_assert_acceso_org(p_org_id::integer);
  IF EXISTS (SELECT 1 FROM website_pages WHERE organization_id = p_org_id) THEN
    RETURN;
  END IF;

  v_preset := CASE p_type_id
    WHEN 1 THEN '{"pages":[
      {"slug":"home","title":"Inicio","show_in_header":true,"show_in_footer":false,"header_order":0,"footer_order":0,"sections":[
        {"t":"restaurant_hero","v":"split_bento"},{"t":"signature_dishes","v":"carousel"},{"t":"menu_preview","v":"tabs"},{"t":"delivery_cta","v":"banner"},{"t":"gallery_bento","v":"default"},{"t":"testimonials","v":"carousel"},{"t":"reservation","v":"band"},{"t":"hours_location","v":"hours_map"}
      ]},
      {"slug":"menu","title":"Menú","show_in_header":true,"show_in_footer":true,"header_order":1,"footer_order":1,"sections":[
        {"t":"hero","v":"minimal"},{"t":"menu_full","v":"anchors"},{"t":"cta","v":"centered"}
      ]},
      {"slug":"domicilios","title":"Pedir Online","show_in_header":true,"show_in_footer":true,"header_order":2,"footer_order":2,"sections":[
        {"t":"hero","v":"minimal"},{"t":"products_grid","v":"grid"}
      ]},
      {"slug":"reservas-mesa","title":"Reservar Mesa","show_in_header":true,"show_in_footer":true,"header_order":3,"footer_order":3,"sections":[
        {"t":"hero","v":"minimal"},{"t":"reservation","v":"stepper"},{"t":"private_events","v":"default"},{"t":"faq","v":"accordion"}
      ]},
      {"slug":"nosotros","title":"Nosotros","show_in_header":true,"show_in_footer":true,"header_order":5,"footer_order":3,"sections":[
        {"t":"hero","v":"split"},{"t":"text_block","v":"two_columns"},{"t":"stats","v":"counters"},{"t":"team","v":"grid"},{"t":"chef_team","v":"chef"}
      ]},
      {"slug":"contacto","title":"Contacto","show_in_header":true,"show_in_footer":true,"header_order":6,"footer_order":4,"sections":[
        {"t":"hero","v":"minimal"},{"t":"contact_form","v":"split"},{"t":"map","v":"embedded"}
      ]},
      {"slug":"galeria","title":"Galería","show_in_header":false,"show_in_footer":true,"header_order":7,"footer_order":5,"sections":[
        {"t":"gallery","v":"masonry"}
      ]}
    ]}'::jsonb
    WHEN 2 THEN '{"pages":[
      {"slug":"home","title":"Inicio","show_in_header":true,"show_in_footer":false,"header_order":0,"footer_order":0,"sections":[
        {"t":"hero","v":"fullscreen"},{"t":"booking_cta","v":"inline_form"},{"t":"room_types","v":"cards"},
        {"t":"why_choose_us","v":"icons"},{"t":"amenities","v":"icons"},{"t":"gallery","v":"masonry"},
        {"t":"testimonials","v":"carousel"},{"t":"stats","v":"counters"},{"t":"map","v":"embedded"}
      ]},
      {"slug":"espacios","title":"Habitaciones","show_in_header":true,"show_in_footer":true,"header_order":1,"footer_order":1,"sections":[
        {"t":"hero","v":"minimal"},{"t":"room_types","v":"detailed"},{"t":"booking_cta","v":"banner"}
      ]},
      {"slug":"servicios","title":"Servicios","show_in_header":true,"show_in_footer":true,"header_order":2,"footer_order":2,"sections":[
        {"t":"hero","v":"minimal"},{"t":"amenities","v":"grid"},{"t":"services_list","v":"cards"}
      ]},
      {"slug":"galeria","title":"Galería","show_in_header":true,"show_in_footer":true,"header_order":3,"footer_order":3,"sections":[
        {"t":"gallery","v":"masonry"}
      ]},
      {"slug":"nosotros","title":"Nosotros","show_in_header":true,"show_in_footer":true,"header_order":5,"footer_order":3,"sections":[
        {"t":"hero","v":"split"},{"t":"text_block","v":"centered"},{"t":"stats","v":"counters"},{"t":"team","v":"grid"}
      ]},
      {"slug":"contacto","title":"Contacto","show_in_header":true,"show_in_footer":true,"header_order":6,"footer_order":4,"sections":[
        {"t":"hero","v":"minimal"},{"t":"contact_form","v":"split"},{"t":"map","v":"embedded"}
      ]}
    ]}'::jsonb
    WHEN 3 THEN '{"pages":[
      {"slug":"home","title":"Inicio","show_in_header":true,"show_in_footer":false,"header_order":0,"footer_order":0,"sections":[
        {"t":"hero","v":"slider"},{"t":"categories_grid","v":"horizontal"},{"t":"featured_products","v":"grid"},
        {"t":"promo_banners","v":"grid"},{"t":"products_grid","v":"grid"},{"t":"testimonials","v":"carousel"},
        {"t":"newsletter","v":"simple"},{"t":"brands","v":"logos"}
      ]},
      {"slug":"productos","title":"Productos","show_in_header":true,"show_in_footer":true,"header_order":1,"footer_order":1,"sections":[
        {"t":"hero","v":"minimal"},{"t":"products_grid","v":"grid"}
      ]},
      {"slug":"categorias","title":"Categorías","show_in_header":true,"show_in_footer":true,"header_order":2,"footer_order":2,"sections":[
        {"t":"hero","v":"minimal"},{"t":"categories_grid","v":"grid"}
      ]},
      {"slug":"ofertas","title":"Ofertas","show_in_header":true,"show_in_footer":true,"header_order":3,"footer_order":3,"sections":[
        {"t":"hero","v":"minimal"},{"t":"promo_banners","v":"grid"},{"t":"featured_products","v":"carousel"},{"t":"cta","v":"banner"}
      ]},
      {"slug":"nosotros","title":"Nosotros","show_in_header":true,"show_in_footer":true,"header_order":5,"footer_order":3,"sections":[
        {"t":"hero","v":"split"},{"t":"text_block","v":"two_columns"},{"t":"stats","v":"counters"},{"t":"team","v":"grid"},{"t":"partners","v":"logos"}
      ]},
      {"slug":"contacto","title":"Contacto","show_in_header":true,"show_in_footer":true,"header_order":6,"footer_order":4,"sections":[
        {"t":"hero","v":"minimal"},{"t":"contact_form","v":"split"},{"t":"map","v":"full_width"}
      ]}
    ]}'::jsonb
    WHEN 4 THEN '{"pages":[
      {"slug":"home","title":"Inicio","show_in_header":true,"show_in_footer":false,"header_order":0,"footer_order":0,"sections":[
        {"t":"hero","v":"split"},{"t":"partners","v":"logos"},{"t":"features_grid","v":"alternating"},
        {"t":"stats","v":"counters"},{"t":"how_it_works","v":"steps"},{"t":"pricing_table","v":"three_columns"},
        {"t":"testimonials","v":"carousel"},{"t":"faq","v":"accordion"},{"t":"demo_cta","v":"form"}
      ]},
      {"slug":"servicios","title":"Servicios","show_in_header":true,"show_in_footer":true,"header_order":1,"footer_order":1,"sections":[
        {"t":"hero","v":"minimal"},{"t":"features_grid","v":"alternating"},{"t":"cta","v":"centered"}
      ]},
      {"slug":"precios","title":"Precios","show_in_header":true,"show_in_footer":true,"header_order":2,"footer_order":2,"sections":[
        {"t":"hero","v":"minimal"},{"t":"pricing_table","v":"three_columns"},{"t":"faq","v":"two_columns"},{"t":"cta","v":"banner"}
      ]},
      {"slug":"nosotros","title":"Nosotros","show_in_header":true,"show_in_footer":true,"header_order":5,"footer_order":3,"sections":[
        {"t":"hero","v":"split"},{"t":"text_block","v":"two_columns"},{"t":"stats","v":"counters"},{"t":"team","v":"grid"}
      ]},
      {"slug":"contacto","title":"Contacto","show_in_header":true,"show_in_footer":true,"header_order":6,"footer_order":4,"sections":[
        {"t":"hero","v":"minimal"},{"t":"contact_form","v":"split"},{"t":"map","v":"default"}
      ]}
    ]}'::jsonb
    WHEN 5 THEN '{"pages":[
      {"slug":"home","title":"Inicio","show_in_header":true,"show_in_footer":false,"header_order":0,"footer_order":0,"sections":[
        {"t":"hero","v":"video"},{"t":"membership_plans","v":"pricing_table"},{"t":"gym_features","v":"icons"},
        {"t":"class_schedule","v":"grid"},{"t":"trainers","v":"grid"},{"t":"transformation","v":"before_after"},
        {"t":"testimonials","v":"carousel"},{"t":"cta","v":"with_image"},{"t":"gallery","v":"grid"}
      ]},
      {"slug":"membresias","title":"Membresías","show_in_header":true,"show_in_footer":true,"header_order":1,"footer_order":1,"sections":[
        {"t":"hero","v":"minimal"},{"t":"membership_plans","v":"pricing_table"},{"t":"faq","v":"accordion"},{"t":"cta","v":"centered"}
      ]},
      {"slug":"clases","title":"Clases","show_in_header":true,"show_in_footer":true,"header_order":2,"footer_order":2,"sections":[
        {"t":"hero","v":"minimal"},{"t":"class_schedule","v":"grid"},{"t":"trainers","v":"grid"}
      ]},
      {"slug":"entrenadores","title":"Entrenadores","show_in_header":true,"show_in_footer":true,"header_order":3,"footer_order":3,"sections":[
        {"t":"hero","v":"minimal"},{"t":"trainers","v":"grid"}
      ]},
      {"slug":"nosotros","title":"Nosotros","show_in_header":true,"show_in_footer":true,"header_order":5,"footer_order":3,"sections":[
        {"t":"hero","v":"fullscreen"},{"t":"text_block","v":"centered"},{"t":"stats","v":"counters"},{"t":"team","v":"grid"}
      ]},
      {"slug":"contacto","title":"Contacto","show_in_header":true,"show_in_footer":true,"header_order":6,"footer_order":4,"sections":[
        {"t":"hero","v":"minimal"},{"t":"contact_form","v":"split"},{"t":"map","v":"full_width"}
      ]}
    ]}'::jsonb
    WHEN 6 THEN '{"pages":[
      {"slug":"home","title":"Inicio","show_in_header":true,"show_in_footer":false,"header_order":0,"footer_order":0,"sections":[
        {"t":"hero","v":"split"},{"t":"trip_search","v":"form"},{"t":"routes","v":"cards"},
        {"t":"stats","v":"counters"},{"t":"fleet_showcase","v":"grid"},{"t":"why_choose_us","v":"icons"},
        {"t":"testimonials","v":"carousel"},{"t":"partners","v":"logos"},{"t":"cta","v":"banner"},{"t":"contact_form","v":"split"}
      ]},
      {"slug":"servicios","title":"Servicios","show_in_header":true,"show_in_footer":true,"header_order":1,"footer_order":1,"sections":[
        {"t":"hero","v":"minimal"},{"t":"services_list","v":"cards"},{"t":"cta","v":"centered"}
      ]},
      {"slug":"rutas","title":"Rutas","show_in_header":true,"show_in_footer":true,"header_order":2,"footer_order":2,"sections":[
        {"t":"hero","v":"minimal"},{"t":"routes","v":"cards"},{"t":"coverage_map","v":"static"}
      ]},
      {"slug":"flota","title":"Nuestra Flota","show_in_header":true,"show_in_footer":true,"header_order":3,"footer_order":3,"sections":[
        {"t":"hero","v":"minimal"},{"t":"fleet_showcase","v":"grid"}
      ]},
      {"slug":"nosotros","title":"Nosotros","show_in_header":true,"show_in_footer":true,"header_order":5,"footer_order":3,"sections":[
        {"t":"hero","v":"split"},{"t":"text_block","v":"two_columns"},{"t":"stats","v":"counters"},{"t":"team","v":"grid"}
      ]},
      {"slug":"contacto","title":"Contacto","show_in_header":true,"show_in_footer":true,"header_order":6,"footer_order":4,"sections":[
        {"t":"hero","v":"minimal"},{"t":"contact_form","v":"split"},{"t":"map","v":"full_width"}
      ]}
    ]}'::jsonb
    WHEN 7 THEN '{"pages":[
      {"slug":"home","title":"Inicio","show_in_header":true,"show_in_footer":false,"header_order":0,"footer_order":0,"sections":[
        {"t":"hero","v":"split"},{"t":"parking_zones","v":"grid"},{"t":"parking_pricing","v":"cards"},
        {"t":"parking_features","v":"icons"},{"t":"stats","v":"counters"},{"t":"testimonials","v":"carousel"},
        {"t":"faq","v":"accordion"},{"t":"map","v":"full_width"}
      ]},
      {"slug":"zonas","title":"Zonas","show_in_header":true,"show_in_footer":true,"header_order":1,"footer_order":1,"sections":[
        {"t":"hero","v":"minimal"},{"t":"parking_zones","v":"grid"},{"t":"parking_availability","v":"summary"}
      ]},
      {"slug":"tarifas","title":"Tarifas","show_in_header":true,"show_in_footer":true,"header_order":2,"footer_order":2,"sections":[
        {"t":"hero","v":"minimal"},{"t":"parking_pricing","v":"cards"},{"t":"parking_pass_plans","v":"cards"},{"t":"faq","v":"accordion"},{"t":"cta","v":"centered"}
      ]},
      {"slug":"servicios","title":"Servicios","show_in_header":true,"show_in_footer":true,"header_order":3,"footer_order":3,"sections":[
        {"t":"hero","v":"minimal"},{"t":"parking_features","v":"icons"},{"t":"services_list","v":"grid"}
      ]},
      {"slug":"nosotros","title":"Nosotros","show_in_header":true,"show_in_footer":true,"header_order":5,"footer_order":3,"sections":[
        {"t":"hero","v":"minimal"},{"t":"text_block","v":"left"},{"t":"stats","v":"counters"},{"t":"team","v":"grid"}
      ]},
      {"slug":"contacto","title":"Contacto","show_in_header":true,"show_in_footer":true,"header_order":6,"footer_order":4,"sections":[
        {"t":"hero","v":"minimal"},{"t":"contact_form","v":"split"},{"t":"map","v":"full_width"}
      ]}
    ]}'::jsonb
    ELSE NULL
  END;

  IF v_preset IS NULL THEN RETURN; END IF;

  FOR v_page IN SELECT * FROM jsonb_array_elements(v_preset->'pages')
  LOOP
    INSERT INTO website_pages (
      organization_id, slug, title, show_in_header, show_in_footer,
      header_order, footer_order, page_type
    ) VALUES (
      p_org_id, v_page->>'slug', v_page->>'title',
      (v_page->>'show_in_header')::boolean, (v_page->>'show_in_footer')::boolean,
      (v_page->>'header_order')::integer, (v_page->>'footer_order')::integer, 'builtin'
    ) RETURNING id INTO v_page_id;

    v_sort_order := 0;
    FOR v_section IN SELECT * FROM jsonb_array_elements(v_page->'sections')
    LOOP
      INSERT INTO website_page_sections (
        page_id, organization_id, section_type, section_variant,
        content, settings, sort_order, is_visible
      ) VALUES (
        v_page_id, p_org_id, v_section->>'t', v_section->>'v',
        get_section_default_content(v_section->>'t', v_section->>'v', p_type_id),
        '{}'::jsonb, v_sort_order, true
      );
      v_sort_order := v_sort_order + 1;
    END LOOP;
  END LOOP;
END;
$function$;
