-- Contacto v2 en TODOS los sembrados y en los sitios que aún tenían el contacto viejo (2026-11-25).
--
-- Pedido del dueño: «todas las tiendas viejas, ¿por qué tienen el contacto viejo? Deberían tener el
-- nuevo, y las tiendas nuevas también. Si es un tema de plantillas, organizarlo.»
--
-- Causa (verificada por MCP): la org 338 SÍ se migró en 20261125050000 (05:07 UTC), pero a las
-- 17:20 UTC se aplicó «Plantilla completa» en su editor (instantánea `antes_de_restaurar` de la
-- versión 85 del borrador): todas sus páginas se rehicieron con ids nuevos desde `PAGINAS_BASE_GIRO`
-- (src/components/sitio-web/paginas/plantillasPagina.ts), que en la página Contacto de cada giro
-- seguía diciendo `hero:minimal, contact_form:split, map:*` (copia de `create_default_pages`). Las
-- revisiones 25 (17:22 UTC) a 30 publicaron ese contacto viejo. El contacto viejo no venía de
-- páginas editadas por los dueños: venía de las plantillas.
--
-- Qué hace:
--   1. `create_default_pages` (siembra el sitio al crear la organización, por
--      `trg_org_create_default_pages`) siembra la página «contacto» de los 7 giros con las 5
--      secciones de `seccionesContactoPorDefecto()` y sus textos (constante `v_contacto`). Lo demás
--      de la función queda igual, carácter por carácter (cuerpo anterior: md5
--      ae8933c838fa9bd9c9b9331097fbaa15, el de 20261006125630). Solo afecta organizaciones nuevas.
--      En el código, `PAGINAS_BASE_GIRO` usa `paginaContacto()` (la misma fuente) para «Plantilla
--      completa», «Restaurar páginas base» y la plantilla de sede.
--   2. Las páginas Contacto que siguen con el contacto viejo TAL COMO SE SEMBRÓ (misma definición de
--      «intacta» que 20261125050000: 3 secciones hero·minimal / contact_form·split / map con los
--      textos del sembrado, sin diseño, ajustes ni ediciones) pasan a Contacto v2:
--      a. V2 publicado (org 338): revisión NUEVA desde lo publicado con solo la página Contacto
--         reemplazada (nota «Contacto v2 (migración 2026-11-25, sitios restantes)»), borrador con la
--         misma página y version+1, el sitio apunta a la revisión nueva y fila en
--         `website_publication_outbox` para la caché de la tienda. Exige que la página Contacto del
--         borrador sea igual a la publicada (si no, se salta: sería publicar algo no publicado).
--      b. Borrador V2 de un sitio que aún no publica en V2 (org 383, creado el 2026-11-14 desde el
--         sitio viejo, que ya es v2): solo el borrador, version+1. Sin esto, al publicar por primera
--         vez en V2 volvería el contacto viejo.
--      c. Legacy (`website_pages` / `website_page_sections`) de los sitios que ya publican en V2
--         (17 orgs; su sitio viejo sigue en la base y es lo que trae «Importar del sitio anterior»):
--         se borran las 3 filas y se insertan las 5. No cambia lo que se ve hoy.
--   Una página con el contacto viejo que NO esté intacta se salta y queda anotada en el respaldo con
--   el motivo (al revisar no había ninguna: ningún dueño había editado su contacto viejo).
--
-- No se tocan: las páginas que ya son v2; el sitio V2 de la org 374 (organización de pruebas; usa
-- «Café de especialidad», que no trae página Contacto); las orgs 131 y 135 (página Contacto legacy
-- SIN secciones) y 113, 145 y 197 (sin página Contacto): la tienda ya les pinta Contacto v2 en
-- memoria (goadmin-websites `lib/website/contactoRespaldo.ts`).
--
-- Respaldo: `website_contacto_v2_respaldo` gana la columna `migracion` (las filas de 20261125050000
-- quedan con ese valor por el DEFAULT); las de esta llevan '20261125230000'.
-- Reversión: supabase/rollbacks/20261125230000_contacto_v2_plantillas_y_restantes_rollback.sql
-- Idempotente: una página que ya es v2 no es candidata, y lo aplicado por esta migración no se
-- vuelve a tocar.

alter table public.website_contacto_v2_respaldo
  add column if not exists migracion text not null default '20261125050000';

comment on column public.website_contacto_v2_respaldo.migracion is
  'Migración que escribió la fila (20261125050000: tiendas intactas; 20261125230000: plantillas y sitios restantes). Cada reversión deshace solo las suyas.';

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
  v_secciones jsonb;
  -- Contacto v2 (Figma 3104:84056): mismas secciones y textos que `seccionesContactoPorDefecto()`
  -- de src/lib/website/contrato/paginaContacto.ts (la prueba contactoV2Sembrado.test.ts lo
  -- compara). Toda página «contacto» del juego se siembra con estas, en este orden.
  v_contacto constant jsonb := $contacto$[
    {"t":"hero","v":"page_header","c":{"title":"Hablemos","subtitle":"Escríbenos por el canal que prefieras. Te respondemos lo antes posible.","show_breadcrumb":true}},
    {"t":"contact_channels","v":"cards","c":{"title":"Elige cómo hablar con nosotros","subtitle":"Todos los canales llegan al mismo equipo."}},
    {"t":"contact_form","v":"card_hours","c":{"title":"Envíanos un mensaje","subtitle":"Déjanos tus datos y te respondemos al correo o por WhatsApp.","anchor_id":"formulario"}},
    {"t":"hours_location","v":"hours_map","c":{"eyebrow":"","title":"Nuestras sedes","show_whatsapp":true,"show_reserve":false,"show_order":false}},
    {"t":"social_networks","v":"row","c":{"title":"Síguenos en redes","subtitle":""}}
  ]$contacto$;
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
        {"t":"hero","v":"page_header"},{"t":"contact_channels","v":"cards"},{"t":"contact_form","v":"card_hours"},{"t":"hours_location","v":"hours_map"},{"t":"social_networks","v":"row"}
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
        {"t":"hero","v":"page_header"},{"t":"contact_channels","v":"cards"},{"t":"contact_form","v":"card_hours"},{"t":"hours_location","v":"hours_map"},{"t":"social_networks","v":"row"}
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
        {"t":"hero","v":"page_header"},{"t":"contact_channels","v":"cards"},{"t":"contact_form","v":"card_hours"},{"t":"hours_location","v":"hours_map"},{"t":"social_networks","v":"row"}
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
        {"t":"hero","v":"page_header"},{"t":"contact_channels","v":"cards"},{"t":"contact_form","v":"card_hours"},{"t":"hours_location","v":"hours_map"},{"t":"social_networks","v":"row"}
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
        {"t":"hero","v":"page_header"},{"t":"contact_channels","v":"cards"},{"t":"contact_form","v":"card_hours"},{"t":"hours_location","v":"hours_map"},{"t":"social_networks","v":"row"}
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
        {"t":"hero","v":"page_header"},{"t":"contact_channels","v":"cards"},{"t":"contact_form","v":"card_hours"},{"t":"hours_location","v":"hours_map"},{"t":"social_networks","v":"row"}
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
        {"t":"hero","v":"page_header"},{"t":"contact_channels","v":"cards"},{"t":"contact_form","v":"card_hours"},{"t":"hours_location","v":"hours_map"},{"t":"social_networks","v":"row"}
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
    v_secciones := CASE WHEN v_page->>'slug' = 'contacto' THEN v_contacto ELSE v_page->'sections' END;
    FOR v_section IN SELECT * FROM jsonb_array_elements(v_secciones)
    LOOP
      INSERT INTO website_page_sections (
        page_id, organization_id, section_type, section_variant,
        content, settings, sort_order, is_visible
      ) VALUES (
        v_page_id, p_org_id, v_section->>'t', v_section->>'v',
        coalesce(v_section->'c', get_section_default_content(v_section->>'t', v_section->>'v', p_type_id)),
        '{}'::jsonb, v_sort_order, true
      );
      v_sort_order := v_sort_order + 1;
    END LOOP;
  END LOOP;
END;
$function$;

do $$
declare
  c_mig  constant text := '20261125230000';
  c_nota constant text := 'Contacto v2 (migración 2026-11-25, sitios restantes)';

  -- Contenidos del sembrado viejo (sin ids), los mismos de 20261125050000.
  c_heroes constant jsonb := $j$[
    {"title":"Contacto","subtitle":"Estamos aquí para ayudarte"},
    {"title":"Productos","subtitle":"Explora nuestro catálogo completo"},
    {"title":"Nuestros Servicios","subtitle":"Conoce lo que podemos hacer por ti"},
    {"title":"Nuestras Habitaciones","subtitle":"Confort y elegancia en cada detalle"},
    {"title":"Nuestra Carta","subtitle":"Explora todos nuestros platos"},
    {"title":"Nuestras Clases","subtitle":"Entrena con los mejores"}
  ]$j$;
  c_forms constant jsonb := $j$[
    {"title":"Escríbenos","subtitle":"Te respondemos lo antes posible."},
    {"title":"Contáctanos","subtitle":"Estamos aquí para ayudarte. Envíanos un mensaje y te responderemos lo antes posible."}
  ]$j$;
  c_mapa  constant jsonb := '{"title":"Encuéntranos","subtitle":"Visítanos en nuestra sede"}';
  c_fondo constant jsonb := '{"padding_top":0}';

  -- seccionesContactoPorDefecto() (tipo, variante, contenido), en orden.
  c_plantilla constant jsonb := $j$[
    {"tipo":"hero","variante":"page_header","contenido":{"title":"Hablemos","subtitle":"Escríbenos por el canal que prefieras. Te respondemos lo antes posible.","show_breadcrumb":true}},
    {"tipo":"contact_channels","variante":"cards","contenido":{"title":"Elige cómo hablar con nosotros","subtitle":"Todos los canales llegan al mismo equipo."}},
    {"tipo":"contact_form","variante":"card_hours","contenido":{"title":"Envíanos un mensaje","subtitle":"Déjanos tus datos y te respondemos al correo o por WhatsApp.","anchor_id":"formulario"}},
    {"tipo":"hours_location","variante":"hours_map","contenido":{"eyebrow":"","title":"Nuestras sedes","show_whatsapp":true,"show_reserve":false,"show_order":false}},
    {"tipo":"social_networks","variante":"row","contenido":{"title":"Síguenos en redes","subtitle":""}}
  ]$j$;

  v_state     public.website_site_states%rowtype;
  v_draft     public.website_site_drafts%rowtype;
  v_pub       public.website_site_revisions%rowtype;
  v_page      public.website_pages%rowtype;
  v_secs      jsonb;
  v_norm      jsonb;
  v_nuevas    jsonb;
  v_idx       integer;
  v_idx_d     integer;
  v_numero    integer;
  v_revision  uuid;
  v_motivo    text;
  v_n         integer;
  v_aplicadas integer := 0;
  v_saltadas  integer := 0;
begin
  -- ── a y b: sitios V2 (publicados y borradores sin publicar) ──────────────────────────────
  for v_state in
    select * from public.website_site_states where branch_id is null order by organization_id for update
  loop
    v_motivo := null; v_draft := null; v_pub := null; v_secs := null; v_norm := null;
    v_nuevas := null; v_idx := null; v_idx_d := null; v_numero := null;

    select * into v_draft from public.website_site_drafts where site_state_id = v_state.id for update;
    -- Un sitio sin adoptar no publica su revisión: lo que manda es el borrador.
    if v_state.v2_adopted and v_state.published_revision_id is not null then
      select * into v_pub from public.website_site_revisions where id = v_state.published_revision_id;
      select (o - 1)::integer into v_idx
        from jsonb_array_elements(v_pub.document->'paginas') with ordinality as t(p, o)
       where p->>'slug' = 'contacto';
    end if;
    if v_draft.site_state_id is not null then
      select (o - 1)::integer into v_idx_d
        from jsonb_array_elements(v_draft.document->'paginas') with ordinality as t(p, o)
       where p->>'slug' = 'contacto';
    end if;

    -- Candidata: la página Contacto que manda (la publicada o, sin publicación V2, la del
    -- borrador) existe, tiene secciones y no tiene ya las de Contacto v2.
    v_secs := case when v_pub.id is not null then v_pub.document->'paginas'->v_idx->'secciones'
                   else v_draft.document->'paginas'->v_idx_d->'secciones' end;
    if v_secs is null or jsonb_typeof(v_secs) <> 'array' or jsonb_array_length(v_secs) = 0
       or exists (select 1 from jsonb_array_elements(v_secs) s where s->>'tipo' = 'contact_channels') then
      continue;
    end if;

    if exists (select 1 from public.website_contacto_v2_respaldo
                where organization_id = v_state.organization_id and modelo = 'v2'
                  and migracion = c_mig and resultado = 'aplicada') then
      raise notice 'org %: V2 ya aplicada por esta migración, sin cambios', v_state.organization_id;
      continue;
    end if;

    if v_draft.site_state_id is null or v_idx_d is null then
      v_motivo := 'sin borrador o sin página Contacto en el borrador';
    elsif v_pub.id is not null
          and v_draft.document->'paginas'->v_idx_d is distinct from v_pub.document->'paginas'->v_idx then
      v_motivo := 'la página Contacto del borrador no es igual a la publicada (edición sin publicar)';
    elsif exists (select 1 from jsonb_array_elements(v_secs) s
                   where s->'diseno' is distinct from '{}'::jsonb
                      or s->'visibilidad' is distinct from '{"movil":true,"escritorio":true}'::jsonb
                      or s->>'version' is distinct from '1'
                      or s ? 'fuente') then
      v_motivo := 'alguna sección tiene diseño, visibilidad o datos propios';
    end if;
    if v_motivo is null then
      select coalesce(jsonb_agg(jsonb_build_object('tipo', s->>'tipo', 'variante', s->>'variante', 'contenido', s->'contenido') order by o), '[]')
        into v_norm from jsonb_array_elements(v_secs) with ordinality as t(s, o);
    end if;

    -- Firma del sembrado (igual que 20261125050000).
    if v_motivo is null then
      if jsonb_array_length(v_norm) <> 3 then
        v_motivo := format('tiene %s secciones, no las 3 del sembrado', jsonb_array_length(v_norm));
      elsif not (
            v_norm->0->>'tipo' = 'hero' and v_norm->0->>'variante' = 'minimal'
        and exists (select 1 from jsonb_array_elements(c_heroes) h where h = (v_norm->0->'contenido') - 'section_background')
        and coalesce(v_norm->0->'contenido'->'section_background', c_fondo) = c_fondo
        and v_norm->1->>'tipo' = 'contact_form' and v_norm->1->>'variante' = 'split'
        and exists (select 1 from jsonb_array_elements(c_forms) f where f = v_norm->1->'contenido')
        and v_norm->2->>'tipo' = 'map' and v_norm->2->>'variante' in ('full_width', 'embedded', 'default')
        and v_norm->2->'contenido' = c_mapa) then
        v_motivo := 'las secciones o sus textos ya no son los del sembrado';
      end if;
    end if;

    if v_motivo is not null then
      insert into public.website_contacto_v2_respaldo (organization_id, modelo, resultado, motivo, site_state_id, secciones_viejas, migracion)
      values (v_state.organization_id, 'v2', 'saltada', v_motivo, v_state.id, v_secs, c_mig);
      v_saltadas := v_saltadas + 1;
      raise notice 'org %: V2 saltada (%)', v_state.organization_id, v_motivo;
      continue;
    end if;

    select jsonb_agg(jsonb_build_object(
             'id', gen_random_uuid()::text, 'tipo', s->>'tipo', 'variante', s->>'variante', 'version', 1,
             'contenido', s->'contenido', 'diseno', '{}'::jsonb,
             'visibilidad', '{"movil":true,"escritorio":true}'::jsonb) order by o)
      into v_nuevas from jsonb_array_elements(c_plantilla) with ordinality as t(s, o);

    update public.website_site_drafts
       set document = jsonb_set(document, array['paginas', v_idx_d::text, 'secciones'], v_nuevas, false),
           version  = v_draft.version + 1
     where site_state_id = v_state.id and version = v_draft.version;
    get diagnostics v_n = row_count;
    if v_n <> 1 then
      raise exception 'org %: conflicto al guardar el borrador', v_state.organization_id;
    end if;

    v_revision := null;
    if v_pub.id is not null then
      select coalesce(max(r.revision_number), 0) + 1 into v_numero
        from public.website_site_revisions r where r.site_state_id = v_state.id;
      insert into public.website_site_revisions (
        site_state_id, organization_id, revision_number, schema_version, document,
        source_draft_version, note, published_by)
      values (
        v_state.id, v_state.organization_id, v_numero, v_pub.schema_version,
        jsonb_set(v_pub.document, array['paginas', v_idx::text, 'secciones'], v_nuevas, false),
        v_draft.version + 1, c_nota, null)
      returning id into v_revision;

      update public.website_site_states set published_revision_id = v_revision where id = v_state.id;
      update public.website_site_drafts set base_revision_id = v_revision where site_state_id = v_state.id;
      insert into public.website_publication_outbox (organization_id, site_state_id, revision_id)
      values (v_state.organization_id, v_state.id, v_revision);
    end if;

    insert into public.website_contacto_v2_respaldo (
      organization_id, modelo, resultado, motivo, page_id, site_state_id, revision_previa_id, revision_id,
      secciones_viejas, secciones_nuevas, migracion)
    values (v_state.organization_id, 'v2', 'aplicada',
            case when v_revision is null then 'solo el borrador (el sitio aún no publica en V2)' end,
            v_draft.document->'paginas'->v_idx_d->>'id', v_state.id, v_pub.id, v_revision,
            v_secs, v_nuevas, c_mig);
    v_aplicadas := v_aplicadas + 1;
    raise notice 'org %: Contacto v2 aplicado (V2, %)', v_state.organization_id,
      coalesce('revisión ' || v_numero, 'solo borrador');
  end loop;

  -- ── c: legacy (website_pages / website_page_sections) ───────────────────────────────────
  for v_page in
    select p.* from public.website_pages p
     where p.slug = 'contacto' and p.branch_id is null
       and exists (select 1 from public.website_page_sections s where s.page_id = p.id)
       and not exists (select 1 from public.website_page_sections s where s.page_id = p.id and s.section_type = 'contact_channels')
     order by p.organization_id
     for update
  loop
    v_motivo := null; v_secs := null; v_norm := null; v_nuevas := null;

    if exists (select 1 from public.website_contacto_v2_respaldo
                where page_id = v_page.id::text and modelo = 'legacy'
                  and migracion = c_mig and resultado = 'aplicada') then
      continue;
    end if;

    perform 1 from public.website_page_sections where page_id = v_page.id for update;
    select coalesce(jsonb_agg(to_jsonb(s) order by s.sort_order, s.created_at, s.id), '[]') into v_secs
      from public.website_page_sections s where s.page_id = v_page.id;

    if v_page.is_published is not true then
      v_motivo := 'la página Contacto no está publicada';
    elsif v_page.draft_content is not null or v_page.has_unpublished_changes is true then
      v_motivo := 'la página Contacto tiene cambios sin publicar';
    elsif exists (select 1 from public.website_page_sections s
                   where s.page_id = v_page.id
                     and (s.is_visible is not true
                          or coalesce(s.settings, '{}'::jsonb) <> '{}'::jsonb
                          or s.updated_at <> s.created_at
                          or s.branch_id is not null)) then
      v_motivo := 'alguna sección está oculta, tiene ajustes propios o fue editada';
    end if;

    if v_motivo is null then
      select coalesce(jsonb_agg(jsonb_build_object('tipo', s->>'section_type', 'variante', s->>'section_variant', 'contenido', s->'content') order by o), '[]')
        into v_norm from jsonb_array_elements(v_secs) with ordinality as t(s, o);
      if jsonb_array_length(v_norm) <> 3 then
        v_motivo := format('tiene %s secciones, no las 3 del sembrado', jsonb_array_length(v_norm));
      elsif not (
            v_norm->0->>'tipo' = 'hero' and v_norm->0->>'variante' = 'minimal'
        and exists (select 1 from jsonb_array_elements(c_heroes) h where h = (v_norm->0->'contenido') - 'section_background')
        and coalesce(v_norm->0->'contenido'->'section_background', c_fondo) = c_fondo
        and v_norm->1->>'tipo' = 'contact_form' and v_norm->1->>'variante' = 'split'
        and exists (select 1 from jsonb_array_elements(c_forms) f where f = v_norm->1->'contenido')
        and v_norm->2->>'tipo' = 'map' and v_norm->2->>'variante' in ('full_width', 'embedded', 'default')
        and v_norm->2->'contenido' = c_mapa) then
        v_motivo := 'las secciones o sus textos ya no son los del sembrado';
      end if;
    end if;

    if v_motivo is not null then
      insert into public.website_contacto_v2_respaldo (organization_id, modelo, resultado, motivo, page_id, secciones_viejas, migracion)
      values (v_page.organization_id, 'legacy', 'saltada', v_motivo, v_page.id::text, v_secs, c_mig);
      v_saltadas := v_saltadas + 1;
      raise notice 'org %: legacy saltada (%)', v_page.organization_id, v_motivo;
      continue;
    end if;

    delete from public.website_page_sections where page_id = v_page.id;

    with nuevas as (
      insert into public.website_page_sections (
        id, page_id, organization_id, section_type, section_variant, content, settings, sort_order, is_visible)
      select gen_random_uuid(), v_page.id, v_page.organization_id, s->>'tipo', s->>'variante', s->'contenido', '{}'::jsonb, (o - 1)::integer, true
        from jsonb_array_elements(c_plantilla) with ordinality as t(s, o)
      returning *)
    select jsonb_agg(to_jsonb(n) order by n.sort_order) into v_nuevas from nuevas n;

    insert into public.website_contacto_v2_respaldo (
      organization_id, modelo, resultado, page_id, secciones_viejas, secciones_nuevas, migracion)
    values (v_page.organization_id, 'legacy', 'aplicada', v_page.id::text, v_secs, v_nuevas, c_mig);
    v_aplicadas := v_aplicadas + 1;
    raise notice 'org %: Contacto v2 aplicado (legacy)', v_page.organization_id;
  end loop;

  raise notice 'contacto_v2_restantes: % aplicadas, % saltadas', v_aplicadas, v_saltadas;
end
$$;
