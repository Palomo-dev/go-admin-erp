-- Contacto v2 en la página Contacto intacta de la org 358 (sitio V2 adoptado).
--
-- Aprobado por el dueño (2026-11-24): pasar a «Contacto v2» solo las páginas Contacto que siguen
-- con las tres secciones y los textos con que se sembraron. Esta migración hace SOLO la org 358;
-- las demás van en migraciones aparte.
--
-- Qué hace (equivalente transaccional de guardar el borrador + `publish_site_revision`, que no se
-- puede llamar desde aquí porque exige `auth.uid()` con permiso `website.sites.publish`):
--   1. Comprueba que el sitio sigue como se revisó: revisión publicada y versión del borrador
--      esperadas, borrador = documento publicado en la página Contacto, y esa página idéntica a la
--      sembrada (hero:minimal «Contacto», contact_form:split «Escríbenos», map:full_width
--      «Encuéntranos»). Si algo no cuadra, aborta sin tocar nada.
--   2. Borrador: reemplaza solo `secciones` de la página Contacto por las 5 de
--      `seccionesContactoPorDefecto()` (src/lib/website/contrato/paginaContacto.ts, sin FAQ) y
--      sube `version` en 1 (compare-and-swap del trigger `fn_website_site_drafts_version`).
--      Las demás páginas, menús, tema, etc. no cambian.
--   3. Revisión nueva (las publicadas no se editan: son historial) con el documento del borrador,
--      nota «Contacto v2 (migración 2026-11-24)»; el sitio y el borrador apuntan a ella; y una
--      fila en `website_publication_outbox` para que la tienda invalide su caché
--      (cron /api/revalidate/sitios-v2, cada minuto), igual que al publicar desde el ERP.
--
-- Las secciones nuevas se validaron con `esquemaPagina` del contrato del ERP y con la copia de la
-- tienda (goadmin-websites/lib/website/v2/contrato/documentoSitio.ts) antes de aplicar.
-- El encabezado viejo tenía `section_background.padding_top = 0`; el nuevo usa el contenido exacto
-- del contrato (sin fondo propio).
--
-- Idempotente: si la página Contacto ya tiene las secciones v2 de esta migración, no hace nada.
-- Reversión: supabase/rollbacks/20261125034500_contacto_v2_org358_rollback.sql

do $$
declare
  c_org        constant integer := 358;
  c_sitio      constant uuid    := 'c2695ca5-2d13-42fc-bf54-c3d7604fdb87';
  c_rev_previa constant uuid    := 'b4af7dd7-611c-46b7-a278-da782fab188a';
  c_version    constant integer := 229;
  c_pagina_id  constant text    := '0d7b7a11-15a7-46b6-8f3a-77056af97657';
  c_nota       constant text    := 'Contacto v2 (migración 2026-11-24)';

  -- Secciones sembradas (estado revisado el 2026-11-25 03:40 UTC, borrador = publicado).
  c_viejas constant jsonb := $j$[
    {"id":"ab75f004-06ba-4ecb-ab37-5514bb13ebec","tipo":"hero","diseno":{},"version":1,"variante":"minimal","contenido":{"title":"Contacto","subtitle":"Estamos aquí para ayudarte","section_background":{"padding_top":0}},"visibilidad":{"movil":true,"escritorio":true}},
    {"id":"5812b4a4-afad-4138-8ad4-4cdbc141609b","tipo":"contact_form","diseno":{},"version":1,"variante":"split","contenido":{"title":"Escríbenos","subtitle":"Te respondemos lo antes posible."},"visibilidad":{"movil":true,"escritorio":true}},
    {"id":"f89ecaa1-f393-492f-8f7f-5649a6dd6af7","tipo":"map","diseno":{},"version":1,"variante":"full_width","contenido":{"title":"Encuéntranos","subtitle":"Visítanos en nuestra sede"},"visibilidad":{"movil":true,"escritorio":true}}
  ]$j$;

  -- seccionesContactoPorDefecto() → secciones del documento V2 (mismo armado que
  -- `seccionDe` de plantillasPagina.ts: version 1, diseno {}, visible en móvil y escritorio).
  c_nuevas constant jsonb := $j$[
    {"id":"33334f1a-2112-46f6-9ce5-27ed6f8b5649","tipo":"hero","variante":"page_header","version":1,"contenido":{"title":"Hablemos","subtitle":"Escríbenos por el canal que prefieras. Te respondemos lo antes posible.","show_breadcrumb":true},"diseno":{},"visibilidad":{"movil":true,"escritorio":true}},
    {"id":"86553216-4537-4594-ac1a-ae6e7d191e51","tipo":"contact_channels","variante":"cards","version":1,"contenido":{"title":"Elige cómo hablar con nosotros","subtitle":"Todos los canales llegan al mismo equipo."},"diseno":{},"visibilidad":{"movil":true,"escritorio":true}},
    {"id":"b816b797-d803-4373-aa63-361dba7bed95","tipo":"contact_form","variante":"card_hours","version":1,"contenido":{"title":"Envíanos un mensaje","subtitle":"Déjanos tus datos y te respondemos al correo o por WhatsApp.","anchor_id":"formulario"},"diseno":{},"visibilidad":{"movil":true,"escritorio":true}},
    {"id":"28714bdb-e55c-4b46-b9ca-57474a1b0d0b","tipo":"hours_location","variante":"hours_map","version":1,"contenido":{"eyebrow":"","title":"Nuestras sedes","show_whatsapp":true,"show_reserve":false,"show_order":false},"diseno":{},"visibilidad":{"movil":true,"escritorio":true}},
    {"id":"a81b192d-c45a-40ba-82d9-8e374a1b9f76","tipo":"social_networks","variante":"row","version":1,"contenido":{"title":"Síguenos en redes","subtitle":""},"diseno":{},"visibilidad":{"movil":true,"escritorio":true}}
  ]$j$;

  v_state  public.website_site_states%rowtype;
  v_draft  public.website_site_drafts%rowtype;
  v_rev    public.website_site_revisions%rowtype;
  v_idx    integer;
  v_idx_pub integer;
  v_doc    jsonb;
  v_numero integer;
  v_revision uuid;
begin
  select * into v_state from public.website_site_states
   where id = c_sitio and organization_id = c_org for update;
  if not found or v_state.branch_id is not null or not v_state.v2_adopted then
    raise exception 'contacto_v2: sitio % de la org % no encontrado o no es el principal V2', c_sitio, c_org;
  end if;

  select * into v_draft from public.website_site_drafts where site_state_id = c_sitio for update;
  if not found then
    raise exception 'contacto_v2: borrador no encontrado';
  end if;

  select (ord - 1)::integer into v_idx
    from jsonb_array_elements(v_draft.document->'paginas') with ordinality as x(p, ord)
   where p->>'slug' = 'contacto' and p->>'id' = c_pagina_id;
  if v_idx is null then
    raise exception 'contacto_v2: la página Contacto no está en el borrador';
  end if;

  -- Ya aplicada: no hacer nada.
  if v_draft.document->'paginas'->v_idx->'secciones' = c_nuevas
     and v_state.published_revision_id is distinct from c_rev_previa then
    raise notice 'contacto_v2: la org % ya tiene Contacto v2; sin cambios', c_org;
    return;
  end if;

  if v_state.published_revision_id is distinct from c_rev_previa then
    raise exception 'contacto_v2: la revisión publicada cambió (esperada %, actual %)', c_rev_previa, v_state.published_revision_id;
  end if;
  if v_draft.version <> c_version then
    raise exception 'contacto_v2: el borrador cambió (versión esperada %, actual %)', c_version, v_draft.version;
  end if;
  if v_draft.document->'paginas'->v_idx->'secciones' is distinct from c_viejas then
    raise exception 'contacto_v2: la página Contacto del borrador ya no es la sembrada';
  end if;

  select * into v_rev from public.website_site_revisions where id = c_rev_previa;
  select (ord - 1)::integer into v_idx_pub
    from jsonb_array_elements(v_rev.document->'paginas') with ordinality as x(p, ord)
   where p->>'slug' = 'contacto' and p->>'id' = c_pagina_id;
  if v_idx_pub is null
     or v_rev.document->'paginas'->v_idx_pub is distinct from v_draft.document->'paginas'->v_idx then
    raise exception 'contacto_v2: la página Contacto del borrador no es igual a la publicada';
  end if;
  if (v_draft.document->>'schemaVersion') is distinct from v_draft.schema_version::text then
    raise exception 'contacto_v2: documento con schemaVersion distinto de schema_version';
  end if;

  -- 2. Borrador: solo las secciones de la página Contacto.
  v_doc := jsonb_set(v_draft.document, array['paginas', v_idx::text, 'secciones'], c_nuevas, false);

  update public.website_site_drafts
     set document = v_doc, version = v_draft.version + 1
   where site_state_id = c_sitio and version = c_version;
  if not found then
    raise exception 'contacto_v2: conflicto al guardar el borrador';
  end if;

  -- 3. Revisión nueva = documento del borrador (como publish_site_revision).
  select coalesce(max(r.revision_number), 0) + 1 into v_numero
    from public.website_site_revisions r where r.site_state_id = c_sitio;

  insert into public.website_site_revisions (
    site_state_id, organization_id, revision_number, schema_version, document,
    source_draft_version, note, published_by)
  values (
    c_sitio, c_org, v_numero, v_draft.schema_version, v_doc,
    v_draft.version + 1, c_nota, null)
  returning id into v_revision;

  update public.website_site_states set published_revision_id = v_revision where id = c_sitio;
  update public.website_site_drafts set base_revision_id = v_revision where site_state_id = c_sitio;

  insert into public.website_publication_outbox (organization_id, site_state_id, revision_id)
  values (c_org, c_sitio, v_revision);

  raise notice 'contacto_v2: org % → revisión % (número %), borrador versión %', c_org, v_revision, v_numero, v_draft.version + 1;
end
$$;
