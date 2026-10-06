-- Reversión de 20261006220000_paginas_por_defecto_restaurante (SIN APLICAR a
-- 2026-10-06). Devuelve `create_default_pages` exactamente a como está hoy
-- (bloque de restaurante con las secciones viejas y sin search_path). Los sitios
-- creados mientras estuvo aplicada conservan sus páginas.

create or replace function public.create_default_pages(p_org_id integer, p_type_id integer)
returns void
language plpgsql
security definer
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
        {"t":"hero","v":"fullscreen"},{"t":"specialties","v":"featured"},{"t":"menu_preview","v":"tabs"},
        {"t":"delivery_cta","v":"banner"},{"t":"gallery","v":"grid"},{"t":"testimonials","v":"carousel"},
        {"t":"reservation_cta","v":"with_form"},{"t":"map","v":"embedded"}
      ]},
      {"slug":"menu","title":"Menú","show_in_header":true,"show_in_footer":true,"header_order":1,"footer_order":1,"sections":[
        {"t":"hero","v":"minimal"},{"t":"menu_preview","v":"tabs"},{"t":"cta","v":"centered"}
      ]},
      {"slug":"domicilios","title":"Pedir Online","show_in_header":true,"show_in_footer":true,"header_order":2,"footer_order":2,"sections":[
        {"t":"hero","v":"minimal"},{"t":"products_grid","v":"grid"}
      ]},
      {"slug":"reservas-mesa","title":"Reservar Mesa","show_in_header":true,"show_in_footer":true,"header_order":3,"footer_order":3,"sections":[
        {"t":"hero","v":"minimal"},{"t":"reservation_cta","v":"with_form"},{"t":"faq","v":"accordion"}
      ]},
      {"slug":"nosotros","title":"Nosotros","show_in_header":true,"show_in_footer":true,"header_order":5,"footer_order":3,"sections":[
        {"t":"hero","v":"split"},{"t":"text_block","v":"two_columns"},{"t":"stats","v":"counters"},{"t":"team","v":"grid"}
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

alter function public.create_default_pages(integer, integer) reset search_path;
